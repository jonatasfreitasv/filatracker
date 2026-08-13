import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { executePublicationBatch } from "../../src/adapters/persistence/publish-batch";
import {
  setPublicationActivationGate,
  setStoreDisplayName,
  transitionStoreSupport,
} from "../../src/adapters/persistence/store-health";
import { createD1BrowseCatalog } from "../../src/adapters/persistence/d1-browse-catalog";
import { createD1SearchCatalog } from "../../src/adapters/persistence/d1-search-catalog";
import { rebuildTaxonomyAndFtsShadow } from "../../src/adapters/persistence/fts-writer";
import { getBrowsePage } from "../../src/application/get-browse-page";
import { getSearchPage } from "../../src/application/get-search-page";
import {
  createRun,
  transitionRun,
} from "../../src/application/ingestion-coordinator";
import type { StagedOffer } from "../../src/contracts/offer";

async function approve(storeId: "closin" | "voolt3d", name: string): Promise<void> {
  const now = "2026-08-13T00:00:00.000Z";
  const current = await env.DB.prepare(
    `SELECT support_state, activation_gate FROM store_state WHERE store_id = ?`,
  ).bind(storeId).first<{ support_state: string; activation_gate: string }>();
  if (current?.support_state === "unsupported") {
    await transitionStoreSupport(env.DB, {
      storeId,
      toState: "active",
      actor: "operator",
      reason: "test_activation",
      nowIso: now,
    });
  }
  if (current?.activation_gate !== "approved") {
    await setPublicationActivationGate(env.DB, {
      storeId,
      gate: "approved",
      actor: "operator",
      reason: "test_gate",
      nowIso: now,
    });
  }
  await setStoreDisplayName(env.DB, { storeId, displayName: name, nowIso: now });
}

async function bindArtifact(runId: string, storeId: string): Promise<void> {
  const artifactId = `artifact-${runId}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO retained_payloads (
        artifact_id, store_id, run_id, digest_sha256, contract_version,
        map_version, parser_version, payload_json, byte_length, expires_at,
        purged_at, created_at
      ) VALUES (?, ?, ?, ?, 2, 1, 1, '{}', 2, ?, NULL, ?)`,
    ).bind(artifactId, storeId, runId, `digest-${runId}`, "2027-08-13T00:00:00.000Z", "2026-08-13T00:00:00.000Z"),
    env.DB.prepare(
      `UPDATE ingestion_runs SET payload_artifact_id = ?, evidence_digest_sha256 = ?,
           map_version = 1, parser_version = 1 WHERE run_id = ?`,
    ).bind(artifactId, `digest-${runId}`, runId),
    env.DB.prepare(
      `INSERT INTO ingestion_inbox (
        idempotency_key, store_id, run_id, message_id, status,
        recovery_epoch, payload_artifact_id, claimed_at, completed_at
      ) VALUES (?, ?, ?, ?, 'claimed', 1, ?, ?, NULL)`,
    ).bind(`idem-${runId}`, storeId, runId, `msg-${runId}`, artifactId, "2026-08-13T00:00:00.000Z"),
  ]);
}

function offer(input: {
  runId: string;
  storeId: "closin" | "voolt3d";
  i: number;
  brand: string;
  family: "PLA" | "PETG";
  title: string;
  formulationSpecificTypeId?: string;
}): StagedOffer & { formulationSpecificTypeId?: string } {
  const host = input.storeId === "closin"
    ? "https://www.closin.com.br/product-page"
    : "https://voolt3d.com.br/produtos";
  return {
    contractVersion: 1,
    offerId: `${input.storeId}_tax_${input.i}`,
    storeId: input.storeId,
    runId: input.runId,
    sourceKey: `${input.storeId}|${host}/tax-${input.i}|SKU${input.i}`,
    continuityFingerprint: `semantic-v1|brand=${input.brand}|material=${input.family}|mass=1000`,
    canonicalPdpUrl: `${host}/tax-${input.i}`,
    merchantVariantId: `SKU${input.i}`,
    brand: input.brand,
    specificType: "filament",
    materialFamily: input.family,
    color: "Preto",
    diameterMm: 1.75,
    massGrams: 1000,
    listingTitle: input.title,
    listingPriceCentavos: 9000 + input.i,
    originalPriceCentavos: null,
    isPromotion: false,
    availability: "available",
    observedAt: "2026-08-13T00:00:00.000Z",
    mapVersion: 1,
    parserVersion: 1,
    normalizePolicyVersion: 2,
    standaloneOnly: false,
    visible: false,
    ...(input.formulationSpecificTypeId
      ? { formulationSpecificTypeId: input.formulationSpecificTypeId }
      : {}),
  };
}

describe("browse + family-intent search", () => {
  it("includes family children, narrows by type, and matches search identities", async () => {
    await approve("closin", "Closin");
    await approve("voolt3d", "Voolt3D");
    const deps = { db: env.DB, recoveryEpochAuthority: 1 };
    const runId = "run-browse-1";
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
    await bindArtifact(runId, "closin");
    const published = await executePublicationBatch(env.DB, {
      fences: {
        storeId: "closin",
        runId,
        claimId: "claim-browse-1",
        expectedStoreGeneration: health!.store_generation,
        expectedSupportGeneration: health!.support_generation,
        expectedProjectionEpoch: 1,
        expectedRecoveryEpoch: 1,
        recoveryEpochAuthority: 1,
      },
      publicationClass: "authoritative-complete",
      staged: [
        offer({
          runId,
          storeId: "closin",
          i: 1,
          brand: "Closin",
          family: "PETG",
          title: "PETG Preto 1kg",
          formulationSpecificTypeId: "typ_petg",
        }),
        offer({
          runId,
          storeId: "closin",
          i: 2,
          brand: "Closin",
          family: "PETG",
          title: "PETG HF Preto 1kg",
          formulationSpecificTypeId: "typ_petg-hf",
        }),
        offer({ runId, storeId: "closin", i: 3, brand: "Closin", family: "PLA", title: "PLA Branco 1kg" }),
      ],
      idempotencyKey: "idem-run-browse-1",
      nowIso: "2026-08-13T00:00:00.000Z",
      markAbsentUnavailable: true,
      runOutcome: "complete",
      failureCodes: [],
      observationCount: 3,
    });
    expect(published.ok).toBe(true);

    const search = getSearchPage(createD1SearchCatalog(env.DB), { q: "PETG" });
    const browse = getBrowsePage(createD1BrowseCatalog(env.DB), {
      kind: "material",
      slug: "petg",
    });
    const [searchResult, browseResult] = await Promise.all([search, browse]);
    expect(searchResult.outcome).toBe("ok");
    expect(browseResult.outcome).toBe("ok");
    if (searchResult.outcome === "ok" && browseResult.outcome === "ok") {
      const searchIds = searchResult.data.hits.map((hit) => hit.id).sort();
      const browseIds = browseResult.data.hits.map((hit) => hit.id).sort();
      expect(searchIds).toEqual(browseIds);
      expect(searchIds).toContain("closin_tax_1");
      expect(searchIds).toContain("closin_tax_2");
      expect(searchIds).not.toContain("closin_tax_3");
      expect(searchResult.data.hits.map((hit) => hit.specificTypeLabel).sort()).toEqual(
        ["PETG", "PETG HF"].sort(),
      );
      expect(searchResult.data.specificTypeFacet.map((facet) => facet.slug).sort()).toEqual(
        ["petg", "petg-hf"].sort(),
      );
    }

    const narrowed = await getSearchPage(createD1SearchCatalog(env.DB), {
      q: "PETG",
      type: "petg-hf",
    });
    expect(narrowed.outcome).toBe("ok");
    if (narrowed.outcome === "ok") {
      expect(narrowed.data.hits.map((hit) => hit.id)).toEqual(["closin_tax_2"]);
    }

    const typeIntent = await getSearchPage(createD1SearchCatalog(env.DB), { q: "PETG HF" });
    expect(typeIntent.outcome).toBe("ok");
    if (typeIntent.outcome === "ok") {
      expect(typeIntent.data.hits.map((hit) => hit.id)).toEqual(["closin_tax_2"]);
      expect(typeIntent.data.specificTypeFacet.map((facet) => facet.slug).sort()).toEqual(
        ["petg", "petg-hf"].sort(),
      );
    }

    const rebuilt = await rebuildTaxonomyAndFtsShadow(
      env.DB,
      "2026-08-13T00:00:00.000Z",
      { expectedTaxonomyVersion: 1, targetTaxonomyVersion: 2 },
    );
    expect(rebuilt.ok).toBe(true);

    const aliasSearch = await getSearchPage(createD1SearchCatalog(env.DB), { q: "petghf" });
    expect(aliasSearch.outcome).toBe("ok");
    if (aliasSearch.outcome === "ok") {
      expect(aliasSearch.data.hits.map((hit) => hit.id)).toEqual(["closin_tax_2"]);
    }

    const alias = await getBrowsePage(createD1BrowseCatalog(env.DB), {
      kind: "brand",
      slug: "voolt",
    });
    expect(alias.outcome).toBe("redirect");
    if (alias.outcome === "redirect") {
      expect(alias.canonicalSlug).toBe("voolt3d");
    }

    const unknown = await getBrowsePage(createD1BrowseCatalog(env.DB), {
      kind: "material",
      slug: "no-such-family",
    });
    expect(unknown.outcome).toBe("notFound");

    await env.DB.prepare(
      `INSERT OR IGNORE INTO taxonomy_gone (gone_slug, kind, taxonomy_version, reason)
       VALUES ('split-petg', 'family', 1, 'reviewed-split')`,
    ).run();
    const gone = await getBrowsePage(createD1BrowseCatalog(env.DB), {
      kind: "material",
      slug: "split-petg",
    });
    expect(gone.outcome).toBe("gone");
  });

  it("rejects mixed taxonomy CAS", async () => {
    const result = await rebuildTaxonomyAndFtsShadow(
      env.DB,
      "2026-08-13T00:00:00.000Z",
      { expectedTaxonomyVersion: 99, targetTaxonomyVersion: 100 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("mixed_taxonomy");
  });

  it("fails closed when eligible offers still require legacy taxonomy republication", async () => {
    await approve("closin", "Closin");
    const deps = { db: env.DB, recoveryEpochAuthority: 1 };
    const runId = "run-browse-legacy";
    const health = await env.DB.prepare(
      `SELECT store_generation, support_generation FROM store_state WHERE store_id = 'closin'`,
    ).first<{ store_generation: number; support_generation: number }>();
    const projection = await env.DB.prepare(
      `SELECT projection_epoch, taxonomy_version FROM projection_meta WHERE id = 1`,
    ).first<{ projection_epoch: number; taxonomy_version: number }>();
    await createRun(deps, {
      runId,
      storeId: "closin",
      supportGeneration: health!.support_generation,
      projectionEpoch: projection!.projection_epoch,
    });
    await transitionRun(deps, { runId, from: "created", to: "discovering" });
    await transitionRun(deps, { runId, from: "discovering", to: "staged" });
    await transitionRun(deps, { runId, from: "staged", to: "validated" });
    await transitionRun(deps, { runId, from: "validated", to: "publishing" });
    await bindArtifact(runId, "closin");
    const published = await executePublicationBatch(env.DB, {
      fences: {
        storeId: "closin",
        runId,
        claimId: "claim-browse-legacy",
        expectedStoreGeneration: health!.store_generation,
        expectedSupportGeneration: health!.support_generation,
        expectedProjectionEpoch: projection!.projection_epoch,
        expectedRecoveryEpoch: 1,
        recoveryEpochAuthority: 1,
      },
      publicationClass: "authoritative-complete",
      staged: [
        offer({
          runId,
          storeId: "closin",
          i: 10,
          brand: "Closin",
          family: "PETG",
          title: "PETG Preto 1kg",
          formulationSpecificTypeId: "typ_petg",
        }),
      ],
      idempotencyKey: "idem-run-browse-legacy",
      nowIso: "2026-08-13T00:00:00.000Z",
      markAbsentUnavailable: true,
      runOutcome: "complete",
      failureCodes: [],
      observationCount: 1,
    });
    expect(published.ok).toBe(true);

    const before = await env.DB.prepare(
      `SELECT search_text, material_family_id, formulation_specific_type_id
       FROM offers WHERE offer_id = 'closin_tax_10'`,
    ).first<{
      search_text: string | null;
      material_family_id: string | null;
      formulation_specific_type_id: string | null;
    }>();
    await env.DB.prepare(
      `UPDATE offers
       SET normalize_policy_version = 1
       WHERE offer_id = 'closin_tax_10'`,
    ).run();

    const result = await rebuildTaxonomyAndFtsShadow(
      env.DB,
      "2026-08-13T00:00:00.000Z",
      {
        expectedTaxonomyVersion: projection!.taxonomy_version,
        targetTaxonomyVersion: projection!.taxonomy_version + 1,
      },
    );
    expect(result).toMatchObject({
      ok: false,
      code: "validation_failed",
      detail: "legacy_offer_requires_republish",
    });

    const after = await env.DB.prepare(
      `SELECT search_text, material_family_id, formulation_specific_type_id
       FROM offers WHERE offer_id = 'closin_tax_10'`,
    ).first<{
      search_text: string | null;
      material_family_id: string | null;
      formulation_specific_type_id: string | null;
    }>();
    expect(after).toEqual(before);
  });
});
