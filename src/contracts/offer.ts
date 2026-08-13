import { z } from "zod";

import { AvailabilitySchema } from "./raw-offer-observation";
import { MassGramsSchema, MoneyCentavosSchema, UtcInstantSchema } from "./search-page";

/**
 * Offer contracts v1 — no predecessor.
 * Published facts are generation-scoped current values; staged facts are
 * run-scoped and invisible until atomic publication.
 */
export const OFFER_CONTRACT_VERSION = 1 as const;
export const OFFER_CONTRACT_NO_PREDECESSOR = true as const;

const BoundedId = z.string().min(1).max(128);
const BoundedUrl = z.string().url().max(2048);
const BoundedText = z.string().min(1).max(512);

export const SpecificTypeSchema = z.enum([
  "filament",
  "filament_kit",
  "unknown",
]);

export type SpecificType = z.infer<typeof SpecificTypeSchema>;

export const MaterialFamilySchema = z.enum([
  "PLA",
  "PETG",
  "ABS",
  "ASA",
  "TPU",
  "PC",
  "Nylon",
  "PVA",
  "HIPS",
  "other",
]);

export type MaterialFamily = z.infer<typeof MaterialFamilySchema>;

/** Diameter in mm when known; explicit null when unknown/ambiguous. */
export const DiameterMmSchema = z.number().positive().nullable();

/**
 * Generation-scoped published Offer facts (immutable identity + current facts).
 * Incomplete canonical keys may remain as standalone Offers.
 */
export const PublishedOfferSchema = z.strictObject({
  contractVersion: z.literal(OFFER_CONTRACT_VERSION),
  offerId: BoundedId,
  storeId: BoundedId,
  storeGeneration: z.number().int().positive(),
  sourceKey: BoundedText,
  canonicalPdpUrl: BoundedUrl,
  merchantVariantId: z.string().max(256).nullable(),
  brand: BoundedText.nullable(),
  specificType: SpecificTypeSchema.nullable(),
  materialFamily: MaterialFamilySchema.nullable(),
  color: BoundedText.nullable(),
  diameterMm: DiameterMmSchema,
  massGrams: MassGramsSchema.nullable(),
  /** Bounded plain-text listing title from titleEvidence; never raw HTML. */
  listingTitle: BoundedText.nullable(),
  listingPriceCentavos: MoneyCentavosSchema.nullable(),
  originalPriceCentavos: MoneyCentavosSchema.nullable(),
  isPromotion: z.boolean(),
  availability: AvailabilitySchema,
  /** Derived independently from last successful publish observedAt (48h). */
  stale: z.boolean(),
  observedAt: UtcInstantSchema,
  publishedAt: UtcInstantSchema,
  mapVersion: z.number().int().positive(),
  parserVersion: z.number().int().positive(),
  normalizePolicyVersion: z.number().int().positive(),
  visible: z.literal(true),
});

export type PublishedOffer = z.infer<typeof PublishedOfferSchema>;

/** Run-scoped staged Offer — invisible until publication claim succeeds. */
export const StagedOfferSchema = z.strictObject({
  contractVersion: z.literal(OFFER_CONTRACT_VERSION),
  offerId: BoundedId,
  storeId: BoundedId,
  runId: BoundedId,
  sourceKey: BoundedText,
  /** Independent semantic proof used to detect merchant tuple reuse. */
  continuityFingerprint: BoundedText,
  canonicalPdpUrl: BoundedUrl,
  merchantVariantId: z.string().max(256).nullable(),
  brand: BoundedText.nullable(),
  specificType: SpecificTypeSchema.nullable(),
  materialFamily: MaterialFamilySchema.nullable(),
  color: BoundedText.nullable(),
  diameterMm: DiameterMmSchema,
  massGrams: MassGramsSchema.nullable(),
  /** Bounded plain-text listing title from titleEvidence; never raw HTML. */
  listingTitle: BoundedText.nullable(),
  listingPriceCentavos: MoneyCentavosSchema.nullable(),
  originalPriceCentavos: MoneyCentavosSchema.nullable(),
  isPromotion: z.boolean(),
  availability: AvailabilitySchema,
  observedAt: UtcInstantSchema,
  mapVersion: z.number().int().positive(),
  parserVersion: z.number().int().positive(),
  normalizePolicyVersion: z.number().int().positive(),
  /** Incomplete canonical key → standalone-only eligibility. */
  standaloneOnly: z.boolean(),
  visible: z.literal(false),
});

export type StagedOffer = z.infer<typeof StagedOfferSchema>;

export const OfferDecoders = {
  1: PublishedOfferSchema,
} as const;
