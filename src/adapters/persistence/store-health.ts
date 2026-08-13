/**
 * Store health read + audited lifecycle transitions (AD-18 / AD-24).
 * Support transitions atomically update Store state, support epoch,
 * relational Offer visibility, active FTS docs, and search-write generation.
 */

import { canonicalizeUtcInstant } from "../../contracts/search-page";
import {
  STORE_HEALTH_CONTRACT_VERSION,
  canTransitionSupport,
  type PublicationActivationGate,
  type StoreHealth,
  type StoreLifecycleActor,
  type StoreSupportState,
} from "../../contracts/store-health";
import type { FailureCode } from "../../contracts/store-run-evidence";
import {
  sqlDeleteStoreFtsDocsForTransition,
  sqlInsertStoreFtsDocsForTransition,
  selectActiveFtsSlot,
} from "./fts-writer";

export async function getStoreHealth(
  db: D1Database,
  storeId: string,
): Promise<StoreHealth | null> {
  const row = await db
    .prepare(
      `SELECT store_id, support_state, support_generation, store_generation,
              activation_gate, recovery_epoch_snapshot, last_run_id, last_run_outcome,
              last_failure_codes_json, observation_count, published_offer_count,
              freshness_observed_at, updated_at, display_name
       FROM store_state WHERE store_id = ?`,
    )
    .bind(storeId)
    .first<{
      store_id: string;
      support_state: StoreSupportState;
      support_generation: number;
      store_generation: number;
      activation_gate: PublicationActivationGate;
      recovery_epoch_snapshot: number;
      last_run_id: string | null;
      last_run_outcome:
        | "complete"
        | "partial"
        | "failed"
        | "quarantined"
        | "oversized"
        | null;
      last_failure_codes_json: string;
      observation_count: number | null;
      published_offer_count: number | null;
      freshness_observed_at: string | null;
      updated_at: string;
      display_name: string | null;
    }>();

  if (!row) return null;

  const epochs = await db
    .prepare(`SELECT projection_epoch FROM projection_meta WHERE id = 1`)
    .first<{ projection_epoch: number }>();

  let failureCodes: FailureCode[] = [];
  try {
    failureCodes = JSON.parse(row.last_failure_codes_json) as FailureCode[];
  } catch {
    failureCodes = [];
  }

  return {
    contractVersion: STORE_HEALTH_CONTRACT_VERSION,
    storeId: row.store_id,
    supportState: row.support_state,
    supportGeneration: row.support_generation,
    storeGeneration: row.store_generation,
    projectionEpoch: epochs?.projection_epoch ?? 0,
    recoveryEpochSnapshot: row.recovery_epoch_snapshot,
    activationGate: row.activation_gate,
    lastRunId: row.last_run_id,
    lastRunOutcome: row.last_run_outcome,
    lastFailureCodes: failureCodes,
    observationCount: row.observation_count,
    publishedOfferCount: row.published_offer_count,
    freshnessObservedAt: row.freshness_observed_at,
    updatedAt: row.updated_at,
  };
}

function isVisibleSupport(state: StoreSupportState): boolean {
  return state === "active" || state === "degraded";
}

/**
 * Audited, generation-fenced support-state transition.
 * active|degraded restores eligible relational visibility and reindexes FTS.
 * unsupported|deactivated hides Offers and removes FTS docs.
 * Stale/concurrent transitions roll back completely (batch failure or 0 changes).
 */
export async function transitionStoreSupport(
  db: D1Database,
  input: {
    storeId: string;
    toState: StoreSupportState;
    actor: StoreLifecycleActor;
    reason: string;
    nowIso: string;
  },
): Promise<{ ok: true } | { ok: false; code: string }> {
  const nowIso = canonicalizeUtcInstant(input.nowIso);
  if (!nowIso) return { ok: false, code: "invalid_utc_instant" };

  const current = await db
    .prepare(
      `SELECT support_state, support_generation FROM store_state WHERE store_id = ?`,
    )
    .bind(input.storeId)
    .first<{ support_state: StoreSupportState; support_generation: number }>();

  if (!current) return { ok: false, code: "store_not_found" };
  if (!canTransitionSupport(current.support_state, input.toState, input.actor)) {
    return { ok: false, code: "illegal_transition" };
  }

  let selectedSlot: "a" | "b";
  try {
    selectedSlot = await selectActiveFtsSlot(db);
  } catch {
    return { ok: false, code: "active_slot_selector_failed" };
  }

  let transitionToken: string;
  try {
    transitionToken = crypto.randomUUID();
  } catch {
    return { ok: false, code: "batch_failed" };
  }
  const becomingVisible = isVisibleSupport(input.toState);
  const wasVisible = isVisibleSupport(current.support_state);

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE store_state
         SET support_state = ?,
             support_generation = support_generation + 1,
             search_transition_token = ?,
             updated_at = ?
         WHERE store_id = ? AND support_state = ? AND support_generation = ?
           AND EXISTS (
             SELECT 1 FROM search_projection_meta
             WHERE id = 1 AND active_slot = ?
           )`,
      )
      .bind(
        input.toState,
        transitionToken,
        nowIso,
        input.storeId,
        current.support_state,
        current.support_generation,
        selectedSlot,
      ),
    db
      .prepare(
        `UPDATE projection_meta
         SET support_epoch = support_epoch + 1,
             updated_at = ?
         WHERE id = 1
           AND EXISTS (
             SELECT 1 FROM store_state
             WHERE store_id = ? AND search_transition_token = ?
           )`,
      )
      .bind(nowIso, input.storeId, transitionToken),
  ];

  if (becomingVisible) {
    statements.push(
      db
        .prepare(
          `UPDATE offers
           SET visible = 1
           WHERE store_id = ?
             AND tombstoned = 0
             AND EXISTS (
               SELECT 1 FROM store_state
               WHERE store_id = ? AND search_transition_token = ?
             )`,
        )
        .bind(input.storeId, input.storeId, transitionToken),
    );
    // Clear then reindex active slot for this store.
    statements.push(
      db
        .prepare(sqlDeleteStoreFtsDocsForTransition(selectedSlot))
        .bind(input.storeId, input.storeId, transitionToken),
      db
        .prepare(sqlInsertStoreFtsDocsForTransition(selectedSlot))
        .bind(input.storeId, input.storeId, transitionToken),
    );
  } else if (wasVisible && !becomingVisible) {
    statements.push(
      db
        .prepare(
          `UPDATE offers
           SET visible = 0
           WHERE store_id = ?
             AND EXISTS (
               SELECT 1 FROM store_state
               WHERE store_id = ? AND search_transition_token = ?
             )`,
        )
        .bind(input.storeId, input.storeId, transitionToken),
      db
        .prepare(sqlDeleteStoreFtsDocsForTransition(selectedSlot))
        .bind(input.storeId, input.storeId, transitionToken),
    );
  }

  statements.push(
    db
      .prepare(
        `UPDATE search_projection_meta
         SET search_write_generation = search_write_generation + 1,
             projection_epoch = (
               SELECT projection_epoch FROM projection_meta WHERE id = 1
             ),
             updated_at = ?
         WHERE id = 1
           AND EXISTS (
             SELECT 1 FROM store_state
             WHERE store_id = ? AND search_transition_token = ?
           )`,
      )
      .bind(nowIso, input.storeId, transitionToken),
    db
      .prepare(
        `INSERT INTO store_lifecycle_audit (
          store_id, from_state, to_state, actor, reason, at
        )
        SELECT ?, ?, ?, ?, ?, ?
        FROM store_state
        WHERE store_id = ? AND search_transition_token = ?`,
      )
      .bind(
        input.storeId,
        current.support_state,
        input.toState,
        input.actor,
        input.reason,
        nowIso,
        input.storeId,
        transitionToken,
      ),
    db
      .prepare(
        `UPDATE store_state SET search_transition_token = NULL
         WHERE store_id = ? AND search_transition_token = ?`,
      )
      .bind(input.storeId, transitionToken),
  );

  try {
    const results = await db.batch(statements);
    if ((results[0]?.meta?.changes ?? 0) === 0) {
      return { ok: false, code: "stale_state" };
    }
  } catch {
    return { ok: false, code: "batch_failed" };
  }

  return { ok: true };
}

/**
 * Publication activation gate — blocked|approved.
 * Passing Story 1.3 tests does NOT auto-activate; requires explicit operator approval
 * after gate items including a current safe probe.
 */
export async function setPublicationActivationGate(
  db: D1Database,
  input: {
    storeId: string;
    gate: PublicationActivationGate;
    actor: StoreLifecycleActor;
    reason: string;
    nowIso: string;
  },
): Promise<{ ok: true } | { ok: false; code: string }> {
  if (input.gate === "approved" && input.actor !== "operator") {
    return { ok: false, code: "operator_only" };
  }
  const [result] = await db.batch([
    db
      .prepare(
        `UPDATE store_state
         SET activation_gate = ?, updated_at = ?
         WHERE store_id = ?`,
      )
      .bind(input.gate, input.nowIso, input.storeId),
    db
      .prepare(
        `INSERT INTO store_lifecycle_audit (
          store_id, from_state, to_state, actor, reason, at
        )
        SELECT ?, NULL, ?, ?, ?, ?
        FROM store_state
        WHERE store_id = ? AND activation_gate = ? AND updated_at = ?`,
      )
      .bind(
        input.storeId,
        `activation_gate:${input.gate}`,
        input.actor,
        input.reason,
        input.nowIso,
        input.storeId,
        input.gate,
        input.nowIso,
      ),
  ]);
  if ((result?.meta?.changes ?? 0) === 0) {
    return { ok: false, code: "store_not_found" };
  }
  return { ok: true };
}

/** Seed/update canonical Store display name (generic metadata — no adapter import). */
export async function setStoreDisplayName(
  db: D1Database,
  input: { storeId: string; displayName: string; nowIso: string },
): Promise<{ ok: true } | { ok: false; code: string }> {
  const token = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(
      `UPDATE store_state
       SET display_name = ?, search_transition_token = ?, updated_at = ?
       WHERE store_id = ? AND display_name IS NOT ?`,
    ).bind(input.displayName, token, input.nowIso, input.storeId, input.displayName),
    db.prepare(
      `UPDATE search_projection_meta
       SET search_write_generation = search_write_generation + 1, updated_at = ?
       WHERE id = 1 AND EXISTS (
         SELECT 1 FROM store_state
         WHERE store_id = ? AND search_transition_token = ?
       )`,
    ).bind(input.nowIso, input.storeId, token),
    db.prepare(
      `UPDATE store_state SET search_transition_token = NULL
       WHERE store_id = ? AND search_transition_token = ?`,
    ).bind(input.storeId, token),
  ]);
  if ((results[0]?.meta?.changes ?? 0) === 0) {
    const exists = await db.prepare(
      `SELECT 1 AS present FROM store_state WHERE store_id = ?`,
    ).bind(input.storeId).first<{ present: number }>();
    if (exists) return { ok: true };
    return { ok: false, code: "store_not_found" };
  }
  return { ok: true };
}
