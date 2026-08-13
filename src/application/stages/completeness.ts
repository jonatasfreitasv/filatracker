/**
 * Completeness compiler (AD-8 / AD-17).
 * Maps StoreRunEvidence + StoreMap completeness rules → publication class.
 *
 * v1 evidence counters are ambiguous (completed ≈ observation count) and must
 * NEVER grant authoritative-complete / absence inference.
 */

import type { StoreMap } from "../../contracts/store-map";
import type {
  StoreRunEvidence,
  StoreRunEvidenceV1,
  StoreRunEvidenceV2,
} from "../../contracts/store-run-evidence";
import type { PublicationClass } from "../../contracts/ingestion-run";
import { toObservationV2 } from "../../contracts/raw-offer-observation";

export const COMPLETENESS_POLICY_VERSION = 1 as const;

export type CompletenessDecision = {
  publicationClass: PublicationClass;
  reason: string;
  /** Terminal run mapping when publish-nothing. */
  terminalHint: "published" | "failed" | "quarantined" | null;
  failureCodes: string[];
};

const DISQUALIFYING_OMISSION_CODES = new Set([
  "unknown",
  "incompatible",
]);

function everyOmissionAllowlisted(
  omissions: ReadonlyArray<{ code: string }>,
  map: StoreMap,
): boolean {
  const allowed = new Set(map.completeness.omissionCodes);
  return omissions.every((o) => allowed.has(o.code));
}

function everyFailureAllowlisted(
  failureCodes: readonly string[],
  map: StoreMap,
): boolean {
  const allowed = new Set(map.completeness.failureCodes);
  return failureCodes.every((code) => allowed.has(code));
}

function boundedTruncationIsConsistent(
  evidence: StoreRunEvidenceV2,
): boolean {
  const truncations = evidence.omissions.filter(
    (omission) => omission.code === "catalog_truncated",
  );
  if (truncations.length === 0) return true;
  if (truncations.length !== 1) return false;
  const omitted = Number(truncations[0]!.detail);
  return (
    Number.isSafeInteger(omitted) &&
    omitted > 0 &&
    evidence.catalogWork.expected - evidence.catalogWork.completed === omitted
  );
}

function compileV1(
  evidence: StoreRunEvidenceV1,
  map: StoreMap,
): CompletenessDecision {
  if (evidence.probeId !== null) {
    return {
      publicationClass: "publish-nothing",
      reason: "probe_non_publishing",
      terminalHint: null,
      failureCodes: [],
    };
  }
  if (evidence.outcome === "failed") {
    return {
      publicationClass: "publish-nothing",
      reason: "evidence_failed",
      terminalHint: "failed",
      failureCodes: [...evidence.failureCodes],
    };
  }
  if (evidence.outcome === "quarantined") {
    return {
      publicationClass: "publish-nothing",
      reason: "evidence_quarantined",
      terminalHint: "quarantined",
      failureCodes: [...evidence.failureCodes],
    };
  }
  if (evidence.outcome === "oversized") {
    return {
      publicationClass: "publish-nothing",
      reason: "capacity_exceeded",
      terminalHint: "failed",
      failureCodes: ["capacity_exceeded"],
    };
  }
  const allowlisted = everyOmissionAllowlisted(evidence.omissions, map);
  const withinCompiledBound =
    evidence.catalogWork.expected > 0 &&
    evidence.catalogWork.expected <= map.completeness.catalogWorkLimit;
  const failuresAllowlisted =
    evidence.outcome === "partial"
      ? everyFailureAllowlisted(evidence.failureCodes, map)
      : true;
  if (
    evidence.outcome === "partial" &&
    allowlisted &&
    failuresAllowlisted &&
    withinCompiledBound
  ) {
    return {
      publicationClass: "positive-only",
      reason: "v1_partial_allowlisted",
      terminalHint: "published",
      failureCodes: [...evidence.failureCodes],
    };
  }
  if (evidence.outcome === "complete" && allowlisted && withinCompiledBound) {
    return {
      publicationClass: "positive-only",
      reason: "v1_complete_conservative",
      terminalHint: "published",
      failureCodes: [],
    };
  }
  return {
    publicationClass: "publish-nothing",
    reason: "v1_inconsistent_or_disallowed",
    terminalHint: "quarantined",
    failureCodes: ["unknown"],
  };
}

function compileV2(
  evidence: StoreRunEvidenceV2,
  map: StoreMap,
): CompletenessDecision {
  if (evidence.probeId !== null) {
    return {
      publicationClass: "publish-nothing",
      reason: "probe_non_publishing",
      terminalHint: null,
      failureCodes: [],
    };
  }
  if (evidence.outcome === "failed") {
    return {
      publicationClass: "publish-nothing",
      reason: "evidence_failed",
      terminalHint: "failed",
      failureCodes: [...evidence.failureCodes],
    };
  }
  if (evidence.outcome === "quarantined") {
    return {
      publicationClass: "publish-nothing",
      reason: "evidence_quarantined",
      terminalHint: "quarantined",
      failureCodes: [...evidence.failureCodes],
    };
  }
  if (evidence.outcome === "oversized") {
    return {
      publicationClass: "publish-nothing",
      reason: "capacity_exceeded",
      terminalHint: "failed",
      failureCodes: ["capacity_exceeded"],
    };
  }

  const omissions = evidence.omissions;
  const allowlisted = everyOmissionAllowlisted(omissions, map);
  const failuresAllowlisted =
    evidence.outcome === "partial"
      ? everyFailureAllowlisted(evidence.failureCodes, map)
      : true;
  const hasDisqualifying = omissions.some((o) =>
    DISQUALIFYING_OMISSION_CODES.has(o.code),
  );
  const expected = evidence.catalogWork.expected;
  const completed = evidence.catalogWork.completed;
  const countersConsistent =
    expected > 0 &&
    expected <= map.completeness.catalogWorkLimit &&
    completed <= expected &&
    evidence.budgetUsage.observationCount === evidence.observations.length &&
    evidence.budgetUsage.candidateCount === expected;

  if (!countersConsistent) {
    return {
      publicationClass: "publish-nothing",
      reason: "forged_or_inconsistent_counters",
      terminalHint: "quarantined",
      failureCodes: ["unknown"],
    };
  }

  if (evidence.outcome === "complete") {
    if (
      map.completeness.requiresExpectedCatalogWork &&
      expected === completed &&
      !hasDisqualifying &&
      allowlisted &&
      countersConsistent
    ) {
      return {
        publicationClass: "authoritative-complete",
        reason: "v2_complete_consistent",
        terminalHint: "published",
        failureCodes: [],
      };
    }
    return {
      publicationClass: "publish-nothing",
      reason: "complete_invariants_failed",
      terminalHint: "quarantined",
      failureCodes: ["unknown"],
    };
  }

  if (
    map.completeness.allowsBoundedOmissions &&
    allowlisted &&
    failuresAllowlisted &&
    boundedTruncationIsConsistent(evidence) &&
    !hasDisqualifying
  ) {
    return {
      publicationClass: "positive-only",
      reason: "v2_partial_allowlisted",
      terminalHint: "published",
      failureCodes: [...evidence.failureCodes],
    };
  }

  return {
    publicationClass: "publish-nothing",
    reason: "partial_disallowed",
    terminalHint: "quarantined",
    failureCodes: [...evidence.failureCodes],
  };
}

/**
 * Compile evidence into a publication class. Probe runs never publish.
 */
export function compilePublicationClass(input: {
  evidence: StoreRunEvidence;
  map: StoreMap;
}): CompletenessDecision {
  if (input.evidence.contractVersion === 2) {
    return compileV2(input.evidence, input.map);
  }
  return compileV1(input.evidence, input.map);
}

/** Lift evidence observations to v2 shape for shared stages. */
export function observationsForStages(evidence: StoreRunEvidence) {
  return evidence.observations.map(toObservationV2);
}
