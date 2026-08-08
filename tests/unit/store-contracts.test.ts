import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  RAW_OFFER_OBSERVATION_CONTRACT_VERSION,
  RAW_OFFER_OBSERVATION_NO_PREDECESSOR,
  RawOfferObservationSchema,
  STORE_MAP_CONTRACT_VERSION,
  STORE_MAP_NO_PREDECESSOR,
  STORE_RUN_EVIDENCE_CONTRACT_VERSION,
  STORE_RUN_EVIDENCE_NO_PREDECESSOR,
  StoreMapSchema,
  StoreRunEvidenceSchema,
} from "../../src/contracts";
import { closinMap } from "../../src/adapters/stores/closin/map";

describe("Store contracts v1 — no predecessor, strict keys", () => {
  it("documents no predecessor for observation/map/run evidence", () => {
    expect(RAW_OFFER_OBSERVATION_NO_PREDECESSOR).toBe(true);
    expect(STORE_MAP_NO_PREDECESSOR).toBe(true);
    expect(STORE_RUN_EVIDENCE_NO_PREDECESSOR).toBe(true);
    expect(RAW_OFFER_OBSERVATION_CONTRACT_VERSION).toBe(1);
    expect(STORE_MAP_CONTRACT_VERSION).toBe(1);
    expect(STORE_RUN_EVIDENCE_CONTRACT_VERSION).toBe(1);
  });

  it("round-trips a golden RawOfferObservation", () => {
    const golden = {
      contractVersion: 1 as const,
      storeId: "closin",
      runId: "run-1",
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
    };
    const parsed = RawOfferObservationSchema.parse(golden);
    expect(parsed).toEqual(golden);
    expect(
      RawOfferObservationSchema.safeParse({ ...golden, extra: true }).success,
    ).toBe(false);
    expect(
      RawOfferObservationSchema.safeParse({ ...golden, contractVersion: 2 })
        .success,
    ).toBe(false);
    expect(
      RawOfferObservationSchema.safeParse({
        ...golden,
        price: { ...golden.price, listingPriceCentavos: 0 },
      }).success,
    ).toBe(false);
  });

  it("validates Closin map and rejects unknown keys/versions", () => {
    expect(StoreMapSchema.parse(closinMap).storeId).toBe("closin");
    expect(
      StoreMapSchema.safeParse({ ...closinMap, contractVersion: 2 }).success,
    ).toBe(false);
    expect(
      StoreMapSchema.safeParse({ ...closinMap, unexpected: 1 }).success,
    ).toBe(false);
  });

  it("rejects failed run masquerading as empty success array shape misuse", () => {
    const failed = {
      contractVersion: 1 as const,
      storeId: "closin",
      runId: "r",
      probeId: null,
      mapVersion: 1,
      parserVersion: 1,
      startedAt: "2026-08-08T08:00:00.000Z",
      finishedAt: "2026-08-08T08:00:01.000Z",
      budgetUsage: {
        fetchCount: 1,
        redirectHops: 0,
        encodedBytes: 10,
        decompressedBytes: 10,
        observationCount: 0,
        candidateCount: 0,
        subrequests: 1,
        durationMs: 5,
        stagedByteEstimate: 0,
        logEventBytes: 0,
      },
      catalogWork: { expected: 10, completed: 0 },
      outcome: "failed" as const,
      observations: [],
      omissions: [],
      failureCodes: ["robots_disallow" as const],
    };
    expect(StoreRunEvidenceSchema.parse(failed).outcome).toBe("failed");
    const { failureCodes: _failureCodes, ...withoutFailure } = failed;
    expect(
      StoreRunEvidenceSchema.safeParse({
        ...withoutFailure,
        outcome: "complete",
      }).success,
    ).toBe(true);
    // complete without failureCodes is fine; failed without failureCodes is not
    expect(
      StoreRunEvidenceSchema.safeParse({
        ...failed,
        failureCodes: undefined,
      }).success,
    ).toBe(false);
  });

  it("loads golden map fixture from source tree", () => {
    const raw = JSON.parse(
      readFileSync(
        resolve("src/adapters/stores/closin/capacity/capacity-artifact.json"),
        "utf8",
      ),
    );
    expect(raw.measuredMaxCatalogVolume).toBe(111);
    expect(raw.dryRunInputsForStory13.ad8ProofStatus).toBe("pending-story-1-3");
  });
});
