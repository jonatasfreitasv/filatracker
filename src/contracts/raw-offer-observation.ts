import { z } from "zod";

import { MassGramsSchema, MoneyCentavosSchema, UtcInstantSchema } from "./search-page";

/**
 * RawOfferObservation contract v1.
 * No predecessor version exists; unknown versions and unknown keys are rejected.
 */
export const RAW_OFFER_OBSERVATION_CONTRACT_VERSION = 1 as const;
export const RAW_OFFER_OBSERVATION_NO_PREDECESSOR = true as const;

export const RAW_TEXT_MAX = 512;
export const RAW_URL_MAX = 2048;
export const RAW_VARIANT_MAX = 256;
export const RAW_ID_MAX = 128;

export const AvailabilitySchema = z.enum([
  "available",
  "unavailable",
  "unknown",
]);

export type Availability = z.infer<typeof AvailabilitySchema>;

const BoundedText = z.string().min(1).max(RAW_TEXT_MAX);
const BoundedUrl = z.string().url().max(RAW_URL_MAX);
const BoundedId = z.string().min(1).max(RAW_ID_MAX);

/**
 * Parsed money: positive integer BRL centavos, or explicit null.
 * Zero / free / invalid merchant text must not become a positive price.
 */
export const ObservationMoneyCentavosSchema = MoneyCentavosSchema.nullable();

export const PriceEvidenceSchema = z.strictObject({
  listingPriceCentavos: ObservationMoneyCentavosSchema,
  originalPriceCentavos: ObservationMoneyCentavosSchema,
  listingPriceRaw: z.string().max(RAW_TEXT_MAX).nullable(),
  originalPriceRaw: z.string().max(RAW_TEXT_MAX).nullable(),
});

export type PriceEvidence = z.infer<typeof PriceEvidenceSchema>;

export const RawOfferObservationSchema = z.strictObject({
  contractVersion: z.literal(RAW_OFFER_OBSERVATION_CONTRACT_VERSION),
  storeId: BoundedId,
  runId: BoundedId,
  probeId: BoundedId.nullable(),
  sourceUrl: BoundedUrl,
  merchantVariantId: z.string().max(RAW_VARIANT_MAX).nullable(),
  availability: AvailabilitySchema,
  price: PriceEvidenceSchema,
  brandEvidence: BoundedText.nullable(),
  materialEvidence: BoundedText.nullable(),
  weightEvidence: BoundedText.nullable(),
  colorEvidence: BoundedText.nullable(),
  diameterEvidence: BoundedText.nullable(),
  /** Positive grams when unambiguously known; null when unknown/ambiguous (e.g. kit). */
  massGrams: MassGramsSchema.nullable(),
  observedAt: UtcInstantSchema,
  mapVersion: z.number().int().positive(),
  parserVersion: z.number().int().positive(),
});

export type RawOfferObservation = z.infer<typeof RawOfferObservationSchema>;

/** v1 has no predecessor decoder — do not invent a fake N-1 alias. */
export const RawOfferObservationDecoders = {
  1: RawOfferObservationSchema,
} as const;
