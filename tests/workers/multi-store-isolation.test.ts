import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { executePublicationBatch } from "../../src/adapters/persistence/publish-batch";
import {
  setPublicationActivationGate,
  setStoreDisplayName,
  transitionStoreSupport,
} from "../../src/adapters/persistence/store-health";
import { createD1SearchCatalog } from "../../src/adapters/persistence/d1-search-catalog";
import { getSearchPage } from "../../src/application/get-search-page";
import {
  createRun,
  transitionRun,
} from "../../src/application/ingestion-coordinator";
import type { StagedOffer } from "../../src/contracts/offer";
import { VOOLT3D_BUDGETS } from "../../src/adapters/stores/voolt3d/budgets";

async function activateStore(
  storeId: "closin" | "voolt3d",
  displayName: string,
  supportState: "active" | "degraded" = "active",
): Promise<void> {
  const now = "2026-08-10T00:00:00.000Z";
  const current = await env.DB.prepare(
    `SELECT support_state, activation_gate FROM store_state WHERE store_id = ?`,
  )
    .bind(storeId)
    .first<{ support_state: string; activation_gate: string }>();

  expect(current).toBeTruthy();

  if (current!.support_state === "unsupported") {
    await transitionStoreSupport(env.DB, {
      storeId,
      toState: supportState,
      actor: "operator",
      reason: "test_activation",
      nowIso: now,
    });
  } else {
    await env.DB.prepare(
      `UPDATE store_state SET support_state = ?, updated_at = ? WHERE store_id = ?`,
    )
      .bind(supportState, now, storeId)
      .run();
  }

  if (current!.activation_gate !== "approved") {
    await setPublicationActivationGate(env.DB, {
      storeId,
      gate: "approved",
      actor: "operator",
      reason: "test_gate",
      nowIso: now,
    });
  }

  await setStoreDisplayName(env.DB, {
    storeId,
    displayName,
    nowIso: now,
  });
}

async function preparePublishingRun(
  storeId: "closin" | "voolt3d",
  runId: string,
): Promise<{ supportGeneration: number; storeGeneration: number }> {
  const deps = { db: env.DB, recoveryEpochAuthority: 1 };
  const health = await env.DB.prepare(
    `SELECT store_generation, support_generation FROM store_state WHERE store_id = ?`,
  )
    .bind(storeId)
    .first<{ store_generation: number; support_generation: number }>();

  await createRun(deps, {
    runId,
    storeId,
    supportGeneration: health!.support_generation,
    projectionEpoch: 1,
  });
  await transitionRun(deps, { runId, from: "created", to: "discovering" });
  await transitionRun(deps, { runId, from: "discovering", to: "staged" });
  await transitionRun(deps, { runId, from: "staged", to: "validated" });
  await transitionRun(deps, { runId, from: "validated", to: "publishing" });

  return {
    supportGeneration: health!.support_generation,
    storeGeneration: health!.store_generation,
  };
}

async function bindRetainedArtifactForRun(input: {
  storeId: "closin" | "voolt3d";
  runId: string;
  idempotencyKey: string;
  messageId: string;
  claimedAt: string;
}): Promise<void> {
  const artifactId = `artifact-${input.runId}`;
  const digestSha256 = `digest-${input.runId}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO retained_payloads (
        artifact_id, store_id, run_id, digest_sha256, contract_version,
        map_version, parser_version, payload_json, byte_length, expires_at,
        purged_at, created_at
      ) VALUES (?, ?, ?, ?, 2, 1, 1, '{}', 2, ?, NULL, ?)`,
    ).bind(
      artifactId,
      input.storeId,
      input.runId,
      digestSha256,
      "2027-08-10T00:00:00.000Z",
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
      ) VALUES (?, ?, ?, ?, 'claimed', 1, ?, ?, NULL)`,
    ).bind(
      input.idempotencyKey,
      input.storeId,
      input.runId,
      input.messageId,
      artifactId,
      input.claimedAt,
    ),
  ]);
}

function stagedFor(
  storeId: "closin" | "voolt3d",
  runId: string,
  i: number,
  overrides: Partial<StagedOffer> = {},
): StagedOffer {
  const host =
    storeId === "closin"
      ? "https://www.closin.com.br/product-page"
      : "https://voolt3d.com.br/produtos";
  const brand = storeId === "closin" ? "Closin" : "Voolt3D";
  return {
    contractVersion: 1,
    offerId: `${storeId}_ms_${i}`,
    storeId,
    runId,
    sourceKey: `${storeId}|${host}/ms-${i}|SKU${i}`,
    continuityFingerprint: `semantic-v1|brand=${storeId}|material=pla|mass=1000`,
    canonicalPdpUrl: `${host}/ms-${i}`,
    merchantVariantId: `SKU${i}`,
    brand,
    specificType: "filament",
    materialFamily: "PLA",
    color: "Branco",
    diameterMm: 1.75,
    massGrams: 1000,
    listingTitle: "Filamento PLA Branco Premium 1kg",
    listingPriceCentavos: 8000 + i,
    originalPriceCentavos: null,
    isPromotion: false,
    availability: "available",
    observedAt: "2026-08-10T03:00:00.000Z",
    mapVersion: 1,
    parserVersion: 1,
    normalizePolicyVersion: 1,
    standaloneOnly: false,
    visible: false,
    ...overrides,
  };
}

async function publishOneOffer(input: {
  storeId: "closin" | "voolt3d";
  runId: string;
  idempotencyKey: string;
  messageId: string;
  claimedAt: string;
  nowIso: string;
  publicationClass?: "authoritative-complete" | "positive-only";
  runOutcome?: "complete" | "partial";
  failureCodes?: string[];
  observationCount?: number;
  staged?: StagedOffer[];
}): Promise<void> {
  const fences = await preparePublishingRun(input.storeId, input.runId);
  await bindRetainedArtifactForRun({
    storeId: input.storeId,
    runId: input.runId,
    idempotencyKey: input.idempotencyKey,
    messageId: input.messageId,
    claimedAt: input.claimedAt,
  });
  const result = await executePublicationBatch(env.DB, {
    fences: {
      storeId: input.storeId,
      runId: input.runId,
      claimId: `claim-${input.runId}`,
      expectedStoreGeneration: fences.storeGeneration,
      expectedSupportGeneration: fences.supportGeneration,
      expectedProjectionEpoch: 1,
      expectedRecoveryEpoch: 1,
      recoveryEpochAuthority: 1,
    },
    publicationClass: input.publicationClass ?? "authoritative-complete",
    staged: input.staged ?? [stagedFor(input.storeId, input.runId, 0)],
    idempotencyKey: input.idempotencyKey,
    nowIso: input.nowIso,
    markAbsentUnavailable: (input.publicationClass ?? "authoritative-complete") === "authoritative-complete",
    runOutcome: input.runOutcome ?? "complete",
    failureCodes: input.failureCodes ?? [],
    observationCount: input.observationCount ?? 1,
  });
  expect(result.ok).toBe(true);
}

async function activeFtsTable(): Promise<"search_fts_a" | "search_fts_b"> {
  const meta = await env.DB.prepare(
    `SELECT active_slot FROM search_projection_meta WHERE id = 1`,
  ).first<{ active_slot: "a" | "b" }>();
  return meta?.active_slot === "b" ? "search_fts_b" : "search_fts_a";
}

describe("Story 1.5 multi-Store publication isolation + search", () => {
  it("seeds voolt3d blocked/unsupported by default", async () => {
    const row = await env.DB.prepare(
      `SELECT support_state, activation_gate, display_name, store_generation
       FROM store_state WHERE store_id = 'voolt3d'`,
    ).first<{
      support_state: string;
      activation_gate: string;
      display_name: string;
      store_generation: number;
    }>();
    expect(row).toEqual({
      support_state: "unsupported",
      activation_gate: "blocked",
      display_name: "Voolt3D",
      store_generation: 0,
    });
  });

  it("publishes Voolt3D without changing Closin generation or visible Offers", async () => {
    await activateStore("closin", "Closin");
    await activateStore("voolt3d", "Voolt3D");

    // Seed a prior Closin generation
    const closinRun = "run-ms-closin-base";
    const closinFences = await preparePublishingRun("closin", closinRun);
    await bindRetainedArtifactForRun({
      storeId: "closin",
      runId: closinRun,
      idempotencyKey: "ms-closin-base",
      messageId: "msg-ms-closin-base",
      claimedAt: "2026-08-10T00:00:00.000Z",
    });
    const closinPub = await executePublicationBatch(env.DB, {
      fences: {
        storeId: "closin",
        runId: closinRun,
        claimId: "claim-ms-closin-base",
        expectedStoreGeneration: closinFences.storeGeneration,
        expectedSupportGeneration: closinFences.supportGeneration,
        expectedProjectionEpoch: 1,
        expectedRecoveryEpoch: 1,
        recoveryEpochAuthority: 1,
      },
      publicationClass: "authoritative-complete",
      staged: [stagedFor("closin", closinRun, 0)],
      idempotencyKey: "ms-closin-base",
      nowIso: "2026-08-10T00:05:00.000Z",
      markAbsentUnavailable: true,
      runOutcome: "complete",
      failureCodes: [],
      observationCount: 1,
    });
    expect(closinPub.ok).toBe(true);

    const closinBefore = await env.DB.prepare(
      `SELECT store_generation FROM store_state WHERE store_id = 'closin'`,
    ).first<{ store_generation: number }>();
    const closinVisibleBefore = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM offers WHERE store_id = 'closin' AND visible = 1`,
    ).first<{ n: number }>();

    const vooltRun = "run-ms-voolt-ok";
    const vooltFences = await preparePublishingRun("voolt3d", vooltRun);
    await bindRetainedArtifactForRun({
      storeId: "voolt3d",
      runId: vooltRun,
      idempotencyKey: "ms-voolt-ok",
      messageId: "msg-ms-voolt-ok",
      claimedAt: "2026-08-10T00:10:00.000Z",
    });
    const vooltPub = await executePublicationBatch(env.DB, {
      fences: {
        storeId: "voolt3d",
        runId: vooltRun,
        claimId: "claim-ms-voolt-ok",
        expectedStoreGeneration: vooltFences.storeGeneration,
        expectedSupportGeneration: vooltFences.supportGeneration,
        expectedProjectionEpoch: 1,
        expectedRecoveryEpoch: 1,
        recoveryEpochAuthority: 1,
      },
      publicationClass: "authoritative-complete",
      staged: [
        stagedFor("voolt3d", vooltRun, 0),
        stagedFor("voolt3d", vooltRun, 1, {
          listingTitle: "Filamento PLA Branco Premium 1kg",
        }),
      ],
      idempotencyKey: "ms-voolt-ok",
      nowIso: "2026-08-10T00:15:00.000Z",
      markAbsentUnavailable: true,
      runOutcome: "complete",
      failureCodes: [],
      observationCount: 2,
    });
    expect(vooltPub.ok).toBe(true);
    if (vooltPub.ok) expect(vooltPub.newStoreGeneration).toBe(1);

    const closinAfter = await env.DB.prepare(
      `SELECT store_generation FROM store_state WHERE store_id = 'closin'`,
    ).first<{ store_generation: number }>();
    const closinVisibleAfter = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM offers WHERE store_id = 'closin' AND visible = 1`,
    ).first<{ n: number }>();
    expect(closinAfter?.store_generation).toBe(closinBefore?.store_generation);
    expect(closinVisibleAfter?.n).toBe(closinVisibleBefore?.n);

    const vooltVisible = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM offers WHERE store_id = 'voolt3d' AND visible = 1`,
    ).first<{ n: number }>();
    expect(vooltVisible?.n).toBe(2);
  });

  it("allows concurrent open claims for Closin and Voolt3D", async () => {
    await activateStore("closin", "Closin");
    await activateStore("voolt3d", "Voolt3D");

    // Clear any leftover open claims from prior tests in this worker isolate.
    await env.DB.prepare(
      `UPDATE publication_claims SET status = 'aborted', completed_at = ?
       WHERE status = 'open'`,
    )
      .bind("2026-08-10T00:59:00.000Z")
      .run();

    const deps = { db: env.DB, recoveryEpochAuthority: 1 };
    for (const [storeId, runId] of [
      ["closin", "run-open-c"],
      ["voolt3d", "run-open-v"],
      ["closin", "run-open-c2"],
    ] as const) {
      const health = await env.DB.prepare(
        `SELECT support_generation FROM store_state WHERE store_id = ?`,
      )
        .bind(storeId)
        .first<{ support_generation: number }>();
      await createRun(deps, {
        runId,
        storeId,
        supportGeneration: health!.support_generation,
        projectionEpoch: 1,
      });
    }

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO publication_claims (
          claim_id, store_id, run_id, status, expected_store_generation,
          expected_support_generation, expected_projection_epoch,
          expected_recovery_epoch, created_at, completed_at
        ) VALUES ('open-closin', 'closin', 'run-open-c', 'open', 0, 1, 1, 1, ?, NULL)`,
      ).bind("2026-08-10T01:00:00.000Z"),
      env.DB.prepare(
        `INSERT INTO publication_claims (
          claim_id, store_id, run_id, status, expected_store_generation,
          expected_support_generation, expected_projection_epoch,
          expected_recovery_epoch, created_at, completed_at
        ) VALUES ('open-voolt', 'voolt3d', 'run-open-v', 'open', 0, 1, 1, 1, ?, NULL)`,
      ).bind("2026-08-10T01:00:00.000Z"),
    ]);

    const open = await env.DB.prepare(
      `SELECT store_id FROM publication_claims WHERE status = 'open' ORDER BY store_id`,
    ).all<{ store_id: string }>();
    expect((open.results ?? []).map((r) => r.store_id)).toEqual([
      "closin",
      "voolt3d",
    ]);

    // Second open claim for the same Store must fail the unique index.
    let secondClosinFailed = false;
    try {
      await env.DB.prepare(
        `INSERT INTO publication_claims (
          claim_id, store_id, run_id, status, expected_store_generation,
          expected_support_generation, expected_projection_epoch,
          expected_recovery_epoch, created_at, completed_at
        ) VALUES ('open-closin-2', 'closin', 'run-open-c2', 'open', 0, 1, 1, 1, ?, NULL)`,
      )
        .bind("2026-08-10T01:01:00.000Z")
        .run();
    } catch {
      secondClosinFailed = true;
    }
    expect(secondClosinFailed).toBe(true);

    await env.DB.prepare(
      `UPDATE publication_claims SET status = 'aborted', completed_at = ?
       WHERE status = 'open'`,
    )
      .bind("2026-08-10T01:02:00.000Z")
      .run();
  });

  it("returns mixed-Store search hits as standalone offers with FTS≡fallback identities", async () => {
    await activateStore("closin", "Closin");
    await activateStore("voolt3d", "Voolt3D", "degraded");

    for (const storeId of ["closin", "voolt3d"] as const) {
      const runId = `run-ms-search-${storeId}`;
      const fences = await preparePublishingRun(storeId, runId);
      await bindRetainedArtifactForRun({
        storeId,
        runId,
        idempotencyKey: `ms-search-${storeId}`,
        messageId: `msg-ms-search-${storeId}`,
        claimedAt: "2026-08-10T02:00:00.000Z",
      });
      const pub = await executePublicationBatch(env.DB, {
        fences: {
          storeId,
          runId,
          claimId: `claim-ms-search-${storeId}`,
          expectedStoreGeneration: fences.storeGeneration,
          expectedSupportGeneration: fences.supportGeneration,
          expectedProjectionEpoch: 1,
          expectedRecoveryEpoch: 1,
          recoveryEpochAuthority: 1,
        },
        publicationClass: "authoritative-complete",
        staged: [
          stagedFor(storeId, runId, 20, {
            offerId: `${storeId}_mix_20`,
            listingPriceCentavos: storeId === "closin" ? 9000 : 9500,
            listingTitle: "Filamento MixToken XYZ Premium 1kg",
          }),
        ],
        idempotencyKey: `ms-search-${storeId}`,
        nowIso: "2026-08-10T02:05:00.000Z",
        markAbsentUnavailable: true,
        runOutcome: "complete",
        failureCodes: [],
        observationCount: 1,
      });
      if (!pub.ok) {
        expect.fail(`publish ${storeId} failed: ${pub.code}`);
      }
    }

    // Ensure searchable text for mixed query
    await env.DB.prepare(
      `UPDATE offers SET search_text = 'filamento mixtoken xyz premium marca overlap',
         listing_title = 'Filamento MixToken XYZ Premium 1kg'
       WHERE offer_id IN ('closin_mix_20', 'voolt3d_mix_20')`,
    ).run();
    const meta = await env.DB.prepare(
      `SELECT active_slot FROM search_projection_meta WHERE id = 1`,
    ).first<{ active_slot: string }>();
    const table =
      meta?.active_slot === "b" ? "search_fts_b" : "search_fts_a";
    await env.DB.batch([
      env.DB.prepare(
        `DELETE FROM ${table} WHERE offer_id IN ('closin_mix_20', 'voolt3d_mix_20')`,
      ),
      env.DB.prepare(
        `INSERT INTO ${table} (offer_id, search_text)
         SELECT offer_id, search_text FROM offers
         WHERE offer_id IN ('closin_mix_20', 'voolt3d_mix_20')`,
      ),
    ]);

    const catalog = createD1SearchCatalog(env.DB);
    const page = await getSearchPage(catalog, { q: "mixtoken xyz" });
    expect(page.outcome).toBe("ok");
    if (page.outcome !== "ok") return;

    const storeIds = page.data.hits.map((h) => h.storeId);
    expect(storeIds).toContain("closin");
    expect(storeIds).toContain("voolt3d");
    expect(page.data.hits.every((h) => h.kind === "offer")).toBe(true);
    expect(page.data.hits.map((h) => h.storeName).sort()).toEqual([
      "Closin",
      "Voolt3D",
    ]);
    // No Merge — overlapping titles remain separate rows
    expect(page.data.hits).toHaveLength(2);
    expect(new Set(page.data.hits.map((h) => h.id)).size).toBe(2);

    const supportIds = page.data.storeSupport.map((s) => s.storeId);
    expect(supportIds).toContain("closin");
    expect(supportIds).toContain("voolt3d");
    expect(
      page.data.storeSupport.find((s) => s.storeId === "voolt3d")?.supportState,
    ).toBe("degraded");

    // Deterministic order: same availability → lower price first
    expect(page.data.hits[0]?.storeId).toBe("closin");
    expect(page.data.hits[1]?.storeId).toBe("voolt3d");

    const ftsIds = page.data.hits.map((h) => h.id);
    // Force relational fallback and compare ordered identities
    await env.DB.prepare(
      `DELETE FROM ${table} WHERE offer_id IN ('closin_mix_20', 'voolt3d_mix_20')`,
    ).run();
    const fallback = await getSearchPage(catalog, { q: "mixtoken xyz" });
    expect(fallback.outcome).toBe("degraded");
    if (fallback.outcome !== "degraded") return;
    expect(fallback.data.hits.map((h) => h.id)).toEqual(ftsIds);
  });

  it("cuts unsupported Voolt3D from search while Closin remains searchable", async () => {
    await activateStore("closin", "Closin");
    await activateStore("voolt3d", "Voolt3D");

    for (const storeId of ["closin", "voolt3d"] as const) {
      const runId = `run-ms-cut-${storeId}`;
      const fences = await preparePublishingRun(storeId, runId);
      await bindRetainedArtifactForRun({
        storeId,
        runId,
        idempotencyKey: `ms-cut-${storeId}`,
        messageId: `msg-ms-cut-${storeId}`,
        claimedAt: "2026-08-10T03:00:00.000Z",
      });
      const pub = await executePublicationBatch(env.DB, {
        fences: {
          storeId,
          runId,
          claimId: `claim-ms-cut-${storeId}`,
          expectedStoreGeneration: fences.storeGeneration,
          expectedSupportGeneration: fences.supportGeneration,
          expectedProjectionEpoch: 1,
          expectedRecoveryEpoch: 1,
          recoveryEpochAuthority: 1,
        },
        publicationClass: "authoritative-complete",
        staged: [stagedFor(storeId, runId, 9)],
        idempotencyKey: `ms-cut-${storeId}`,
        nowIso: "2026-08-10T03:05:00.000Z",
        markAbsentUnavailable: true,
        runOutcome: "complete",
        failureCodes: [],
        observationCount: 1,
      });
      expect(pub.ok).toBe(true);
    }

    await env.DB.prepare(
      `UPDATE offers SET search_text = 'filamento isolamento cut teste',
         listing_title = 'Filamento Isolamento Cut'
       WHERE offer_id IN ('closin_ms_9', 'voolt3d_ms_9')`,
    ).run();
    const meta = await env.DB.prepare(
      `SELECT active_slot FROM search_projection_meta WHERE id = 1`,
    ).first<{ active_slot: string }>();
    const table =
      meta?.active_slot === "b" ? "search_fts_b" : "search_fts_a";
    await env.DB.batch([
      env.DB.prepare(
        `DELETE FROM ${table} WHERE offer_id IN ('closin_ms_9', 'voolt3d_ms_9')`,
      ),
      env.DB.prepare(
        `INSERT INTO ${table} (offer_id, search_text)
         SELECT offer_id, search_text FROM offers
         WHERE offer_id IN ('closin_ms_9', 'voolt3d_ms_9')`,
      ),
    ]);

    await transitionStoreSupport(env.DB, {
      storeId: "voolt3d",
      toState: "unsupported",
      actor: "operator",
      reason: "test_cut",
      nowIso: "2026-08-10T03:10:00.000Z",
    });

    const catalog = createD1SearchCatalog(env.DB);
    const page = await getSearchPage(catalog, { q: "isolamento cut" });
    expect(page.outcome).toBe("ok");
    if (page.outcome !== "ok") return;
    expect(page.data.hits.every((h) => h.storeId === "closin")).toBe(true);
    expect(page.data.hits.some((h) => h.storeId === "voolt3d")).toBe(false);
  });

  it("records Voolt3D capacity bound with ≥20% margin for AD-8 reuse", () => {
    expect(VOOLT3D_BUDGETS.measuredCatalogBound).toBe(213);
    expect(VOOLT3D_BUDGETS.catalogBoundWithMargin).toBe(256);
    expect(VOOLT3D_BUDGETS.catalogBoundWithMargin).toBeGreaterThanOrEqual(
      Math.ceil(213 * 1.2),
    );
  });

  it.each([
    {
      outcome: "failed" as const,
      failureCodesJson: '["fetch_failed"]',
    },
    {
      outcome: "quarantined" as const,
      failureCodesJson: '["captcha_or_auth_wall"]',
    },
    {
      outcome: "oversized" as const,
      failureCodesJson: '["budget_overflow"]',
    },
  ])(
    "retains last valid Closin generation and FTS docs when Voolt3D publishes nothing ($outcome)",
    async ({ outcome, failureCodesJson }) => {
      await activateStore("closin", "Closin");
      await activateStore("voolt3d", "Voolt3D");

      await publishOneOffer({
        storeId: "closin",
        runId: `run-ms-closin-retained-${outcome}`,
        idempotencyKey: `ms-closin-retained-${outcome}`,
        messageId: `msg-ms-closin-retained-${outcome}`,
        claimedAt: "2026-08-10T04:00:00.000Z",
        nowIso: "2026-08-10T04:01:00.000Z",
        staged: [
          stagedFor("closin", `run-ms-closin-retained-${outcome}`, 91, {
            offerId: `closin_retained_${outcome}`,
            sourceKey: `closin|https://www.closin.com.br/product-page/retained-${outcome}|RETAINED-${outcome}`,
            canonicalPdpUrl: `https://www.closin.com.br/product-page/retained-${outcome}`,
            merchantVariantId: `RETAINED-${outcome}`,
            listingTitle: `Filamento Retained Closin ${outcome}`,
          }),
        ],
      });

      const table = await activeFtsTable();
      const closinGen = await env.DB.prepare(
        `SELECT store_generation FROM store_state WHERE store_id = 'closin'`,
      ).first<{ store_generation: number }>();
      const closinFtsBefore = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM ${table} WHERE offer_id = ?`,
      )
        .bind(`closin_retained_${outcome}`)
        .first<{ n: number }>();

      await env.DB.prepare(
        `UPDATE store_state
         SET last_run_outcome = ?,
             last_failure_codes_json = ?,
             updated_at = ?
         WHERE store_id = 'voolt3d'`,
      )
        .bind(outcome, failureCodesJson, "2026-08-10T04:02:00.000Z")
        .run();

      const closinAfter = await env.DB.prepare(
        `SELECT store_generation FROM store_state WHERE store_id = 'closin'`,
      ).first<{ store_generation: number }>();
      const closinFtsAfter = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM ${table} WHERE offer_id = ?`,
      )
        .bind(`closin_retained_${outcome}`)
        .first<{ n: number }>();
      expect(closinAfter?.store_generation).toBe(closinGen?.store_generation);
      expect(closinFtsAfter?.n).toBe(closinFtsBefore?.n);

      const vooltState = await env.DB.prepare(
        `SELECT store_generation, last_run_outcome FROM store_state WHERE store_id = 'voolt3d'`,
      ).first<{ store_generation: number; last_run_outcome: string }>();
      expect(vooltState?.last_run_outcome).toBe(outcome);
    },
  );

  it("retains Closin generation and FTS docs when Voolt3D publishes a positive-only partial batch", async () => {
    await activateStore("closin", "Closin");
    await activateStore("voolt3d", "Voolt3D");

    await publishOneOffer({
      storeId: "closin",
      runId: "run-ms-closin-partial-baseline",
      idempotencyKey: "ms-closin-partial-baseline",
      messageId: "msg-ms-closin-partial-baseline",
      claimedAt: "2026-08-10T04:10:00.000Z",
      nowIso: "2026-08-10T04:11:00.000Z",
      staged: [
        stagedFor("closin", "run-ms-closin-partial-baseline", 92, {
          offerId: "closin_partial_baseline",
          sourceKey: "closin|https://www.closin.com.br/product-page/partial-baseline|PARTIAL-BASELINE",
          canonicalPdpUrl: "https://www.closin.com.br/product-page/partial-baseline",
          merchantVariantId: "PARTIAL-BASELINE",
          listingTitle: "Filamento Closin Partial Baseline",
        }),
      ],
    });

    const table = await activeFtsTable();
    const closinGen = await env.DB.prepare(
      `SELECT store_generation FROM store_state WHERE store_id = 'closin'`,
    ).first<{ store_generation: number }>();
    const closinFtsBefore = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM ${table} WHERE offer_id = 'closin_partial_baseline'`,
    ).first<{ n: number }>();

    await publishOneOffer({
      storeId: "voolt3d",
      runId: "run-ms-voolt-partial",
      idempotencyKey: "ms-voolt-partial",
      messageId: "msg-ms-voolt-partial",
      claimedAt: "2026-08-10T04:12:00.000Z",
      nowIso: "2026-08-10T04:13:00.000Z",
      publicationClass: "positive-only",
      runOutcome: "partial",
      failureCodes: ["fetch_failed"],
      observationCount: 1,
      staged: [
        stagedFor("voolt3d", "run-ms-voolt-partial", 93, {
          offerId: "voolt3d_partial_offer",
          sourceKey: "voolt3d|https://voolt3d.com.br/produtos/partial-offer/|VOOLT-PARTIAL",
          canonicalPdpUrl: "https://voolt3d.com.br/produtos/partial-offer/",
          merchantVariantId: "VOOLT-PARTIAL",
          listingTitle: "Filamento Voolt Partial Offer",
        }),
      ],
    });

    const closinAfter = await env.DB.prepare(
      `SELECT store_generation FROM store_state WHERE store_id = 'closin'`,
    ).first<{ store_generation: number }>();
    const closinFtsAfter = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM ${table} WHERE offer_id = 'closin_partial_baseline'`,
    ).first<{ n: number }>();
    expect(closinAfter?.store_generation).toBe(closinGen?.store_generation);
    expect(closinFtsAfter?.n).toBe(closinFtsBefore?.n);

    const vooltState = await env.DB.prepare(
      `SELECT store_generation, last_run_outcome FROM store_state WHERE store_id = 'voolt3d'`,
    ).first<{ store_generation: number; last_run_outcome: string }>();
    expect(vooltState?.store_generation).toBeGreaterThan(0);
    expect(vooltState?.last_run_outcome).toBe("partial");
  });
});
