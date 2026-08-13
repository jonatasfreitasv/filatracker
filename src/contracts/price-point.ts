import { z } from "zod";

import { MoneyCentavosSchema, UtcInstantSchema } from "./search-page";

/**
 * PricePoint contract v1 — append-only; no predecessor.
 * At most one PricePoint per (offerId, runId); never rewrite history.
 */
export const PRICE_POINT_CONTRACT_VERSION = 1 as const;
export const PRICE_POINT_CONTRACT_NO_PREDECESSOR = true as const;

const BoundedId = z.string().min(1).max(128);

export const PricePointSchema = z.strictObject({
  contractVersion: z.literal(PRICE_POINT_CONTRACT_VERSION),
  pricePointId: BoundedId,
  offerId: BoundedId,
  storeId: BoundedId,
  runId: BoundedId,
  listingPriceCentavos: MoneyCentavosSchema,
  originalPriceCentavos: MoneyCentavosSchema.nullable(),
  observedAt: UtcInstantSchema,
  recordedAt: UtcInstantSchema,
  /** Null unless this fact corrects a prior PricePoint on the same Offer. */
  correctsPricePointId: BoundedId.nullable(),
  /** True while this is the effective published price for folding. */
  effective: z.boolean(),
});

export type PricePoint = z.infer<typeof PricePointSchema>;

export const PricePointDecoders = {
  1: PricePointSchema,
} as const;

/** Positive price tuple used for change detection. */
export type PriceTuple = {
  listingPriceCentavos: number;
  originalPriceCentavos: number | null;
};

export function priceTuplesEqual(a: PriceTuple, b: PriceTuple): boolean {
  return (
    a.listingPriceCentavos === b.listingPriceCentavos &&
    a.originalPriceCentavos === b.originalPriceCentavos
  );
}
