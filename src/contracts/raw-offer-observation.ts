import { z } from "zod";

import { MassGramsSchema, MoneyCentavosSchema, UtcInstantSchema } from "./search-page";

/**
 * RawOfferObservation contract.
 * v1: Story 1.2 wire — no title/description evidence (discarded at producer).
 * v2: additive — carries bounded titleEvidence/descriptionEvidence required for
 * honest Specific Type / Material Family normalization. No silent v1 mutation.
 */
export const RAW_OFFER_OBSERVATION_CONTRACT_VERSION = 1 as const;
export const RAW_OFFER_OBSERVATION_CONTRACT_VERSION_V2 = 2 as const;
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
const BoundedTextNullable = BoundedText.nullable();

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

const ObservationFieldsV1 = {
  storeId: BoundedId,
  runId: BoundedId,
  probeId: BoundedId.nullable(),
  sourceUrl: BoundedUrl,
  merchantVariantId: z.string().max(RAW_VARIANT_MAX).nullable(),
  availability: AvailabilitySchema,
  price: PriceEvidenceSchema,
  brandEvidence: BoundedTextNullable,
  materialEvidence: BoundedTextNullable,
  weightEvidence: BoundedTextNullable,
  colorEvidence: BoundedTextNullable,
  diameterEvidence: BoundedTextNullable,
  /** Positive grams when unambiguously known; null when unknown/ambiguous (e.g. kit). */
  massGrams: MassGramsSchema.nullable(),
  observedAt: UtcInstantSchema,
  mapVersion: z.number().int().positive(),
  parserVersion: z.number().int().positive(),
} as const;

/** Story 1.2 wire — unchanged. */
export const RawOfferObservationV1Schema = z.strictObject({
  contractVersion: z.literal(RAW_OFFER_OBSERVATION_CONTRACT_VERSION),
  ...ObservationFieldsV1,
});

/**
 * Additive v2: bounded title/description evidence for shared normalize stages.
 * Producers emit v2 only after v1+v2 consumers are deployed and verified.
 */
export const RawOfferObservationV2Schema = z.strictObject({
  contractVersion: z.literal(RAW_OFFER_OBSERVATION_CONTRACT_VERSION_V2),
  ...ObservationFieldsV1,
  titleEvidence: BoundedTextNullable,
  descriptionEvidence: BoundedTextNullable,
});

export const RawOfferObservationSchema = RawOfferObservationV1Schema;

export type RawOfferObservationV1 = z.infer<typeof RawOfferObservationV1Schema>;
export type RawOfferObservationV2 = z.infer<typeof RawOfferObservationV2Schema>;
export type RawOfferObservation = RawOfferObservationV1 | RawOfferObservationV2;

/**
 * Normalize any accepted observation into the v2 shape used by shared stages.
 * Missing v1 title/description evidence → explicit null (never invented).
 */
export function toObservationV2(
  observation: RawOfferObservation,
): RawOfferObservationV2 {
  if (observation.contractVersion === 2) {
    return observation;
  }
  return {
    ...observation,
    contractVersion: RAW_OFFER_OBSERVATION_CONTRACT_VERSION_V2,
    titleEvidence: null,
    descriptionEvidence: null,
  };
}

export const RawOfferObservationAnySchema = z.discriminatedUnion(
  "contractVersion",
  [RawOfferObservationV1Schema, RawOfferObservationV2Schema],
);

/** Decoders for N and N-1. Unknown/N-2 versions fail closed. */
export const RawOfferObservationDecoders = {
  1: RawOfferObservationV1Schema,
  2: RawOfferObservationV2Schema,
} as const;
