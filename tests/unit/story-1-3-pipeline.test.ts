import { describe, expect, it } from "vitest";

import { closinMap } from "../../src/adapters/stores/closin/map";
import { compilePublicationClass } from "../../src/application/stages/completeness";
import { normalizeAndValidateObservations } from "../../src/application/stages/normalize-validate";
import {
  decidePricePointAppend,
  foldEffectivePrice,
  validateCorrectionEdge,
} from "../../src/application/stages/price-points";
import { deriveStale } from "../../src/domain/policy/validate";
import {
  resolveOfferIdentity,
  type OfferContinuityEvidence,
} from "../../src/domain/identity/offer-identity";
import { normalizeBrand, normalizeMaterialFamily } from "../../src/domain/policy/normalize";
import { redactTelemetry } from "../../src/application/telemetry-redaction";
import type { StoreRunEvidenceV2 } from "../../src/contracts/store-run-evidence";
import type { RawOfferObservationV2 } from "../../src/contracts/raw-offer-observation";
import type { PricePoint } from "../../src/contracts/price-point";

const budget = {
  fetchCount: 1,
  redirectHops: 0,
  encodedBytes: 10,
  decompressedBytes: 10,
  observationCount: 1,
  candidateCount: 1,
  subrequests: 1,
  durationMs: 5,
  stagedByteEstimate: 2048,
  logEventBytes: 0,
};

const plaContinuity: OfferContinuityEvidence = {
  brandEvidence: "Closin",
  materialEvidence: "PLA",
  massGrams: 1000,
  titleEvidence: "PLA Branco 1kg",
};

function obs(partial: Partial<RawOfferObservationV2> = {}): RawOfferObservationV2 {
  return {
    contractVersion: 2,
    storeId: "closin",
    runId: "r1",
    probeId: null,
    sourceUrl: "https://www.closin.com.br/product-page/pla-branco-1kg",
    merchantVariantId: "CLO-PLA-01BRA",
    availability: "available",
    price: {
      listingPriceCentavos: 8030,
      originalPriceCentavos: null,
      listingPriceRaw: "80.3",
      originalPriceRaw: null,
    },
    brandEvidence: "Closin",
    materialEvidence: "PLA",
    weightEvidence: "1kg",
    colorEvidence: "Branco",
    diameterEvidence: "1.75mm",
    massGrams: 1000,
    titleEvidence: "PLA - Branco - 1kg",
    descriptionEvidence: null,
    observedAt: "2026-08-08T08:02:00.000Z",
    mapVersion: 1,
    parserVersion: 1,
    ...partial,
  };
}

function evidence(
  overrides: Partial<StoreRunEvidenceV2> &
    Pick<StoreRunEvidenceV2, "outcome">,
): StoreRunEvidenceV2 {
  const base = {
    contractVersion: 2 as const,
    storeId: "closin",
    runId: "r1",
    probeId: null,
    mapVersion: 1,
    parserVersion: 1,
    startedAt: "2026-08-08T08:00:00.000Z",
    finishedAt: "2026-08-08T08:01:00.000Z",
    budgetUsage: budget,
    catalogWork: { expected: 1, completed: 1 },
    observations: [obs()],
    omissions: [] as StoreRunEvidenceV2["omissions"],
  };
  if (overrides.outcome === "complete") {
    return { ...base, ...overrides, outcome: "complete" };
  }
  if (overrides.outcome === "partial") {
    return {
      ...base,
      omissions: [{ code: "fetch_failed", detail: null, sourceUrl: null }],
      failureCodes: ["fetch_failed"],
      ...overrides,
      outcome: "partial",
    };
  }
  return {
    ...base,
    observations: [],
    failureCodes: ["unknown"],
    ...overrides,
  } as StoreRunEvidenceV2;
}

describe("normalize / identity / completeness / PricePoint / stale / redaction", () => {
  it("normalizes brand/material from dictionaries and leaves unknowns null", () => {
    expect(normalizeBrand("Closin")).toBe("Closin");
    expect(normalizeBrand("UnknownBrandXYZ")).toBeNull();
    expect(normalizeMaterialFamily("PLA")).toBe("PLA");
    expect(normalizeMaterialFamily("mystery")).toBeNull();
  });

  it("stages valid observations and quarantines incompatible reuse", () => {
    const first = normalizeAndValidateObservations({
      observations: [obs()],
      allowedHosts: ["www.closin.com.br", "closin.com.br"],
      apexToWww: { apex: "closin.com.br", www: "www.closin.com.br" },
    });
    expect(first.staged).toHaveLength(1);
    expect(first.staged[0]?.brand).toBe("Closin");
    expect(first.staged[0]?.materialFamily).toBe("PLA");

    const conflicting = new Map(first.identityBySourceKey);
    const existing = [...conflicting.values()][0]!;
    conflicting.set(existing.sourceKey, {
      ...existing,
      canonicalPdpUrl: "https://www.closin.com.br/product-page/OTHER",
    });
    const second = normalizeAndValidateObservations({
      observations: [obs()],
      allowedHosts: ["www.closin.com.br", "closin.com.br"],
      apexToWww: { apex: "closin.com.br", www: "www.closin.com.br" },
      existingBySourceKey: conflicting,
    });
    expect(second.quarantined.length).toBe(1);
  });

  it("signals publish-nothing when any observation fails validation", () => {
    const result = normalizeAndValidateObservations({
      observations: [obs({ price: { ...obs().price, listingPriceCentavos: -1 } })],
      allowedHosts: ["www.closin.com.br", "closin.com.br"],
    });
    expect(result.rejected).toHaveLength(1);
    expect(result.publicationSafe).toBe(false);
    expect(result.blockingReason).toBe("validation_rejected");
  });

  it("compiles authoritative-complete only from consistent v2 complete evidence", () => {
    const auth = compilePublicationClass({
      evidence: evidence({ outcome: "complete" }),
      map: closinMap,
    });
    expect(auth.publicationClass).toBe("authoritative-complete");

    const forged = compilePublicationClass({
      evidence: evidence({
        outcome: "complete",
        catalogWork: { expected: 1, completed: 2 },
      }),
      map: closinMap,
    });
    expect(forged.publicationClass).toBe("publish-nothing");

    const partial = compilePublicationClass({
      evidence: evidence({ outcome: "partial" }),
      map: closinMap,
    });
    expect(partial.publicationClass).toBe("positive-only");

    const disallowedFailure = compilePublicationClass({
      evidence: evidence({
        outcome: "partial",
        failureCodes: ["unknown"],
      }),
      map: closinMap,
    });
    expect(disallowedFailure.publicationClass).toBe("publish-nothing");

    const boundedTruncation = compilePublicationClass({
      evidence: evidence({
        outcome: "partial",
        budgetUsage: { ...budget, candidateCount: 2 },
        catalogWork: { expected: 2, completed: 1 },
        omissions: [
          { code: "catalog_truncated", detail: "1", sourceUrl: null },
        ],
        failureCodes: ["budget_overflow"],
      }),
      map: closinMap,
    });
    expect(boundedTruncation.publicationClass).toBe("positive-only");
    expect(boundedTruncation.failureCodes).toEqual(["budget_overflow"]);

    const emptyCatalog = compilePublicationClass({
      evidence: evidence({
        outcome: "complete",
        budgetUsage: { ...budget, observationCount: 0, candidateCount: 0 },
        catalogWork: { expected: 0, completed: 0 },
        observations: [],
      }),
      map: closinMap,
    });
    expect(emptyCatalog.publicationClass).toBe("publish-nothing");

    const beyondCapacity = compilePublicationClass({
      evidence: evidence({
        outcome: "complete",
        budgetUsage: { ...budget, candidateCount: 135 },
        catalogWork: { expected: 135, completed: 135 },
      }),
      map: closinMap,
    });
    expect(beyondCapacity.publicationClass).toBe("publish-nothing");

    const v1Conservative = compilePublicationClass({
      evidence: {
        contractVersion: 1,
        storeId: "closin",
        runId: "r1",
        probeId: null,
        mapVersion: 1,
        parserVersion: 1,
        startedAt: "2026-08-08T08:00:00.000Z",
        finishedAt: "2026-08-08T08:01:00.000Z",
        budgetUsage: budget,
        catalogWork: { expected: 1, completed: 1 },
        outcome: "complete",
        observations: [
          {
            contractVersion: 1 as const,
            storeId: "closin",
            runId: "r1",
            probeId: null,
            sourceUrl: "https://www.closin.com.br/product-page/pla-branco-1kg",
            merchantVariantId: "CLO-PLA-01BRA",
            availability: "available" as const,
            price: {
              listingPriceCentavos: 8030,
              originalPriceCentavos: null,
              listingPriceRaw: "80.3",
              originalPriceRaw: null,
            },
            brandEvidence: "Closin",
            materialEvidence: "PLA",
            weightEvidence: "1kg",
            colorEvidence: "Branco",
            diameterEvidence: null,
            massGrams: 1000,
            observedAt: "2026-08-08T08:02:00.000Z",
            mapVersion: 1,
            parserVersion: 1,
          },
        ],
        omissions: [],
      },
      map: closinMap,
    });
    expect(v1Conservative.publicationClass).toBe("positive-only");
    expect(v1Conservative.reason).toMatch(/v1/);

    const probe = compilePublicationClass({
      evidence: evidence({ outcome: "complete", probeId: "probe-1" }),
      map: closinMap,
    });
    expect(probe.publicationClass).toBe("publish-nothing");

    const oversized = compilePublicationClass({
      evidence: evidence({
        outcome: "oversized",
        failureCodes: ["budget_overflow"],
      }),
      map: closinMap,
    });
    expect(oversized.publicationClass).toBe("publish-nothing");
    expect(oversized.terminalHint).toBe("failed");
  });

  it("appends PricePoint only on changed positive price tuple", () => {
    expect(
      decidePricePointAppend({
        listingPriceCentavos: 8030,
        originalPriceCentavos: null,
        priorEffective: null,
        availabilityChangedOnly: false,
      }).append,
    ).toBe(true);
    expect(
      decidePricePointAppend({
        listingPriceCentavos: 8030,
        originalPriceCentavos: null,
        priorEffective: {
          listingPriceCentavos: 8030,
          originalPriceCentavos: null,
        },
        availabilityChangedOnly: true,
      }).append,
    ).toBe(false);
  });

  it("rejects cross-offer / cycle / double-successor corrections", () => {
    const existing: PricePoint[] = [
      {
        contractVersion: 1,
        pricePointId: "pp1",
        offerId: "off_a",
        storeId: "closin",
        runId: "r1",
        listingPriceCentavos: 100,
        originalPriceCentavos: null,
        observedAt: "2026-08-08T08:00:00.000Z",
        recordedAt: "2026-08-08T08:00:00.000Z",
        correctsPricePointId: null,
        effective: true,
      },
    ];
    expect(
      validateCorrectionEdge({
        offerId: "off_b",
        correctsPricePointId: "pp1",
        existing,
      }).ok,
    ).toBe(false);

    const withSuccessor: PricePoint[] = [
      ...existing,
      {
        ...existing[0]!,
        pricePointId: "pp2",
        runId: "r2",
        correctsPricePointId: "pp1",
        effective: true,
      },
    ];
    expect(
      validateCorrectionEdge({
        offerId: "off_a",
        correctsPricePointId: "pp1",
        existing: withSuccessor,
      }).ok,
    ).toBe(false);

    expect(
      foldEffectivePrice(withSuccessor)?.pricePointId,
    ).toBe("pp2");
  });

  it("derives stale independently after 48h from last published observedAt", () => {
    expect(
      deriveStale({
        lastPublishedObservedAt: "2026-08-06T08:00:00.000Z",
        now: new Date("2026-08-08T09:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      deriveStale({
        lastPublishedObservedAt: "2026-08-08T08:00:00.000Z",
        now: new Date("2026-08-08T09:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("redacts forbidden telemetry fields including digests", () => {
    const redacted = redactTelemetry({
      event: "publish",
      storeId: "closin",
      sourceUrl: "https://evil.example",
      contentDigestSha256: "deadbeef",
      publicationClass: "positive-only",
    });
    expect(redacted).not.toHaveProperty("sourceUrl");
    expect(redacted).not.toHaveProperty("contentDigestSha256");
    expect(redacted.publicationClass).toBe("positive-only");
  });

  it("allocates durable Offer IDs from source tuple", () => {
    const a = resolveOfferIdentity({
      storeId: "closin",
      pdpUrl: "https://www.closin.com.br/product-page/pla-branco-1kg",
      merchantVariantId: "SKU",
      allowedHosts: ["www.closin.com.br"],
      bySourceKey: new Map(),
      continuityEvidence: plaContinuity,
    });
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(a.record.offerId.startsWith("off_")).toBe(true);
      const again = resolveOfferIdentity({
        storeId: "closin",
        pdpUrl: "https://www.closin.com.br/product-page/pla-branco-1kg",
        merchantVariantId: "SKU",
        allowedHosts: ["www.closin.com.br"],
        bySourceKey: new Map([[a.record.sourceKey, a.record]]),
        continuityEvidence: plaContinuity,
      });
      expect(again.ok && again.kind === "existing").toBe(true);

      const reused = resolveOfferIdentity({
        storeId: "closin",
        pdpUrl: "https://www.closin.com.br/product-page/pla-branco-1kg",
        merchantVariantId: "SKU",
        allowedHosts: ["www.closin.com.br"],
        bySourceKey: new Map([[a.record.sourceKey, a.record]]),
        continuityEvidence: {
          ...plaContinuity,
          materialEvidence: "PETG",
        },
      });
      expect(reused.ok).toBe(false);
      expect(!reused.ok && reused.code).toBe("incompatible_reuse");
    }
  });

  it("resolves reviewed aliases and fails closed for tombstone lineage", () => {
    const original = resolveOfferIdentity({
      storeId: "closin",
      pdpUrl: "https://www.closin.com.br/product-page/old-pla",
      merchantVariantId: "SKU-OLD",
      allowedHosts: ["www.closin.com.br"],
      bySourceKey: new Map(),
      continuityEvidence: plaContinuity,
    });
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    const migratedProbe = resolveOfferIdentity({
      storeId: "closin",
      pdpUrl: "https://www.closin.com.br/product-page/new-pla",
      merchantVariantId: "SKU-NEW",
      allowedHosts: ["www.closin.com.br"],
      bySourceKey: new Map([[original.record.sourceKey, original.record]]),
      continuityEvidence: plaContinuity,
    });
    expect(migratedProbe.ok).toBe(true);
    if (!migratedProbe.ok) return;

    const alias = resolveOfferIdentity({
      storeId: "closin",
      pdpUrl: "https://www.closin.com.br/product-page/new-pla",
      merchantVariantId: "SKU-NEW",
      allowedHosts: ["www.closin.com.br"],
      bySourceKey: new Map([[original.record.sourceKey, original.record]]),
      lineage: new Map([
        [
          migratedProbe.record.sourceKey,
          {
            sourceKey: migratedProbe.record.sourceKey,
            offerId: original.record.offerId,
            kind: "alias" as const,
          },
        ],
      ]),
      continuityEvidence: plaContinuity,
    });
    expect(alias.ok && alias.record.offerId).toBe(original.record.offerId);
    expect(alias.ok && alias.kind).toBe("alias");

    const tombstoned = resolveOfferIdentity({
      storeId: "closin",
      pdpUrl: "https://www.closin.com.br/product-page/new-pla",
      merchantVariantId: "SKU-NEW",
      allowedHosts: ["www.closin.com.br"],
      bySourceKey: new Map([[original.record.sourceKey, original.record]]),
      tombstones: new Set([migratedProbe.record.sourceKey]),
      continuityEvidence: plaContinuity,
    });
    expect(!tombstoned.ok && tombstoned.code).toBe("tombstoned");
  });
});
