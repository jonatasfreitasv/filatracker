import { z } from "zod";

import { FailureCodeSchema } from "./store-run-evidence";
import { UtcInstantSchema } from "./search-page";

/**
 * Ingestion run + Store generation state contracts v1 — no predecessor.
 * Legal SM: created → discovering → staged → validated → publishing → published.
 * Any nonterminal may become failed | quarantined | superseded.
 * Terminal states are immutable.
 */
export const INGESTION_RUN_CONTRACT_VERSION = 1 as const;
export const INGESTION_RUN_CONTRACT_NO_PREDECESSOR = true as const;

const BoundedId = z.string().min(1).max(128);

export const RunStateSchema = z.enum([
  "created",
  "discovering",
  "staged",
  "validated",
  "publishing",
  "published",
  "failed",
  "quarantined",
  "superseded",
]);

export type RunState = z.infer<typeof RunStateSchema>;

export const TERMINAL_RUN_STATES = [
  "published",
  "failed",
  "quarantined",
  "superseded",
] as const satisfies readonly RunState[];

export type TerminalRunState = (typeof TERMINAL_RUN_STATES)[number];

export const NONTERMINAL_RUN_STATES = [
  "created",
  "discovering",
  "staged",
  "validated",
  "publishing",
] as const satisfies readonly RunState[];

export const PublicationClassSchema = z.enum([
  "authoritative-complete",
  "positive-only",
  "publish-nothing",
]);

export type PublicationClass = z.infer<typeof PublicationClassSchema>;

export const IngestionRunSchema = z.strictObject({
  contractVersion: z.literal(INGESTION_RUN_CONTRACT_VERSION),
  runId: BoundedId,
  storeId: BoundedId,
  state: RunStateSchema,
  probeId: BoundedId.nullable(),
  storeGeneration: z.number().int().nonnegative().nullable(),
  supportGeneration: z.number().int().nonnegative(),
  projectionEpoch: z.number().int().nonnegative(),
  recoveryEpoch: z.number().int().nonnegative(),
  publicationClass: PublicationClassSchema.nullable(),
  failureCodes: z.array(FailureCodeSchema).max(16),
  evidenceDigestSha256: z.string().min(1).max(128).nullable(),
  payloadArtifactId: BoundedId.nullable(),
  mapVersion: z.number().int().positive().nullable(),
  parserVersion: z.number().int().positive().nullable(),
  createdAt: UtcInstantSchema,
  updatedAt: UtcInstantSchema,
  terminalAt: UtcInstantSchema.nullable(),
});

export type IngestionRun = z.infer<typeof IngestionRunSchema>;

/** Legal forward edges for the run state machine. */
export const LEGAL_RUN_TRANSITIONS: Readonly<
  Record<RunState, readonly RunState[]>
> = {
  created: ["discovering", "failed", "quarantined", "superseded"],
  discovering: ["staged", "failed", "quarantined", "superseded"],
  staged: ["validated", "failed", "quarantined", "superseded"],
  validated: ["publishing", "failed", "quarantined", "superseded"],
  publishing: ["published", "failed", "quarantined", "superseded"],
  published: [],
  failed: [],
  quarantined: [],
  superseded: [],
};

export function isTerminalRunState(state: RunState): state is TerminalRunState {
  return (TERMINAL_RUN_STATES as readonly string[]).includes(state);
}

export function canTransitionRun(from: RunState, to: RunState): boolean {
  return LEGAL_RUN_TRANSITIONS[from].includes(to);
}

export const IngestionRunDecoders = {
  1: IngestionRunSchema,
} as const;
