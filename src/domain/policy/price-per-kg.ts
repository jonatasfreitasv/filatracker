/**
 * Conditional R$/kg derivation (AD-15 / Story 1.4).
 * Positive Listing Price + unambiguous net mass only.
 * Kits/bundles with ambiguous per-spool mass omit R$/kg.
 */

import type { SpecificType } from "../../contracts/offer";
import { MONEY_CENTAVOS_MAX } from "../../contracts/search-page";

/**
 * Returns positive integer centavos-per-kg, or null when not honestly derivable.
 */
export function derivePricePerKgCentavos(input: {
  listingPriceCentavos: number | null;
  massGrams: number | null;
  specificType: SpecificType | null;
}): number | null {
  const { listingPriceCentavos, massGrams, specificType } = input;

  if (
    listingPriceCentavos === null ||
    !Number.isSafeInteger(listingPriceCentavos) ||
    listingPriceCentavos <= 0
  ) {
    return null;
  }

  // Aggregate kit mass must never be treated as a single spool.
  if (specificType === "filament_kit") {
    return null;
  }

  if (
    massGrams === null ||
    !Number.isSafeInteger(massGrams) ||
    massGrams <= 0
  ) {
    return null;
  }

  // Round to nearest centavo: price * 1000 / massGrams
  const numerator = listingPriceCentavos * 1000;
  if (!Number.isSafeInteger(numerator)) return null;
  const raw = numerator / massGrams;
  const rounded = Math.round(raw);
  if (
    !Number.isSafeInteger(rounded) || rounded <= 0 ||
    rounded > MONEY_CENTAVOS_MAX
  ) return null;
  return rounded;
}
