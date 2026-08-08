/**
 * Shared promotion validation (PRD FR-17 / AD-15).
 * Hooks capture listing/original evidence only.
 * Promotion semantics require both parsed values positive AND original > listing.
 */

export const PROMOTION_POLICY_VERSION = 1 as const;

export type PromotionAssessment =
  | {
      isPromotion: true;
      listingPriceCentavos: number;
      originalPriceCentavos: number;
    }
  | {
      isPromotion: false;
      reason:
        | "missing_listing"
        | "missing_original"
        | "equal"
        | "original_not_higher"
        | "zero_or_invalid";
    };

export function assessPromotion(input: {
  listingPriceCentavos: number | null;
  originalPriceCentavos: number | null;
}): PromotionAssessment {
  const listing = input.listingPriceCentavos;
  const original = input.originalPriceCentavos;

  if (listing === null) {
    return { isPromotion: false, reason: "missing_listing" };
  }
  if (original === null) {
    return { isPromotion: false, reason: "missing_original" };
  }
  if (listing <= 0 || original <= 0) {
    return { isPromotion: false, reason: "zero_or_invalid" };
  }
  if (original === listing) {
    return { isPromotion: false, reason: "equal" };
  }
  if (original < listing) {
    return { isPromotion: false, reason: "original_not_higher" };
  }
  return {
    isPromotion: true,
    listingPriceCentavos: listing,
    originalPriceCentavos: original,
  };
}
