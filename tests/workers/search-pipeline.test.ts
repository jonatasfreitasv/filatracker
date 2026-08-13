import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { executePublicationBatch } from "../../src/adapters/persistence/publish-batch";
import {
  setPublicationActivationGate,
  setStoreDisplayName,
  transitionStoreSupport,
} from "../../src/adapters/persistence/store-health";
import { rebuildSearchFtsShadow } from "../../src/adapters/persistence/fts-writer";
import { createD1SearchCatalog } from "../../src/adapters/persistence/d1-search-catalog";
import { encodeSearchCursor } from "../../src/adapters/persistence/search-cursor";
import { getSearchPage } from "../../src/application/get-search-page";
import {
  createRun,
  transitionRun,
} from "../../src/application/ingestion-coordinator";
import type { StagedOffer } from "../../src/contracts/offer";

async function approveClosin(): Promise<void> {
  const now = "2026-08-09T00:00:00.000Z";
  const current = await env.DB.prepare(
    `SELECT support_state, activation_gate FROM store_state WHERE store_id = 'closin'`,
  ).first<{ support_state: string; activation_gate: string }>();

  if (current?.support_state === "unsupported") {
    await transitionStoreSupport(env.DB, {
      storeId: "closin",
      toState: "active",
      actor: "operator",
      reason: "test_activation",
      nowIso: now,
    });
  } else if (
    current?.support_state === "deactivated" ||
    current?.support_state === "degraded"
  ) {
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
      reason: "test_gate",
      nowIso: now,
    });
  }

  await setStoreDisplayName(env.DB, {
    storeId: "closin",
    displayName: "Closin",
    nowIso: now,
  });
}

async function bindRetainedArtifactForRun(input: {
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
      ) VALUES (?, 'closin', ?, ?, 2, 1, 1, '{}', 2, ?, NULL, ?)`,
    ).bind(
      artifactId,
      input.runId,
      digestSha256,
      "2027-08-09T00:00:00.000Z",
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
      ) VALUES (?, 'closin', ?, ?, 'claimed', 1, ?, ?, NULL)`,
    ).bind(
      input.idempotencyKey,
      input.runId,
      input.messageId,
      artifactId,
      input.claimedAt,
    ),
  ]);
}

function stagedOffer(runId: string, i: number): StagedOffer {
  const observedAt = [
    "2026-08-09T03:02:00.000Z",
    "2026-08-09T01:03:00.000-03:00",
    "2026-08-09T06:04:00.000+02:00",
  ][i] ?? "2026-08-09T03:05:00.000Z";
  return {
    contractVersion: 1,
    offerId: `off_search_${i}`,
    storeId: "closin",
    runId,
    sourceKey: `closin|https://www.closin.com.br/product-page/search-${i}|SKU${i}`,
    continuityFingerprint: "semantic-v1|brand=closin|material=pla|mass=1000",
    canonicalPdpUrl: `https://www.closin.com.br/product-page/search-${i}`,
    merchantVariantId: `SKU${i}`,
    brand: "Closin",
    specificType: "filament",
    materialFamily: i % 2 === 0 ? "PLA" : "PETG",
    color: "Branco",
    diameterMm: 1.75,
    massGrams: 1000,
    listingTitle: i % 2 === 0 ? "PLA Branco 1kg Premium" : "PETG Preto 1kg",
    listingPriceCentavos: 8000,
    originalPriceCentavos: null,
    isPromotion: false,
    availability: "available",
    observedAt,
    mapVersion: 1,
    parserVersion: 1,
    normalizePolicyVersion: 1,
    standaloneOnly: false,
    visible: false,
  };
}

async function preparePublishingRun(runId: string): Promise<{
  supportGeneration: number;
  storeGeneration: number;
}> {
  const deps = { db: env.DB, recoveryEpochAuthority: 1 };
  const health = await env.DB.prepare(
    `SELECT store_generation, support_generation FROM store_state WHERE store_id = 'closin'`,
  ).first<{ store_generation: number; support_generation: number }>();

  await createRun(deps, {
    runId,
    storeId: "closin",
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

describe("search pipeline (publish → FTS → aggregate)", () => {
  it("publishes visible Offers into FTS and returns hydrated hits", async () => {
    await approveClosin();

    const runId = "run-search-1";
    const fences = await preparePublishingRun(runId);
    await bindRetainedArtifactForRun({
      runId,
      idempotencyKey: "search-key-1",
      messageId: "msg-search-1",
      claimedAt: "2026-08-09T00:00:00.000Z",
    });

    const published = await executePublicationBatch(env.DB, {
      fences: {
        storeId: "closin",
        runId,
        claimId: "claim-search-1",
        expectedStoreGeneration: fences.storeGeneration,
        expectedSupportGeneration: fences.supportGeneration,
        expectedProjectionEpoch: 1,
        expectedRecoveryEpoch: 1,
        recoveryEpochAuthority: 1,
      },
      publicationClass: "authoritative-complete",
      staged: [stagedOffer(runId, 0), stagedOffer(runId, 1), stagedOffer(runId, 2)],
      idempotencyKey: "search-key-1",
      nowIso: "2026-08-09T00:05:00.000Z",
      markAbsentUnavailable: true,
      runOutcome: "complete",
      failureCodes: [],
      observationCount: 3,
    });
    expect(published.ok).toBe(true);

    const persistedInstants = await env.DB.prepare(
      `SELECT offer_id, observed_at FROM offers
       WHERE offer_id LIKE 'off_search_%' ORDER BY observed_at DESC, offer_id ASC`,
    ).all<{ offer_id: string; observed_at: string }>();
    expect(persistedInstants.results).toEqual([
      { offer_id: "off_search_2", observed_at: "2026-08-09T04:04:00.000Z" },
      { offer_id: "off_search_1", observed_at: "2026-08-09T04:03:00.000Z" },
      { offer_id: "off_search_0", observed_at: "2026-08-09T03:02:00.000Z" },
    ]);

    const meta = await env.DB.prepare(
      `SELECT active_slot FROM search_projection_meta WHERE id = 1`,
    ).first<{ active_slot: string }>();
    const table =
      meta?.active_slot === "b" ? "search_fts_b" : "search_fts_a";
    const ftsCount = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM ${table}`,
    ).first<{ n: number }>();
    expect(ftsCount?.n).toBe(3);

    const matchProbe = await env.DB.prepare(
      `SELECT offer_id FROM ${table} WHERE ${table} MATCH ?`,
    )
      .bind('"pla"')
      .all<{ offer_id: string }>();
    expect((matchProbe.results ?? []).length).toBeGreaterThan(0);

    const catalog = createD1SearchCatalog(env.DB);
    await env.DB.prepare(
      `UPDATE offers SET diameter_mm = '1001' WHERE offer_id = 'off_search_0'`,
    ).run();
    const result = await getSearchPage(catalog, { q: "PLA" });
    expect(result.outcome).toBe("ok");
    if (result.outcome !== "ok") return;
    expect(result.data.hits.length).toBeGreaterThan(0);
    expect(result.data.hits.every((h) => h.kind === "offer")).toBe(true);
    expect(result.data.hits[0]?.storeName).toBe("Closin");
    expect(result.data.hits.some((h) => /PLA/i.test(h.title))).toBe(true);
    expect(result.data.hits.find((h) => h.id === "off_search_0")?.diameterMm).toBeNull();
    expect(result.data.storeSupport.length).toBeGreaterThan(0);

    const inactiveTable = table === "search_fts_a" ? "search_fts_b" : "search_fts_a";
    await env.DB.prepare(
      `INSERT INTO ${inactiveTable} (offer_id, search_text) VALUES ('inactive_ghost', 'pla')`,
    ).run();
    const ignoresInactiveDivergence = await getSearchPage(catalog, { q: "PLA" });
    expect(ignoresInactiveDivergence.outcome).toBe("ok");

    const firstPage = await getSearchPage(catalog, { q: "1kg", limit: 1 });
    expect(firstPage.outcome).toBe("ok");
    if (firstPage.outcome !== "ok") return;
    expect(firstPage.data.totalCount).toBe(3);
    expect(firstPage.data.hasNextPage).toBe(true);
    expect(firstPage.data.nextCursor).not.toBeNull();
    const pagedIds = [firstPage.data.hits[0]!.id];
    let cursor = firstPage.data.nextCursor;
    while (cursor) {
      const nextPage = await getSearchPage(catalog, { q: "1kg", limit: 1, cursor });
      expect(nextPage.outcome).toBe("ok");
      if (nextPage.outcome !== "ok") return;
      expect(nextPage.data.totalCount).toBe(3);
      pagedIds.push(nextPage.data.hits[0]!.id);
      cursor = nextPage.data.nextCursor;
    }
    expect(pagedIds).toEqual(["off_search_2", "off_search_1", "off_search_0"]);
    expect(new Set(pagedIds).size).toBe(3);

    // Equal counts and an unchanged first-page boundary are insufficient: one
    // missing legitimate document compensated by one orphan must still fail the
    // global identity-set check.
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM ${table} WHERE offer_id = ?`).bind("off_search_0"),
      env.DB.prepare(
        `INSERT INTO ${table} (offer_id, search_text) VALUES ('compensating_orphan', '1kg')`,
      ),
    ]);
    const compensatedDrift = await getSearchPage(catalog, { q: "1kg", limit: 1 });
    expect(compensatedDrift.outcome).toBe("degraded");
    if (compensatedDrift.outcome === "degraded") {
      expect(compensatedDrift.data.totalCount).toBe(3);
      expect(compensatedDrift.data.hits[0]?.id).toBe("off_search_2");
    }
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM ${table} WHERE offer_id = ?`).bind("compensating_orphan"),
      env.DB.prepare(
        `INSERT INTO ${table} (offer_id, search_text)
         SELECT offer_id, search_text FROM offers WHERE offer_id = ?`,
      ).bind("off_search_0"),
    ]);

    await env.DB.batch([
      env.DB.prepare(`DELETE FROM ${table} WHERE offer_id = ?`).bind("off_search_0"),
      env.DB.prepare(
        `INSERT INTO ${table} (offer_id, search_text) VALUES ('ordered_ghost', 'pla')`,
      ),
    ]);
    const partial = await getSearchPage(catalog, { q: "PLA" });
    expect(partial.outcome).toBe("degraded");
    if (partial.outcome === "degraded") {
      expect(partial.data.hits.map((hit) => hit.id)).toContain("off_search_0");
    }

    const maximumQuery = `${"a".repeat(48)} ${"b".repeat(48)} ${"c".repeat(22)}`;
    await env.DB.batch([
      env.DB.prepare(`UPDATE offers SET search_text = ? WHERE store_id = 'closin'`).bind(maximumQuery),
      env.DB.prepare(`DELETE FROM ${table}`),
      env.DB.prepare(
        `INSERT INTO ${table} (offer_id, search_text)
         SELECT offer_id, search_text FROM offers WHERE store_id = 'closin' AND visible = 1`,
      ),
    ]);
    const maximumPage = await getSearchPage(catalog, { q: maximumQuery, limit: 1 });
    expect(maximumPage.outcome).toBe("ok");
    if (maximumPage.outcome === "ok") {
      expect(maximumPage.data.nextCursor).not.toBeNull();
      expect(new TextEncoder().encode(maximumPage.data.nextCursor!).byteLength).toBeLessThanOrEqual(1024);
    }
  });

  it("excludes unsupported Store Offers from search atomically", async () => {
    await approveClosin();
    // Ensure there is something to cut — prior test may have published.
    await transitionStoreSupport(env.DB, {
      storeId: "closin",
      toState: "unsupported",
      actor: "operator",
      reason: "cut",
      nowIso: "2026-08-09T01:00:00.000Z",
    });

    const catalog = createD1SearchCatalog(env.DB);
    const result = await getSearchPage(catalog, { q: "PLA" });
    expect(result.outcome).toBe("ok");
    if (result.outcome === "ok") {
      expect(result.data.hits).toEqual([]);
    }
  });

  it("rebuilds shadow FTS and CAS-activates", async () => {
    await approveClosin();
    const state = await env.DB.prepare(
      `SELECT support_state FROM store_state WHERE store_id = 'closin'`,
    ).first<{ support_state: string }>();
    if (state?.support_state === "unsupported") {
      await transitionStoreSupport(env.DB, {
        storeId: "closin",
        toState: "active",
        actor: "operator",
        reason: "reactivate",
        nowIso: "2026-08-09T02:00:00.000Z",
      });
    }

    const rebuild = await rebuildSearchFtsShadow(
      env.DB,
      "2026-08-09T02:01:00.000Z",
    );
    expect(rebuild.ok).toBe(true);
  });

  it("reclaims an expired rebuild lease deterministically", async () => {
    await approveClosin();
    await env.DB.prepare(
      `UPDATE search_projection_meta
       SET rebuild_owner = 'abandoned', rebuild_lease_expires_at = ?
       WHERE id = 1`,
    ).bind("2026-08-09T01:00:00.000Z").run();
    const rebuild = await rebuildSearchFtsShadow(
      env.DB,
      "2026-08-09T02:30:00.000Z",
    );
    expect(rebuild.ok).toBe(true);
    const owner = await env.DB.prepare(
      `SELECT rebuild_owner, rebuild_lease_expires_at FROM search_projection_meta WHERE id = 1`,
    ).first<{ rebuild_owner: string | null; rebuild_lease_expires_at: string | null }>();
    expect(owner).toEqual({ rebuild_owner: null, rebuild_lease_expires_at: null });
  });

  it("null/empty/whitespace queries return zero hits (Home invariant)", async () => {
    const catalog = createD1SearchCatalog(env.DB);
    for (const q of [undefined, "", "   ", "\t"]) {
      const result = await getSearchPage(catalog, { q });
      expect(result.outcome).toBe("ok");
      if (result.outcome === "ok") {
        expect(result.data.query).toBeNull();
        expect(result.data.hits).toEqual([]);
      }
    }

    const cursor = encodeSearchCursor({
      v: 1,
      queryDigest: "0123456789abcdef",
      parserVersion: 1,
      indexVersion: 1,
      projectionEpoch: 1,
      supportEpoch: 1,
      searchWriteGeneration: 1,
      limit: 50,
      sort: {
        availabilityRank: 0,
        listingPriceCentavos: 8000,
        observedAt: "2026-08-09T00:00:00.000Z",
        offerId: "off_search_0",
      },
    });
    for (const q of [undefined, "", "---", "... +++"]) {
      const result = await getSearchPage(catalog, { q, cursor });
      expect(result.outcome).toBe("invalid");
    }

    for (const q of ["---", "... +++", "!!!"]) {
      const result = await getSearchPage(catalog, { q });
      expect(result.outcome).toBe("ok");
      if (result.outcome === "ok") {
        expect(result.data.query).toBe(q);
        expect(result.data.hits).toEqual([]);
        expect(result.data.totalCount).toBe(0);
      }
    }
  });

  it("rejects malformed cursor", async () => {
    const catalog = createD1SearchCatalog(env.DB);
    const result = await getSearchPage(catalog, {
      q: "pla",
      cursor: "%%%not-a-cursor%%%",
    });
    expect(result.outcome).toBe("invalid");
  });

  it("uses one relational fallback batch for a classified FTS failure", async () => {
    const meta = await env.DB.prepare(
      `SELECT active_slot FROM search_projection_meta WHERE id = 1`,
    ).first<{ active_slot: "a" | "b" }>();
    const table = meta?.active_slot === "b" ? "search_fts_b" : "search_fts_a";
    const inactiveTable = table === "search_fts_a" ? "search_fts_b" : "search_fts_a";
    await env.DB.prepare(`DROP TABLE ${inactiveTable}`).run();
    const healthyWithMissingInactive = await getSearchPage(
      createD1SearchCatalog(env.DB),
      { q: "pla" },
    );
    expect(healthyWithMissingInactive.outcome).toBe("ok");
    await env.DB.prepare(`DROP TABLE ${table}`).run();
    const result = await getSearchPage(createD1SearchCatalog(env.DB), { q: "pla" });
    expect(result.outcome).toBe("degraded");
  });
});
