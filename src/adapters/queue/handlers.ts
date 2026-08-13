/**
 * Scheduled + queue entrypoints for ingest Worker — loaded dynamically only.
 * Never imported at top-level of workers/ingest.ts (import-graph gate).
 */

import type { CoordinatorDeps } from "../../application/ingestion-coordinator";
import { runDiscoveryAndEnqueue } from "../../application/ingestion-coordinator";
import { handlePublishQueueMessage } from "./publish-consumer";

export type IngestQueueEnv = {
  DB: D1Database;
  RECOVERY_EPOCH: string;
  INGEST_QUEUE: Queue<unknown>;
};

function parseRecoveryEpoch(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function handleScheduled(
  env: IngestQueueEnv,
  scheduledTime: number,
): Promise<void> {
  const recoveryEpochAuthority = parseRecoveryEpoch(env.RECOVERY_EPOCH);
  const deps: CoordinatorDeps = {
    db: env.DB,
    recoveryEpochAuthority,
  };

  // Lazy-load Store resolution only inside the scheduled path.
  const { resolveStoreRuntime, isKnownStoreId } = await import(
    "../stores/resolve-runtime"
  );

  const stores = await env.DB.prepare(
    `SELECT store_id, store_generation, support_generation, activation_gate, support_state
     FROM store_state
     WHERE activation_gate = 'approved'
       AND support_state IN ('active', 'degraded')`,
  ).all<{
    store_id: string;
    store_generation: number;
    support_generation: number;
    activation_gate: string;
    support_state: string;
  }>();

  const epochs = await env.DB.prepare(
    `SELECT projection_epoch FROM projection_meta WHERE id = 1`,
  ).first<{ projection_epoch: number }>();

  const projectionEpoch = epochs?.projection_epoch ?? 1;

  for (const store of stores.results ?? []) {
    if (!isKnownStoreId(store.store_id)) {
      console.error("ingest_schedule_unknown_store", {
        storeId: store.store_id,
        error: "redacted",
      });
      continue;
    }

    try {
      const runtime = await resolveStoreRuntime(store.store_id);
      if (!runtime) continue;

      const map = runtime.loadMap();
      const runId = `sched_${scheduledTime}_${store.store_id}_${crypto.randomUUID().slice(0, 8)}`;
      await runDiscoveryAndEnqueue({
        deps,
        adapter: runtime.createAdapter(),
        map,
        runId,
        queue: env.INGEST_QUEUE,
        supportGeneration: store.support_generation,
        projectionEpoch,
        storeGeneration: store.store_generation,
        allowedHosts: map.reviewedDestinations.map((d) => d.host),
        apexToWww: runtime.apexToWww,
      });
    } catch {
      // One Store failure must not prevent the other from running.
      console.error("ingest_schedule_store_failed", {
        storeId: store.store_id,
        error: "redacted",
      });
    }
  }
}

export async function handleQueueBatch(
  batch: MessageBatch<unknown>,
  env: IngestQueueEnv,
): Promise<void> {
  const recoveryEpochAuthority = parseRecoveryEpoch(env.RECOVERY_EPOCH);
  const deps: CoordinatorDeps = {
    db: env.DB,
    recoveryEpochAuthority,
  };

  const { resolveStoreRuntime, peekQueueStoreId } = await import(
    "../stores/resolve-runtime"
  );

  for (const message of batch.messages) {
    try {
      const storeId = peekQueueStoreId(message.body);
      if (!storeId) {
        console.error("ingest_queue_dlq", {
          reason: "missing_store_id",
          attempts: message.attempts,
        });
        message.retry();
        continue;
      }

      const runtime = await resolveStoreRuntime(storeId);
      if (!runtime) {
        console.error("ingest_queue_dlq", {
          reason: "unknown_store_id",
          attempts: message.attempts,
        });
        message.retry();
        continue;
      }

      const map = runtime.loadMap();
      const result = await handlePublishQueueMessage({
        deps,
        rawBody: message.body,
        map,
        allowedHosts: map.reviewedDestinations.map((d) => d.host),
        apexToWww: runtime.apexToWww,
      });
      if (result.action === "ack") {
        message.ack();
      } else if (result.action === "retry") {
        message.retry();
      } else {
        // Explicit poison — retry until DLQ max_retries exhausts.
        console.error("ingest_queue_dlq", {
          reason: result.reason,
          attempts: message.attempts,
        });
        message.retry();
      }
    } catch {
      console.error("ingest_queue_handler_threw", {
        error: "redacted",
        attempts: message.attempts,
      });
      message.retry();
    }
  }
}
