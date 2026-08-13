import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  appendPricePointCorrection,
  executePublicationBatch,
  type PublishBatchInput,
} from "../../src/adapters/persistence/publish-batch";
import {
  setPublicationActivationGate,
  transitionStoreSupport,
  getStoreHealth,
} from "../../src/adapters/persistence/store-health";
import {
  createRun,
  publishRetainedEvidence,
  retainPayload,
  transitionRun,
} from "../../src/application/ingestion-coordinator";
import { closinMap } from "../../src/adapters/stores/closin/map";
import type { StagedOffer } from "../../src/contracts/offer";
import type { StoreRunEvidenceV2 } from "../../src/contracts/store-run-evidence";
import { handlePublishQueueMessage } from "../../src/adapters/queue/publish-consumer";
import { decodeQueueEnvelope } from "../../src/contracts/queue-envelope";
import { buildSearchDocument } from "../../src/domain/search-query";
import capacityArtifact from "../../src/adapters/stores/closin/capacity/capacity-artifact.json";

const checkedCapacity = capacityArtifact.dryRunInputsForStory13.story14FtsBatchExtension;

function staged(n: number, runId: string, prefix = "off"): StagedOffer[] {
  return Array.from({ length: n }, (_, i) => ({
    contractVersion: 1 as const,
    offerId: `${prefix}_${i}`,
    storeId: "closin",
    runId,
    sourceKey: `closin|https://www.closin.com.br/product-page/${prefix}-${i}|${prefix}SKU${i}`,
    continuityFingerprint: "semantic-v1|brand=closin|material=pla|mass=1000",
    canonicalPdpUrl: `https://www.closin.com.br/product-page/${prefix}-${i}`,
    merchantVariantId: `${prefix}SKU${i}`,
    brand: "Closin",
    specificType: "filament" as const,
    materialFamily: "PLA" as const,
    color: "Branco",
    diameterMm: 1.75,
    massGrams: 1000,
    listingTitle: `PLA Branco ${i}kg`,
    listingPriceCentavos: 8000 + i,
    originalPriceCentavos: null,
    isPromotion: false,
    availability: "available" as const,
    observedAt: "2026-08-08T08:02:00.000Z",
    mapVersion: 1,
    parserVersion: 1,
    normalizePolicyVersion: 1,
    standaloneOnly: false,
    visible: false as const,
  }));
}

type ActualBatchMetrics = {
  statementCount: number;
  totalBindCount: number;
  maxBindsPerStatement: number;
  totalSqlUtf8Bytes: number;
  maxSqlUtf8Bytes: number;
  totalBoundValueUtf8Bytes: number;
  durationMs: number;
};

function instrumentActualBatch(db: D1Database, injectLateFailure = false): {
  db: D1Database;
  metrics(): ActualBatchMetrics | null;
} {
  const records = new WeakMap<object, { statement: D1PreparedStatement; sql: string; binds: unknown[] }>();
  let latest: ActualBatchMetrics | null = null;
  const encoder = new TextEncoder();

  const wrap = (
    statement: D1PreparedStatement,
    sql: string,
    binds: unknown[] = [],
  ): D1PreparedStatement => {
    const proxy = new Proxy(statement as object, {
      get(target, property) {
        if (property === "bind") {
          return (...values: unknown[]) => wrap(statement.bind(...values), sql, values);
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as unknown as D1PreparedStatement;
    records.set(proxy as unknown as object, { statement, sql, binds });
    return proxy;
  };

  return {
    db: {
      prepare(sql: string) {
        return wrap(db.prepare(sql), sql);
      },
      async batch(statements: D1PreparedStatement[]) {
        const measured = statements.map((statement) => records.get(statement as unknown as object)!);
        const started = performance.now();
        try {
          return await db.batch([
            ...measured.map((record) => record.statement),
            ...(injectLateFailure
              ? [db.prepare("INSERT INTO projection_meta (id, projection_epoch, support_epoch, updated_at) VALUES (1, 1, 1, 'late-failure')")]
              : []),
          ]);
        } finally {
          const sqlBytes = measured.map((record) => encoder.encode(record.sql).byteLength);
          const bindBytes = measured.flatMap((record) => record.binds).map((value) =>
            value === null || value === undefined
              ? 0
              : encoder.encode(typeof value === "string" ? value : String(value)).byteLength
          );
          latest = {
            statementCount: measured.length,
            totalBindCount: measured.reduce((total, record) => total + record.binds.length, 0),
            maxBindsPerStatement: Math.max(...measured.map((record) => record.binds.length)),
            totalSqlUtf8Bytes: sqlBytes.reduce((total, bytes) => total + bytes, 0),
            maxSqlUtf8Bytes: Math.max(...sqlBytes),
            totalBoundValueUtf8Bytes: bindBytes.reduce((total, bytes) => total + bytes, 0),
            durationMs: Math.round((performance.now() - started) * 1000) / 1000,
          };
        }
      },
    } as unknown as D1Database,
    metrics: () => latest,
  };
}

async function approveClosin() {
  const now = "2026-08-08T10:00:00.000Z";
  const current = await env.DB.prepare(
    `SELECT support_state, activation_gate FROM store_state WHERE store_id = 'closin'`,
  ).first<{ support_state: string; activation_gate: string }>();

  if (current?.support_state === "unsupported") {
    await transitionStoreSupport(env.DB, {
      storeId: "closin",
      toState: "active",
      actor: "operator",
      reason: "test_activation_after_gate",
      nowIso: now,
    });
  } else if (
    current?.support_state === "deactivated" ||
    current?.support_state === "degraded"
  ) {
    // Tests should not leave these states; force via SQL for isolation.
    await env.DB.prepare(
      `UPDATE store_state SET support_state = 'active', updated_at = ? WHERE store_id = 'closin'`,
    )
      .bind(now)
      .run();
  }

  if (current?.activation_gate !== "approved") {
    await setPublicationActivationGate(env.DB, {
      storeId: "closin",
      gate: "approved",
      actor: "operator",
      reason: "test_gate_pass",
      nowIso: now,
    });
  }
}

async function bindRetainedArtifactForRun(input: {
  runId: string;
  idempotencyKey: string;
  messageId: string;
  claimedAt: string;
  recoveryEpoch?: number;
}) {
  const artifactId = `artifact-${input.runId}`;
  const digestSha256 = `digest-${input.runId}`;
  const recoveryEpoch = input.recoveryEpoch ?? 1;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO retained_payloads (
        artifact_id, store_id, run_id, digest_sha256, contract_version,
        map_version, parser_version, payload_json, byte_length, expires_at,
        purged_at, created_at
      ) VALUES (?, 'closin', ?, ?, 2, 1, 1, '{}', 2, ?, NULL, ?)`,
    ).bind(
      artifactId,
      input.runId,
      digestSha256,
      "2027-08-08T00:00:00.000Z",
      input.claimedAt,
    ),
    env.DB.prepare(
      `UPDATE ingestion_runs
       SET payload_artifact_id = ?, evidence_digest_sha256 = ?,
           map_version = 1, parser_version = 1
       WHERE run_id = ?`,
    ).bind(artifactId, digestSha256, input.runId),
    env.DB.prepare(
      `INSERT INTO ingestion_inbox (
        idempotency_key, store_id, run_id, message_id, status,
        recovery_epoch, payload_artifact_id, claimed_at, completed_at
      ) VALUES (?, 'closin', ?, ?, 'claimed', ?, ?, ?, NULL)`,
    ).bind(
      input.idempotencyKey,
      input.runId,
      input.messageId,
      recoveryEpoch,
      artifactId,
      input.claimedAt,
    ),
  ]);
  return { artifactId, digestSha256 };
}

function flipActiveSlotAfterSelector(db: D1Database): D1Database {
  let flipped = false;
  return {
    prepare(sql: string) {
      const statement = db.prepare(sql);
      if (!flipped && sql.includes("SELECT active_slot FROM search_projection_meta")) {
        return {
          first: async <T>() => {
            const selected = await statement.first<{ active_slot: "a" | "b" }>();
            if (!selected) return null;
            const next = selected.active_slot === "a" ? "b" : "a";
            await db.prepare(
              `UPDATE search_projection_meta SET active_slot = ? WHERE id = 1`,
            ).bind(next).run();
            flipped = true;
            return selected as T;
          },
        } as unknown as D1PreparedStatement;
      }
      return statement;
    },
    batch(statements: D1PreparedStatement[]) {
      return db.batch(statements);
    },
  } as unknown as D1Database;
}

function failActiveSlotSelector(db: D1Database): D1Database {
  return {
    prepare(sql: string) {
      if (sql.includes("SELECT active_slot FROM search_projection_meta")) {
        return {
          first: async () => { throw new Error("selector unavailable"); },
        } as unknown as D1PreparedStatement;
      }
      return db.prepare(sql);
    },
    batch(statements: D1PreparedStatement[]) {
      return db.batch(statements);
    },
  } as unknown as D1Database;
}

describe("Story 1.3 publication CAS / inbox / capacity (workers)", () => {
  it("rejects publication while activation gate is blocked", async () => {
    const runId = "run-blocked";
    await createRun(
      { db: env.DB, recoveryEpochAuthority: 1 },
      {
        runId,
        storeId: "closin",
        supportGeneration: 0,
        projectionEpoch: 1,
      },
    );
    await transitionRun(
      { db: env.DB, recoveryEpochAuthority: 1 },
      { runId, from: "created", to: "discovering" },
    );
    await transitionRun(
      { db: env.DB, recoveryEpochAuthority: 1 },
      { runId, from: "discovering", to: "staged" },
    );
    await transitionRun(
      { db: env.DB, recoveryEpochAuthority: 1 },
      { runId, from: "staged", to: "validated" },
    );
    await transitionRun(
      { db: env.DB, recoveryEpochAuthority: 1 },
      { runId, from: "validated", to: "publishing" },
    );

    await env.DB.prepare(
      `INSERT INTO ingestion_inbox (
        idempotency_key, store_id, run_id, message_id, status,
        recovery_epoch, payload_artifact_id, claimed_at, completed_at
      ) VALUES (?, 'closin', ?, 'm-blocked', 'claimed', 1, NULL, ?, NULL)`,
    )
      .bind("blocked-key", runId, "2026-08-08T10:00:00.000Z")
      .run();

    const result = await executePublicationBatch(env.DB, {
      fences: {
        storeId: "closin",
        runId,
        claimId: "claim-blocked",
        expectedStoreGeneration: 0,
        expectedSupportGeneration: 0,
        expectedProjectionEpoch: 1,
        expectedRecoveryEpoch: 1,
        recoveryEpochAuthority: 1,
      },
      publicationClass: "positive-only",
      staged: staged(1, runId),
      idempotencyKey: "blocked-key",
      nowIso: "2026-08-08T10:00:00.000Z",
      markAbsentUnavailable: false,
      runOutcome: "partial",
      failureCodes: [],
      observationCount: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("fence_mismatch");
  });

  it("publishes atomically when fences match and gate approved; replay is idempotent", async () => {
    await approveClosin();
    const runId = "run-ok";
    const deps = { db: env.DB, recoveryEpochAuthority: 1 };

    await createRun(deps, {
      runId,
      storeId: "closin",
      supportGeneration: 1,
      projectionEpoch: 1,
    });
    for (const [from, to] of [
      ["created", "discovering"],
      ["discovering", "staged"],
      ["staged", "validated"],
      ["validated", "publishing"],
    ] as const) {
      await transitionRun(deps, { runId, from, to });
    }

    const okArtifact = await bindRetainedArtifactForRun({
      runId,
      idempotencyKey: "ok-key",
      messageId: "m-ok",
      claimedAt: "2026-08-08T10:00:00.000Z",
    });

    // support_generation was bumped by transitionStoreSupport
    const health = await getStoreHealth(env.DB, "closin");
    expect(health?.activationGate).toBe("approved");

    const first = await executePublicationBatch(env.DB, {
      fences: {
        storeId: "closin",
        runId,
        claimId: "claim-ok",
        expectedStoreGeneration: 0,
        expectedSupportGeneration: health!.supportGeneration,
        expectedProjectionEpoch: 1,
        expectedRecoveryEpoch: 1,
        recoveryEpochAuthority: 1,
      },
      publicationClass: "positive-only",
      staged: staged(3, runId),
      idempotencyKey: "ok-key",
      nowIso: "2026-08-08T10:05:00.000Z",
      markAbsentUnavailable: false,
      runOutcome: "partial",
      failureCodes: [],
      observationCount: 3,
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.publishedCount).toBe(3);
      expect(first.newStoreGeneration).toBe(1);
    }

    const offers = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM offers WHERE store_id = 'closin' AND visible = 1`,
    ).first<{ c: number }>();
    expect(offers?.c).toBe(3);

    const pp = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM price_points`,
    ).first<{ c: number }>();
    expect(pp?.c).toBe(3);

    // Zero-row CAS on stale generation
    await createRun(deps, {
      runId: "run-stale",
      storeId: "closin",
      supportGeneration: health!.supportGeneration,
      projectionEpoch: 1,
    });
    for (const [from, to] of [
      ["created", "discovering"],
      ["discovering", "staged"],
      ["staged", "validated"],
      ["validated", "publishing"],
    ] as const) {
      await transitionRun(deps, { runId: "run-stale", from, to });
    }
    await bindRetainedArtifactForRun({
      runId: "run-stale",
      idempotencyKey: "stale-key",
      messageId: "m-stale",
      claimedAt: "2026-08-08T10:06:00.000Z",
    });

    const stale = await executePublicationBatch(env.DB, {
      fences: {
        storeId: "closin",
        runId: "run-stale",
        claimId: "claim-stale",
        expectedStoreGeneration: 0, // wrong — already advanced
        expectedSupportGeneration: health!.supportGeneration,
        expectedProjectionEpoch: 1,
        expectedRecoveryEpoch: 1,
        recoveryEpochAuthority: 1,
      },
      publicationClass: "positive-only",
      staged: staged(1, "run-stale"),
      idempotencyKey: "stale-key",
      nowIso: "2026-08-08T10:07:00.000Z",
      markAbsentUnavailable: false,
      runOutcome: "partial",
      failureCodes: [],
      observationCount: 1,
    });
    expect(stale.ok).toBe(false);

    // Inbox replay after completion → noop path via coordinator
    const evidence: StoreRunEvidenceV2 = {
      contractVersion: 2,
      storeId: "closin",
      runId,
      probeId: null,
      mapVersion: 1,
      parserVersion: 1,
      startedAt: "2026-08-08T08:00:00.000Z",
      finishedAt: "2026-08-08T08:01:00.000Z",
      budgetUsage: {
        fetchCount: 1,
        redirectHops: 0,
        encodedBytes: 10,
        decompressedBytes: 10,
        observationCount: 0,
        candidateCount: 0,
        subrequests: 1,
        durationMs: 1,
        stagedByteEstimate: 0,
        logEventBytes: 0,
      },
      catalogWork: { expected: 0, completed: 0 },
      outcome: "failed",
      observations: [],
      omissions: [],
      failureCodes: ["unknown"],
    };
    const replay = await publishRetainedEvidence(deps, {
      evidence,
      map: closinMap,
      idempotencyKey: "ok-key",
      messageId: "m-ok",
      payloadArtifactId: okArtifact.artifactId,
      payloadDigestSha256: okArtifact.digestSha256,
      expectedStoreGeneration: 1,
      expectedSupportGeneration: health!.supportGeneration,
      expectedProjectionEpoch: 1,
      allowedHosts: ["www.closin.com.br", "closin.com.br"],
    });
    expect(replay.outcome).toBe("idempotent_noop");
  });

  it("AD-8 capacity proof: bounded batch at catalog bound 134 with margin", async () => {
    await approveClosin();
    const runId = "run-capacity-134";
    const deps = { db: env.DB, recoveryEpochAuthority: 1 };
    const health = await getStoreHealth(env.DB, "closin");

    await createRun(deps, {
      runId,
      storeId: "closin",
      supportGeneration: health!.supportGeneration,
      projectionEpoch: 1,
    });
    for (const [from, to] of [
      ["created", "discovering"],
      ["discovering", "staged"],
      ["staged", "validated"],
      ["validated", "publishing"],
    ] as const) {
      await transitionRun(deps, { runId, from, to });
    }

    const currentGen =
      (
        await env.DB.prepare(
          `SELECT store_generation FROM store_state WHERE store_id = 'closin'`,
        ).first<{ store_generation: number }>()
      )?.store_generation ?? 0;

    await bindRetainedArtifactForRun({
      runId,
      idempotencyKey: "cap-key",
      messageId: "m-cap",
      claimedAt: "2026-08-08T11:00:00.000Z",
    });

    const rows = staged(capacityArtifact.catalogBoundWithMargin, runId, "capacity");
    const measuredDb = instrumentActualBatch(env.DB);
    const result = await executePublicationBatch(measuredDb.db, {
      fences: {
        storeId: "closin",
        runId,
        claimId: "claim-cap",
        expectedStoreGeneration: currentGen,
        expectedSupportGeneration: health!.supportGeneration,
        expectedProjectionEpoch: 1,
        expectedRecoveryEpoch: 1,
        recoveryEpochAuthority: 1,
      },
      publicationClass: "positive-only",
      staged: rows,
      idempotencyKey: "cap-key",
      nowIso: "2026-08-08T11:00:00.000Z",
      markAbsentUnavailable: false,
      runOutcome: "partial",
      failureCodes: [],
      observationCount: rows.length,
    });
    const metrics = measuredDb.metrics();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.publishedCount).toBe(capacityArtifact.catalogBoundWithMargin);
    }
    expect(metrics).toMatchObject({
      statementCount: checkedCapacity.measuredStatements,
      totalBindCount: checkedCapacity.measuredTotalBinds,
      maxBindsPerStatement: checkedCapacity.measuredMaxBindsPerStatement,
      totalSqlUtf8Bytes: checkedCapacity.measuredTotalSqlUtf8Bytes,
      maxSqlUtf8Bytes: checkedCapacity.measuredMaxSqlUtf8Bytes,
      totalBoundValueUtf8Bytes: checkedCapacity.measuredTotalBoundValueUtf8Bytes,
    });
    expect(metrics!.maxSqlUtf8Bytes).toBeLessThan(100_000);
    expect(metrics!.durationMs).toBeLessThan(checkedCapacity.durationBudgetMs);
    expect(rows).toHaveLength(checkedCapacity.measuredRows);
    const encoder = new TextEncoder();
    expect(encoder.encode(JSON.stringify(rows)).byteLength).toBe(
      checkedCapacity.serializedStagedFixtureBytes,
    );
    expect(rows.reduce(
      (total, row) => total + encoder.encode(
        buildSearchDocument([row.brand, row.materialFamily, row.listingTitle]),
      ).byteLength,
      0,
    )).toBe(checkedCapacity.canonicalSearchTextBytes);
    console.info("CAPACITY_134_ACTUAL", JSON.stringify(metrics));

    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM offers WHERE store_id = 'closin'`,
    ).first<{ c: number }>();
    expect(count?.c).toBeGreaterThanOrEqual(134);

  });

  it("rolls back every 134-row effect when the actual batch fails at its final statement", async () => {
    await approveClosin();
    const runId = "run-capacity-rollback-134";
    const health = await getStoreHealth(env.DB, "closin");
    const deps = { db: env.DB, recoveryEpochAuthority: health!.recoveryEpochSnapshot };
    await createRun(deps, {
      runId,
      storeId: "closin",
      supportGeneration: health!.supportGeneration,
      projectionEpoch: health!.projectionEpoch,
    });
    for (const [from, to] of [
      ["created", "discovering"],
      ["discovering", "staged"],
      ["staged", "validated"],
      ["validated", "publishing"],
    ] as const) await transitionRun(deps, { runId, from, to });
    await bindRetainedArtifactForRun({
      runId,
      idempotencyKey: "capacity-rollback-key",
      messageId: "capacity-rollback-message",
      claimedAt: "2026-08-09T15:00:00.000Z",
      recoveryEpoch: health!.recoveryEpochSnapshot,
    });
    const beforeSearchMeta = await env.DB.prepare(
      `SELECT active_slot, index_version, parser_version, projection_epoch,
              search_write_generation, rebuild_owner, rebuild_lease_expires_at, updated_at
       FROM search_projection_meta WHERE id = 1`,
    ).first<{
      active_slot: "a" | "b";
      index_version: number;
      parser_version: number;
      projection_epoch: number;
      search_write_generation: number;
      rebuild_owner: string | null;
      rebuild_lease_expires_at: string | null;
      updated_at: string;
    }>();
    expect(beforeSearchMeta).not.toBeNull();
    const beforeProjectionMeta = await env.DB.prepare(
      "SELECT projection_epoch, support_epoch, updated_at FROM projection_meta WHERE id = 1",
    ).first<{ projection_epoch: number; support_epoch: number; updated_at: string }>();
    const activeTable = beforeSearchMeta!.active_slot === "a" ? "search_fts_a" : "search_fts_b";
    const beforeFts = await env.DB.prepare(
      `SELECT offer_id, search_text FROM ${activeTable} ORDER BY offer_id, search_text`,
    ).all<{ offer_id: string; search_text: string }>();
    const failingDb = instrumentActualBatch(env.DB, true);
    const rows = staged(capacityArtifact.catalogBoundWithMargin, runId, "rollback134");
    const result = await executePublicationBatch(failingDb.db, {
      fences: {
        storeId: "closin",
        runId,
        claimId: "claim-capacity-rollback-134",
        expectedStoreGeneration: health!.storeGeneration,
        expectedSupportGeneration: health!.supportGeneration,
        expectedProjectionEpoch: health!.projectionEpoch,
        expectedRecoveryEpoch: health!.recoveryEpochSnapshot,
        recoveryEpochAuthority: health!.recoveryEpochSnapshot,
      },
      publicationClass: "positive-only",
      staged: rows,
      idempotencyKey: "capacity-rollback-key",
      nowIso: "2026-08-09T15:01:00.000Z",
      markAbsentUnavailable: false,
      runOutcome: "partial",
      failureCodes: [],
      observationCount: rows.length,
    });
    expect(result).toMatchObject({ ok: false, code: "batch_failed" });
    expect(failingDb.metrics()).toMatchObject({
      statementCount: checkedCapacity.measuredStatements,
      totalBindCount: checkedCapacity.measuredTotalBinds,
    });
    expect(rows).toHaveLength(checkedCapacity.rollbackRows);
    expect(checkedCapacity.rollbackFailurePosition).toBe(
      checkedCapacity.measuredStatements + 1,
    );
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM offers WHERE offer_id LIKE 'rollback134_%'").first<{ n: number }>()).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM publication_claims WHERE claim_id = 'claim-capacity-rollback-134'").first<{ n: number }>()).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM staged_offers WHERE run_id = 'run-capacity-rollback-134'").first<{ n: number }>()).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT state FROM ingestion_runs WHERE run_id = 'run-capacity-rollback-134'").first<{ state: string }>()).toEqual({ state: "publishing" });
    expect(await env.DB.prepare("SELECT status FROM ingestion_inbox WHERE idempotency_key = 'capacity-rollback-key'").first<{ status: string }>()).toEqual({ status: "claimed" });
    expect((await env.DB.prepare(
      `SELECT offer_id, search_text FROM ${activeTable} ORDER BY offer_id, search_text`,
    ).all<{ offer_id: string; search_text: string }>()).results).toEqual(beforeFts.results);
    expect(await env.DB.prepare(
      `SELECT active_slot, index_version, parser_version, projection_epoch,
              search_write_generation, rebuild_owner, rebuild_lease_expires_at, updated_at
       FROM search_projection_meta WHERE id = 1`,
    ).first()).toEqual(beforeSearchMeta);
    expect(await env.DB.prepare(
      "SELECT projection_epoch, support_epoch, updated_at FROM projection_meta WHERE id = 1",
    ).first()).toEqual(beforeProjectionMeta);
    expect((await getStoreHealth(env.DB, "closin"))?.storeGeneration).toBe(health!.storeGeneration);
  });

  it("rejects old recovery epoch and expired payload in queue consumer", async () => {
    const deps = { db: env.DB, recoveryEpochAuthority: 2 };
    const envelope = {
      contractVersion: 1 as const,
      kind: "ingest.publish" as const,
      messageId: "m-old",
      idempotencyKey: "old-epoch",
      storeId: "closin",
      runId: "run-old",
      storeGeneration: 0,
      supportGeneration: 0,
      projectionEpoch: 1,
      recoveryEpoch: 1, // old
      payloadDigestSha256: "abc",
      payloadArtifactId: "missing",
      payloadExpiresAt: "2026-08-09T00:00:00.000Z",
      enqueuedAt: "2026-08-08T08:00:00.000Z",
      probeId: null,
    };
    expect(decodeQueueEnvelope(envelope).recoveryEpoch).toBe(1);
    const result = await handlePublishQueueMessage({
      deps,
      rawBody: envelope,
      map: closinMap,
      allowedHosts: ["www.closin.com.br"],
    });
    expect(result.action).toBe("ack");

    const expired = await handlePublishQueueMessage({
      deps: { db: env.DB, recoveryEpochAuthority: 1 },
      rawBody: {
        ...envelope,
        recoveryEpoch: 1,
        payloadExpiresAt: "2020-01-01T00:00:00.000Z",
      },
      map: closinMap,
      allowedHosts: ["www.closin.com.br"],
    });
    expect(expired.action).toBe("dlq");
    if (expired.action === "dlq") expect(expired.reason).toBe("payload_expired");
  });

  it("retains payload and verifies digest; publish-nothing on failed evidence", async () => {
    await approveClosin();
    const deps = { db: env.DB, recoveryEpochAuthority: 1 };
    const evidence: StoreRunEvidenceV2 = {
      contractVersion: 2,
      storeId: "closin",
      runId: "run-fail",
      probeId: null,
      mapVersion: 1,
      parserVersion: 1,
      startedAt: "2026-08-08T08:00:00.000Z",
      finishedAt: "2026-08-08T08:01:00.000Z",
      budgetUsage: {
        fetchCount: 1,
        redirectHops: 0,
        encodedBytes: 10,
        decompressedBytes: 10,
        observationCount: 0,
        candidateCount: 0,
        subrequests: 1,
        durationMs: 1,
        stagedByteEstimate: 0,
        logEventBytes: 0,
      },
      catalogWork: { expected: 0, completed: 0 },
      outcome: "failed",
      observations: [],
      omissions: [],
      failureCodes: ["fetch_failed"],
    };

    const retained = await retainPayload(deps, {
      artifactId: "art-fail",
      storeId: "closin",
      runId: "run-fail",
      evidence,
      expiresAt: "2026-12-01T00:00:00.000Z",
    });
    expect(retained.digestSha256).toMatch(/^[a-f0-9]{64}$/);

    const genBefore =
      (
        await env.DB.prepare(
          `SELECT store_generation FROM store_state WHERE store_id = 'closin'`,
        ).first<{ store_generation: number }>()
      )?.store_generation ?? 0;

    const health = await getStoreHealth(env.DB, "closin");
    const result = await publishRetainedEvidence(deps, {
      evidence,
      map: closinMap,
      idempotencyKey: "fail-key",
      messageId: "m-fail",
      payloadArtifactId: "art-fail",
      payloadDigestSha256: retained.digestSha256,
      expectedStoreGeneration: genBefore,
      expectedSupportGeneration: health!.supportGeneration,
      expectedProjectionEpoch: 1,
      allowedHosts: ["www.closin.com.br"],
    });
    expect(result.outcome).toBe("terminal_no_publish");

    const genAfter =
      (
        await env.DB.prepare(
          `SELECT store_generation FROM store_state WHERE store_id = 'closin'`,
        ).first<{ store_generation: number }>()
      )?.store_generation ?? 0;
    expect(genAfter).toBe(genBefore);
  });

  it("rejects illegal Store support transitions without operator", async () => {
    const bad = await transitionStoreSupport(env.DB, {
      storeId: "closin",
      toState: "deactivated",
      actor: "system",
      reason: "nope",
      nowIso: "2026-08-08T12:00:00.000Z",
    });
    expect(bad.ok).toBe(false);
  });

  it("appends a PricePoint only when the price actually changes across republishes", async () => {
    await approveClosin();
    const deps = { db: env.DB, recoveryEpochAuthority: 1 };

    async function publishOnce(
      runId: string,
      claimId: string,
      idempotencyKey: string,
      listingPriceCentavos: number,
      originalPriceCentavos: number | null = null,
      observedAt = "2026-08-08T08:02:00.000Z",
    ) {
      const health = await getStoreHealth(env.DB, "closin");
      await createRun(deps, {
        runId,
        storeId: "closin",
        supportGeneration: health!.supportGeneration,
        projectionEpoch: 1,
      });
      for (const [from, to] of [
        ["created", "discovering"],
        ["discovering", "staged"],
        ["staged", "validated"],
        ["validated", "publishing"],
      ] as const) {
        await transitionRun(deps, { runId, from, to });
      }
      await bindRetainedArtifactForRun({
        runId,
        idempotencyKey,
        messageId: `m-${runId}`,
        claimedAt: "2026-08-08T11:00:00.000Z",
      });

      const offer = staged(1, runId)[0]!;
      offer.offerId = "off_pp_regression";
      offer.sourceKey = "closin|https://www.closin.com.br/product-page/pp-regression|SKU-PP";
      offer.canonicalPdpUrl = "https://www.closin.com.br/product-page/pp-regression";
      offer.merchantVariantId = "SKU-PP";
      offer.listingPriceCentavos = listingPriceCentavos;
      offer.originalPriceCentavos = originalPriceCentavos;
      offer.observedAt = observedAt;

      return executePublicationBatch(env.DB, {
        fences: {
          storeId: "closin",
          runId,
          claimId,
          expectedStoreGeneration: health!.storeGeneration,
          expectedSupportGeneration: health!.supportGeneration,
          expectedProjectionEpoch: 1,
          expectedRecoveryEpoch: 1,
          recoveryEpochAuthority: 1,
        },
        publicationClass: "positive-only",
        staged: [offer],
        idempotencyKey,
        nowIso: "2026-08-08T11:00:00.000Z",
        markAbsentUnavailable: false,
        runOutcome: "partial",
        failureCodes: [],
        observationCount: 1,
      });
    }

    const first = await publishOnce("run-pp-1", "claim-pp-1", "pp-key-1", 5000);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.pricePointsAppended).toBe(1);

    const countAfterFirst = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM price_points WHERE offer_id = 'off_pp_regression'`,
    ).first<{ c: number }>();
    expect(countAfterFirst?.c).toBe(1);

    // Republish with the SAME price — must not append a duplicate PricePoint.
    const second = await publishOnce("run-pp-2", "claim-pp-2", "pp-key-2", 5000);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.pricePointsAppended).toBe(0);

    const countAfterSecond = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM price_points WHERE offer_id = 'off_pp_regression'`,
    ).first<{ c: number }>();
    expect(countAfterSecond?.c).toBe(1);

    // Republish with a CHANGED price — must append exactly one new PricePoint
    // and mark the prior one non-effective.
    const third = await publishOnce("run-pp-3", "claim-pp-3", "pp-key-3", 5500);
    expect(third.ok).toBe(true);
    if (third.ok) expect(third.pricePointsAppended).toBe(1);

    const rows = await env.DB.prepare(
      `SELECT listing_price_centavos AS price, effective FROM price_points
       WHERE offer_id = 'off_pp_regression' ORDER BY recorded_at`,
    ).all<{ price: number; effective: number }>();
    expect(rows.results).toHaveLength(2);
    const effectiveRows = rows.results.filter((r) => r.effective === 1);
    expect(effectiveRows).toHaveLength(1);
    expect(effectiveRows[0]?.price).toBe(5500);

    // A null → positive original-price change is a distinct tuple and must not
    // leave the previous point effective.
    const fourth = await publishOnce(
      "run-pp-4",
      "claim-pp-4",
      "pp-key-4",
      5500,
      7000,
    );
    expect(fourth.ok).toBe(true);
    if (fourth.ok) expect(fourth.pricePointsAppended).toBe(1);
    const afterOriginalChange = await env.DB.prepare(
      `SELECT original_price_centavos AS originalPrice, effective
       FROM price_points WHERE offer_id = 'off_pp_regression'`,
    ).all<{ originalPrice: number | null; effective: number }>();
    expect(afterOriginalChange.results.filter((row) => row.effective === 1)).toEqual([
      { originalPrice: 7000, effective: 1 },
    ]);

    // A late observation cannot rewind current facts or append price history.
    const late = await publishOnce(
      "run-pp-5",
      "claim-pp-5",
      "pp-key-5",
      9999,
      null,
      "2026-08-07T08:02:00.000Z",
    );
    expect(late.ok).toBe(true);
    if (late.ok) expect(late.pricePointsAppended).toBe(0);
    const currentOffer = await env.DB.prepare(
      `SELECT listing_price_centavos AS listingPrice,
              original_price_centavos AS originalPrice,
              observed_at AS observedAt
       FROM offers WHERE offer_id = 'off_pp_regression'`,
    ).first<{
      listingPrice: number;
      originalPrice: number | null;
      observedAt: string;
    }>();
    expect(currentOffer).toEqual({
      listingPrice: 5500,
      originalPrice: 7000,
      observedAt: "2026-08-08T08:02:00.000Z",
    });

    const effective = afterOriginalChange.results.find((row) => row.effective === 1);
    expect(effective).toBeDefined();
    const effectivePoint = await env.DB.prepare(
      `SELECT price_point_id AS id FROM price_points
       WHERE offer_id = 'off_pp_regression' AND effective = 1`,
    ).first<{ id: string }>();
    const correction = await appendPricePointCorrection(env.DB, {
      pricePointId: "pp-correction-1",
      offerId: "off_pp_regression",
      storeId: "closin",
      runId: "correction-run-1",
      listingPriceCentavos: 5400,
      originalPriceCentavos: 7000,
      observedAt: "2026-08-08T08:02:00.000Z",
      recordedAt: "2026-08-09T12:00:00.000Z",
      correctsPricePointId: effectivePoint!.id,
    });
    expect(correction).toEqual({ ok: true });
    const duplicateSuccessor = await appendPricePointCorrection(env.DB, {
      pricePointId: "pp-correction-2",
      offerId: "off_pp_regression",
      storeId: "closin",
      runId: "correction-run-2",
      listingPriceCentavos: 5300,
      originalPriceCentavos: 7000,
      observedAt: "2026-08-08T08:02:00.000Z",
      recordedAt: "2026-08-09T12:01:00.000Z",
      correctsPricePointId: effectivePoint!.id,
    });
    expect(duplicateSuccessor).toEqual({ ok: false, code: "correction_rejected" });
  });

  it("blocks unsupported Stores and advances a restored recovery snapshot monotonically", async () => {
    await approveClosin();
    const unsupported = await transitionStoreSupport(env.DB, {
      storeId: "closin",
      toState: "unsupported",
      actor: "coordinator",
      reason: "test_policy_failure",
      nowIso: "2026-08-09T13:00:00.000Z",
    });
    expect(unsupported).toEqual({ ok: true });
    const blockedHealth = await getStoreHealth(env.DB, "closin");
    const blockedRunId = "run-unsupported-review";
    const deps1 = { db: env.DB, recoveryEpochAuthority: 1 };
    await createRun(deps1, {
      runId: blockedRunId,
      storeId: "closin",
      supportGeneration: blockedHealth!.supportGeneration,
      projectionEpoch: 1,
    });
    for (const [from, to] of [
      ["created", "discovering"],
      ["discovering", "staged"],
      ["staged", "validated"],
      ["validated", "publishing"],
    ] as const) {
      await transitionRun(deps1, { runId: blockedRunId, from, to });
    }
    await bindRetainedArtifactForRun({
      runId: blockedRunId,
      idempotencyKey: "unsupported-review-key",
      messageId: "unsupported-review-message",
      claimedAt: "2026-08-09T13:00:00.000Z",
    });
    const blocked = await executePublicationBatch(env.DB, {
      fences: {
        storeId: "closin",
        runId: blockedRunId,
        claimId: "unsupported-review-claim",
        expectedStoreGeneration: blockedHealth!.storeGeneration,
        expectedSupportGeneration: blockedHealth!.supportGeneration,
        expectedProjectionEpoch: 1,
        expectedRecoveryEpoch: 1,
        recoveryEpochAuthority: 1,
      },
      publicationClass: "positive-only",
      staged: staged(1, blockedRunId),
      idempotencyKey: "unsupported-review-key",
      nowIso: "2026-08-09T13:01:00.000Z",
      markAbsentUnavailable: false,
      runOutcome: "partial",
      failureCodes: [],
      observationCount: 1,
    });
    expect(blocked.ok).toBe(false);

    const reactivated = await transitionStoreSupport(env.DB, {
      storeId: "closin",
      toState: "active",
      actor: "operator",
      reason: "test_safe_probe_and_approval",
      nowIso: "2026-08-09T13:02:00.000Z",
    });
    expect(reactivated).toEqual({ ok: true });

    const restored = await getStoreHealth(env.DB, "closin");
    const recoveryRunId = "run-recovery-epoch-2";
    const deps2 = { db: env.DB, recoveryEpochAuthority: 2 };
    await createRun(deps2, {
      runId: recoveryRunId,
      storeId: "closin",
      supportGeneration: restored!.supportGeneration,
      projectionEpoch: 1,
    });
    for (const [from, to] of [
      ["created", "discovering"],
      ["discovering", "staged"],
      ["staged", "validated"],
      ["validated", "publishing"],
    ] as const) {
      await transitionRun(deps2, { runId: recoveryRunId, from, to });
    }
    await bindRetainedArtifactForRun({
      runId: recoveryRunId,
      idempotencyKey: "recovery-review-key",
      messageId: "recovery-review-message",
      claimedAt: "2026-08-09T13:03:00.000Z",
      recoveryEpoch: 2,
    });
    const recovered = await executePublicationBatch(env.DB, {
      fences: {
        storeId: "closin",
        runId: recoveryRunId,
        claimId: "recovery-review-claim",
        expectedStoreGeneration: restored!.storeGeneration,
        expectedSupportGeneration: restored!.supportGeneration,
        expectedProjectionEpoch: 1,
        expectedRecoveryEpoch: 2,
        recoveryEpochAuthority: 2,
      },
      publicationClass: "positive-only",
      staged: staged(1, recoveryRunId),
      idempotencyKey: "recovery-review-key",
      nowIso: "2026-08-09T13:04:00.000Z",
      markAbsentUnavailable: false,
      runOutcome: "partial",
      failureCodes: ["fetch_failed"],
      observationCount: 1,
    });
    expect(recovered.ok).toBe(true);
    const recoveredHealth = await getStoreHealth(env.DB, "closin");
    expect(recoveredHealth?.recoveryEpochSnapshot).toBe(2);
    expect(recoveredHealth?.lastRunOutcome).toBe("partial");
    expect(recoveredHealth?.lastFailureCodes).toEqual(["fetch_failed"]);
  });

  it("loses publication and support claims without side effects when the slot races", async () => {
    await approveClosin();
    const before = await getStoreHealth(env.DB, "closin");
    expect(before).not.toBeNull();
    const metaBefore = await env.DB.prepare(
      `SELECT active_slot, search_write_generation FROM search_projection_meta WHERE id = 1`,
    ).first<{ active_slot: "a" | "b"; search_write_generation: number }>();

    const runId = "run-slot-race";
    const deps = { db: env.DB, recoveryEpochAuthority: before!.recoveryEpochSnapshot };
    await createRun(deps, {
      runId,
      storeId: "closin",
      supportGeneration: before!.supportGeneration,
      projectionEpoch: before!.projectionEpoch,
    });
    for (const [from, to] of [
      ["created", "discovering"],
      ["discovering", "staged"],
      ["staged", "validated"],
      ["validated", "publishing"],
    ] as const) {
      await transitionRun(deps, { runId, from, to });
    }
    await bindRetainedArtifactForRun({
      runId,
      idempotencyKey: "slot-race-key",
      messageId: "slot-race-message",
      claimedAt: "2026-08-09T13:30:00.000Z",
      recoveryEpoch: before!.recoveryEpochSnapshot,
    });

    const publishInput: PublishBatchInput = {
      fences: {
        storeId: "closin",
        runId,
        claimId: "slot-race-claim",
        expectedStoreGeneration: before!.storeGeneration,
        expectedSupportGeneration: before!.supportGeneration,
        expectedProjectionEpoch: before!.projectionEpoch,
        expectedRecoveryEpoch: before!.recoveryEpochSnapshot,
        recoveryEpochAuthority: before!.recoveryEpochSnapshot,
      },
      publicationClass: "positive-only",
      staged: staged(1, runId),
      idempotencyKey: "slot-race-key",
      nowIso: "2026-08-09T13:31:00.000Z",
      markAbsentUnavailable: false,
      runOutcome: "partial",
      failureCodes: [],
      observationCount: 1,
    };
    const selectorFailure = await executePublicationBatch(
      failActiveSlotSelector(env.DB), publishInput,
    );
    expect(selectorFailure).toMatchObject({
      ok: false, code: "batch_failed", detail: "active_slot_selector_failed",
    });
    const racedPublication = await executePublicationBatch(
      flipActiveSlotAfterSelector(env.DB), publishInput,
    );
    expect(racedPublication).toMatchObject({ ok: false, code: "fence_mismatch" });
    expect(await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM publication_claims WHERE run_id = ?`,
    ).bind(runId).first<{ n: number }>()).toEqual({ n: 0 });
    expect(await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM offers WHERE store_generation = ?`,
    ).bind(before!.storeGeneration + 1).first<{ n: number }>()).toEqual({ n: 0 });
    expect(await env.DB.prepare(
      `SELECT state FROM ingestion_runs WHERE run_id = ?`,
    ).bind(runId).first<{ state: string }>()).toEqual({ state: "publishing" });
    expect(await getStoreHealth(env.DB, "closin")).toMatchObject({
      storeGeneration: before!.storeGeneration,
      supportGeneration: before!.supportGeneration,
    });
    const afterPublicationMeta = await env.DB.prepare(
      `SELECT search_write_generation FROM search_projection_meta WHERE id = 1`,
    ).first<{ search_write_generation: number }>();
    expect(afterPublicationMeta?.search_write_generation).toBe(metaBefore?.search_write_generation);

    // Restore only the independently raced selector state, then race support CAS.
    await env.DB.prepare(
      `UPDATE search_projection_meta SET active_slot = ? WHERE id = 1`,
    ).bind(metaBefore!.active_slot).run();
    const auditBefore = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM store_lifecycle_audit`,
    ).first<{ n: number }>();
    const visibleBefore = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM offers WHERE store_id = 'closin' AND visible = 1`,
    ).first<{ n: number }>();

    const failedSupportSelector = await transitionStoreSupport(failActiveSlotSelector(env.DB), {
      storeId: "closin",
      toState: "degraded",
      actor: "system",
      reason: "selector_failure",
      nowIso: "2026-08-09T13:31:30.000Z",
    });
    expect(failedSupportSelector).toEqual({
      ok: false, code: "active_slot_selector_failed",
    });

    const racedSupport = await transitionStoreSupport(flipActiveSlotAfterSelector(env.DB), {
      storeId: "closin",
      toState: "degraded",
      actor: "system",
      reason: "slot_race",
      nowIso: "2026-08-09T13:32:00.000Z",
    });
    expect(racedSupport).toEqual({ ok: false, code: "stale_state" });
    expect(await getStoreHealth(env.DB, "closin")).toMatchObject({
      supportState: "active",
      storeGeneration: before!.storeGeneration,
      supportGeneration: before!.supportGeneration,
    });
    expect(await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM store_lifecycle_audit`,
    ).first<{ n: number }>()).toEqual(auditBefore);
    expect(await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM offers WHERE store_id = 'closin' AND visible = 1`,
    ).first<{ n: number }>()).toEqual(visibleBefore);
    const afterSupportMeta = await env.DB.prepare(
      `SELECT search_write_generation FROM search_projection_meta WHERE id = 1`,
    ).first<{ search_write_generation: number }>();
    expect(afterSupportMeta?.search_write_generation).toBe(metaBefore?.search_write_generation);
    await env.DB.prepare(
      `UPDATE search_projection_meta SET active_slot = ? WHERE id = 1`,
    ).bind(metaBefore!.active_slot).run();
  });

  it("publishes and transitions support when the inactive FTS table is dropped", async () => {
    await approveClosin();
    const before = await getStoreHealth(env.DB, "closin");
    expect(before).not.toBeNull();

    const runId = "run-inactive-fts-dropped";
    const deps = { db: env.DB, recoveryEpochAuthority: before!.recoveryEpochSnapshot };
    await createRun(deps, {
      runId,
      storeId: "closin",
      supportGeneration: before!.supportGeneration,
      projectionEpoch: before!.projectionEpoch,
    });
    for (const [from, to] of [
      ["created", "discovering"],
      ["discovering", "staged"],
      ["staged", "validated"],
      ["validated", "publishing"],
    ] as const) {
      await transitionRun(deps, { runId, from, to });
    }
    await bindRetainedArtifactForRun({
      runId,
      idempotencyKey: "inactive-fts-dropped-key",
      messageId: "inactive-fts-dropped-message",
      claimedAt: "2026-08-09T14:00:00.000Z",
      recoveryEpoch: before!.recoveryEpochSnapshot,
    });

    const meta = await env.DB.prepare(
      `SELECT active_slot FROM search_projection_meta WHERE id = 1`,
    ).first<{ active_slot: "a" | "b" }>();
    expect(meta?.active_slot).toMatch(/^[ab]$/);
    const inactiveTable = meta!.active_slot === "a" ? "search_fts_b" : "search_fts_a";
    await env.DB.prepare(`DROP TABLE ${inactiveTable}`).run();

    const published = await executePublicationBatch(env.DB, {
      fences: {
        storeId: "closin",
        runId,
        claimId: "inactive-fts-dropped-claim",
        expectedStoreGeneration: before!.storeGeneration,
        expectedSupportGeneration: before!.supportGeneration,
        expectedProjectionEpoch: before!.projectionEpoch,
        expectedRecoveryEpoch: before!.recoveryEpochSnapshot,
        recoveryEpochAuthority: before!.recoveryEpochSnapshot,
      },
      publicationClass: "positive-only",
      staged: staged(1, runId),
      idempotencyKey: "inactive-fts-dropped-key",
      nowIso: "2026-08-09T14:01:00.000Z",
      markAbsentUnavailable: false,
      runOutcome: "partial",
      failureCodes: [],
      observationCount: 1,
    });
    expect(published).toMatchObject({ ok: true });

    const transitioned = await transitionStoreSupport(env.DB, {
      storeId: "closin",
      toState: "degraded",
      actor: "system",
      reason: "inactive_fts_must_not_block",
      nowIso: "2026-08-09T14:02:00.000Z",
    });
    expect(transitioned).toEqual({ ok: true });
  });
});
