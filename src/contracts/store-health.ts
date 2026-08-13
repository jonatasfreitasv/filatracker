import { z } from "zod";

import { FailureCodeSchema } from "./store-run-evidence";
import { UtcInstantSchema } from "./search-page";

/**
 * Store health / lifecycle / activation-gate contracts v1 — no predecessor.
 * Support states: active | degraded | unsupported | deactivated.
 * Pre-activation is a separate audited publication gate (blocked|approved),
 * not a fifth support state.
 */
export const STORE_HEALTH_CONTRACT_VERSION = 1 as const;
export const STORE_HEALTH_CONTRACT_NO_PREDECESSOR = true as const;

const BoundedId = z.string().min(1).max(128);

export const StoreSupportStateSchema = z.enum([
  "active",
  "degraded",
  "unsupported",
  "deactivated",
]);

export type StoreSupportState = z.infer<typeof StoreSupportStateSchema>;

export const PublicationActivationGateSchema = z.enum([
  "blocked",
  "approved",
]);

export type PublicationActivationGate = z.infer<
  typeof PublicationActivationGateSchema
>;

export const StoreHealthSchema = z.strictObject({
  contractVersion: z.literal(STORE_HEALTH_CONTRACT_VERSION),
  storeId: BoundedId,
  supportState: StoreSupportStateSchema,
  supportGeneration: z.number().int().nonnegative(),
  storeGeneration: z.number().int().nonnegative(),
  projectionEpoch: z.number().int().nonnegative(),
  recoveryEpochSnapshot: z.number().int().nonnegative(),
  activationGate: PublicationActivationGateSchema,
  lastRunId: BoundedId.nullable(),
  lastRunOutcome: z
    .enum(["complete", "partial", "failed", "quarantined", "oversized"])
    .nullable(),
  lastFailureCodes: z.array(FailureCodeSchema).max(16),
  observationCount: z.number().int().nonnegative().nullable(),
  publishedOfferCount: z.number().int().nonnegative().nullable(),
  freshnessObservedAt: UtcInstantSchema.nullable(),
  updatedAt: UtcInstantSchema,
});

export type StoreHealth = z.infer<typeof StoreHealthSchema>;

export const StoreLifecycleActorSchema = z.enum([
  "system",
  "operator",
  "coordinator",
]);

export type StoreLifecycleActor = z.infer<typeof StoreLifecycleActorSchema>;

export const StoreLifecycleTransitionSchema = z.strictObject({
  contractVersion: z.literal(STORE_HEALTH_CONTRACT_VERSION),
  storeId: BoundedId,
  fromState: StoreSupportStateSchema.nullable(),
  toState: StoreSupportStateSchema,
  actor: StoreLifecycleActorSchema,
  reason: z.string().min(1).max(512),
  at: UtcInstantSchema,
});

export type StoreLifecycleTransition = z.infer<
  typeof StoreLifecycleTransitionSchema
>;

/**
 * Legal support-state transitions (AD-18):
 * - active → degraded
 * - active|degraded → unsupported (proven policy/map conditions)
 * - unsupported → active (new homologation + safe probe + operator auth)
 * - any live → deactivated (operator only)
 */
export const LEGAL_SUPPORT_TRANSITIONS: Readonly<
  Record<StoreSupportState, readonly StoreSupportState[]>
> = {
  active: ["degraded", "unsupported", "deactivated"],
  degraded: ["unsupported", "deactivated"],
  unsupported: ["active", "deactivated"],
  deactivated: [],
};

export function canTransitionSupport(
  from: StoreSupportState,
  to: StoreSupportState,
  actor: StoreLifecycleActor,
): boolean {
  if (!LEGAL_SUPPORT_TRANSITIONS[from].includes(to)) return false;
  if (to === "deactivated" && actor !== "operator") return false;
  if (from === "unsupported" && to === "active" && actor !== "operator") {
    return false;
  }
  return true;
}

export const StoreHealthDecoders = {
  1: StoreHealthSchema,
} as const;
