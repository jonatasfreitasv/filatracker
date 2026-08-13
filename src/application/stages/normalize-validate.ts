/**
 * Shared normalize + validate stage orchestration (AD-7).
 * No AI/LLM. Closin adapter remains observation-only.
 */

import type { RawOfferObservationV2 } from "../../contracts/raw-offer-observation";
import type { StagedOffer } from "../../contracts/offer";
import { assessPromotion } from "../../domain/policy/promotion";
import {
  normalizeObservation,
  type NormalizedOfferFacts,
} from "../../domain/policy/normalize";
import { validateNormalizedOffer } from "../../domain/policy/validate";
import {
  resolveOfferIdentity,
  type OfferIdentityRecord,
  type OfferIdentityLineageRecord,
} from "../../domain/identity/offer-identity";
import { OFFER_CONTRACT_VERSION } from "../../contracts/offer";
import { canonicalizeUtcInstant } from "../../contracts/search-page";

export type StageReject = {
  sourceUrl: string;
  code: string;
  detail: string;
};

export type NormalizeValidateResult = {
  staged: StagedOffer[];
  rejected: StageReject[];
  quarantined: StageReject[];
  identityBySourceKey: Map<string, OfferIdentityRecord>;
  /** False means the coordinator must publish nothing for the whole run. */
  publicationSafe: boolean;
  blockingReason: "validation_rejected" | null;
};

export function normalizeAndValidateObservations(input: {
  observations: readonly RawOfferObservationV2[];
  allowedHosts: readonly string[];
  apexToWww?: { apex: string; www: string };
  existingBySourceKey?: ReadonlyMap<string, OfferIdentityRecord>;
  aliases?: ReadonlyMap<string, string>;
  tombstones?: ReadonlySet<string>;
  lineage?: ReadonlyMap<string, OfferIdentityLineageRecord>;
}): NormalizeValidateResult {
  const staged: StagedOffer[] = [];
  const rejected: StageReject[] = [];
  const quarantined: StageReject[] = [];
  const identityBySourceKey = new Map<string, OfferIdentityRecord>(
    input.existingBySourceKey ?? [],
  );
  const seenInRun = new Set<string>();

  for (const obs of input.observations) {
    const observedAt = canonicalizeUtcInstant(obs.observedAt);
    if (observedAt === null) {
      rejected.push({
        sourceUrl: obs.sourceUrl,
        code: "invalid_observed_at",
        detail: "observed_at_must_be_iso_instant",
      });
      continue;
    }
    const identity = resolveOfferIdentity({
      storeId: obs.storeId,
      pdpUrl: obs.sourceUrl,
      merchantVariantId: obs.merchantVariantId,
      allowedHosts: input.allowedHosts,
      apexToWww: input.apexToWww,
      bySourceKey: identityBySourceKey,
      aliases: input.aliases,
      tombstones: input.tombstones,
      lineage: input.lineage,
      continuityEvidence: {
        brandEvidence: obs.brandEvidence,
        materialEvidence: obs.materialEvidence,
        massGrams: obs.massGrams,
        titleEvidence: obs.titleEvidence,
      },
    });

    if (!identity.ok) {
      if (identity.code === "incompatible_reuse") {
        quarantined.push({
          sourceUrl: obs.sourceUrl,
          code: "incompatible_source_tuple_reuse",
          detail: identity.detail,
        });
      } else {
        rejected.push({
          sourceUrl: obs.sourceUrl,
          code: identity.code,
          detail: identity.detail,
        });
      }
      continue;
    }

    if (seenInRun.has(identity.record.sourceKey)) {
      rejected.push({
        sourceUrl: obs.sourceUrl,
        code: "duplicate_source_tuple",
        detail: identity.record.sourceKey,
      });
      continue;
    }
    seenInRun.add(identity.record.sourceKey);
    identityBySourceKey.set(identity.record.sourceKey, identity.record);

    const promotion = assessPromotion({
      listingPriceCentavos: obs.price.listingPriceCentavos,
      originalPriceCentavos: obs.price.originalPriceCentavos,
    });

    const facts: NormalizedOfferFacts = normalizeObservation({
      brandEvidence: obs.brandEvidence,
      materialEvidence: obs.materialEvidence,
      colorEvidence: obs.colorEvidence,
      diameterEvidence: obs.diameterEvidence,
      titleEvidence: obs.titleEvidence,
      descriptionEvidence: obs.descriptionEvidence,
      massGrams: obs.massGrams,
      listingPriceCentavos: obs.price.listingPriceCentavos,
      originalPriceCentavos: obs.price.originalPriceCentavos,
      availability: obs.availability,
      isPromotion: promotion.isPromotion,
    });

    const validated = validateNormalizedOffer(facts);
    if (!validated.ok) {
      rejected.push({
        sourceUrl: obs.sourceUrl,
        code: validated.code,
        detail: validated.detail,
      });
      continue;
    }

    staged.push({
      contractVersion: OFFER_CONTRACT_VERSION,
      offerId: identity.record.offerId,
      storeId: obs.storeId,
      runId: obs.runId,
      sourceKey: identity.record.sourceKey,
      continuityFingerprint: identity.record.continuityFingerprint,
      canonicalPdpUrl: identity.record.canonicalPdpUrl,
      merchantVariantId: identity.record.merchantVariantId,
      brand: validated.facts.brand,
      specificType: validated.facts.specificType,
      materialFamily: validated.facts.materialFamily,
      color: validated.facts.color,
      diameterMm: validated.facts.diameterMm,
      massGrams: validated.facts.massGrams,
      listingTitle: validated.facts.listingTitle,
      listingPriceCentavos: validated.facts.listingPriceCentavos,
      originalPriceCentavos: validated.facts.originalPriceCentavos,
      isPromotion: validated.facts.isPromotion,
      availability: validated.facts.availability,
      observedAt,
      mapVersion: obs.mapVersion,
      parserVersion: obs.parserVersion,
      normalizePolicyVersion: validated.facts.normalizePolicyVersion,
      standaloneOnly: validated.facts.standaloneOnly,
      visible: false,
    });
  }

  return {
    staged,
    rejected,
    quarantined,
    identityBySourceKey,
    publicationSafe: rejected.length === 0 && quarantined.length === 0,
    blockingReason: rejected.length > 0 ? "validation_rejected" : null,
  };
}
