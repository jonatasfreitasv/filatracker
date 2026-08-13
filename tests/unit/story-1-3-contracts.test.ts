import { describe, expect, it } from "vitest";

import {
  OFFER_CONTRACT_NO_PREDECESSOR,
  OFFER_CONTRACT_VERSION,
  PRICE_POINT_CONTRACT_NO_PREDECESSOR,
  PublishedOfferSchema,
  PricePointSchema,
  QUEUE_ENVELOPE_CONTRACT_NO_PREDECESSOR,
  QueueEnvelopeSchema,
  RAW_OFFER_OBSERVATION_CONTRACT_VERSION_V2,
  RAW_OFFER_OBSERVATION_NO_PREDECESSOR,
  RawOfferObservationV1Schema,
  RawOfferObservationV2Schema,
  STORE_HEALTH_CONTRACT_NO_PREDECESSOR,
  STORE_RUN_EVIDENCE_CONTRACT_VERSION_V2,
  StoreHealthSchema,
  StoreRunEvidenceV1Schema,
  StoreRunEvidenceV2Schema,
  canTransitionRun,
  canTransitionSupport,
  decodeQueueEnvelope,
  toObservationV2,
} from "../../src/contracts";
import { IngestionRunSchema } from "../../src/contracts/ingestion-run";

const budget = {
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
};

describe("Story 1.3 contracts — v1 new + observation/evidence v1+v2", () => {
  it("documents no predecessor for new Offer/run/queue/PricePoint/health contracts", () => {
    expect(OFFER_CONTRACT_NO_PREDECESSOR).toBe(true);
    expect(PRICE_POINT_CONTRACT_NO_PREDECESSOR).toBe(true);
    expect(QUEUE_ENVELOPE_CONTRACT_NO_PREDECESSOR).toBe(true);
    expect(STORE_HEALTH_CONTRACT_NO_PREDECESSOR).toBe(true);
    expect(RAW_OFFER_OBSERVATION_NO_PREDECESSOR).toBe(true);
    expect(OFFER_CONTRACT_VERSION).toBe(1);
  });

  it("accepts observation v1 and lifts missing title/description to explicit null", () => {
    const v1 = RawOfferObservationV1Schema.parse({
      contractVersion: 1,
      storeId: "closin",
      runId: "r",
      probeId: null,
      sourceUrl: "https://www.closin.com.br/product-page/pla-branco-1kg",
      merchantVariantId: "SKU",
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
      diameterEvidence: null,
      massGrams: 1000,
      observedAt: "2026-08-08T08:02:00.000Z",
      mapVersion: 1,
      parserVersion: 1,
    });
    const v2 = toObservationV2(v1);
    expect(v2.contractVersion).toBe(RAW_OFFER_OBSERVATION_CONTRACT_VERSION_V2);
    expect(v2.titleEvidence).toBeNull();
    expect(v2.descriptionEvidence).toBeNull();
    expect(
      RawOfferObservationV1Schema.safeParse({ ...v1, contractVersion: 99 })
        .success,
    ).toBe(false);
  });

  it("accepts observation v2 with title/description evidence", () => {
    const v2 = RawOfferObservationV2Schema.parse({
      contractVersion: 2,
      storeId: "closin",
      runId: "r",
      probeId: null,
      sourceUrl: "https://www.closin.com.br/product-page/pla-branco-1kg",
      merchantVariantId: "SKU",
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
      diameterEvidence: null,
      massGrams: 1000,
      titleEvidence: "PLA - Branco - 1kg",
      descriptionEvidence: null,
      observedAt: "2026-08-08T08:02:00.000Z",
      mapVersion: 1,
      parserVersion: 1,
    });
    expect(v2.titleEvidence).toMatch(/PLA/);
    expect(
      RawOfferObservationV2Schema.safeParse({ ...v2, extra: true }).success,
    ).toBe(false);
  });

  it("rejects unknown run-evidence versions and accepts v1+v2", () => {
    const base = {
      storeId: "closin",
      runId: "r",
      probeId: null,
      mapVersion: 1,
      parserVersion: 1,
      startedAt: "2026-08-08T08:00:00.000Z",
      finishedAt: "2026-08-08T08:00:01.000Z",
      budgetUsage: budget,
      catalogWork: { expected: 0, completed: 0 },
      outcome: "failed" as const,
      observations: [] as [],
      omissions: [],
      failureCodes: ["unknown" as const],
    };
    expect(
      StoreRunEvidenceV1Schema.parse({ ...base, contractVersion: 1 }).contractVersion,
    ).toBe(1);
    expect(
      StoreRunEvidenceV2Schema.parse({
        ...base,
        contractVersion: STORE_RUN_EVIDENCE_CONTRACT_VERSION_V2,
      }).contractVersion,
    ).toBe(2);
    expect(
      StoreRunEvidenceV2Schema.safeParse({ ...base, contractVersion: 3 }).success,
    ).toBe(false);
  });

  it("enforces run SM legal transitions and terminal immutability", () => {
    expect(canTransitionRun("created", "discovering")).toBe(true);
    expect(canTransitionRun("publishing", "published")).toBe(true);
    expect(canTransitionRun("published", "failed")).toBe(false);
    expect(canTransitionRun("failed", "published")).toBe(false);
    expect(
      IngestionRunSchema.parse({
        contractVersion: 1,
        runId: "r1",
        storeId: "closin",
        state: "created",
        probeId: null,
        storeGeneration: null,
        supportGeneration: 0,
        projectionEpoch: 1,
        recoveryEpoch: 1,
        publicationClass: null,
        failureCodes: [],
        evidenceDigestSha256: null,
        payloadArtifactId: null,
        mapVersion: null,
        parserVersion: null,
        createdAt: "2026-08-08T08:00:00.000Z",
        updatedAt: "2026-08-08T08:00:00.000Z",
        terminalAt: null,
      }).state,
    ).toBe("created");
  });

  it("rejects unknown queue envelope versions fail-closed", () => {
    const good = {
      contractVersion: 1 as const,
      kind: "ingest.publish" as const,
      messageId: "m1",
      idempotencyKey: "k1",
      storeId: "closin",
      runId: "r1",
      storeGeneration: 0,
      supportGeneration: 0,
      projectionEpoch: 1,
      recoveryEpoch: 1,
      payloadDigestSha256: "abc",
      payloadArtifactId: "a1",
      payloadExpiresAt: "2026-08-09T00:00:00.000Z",
      enqueuedAt: "2026-08-08T08:00:00.000Z",
      probeId: null,
    };
    expect(QueueEnvelopeSchema.parse(good).kind).toBe("ingest.publish");
    expect(() => decodeQueueEnvelope({ ...good, contractVersion: 99 })).toThrow(
      /unsupported_queue_envelope_version/,
    );
  });

  it("validates published Offer and PricePoint positive money", () => {
    expect(
      PublishedOfferSchema.safeParse({
        contractVersion: 1,
        offerId: "off_1",
        storeId: "closin",
        storeGeneration: 1,
        sourceKey: "k",
        canonicalPdpUrl: "https://www.closin.com.br/product-page/x",
        merchantVariantId: null,
        brand: "Closin",
        specificType: "filament",
        materialFamily: "PLA",
        color: "Branco",
        diameterMm: 1.75,
        massGrams: 1000,
        listingTitle: "PLA Branco 1kg",
        listingPriceCentavos: 8030,
        originalPriceCentavos: null,
        isPromotion: false,
        availability: "available",
        stale: false,
        observedAt: "2026-08-08T08:02:00.000Z",
        publishedAt: "2026-08-08T08:03:00.000Z",
        mapVersion: 1,
        parserVersion: 1,
        normalizePolicyVersion: 1,
        visible: true,
      }).success,
    ).toBe(true);
    expect(
      PricePointSchema.safeParse({
        contractVersion: 1,
        pricePointId: "pp1",
        offerId: "off_1",
        storeId: "closin",
        runId: "r1",
        listingPriceCentavos: 0,
        originalPriceCentavos: null,
        observedAt: "2026-08-08T08:02:00.000Z",
        recordedAt: "2026-08-08T08:03:00.000Z",
        correctsPricePointId: null,
        effective: true,
      }).success,
    ).toBe(false);
  });

  it("enforces Store support transition rules", () => {
    expect(canTransitionSupport("active", "degraded", "coordinator")).toBe(true);
    expect(canTransitionSupport("active", "deactivated", "system")).toBe(false);
    expect(canTransitionSupport("unsupported", "active", "operator")).toBe(true);
    expect(canTransitionSupport("unsupported", "active", "system")).toBe(false);
    expect(
      StoreHealthSchema.parse({
        contractVersion: 1,
        storeId: "closin",
        supportState: "unsupported",
        supportGeneration: 0,
        storeGeneration: 0,
        projectionEpoch: 1,
        recoveryEpochSnapshot: 1,
        activationGate: "blocked",
        lastRunId: null,
        lastRunOutcome: null,
        lastFailureCodes: [],
        observationCount: null,
        publishedOfferCount: null,
        freshnessObservedAt: null,
        updatedAt: "2026-08-08T08:00:00.000Z",
      }).activationGate,
    ).toBe("blocked");
  });
});
