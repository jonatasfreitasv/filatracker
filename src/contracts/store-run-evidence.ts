import { z } from "zod";

import { RawOfferObservationSchema } from "./raw-offer-observation";
import { UtcInstantSchema } from "./search-page";

/**
 * Discriminated Store run-evidence result v1.
 * Failures/partial/quarantine/oversize are explicit — never masquerade as [].
 * No predecessor version exists.
 */
export const STORE_RUN_EVIDENCE_CONTRACT_VERSION = 1 as const;
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
  "unknown",
]);

export type FailureCode = z.infer<typeof FailureCodeSchema>;

const RunMetaBase = {
  contractVersion: z.literal(STORE_RUN_EVIDENCE_CONTRACT_VERSION),
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

export const StoreRunCompleteSchema = z.strictObject({
  ...RunMetaBase,
  outcome: z.literal("complete"),
  observations: z.array(RawOfferObservationSchema).max(500),
  omissions: z.array(OmissionSchema).max(200),
});

export const StoreRunPartialSchema = z.strictObject({
  ...RunMetaBase,
  outcome: z.literal("partial"),
  observations: z.array(RawOfferObservationSchema).max(500),
  omissions: z.array(OmissionSchema).min(1).max(200),
  failureCodes: z.array(FailureCodeSchema).min(1).max(16),
});

export const StoreRunFailedSchema = z.strictObject({
  ...RunMetaBase,
  outcome: z.literal("failed"),
  /** Failed runs must not carry a success observation set. */
  observations: z.tuple([]),
  omissions: z.array(OmissionSchema).max(200),
  failureCodes: z.array(FailureCodeSchema).min(1).max(16),
});

export const StoreRunQuarantinedSchema = z.strictObject({
  ...RunMetaBase,
  outcome: z.literal("quarantined"),
  observations: z.tuple([]),
  omissions: z.array(OmissionSchema).max(200),
  failureCodes: z.array(FailureCodeSchema).min(1).max(16),
});

export const StoreRunOversizedSchema = z.strictObject({
  ...RunMetaBase,
  outcome: z.literal("oversized"),
  observations: z.tuple([]),
  omissions: z.array(OmissionSchema).max(200),
  failureCodes: z.array(FailureCodeSchema).min(1).max(16),
});

export const StoreRunEvidenceSchema = z.discriminatedUnion("outcome", [
  StoreRunCompleteSchema,
  StoreRunPartialSchema,
  StoreRunFailedSchema,
  StoreRunQuarantinedSchema,
  StoreRunOversizedSchema,
]);

export type StoreRunEvidence = z.infer<typeof StoreRunEvidenceSchema>;

export const StoreRunEvidenceDecoders = {
  1: StoreRunEvidenceSchema,
} as const;
