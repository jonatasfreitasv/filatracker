/**
 * PricePoint append rules + effective-price folding (AD-19).
 */

import {
  PRICE_POINT_CONTRACT_VERSION,
  priceTuplesEqual,
  type PricePoint,
  type PriceTuple,
} from "../../contracts/price-point";

export type PricePointAppendDecision =
  | { append: false; reason: "no_positive_listing" | "unchanged" | "availability_only" }
  | { append: true; tuple: PriceTuple };

export function decidePricePointAppend(input: {
  listingPriceCentavos: number | null;
  originalPriceCentavos: number | null;
  priorEffective: PriceTuple | null;
  availabilityChangedOnly: boolean;
}): PricePointAppendDecision {
  if (
    input.listingPriceCentavos === null ||
    input.listingPriceCentavos <= 0
  ) {
    return { append: false, reason: "no_positive_listing" };
  }
  if (input.availabilityChangedOnly && input.priorEffective !== null) {
    const next: PriceTuple = {
      listingPriceCentavos: input.listingPriceCentavos,
      originalPriceCentavos: input.originalPriceCentavos,
    };
    if (priceTuplesEqual(next, input.priorEffective)) {
      return { append: false, reason: "availability_only" };
    }
  }
  const next: PriceTuple = {
    listingPriceCentavos: input.listingPriceCentavos,
    originalPriceCentavos: input.originalPriceCentavos,
  };
  if (
    input.priorEffective !== null &&
    priceTuplesEqual(next, input.priorEffective)
  ) {
    return { append: false, reason: "unchanged" };
  }
  return { append: true, tuple: next };
}

export type CorrectionEdgeCheck =
  | { ok: true }
  | {
      ok: false;
      code: "cross_offer" | "cycle" | "double_successor";
      detail: string;
    };

/**
 * Correction edges stay within one Offer, are acyclic, and allow at most one
 * effective successor per corrected position.
 */
export function validateCorrectionEdge(input: {
  offerId: string;
  correctsPricePointId: string | null;
  existing: readonly PricePoint[];
}): CorrectionEdgeCheck {
  if (input.correctsPricePointId === null) return { ok: true };

  const target = input.existing.find(
    (p) => p.pricePointId === input.correctsPricePointId,
  );
  if (!target) {
    return { ok: false, code: "cross_offer", detail: "missing_target" };
  }
  if (target.offerId !== input.offerId) {
    return { ok: false, code: "cross_offer", detail: target.offerId };
  }

  const alreadyHasSuccessor = input.existing.some(
    (p) =>
      p.correctsPricePointId === input.correctsPricePointId && p.effective,
  );
  if (alreadyHasSuccessor) {
    return {
      ok: false,
      code: "double_successor",
      detail: input.correctsPricePointId,
    };
  }

  // Cycle detection: walk correction chain backward.
  const byId = new Map(input.existing.map((p) => [p.pricePointId, p]));
  let cursor: string | null = input.correctsPricePointId;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor)) {
      return { ok: false, code: "cycle", detail: cursor };
    }
    seen.add(cursor);
    cursor = byId.get(cursor)?.correctsPricePointId ?? null;
  }

  return { ok: true };
}

export function buildPricePoint(input: {
  pricePointId: string;
  offerId: string;
  storeId: string;
  runId: string;
  tuple: PriceTuple;
  observedAt: string;
  recordedAt: string;
  correctsPricePointId?: string | null;
}): PricePoint {
  return {
    contractVersion: PRICE_POINT_CONTRACT_VERSION,
    pricePointId: input.pricePointId,
    offerId: input.offerId,
    storeId: input.storeId,
    runId: input.runId,
    listingPriceCentavos: input.tuple.listingPriceCentavos,
    originalPriceCentavos: input.tuple.originalPriceCentavos,
    observedAt: input.observedAt,
    recordedAt: input.recordedAt,
    correctsPricePointId: input.correctsPricePointId ?? null,
    effective: true,
  };
}

/** Deterministic fold: effective correction supersedes prior; history retained. */
export function foldEffectivePrice(
  points: readonly PricePoint[],
): PricePoint | null {
  const effective = points.filter((p) => p.effective);
  if (effective.length === 0) return null;
  return effective.reduce((latest, p) =>
    Date.parse(p.recordedAt) >= Date.parse(latest.recordedAt) ? p : latest,
  );
}
