/**
 * Shared validation for staged Offers (AD-7 / NFR7).
 * Never invent values. Kits with massGrams:null stay eligible as standalone
 * Offers when otherwise valid. Incompatible source-tuple reuse is quarantined
 * upstream (identity stage).
 */

import { MONEY_CENTAVOS_MAX } from "../../contracts/search-page";
import type { NormalizedOfferFacts } from "./normalize";

export const VALIDATE_POLICY_VERSION = 1 as const;

export type ValidationResult =
  | { ok: true; facts: NormalizedOfferFacts }
  | {
      ok: false;
      code:
        | "invented_value_rejected"
        | "invalid_money"
        | "invalid_mass"
        | "invalid_availability";
      detail: string;
    };

/**
 * Validate normalized facts. Positive centavos/grams when non-null.
 * Does not invent brand/type/family/price/mass.
 */
export function validateNormalizedOffer(
  facts: NormalizedOfferFacts,
): ValidationResult {
  if (
    facts.listingPriceCentavos !== null &&
    (!Number.isInteger(facts.listingPriceCentavos) ||
      facts.listingPriceCentavos <= 0 ||
      facts.listingPriceCentavos > MONEY_CENTAVOS_MAX)
  ) {
    return {
      ok: false,
      code: "invalid_money",
      detail: "listingPriceCentavos",
    };
  }
  if (
    facts.originalPriceCentavos !== null &&
    (!Number.isInteger(facts.originalPriceCentavos) ||
      facts.originalPriceCentavos <= 0 ||
      facts.originalPriceCentavos > MONEY_CENTAVOS_MAX)
  ) {
    return {
      ok: false,
      code: "invalid_money",
      detail: "originalPriceCentavos",
    };
  }
  if (
    facts.massGrams !== null &&
    (!Number.isInteger(facts.massGrams) || facts.massGrams <= 0)
  ) {
    return { ok: false, code: "invalid_mass", detail: "massGrams" };
  }
  if (
    facts.availability !== "available" &&
    facts.availability !== "unavailable" &&
    facts.availability !== "unknown"
  ) {
    return {
      ok: false,
      code: "invalid_availability",
      detail: String(facts.availability),
    };
  }

  // Kits / incomplete keys: eligible only as standalone — already flagged.
  return { ok: true, facts };
}

/** 48h stale derivation from last successful publish observedAt. */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export function deriveStale(input: {
  lastPublishedObservedAt: string | null;
  now: Date;
}): boolean {
  if (input.lastPublishedObservedAt === null) return false;
  const observedMs = Date.parse(input.lastPublishedObservedAt);
  if (!Number.isFinite(observedMs)) return false;
  return input.now.getTime() - observedMs > STALE_AFTER_MS;
}
