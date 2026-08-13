import { z } from "zod";

import {
  RawOfferObservationAnySchema,
  RawOfferObservationV1Schema,
  RawOfferObservationV2Schema,
} from "./raw-offer-observation";
import { UtcInstantSchema } from "./search-page";

/**
 * Discriminated Store run-evidence result.
 * Failures/partial/quarantine/oversize are explicit — never masquerade as [].
 *
 * v1: Story 1.2 wire. `catalogWork.completed` historically equaled observation
 * count (ambiguous for omissions). Consumers must NOT grant authoritative
 * completeness from v1 counters alone.
 *
 * v2: truthful counters —
 * - `catalogWork.completed` = catalog candidates whose work reached a terminal
 *   processed/omitted result (not observation count)
 * - `budgetUsage.candidateCount` = discovered candidates counted once
 */
export const STORE_RUN_EVIDENCE_CONTRACT_VERSION = 1 as const;
export const STORE_RUN_EVIDENCE_CONTRACT_VERSION_V2 = 2 as const;
export const STORE_RUN_EVIDENCE_NO_PREDECESSOR = true as const;

export const StoreRunOutcomeKindSchema = z.enum([
  "complete",
  "partial",
  "failed",
  "quarantined",
  "oversized",
]);

export type StoreRunOutcomeKind = z.infer<typeof StoreRunOutcomeKindSchema>;

export const BudgetUsageSchema = z.strictObject({
  fetchCount: z.number().int().nonnegative(),
  redirectHops: z.number().int().nonnegative(),
  encodedBytes: z.number().int().nonnegative(),
  decompressedBytes: z.number().int().nonnegative(),
  observationCount: z.number().int().nonnegative(),
  candidateCount: z.number().int().nonnegative(),
  subrequests: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  stagedByteEstimate: z.number().int().nonnegative(),
  logEventBytes: z.number().int().nonnegative(),
});

export type BudgetUsage = z.infer<typeof BudgetUsageSchema>;

export const CatalogWorkSchema = z.strictObject({
  expected: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
});

export type CatalogWork = z.infer<typeof CatalogWorkSchema>;

export const OmissionSchema = z.strictObject({
  code: z.string().min(1).max(64),
  detail: z.string().max(512).nullable(),
  sourceUrl: z.string().url().max(2048).nullable(),
});

export type Omission = z.infer<typeof OmissionSchema>;

export const FailureCodeSchema = z.enum([
  "robots_disallow",
  "robots_ambiguous",
  "robots_fetch_failed",
  "destination_rejected",
  "dns_policy_failed",
  "redirect_policy_failed",
  "fetch_failed",
  "captcha_or_auth_wall",
  "anti_bot_block",
  "budget_overflow",
  "parse_budget_overflow",
  "timeout",
  "quarantine",
  "map_invalid",
  "probe_bound_exceeded",
  "capacity_exceeded",
  "empty_catalog",
  "unknown",
]);

export type FailureCode = z.infer<typeof FailureCodeSchema>;

function buildRunSchemas(
  version: 1 | 2,
  observationSchema: typeof RawOfferObservationV1Schema | typeof RawOfferObservationV2Schema,
) {
  const RunMetaBase = {
    contractVersion: z.literal(version),
    storeId: z.string().min(1).max(64),
    runId: z.string().min(1).max(128),
    probeId: z.string().min(1).max(128).nullable(),
    mapVersion: z.number().int().positive(),
    parserVersion: z.number().int().positive(),
    startedAt: UtcInstantSchema,
    finishedAt: UtcInstantSchema,
    budgetUsage: BudgetUsageSchema,
    catalogWork: CatalogWorkSchema,
  };

  const complete = z.strictObject({
    ...RunMetaBase,
    outcome: z.literal("complete"),
    observations: z.array(observationSchema).max(500),
    omissions: z.array(OmissionSchema).max(200),
  });

  const partial = z.strictObject({
    ...RunMetaBase,
    outcome: z.literal("partial"),
    observations: z.array(observationSchema).max(500),
    omissions: z.array(OmissionSchema).min(1).max(200),
    failureCodes: z.array(FailureCodeSchema).min(1).max(16),
  });

  const failed = z.strictObject({
    ...RunMetaBase,
    outcome: z.literal("failed"),
    observations: z.tuple([]),
    omissions: z.array(OmissionSchema).max(200),
    failureCodes: z.array(FailureCodeSchema).min(1).max(16),
  });

  const quarantined = z.strictObject({
    ...RunMetaBase,
    outcome: z.literal("quarantined"),
    observations: z.tuple([]),
    omissions: z.array(OmissionSchema).max(200),
    failureCodes: z.array(FailureCodeSchema).min(1).max(16),
  });

  const oversized = z.strictObject({
    ...RunMetaBase,
    outcome: z.literal("oversized"),
    observations: z.tuple([]),
    omissions: z.array(OmissionSchema).max(200),
    failureCodes: z.array(FailureCodeSchema).min(1).max(16),
  });

  return z.discriminatedUnion("outcome", [
    complete,
    partial,
    failed,
    quarantined,
    oversized,
  ]);
}

export const StoreRunEvidenceV1Schema = buildRunSchemas(
  1,
  RawOfferObservationV1Schema,
);
export const StoreRunEvidenceV2Schema = buildRunSchemas(
  2,
  RawOfferObservationV2Schema,
);

export const StoreRunEvidenceSchema = StoreRunEvidenceV1Schema;

export type StoreRunEvidenceV1 = z.infer<typeof StoreRunEvidenceV1Schema>;
export type StoreRunEvidenceV2 = z.infer<typeof StoreRunEvidenceV2Schema>;
export type StoreRunEvidence = StoreRunEvidenceV1 | StoreRunEvidenceV2;

/**
 * Decode any accepted run-evidence version. Unknown versions fail closed.
 * For pipeline use, prefer `toRunEvidenceV2` so counters/observations are
 * normalized without rewriting v1 wire meaning.
 */
export const StoreRunEvidenceAnySchema = z.union([
  StoreRunEvidenceV1Schema,
  StoreRunEvidenceV2Schema,
]);

export const StoreRunEvidenceDecoders = {
  1: StoreRunEvidenceV1Schema,
  2: StoreRunEvidenceV2Schema,
} as const;

/** Loose observation decode for mixed retained payloads. */
export const RetainedObservationSchema = RawOfferObservationAnySchema;
