import { WorkerEntrypoint } from "cloudflare:workers";

import { getSearchPage } from "../src/application/get-search-page";
import { getBrowsePage } from "../src/application/get-browse-page";
import { createD1SearchCatalog } from "../src/adapters/persistence/d1-search-catalog";
import { createD1BrowseCatalog } from "../src/adapters/persistence/d1-browse-catalog";
import {
  BROWSE_PAGE_CONTRACT_VERSION,
  DEFAULT_RETRY_AFTER_SECONDS,
  CorrelationIdSchema,
  SEARCH_PAGE_CONTRACT_VERSION,
  parseBrowsePageQuery,
  parseSearchPageQuery,
  type BrowsePageQuery,
  type BrowsePageRpcOutcome,
  type SearchPageQuery,
  type SearchPageRpcOutcome,
} from "../src/contracts";

export interface IngestEnv {
  DB: D1Database;
  RPC_DEADLINE_MS?: string;
  /** Provisioned for later command methods; unused by getSearchPage. */
  RPC_CAPABILITY_SECRET?: string;
  /** External non-secret recovery epoch authority (AD-24). */
  RECOVERY_EPOCH?: string;
  INGEST_QUEUE?: Queue<unknown>;
}

/**
 * Non-public typed RPC entrypoint. getSearchPage + getBrowsePage (Story 1.6).
 * Store/schedule/queue orchestration is lazy-loaded from the default export only.
 */
export class IngestService extends WorkerEntrypoint<IngestEnv> {
  async getSearchPage(
    query: SearchPageQuery,
    suppliedCorrelationId?: string,
    clientDeadlineMs?: number,
  ): Promise<SearchPageRpcOutcome> {
    const parsedDeadlineMs = Number(this.env.RPC_DEADLINE_MS);
    const configuredDeadlineMs =
      Number.isFinite(parsedDeadlineMs) && parsedDeadlineMs > 0
        ? parsedDeadlineMs
        : 2000;
    const clientBudget =
      typeof clientDeadlineMs === "number" &&
      Number.isFinite(clientDeadlineMs) &&
      clientDeadlineMs > 0
        ? Math.ceil(clientDeadlineMs)
        : configuredDeadlineMs;
    const deadlineMs = Math.min(configuredDeadlineMs, clientBudget);
    const catalog = createD1SearchCatalog(this.env.DB);
    const parsedCorrelationId = CorrelationIdSchema.safeParse(suppliedCorrelationId);
    const correlationId = parsedCorrelationId.success
      ? parsedCorrelationId.data
      : crypto.randomUUID();

    const parsed = parseSearchPageQuery(query ?? {});
    if (!parsed.ok) {
      return {
        outcome: "invalid",
        contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
        projectionEpoch: 0,
        supportEpoch: 0,
        correlationId,
        errors: parsed.errors,
      };
    }

    try {
      return await withDeadline(
        getSearchPage(catalog, {
          correlationId,
          q: parsed.query.q,
          cursor: parsed.query.cursor,
          limit: parsed.query.limit,
          type: parsed.query.type,
        }),
        deadlineMs,
      );
    } catch {
      console.error("IngestService.getSearchPage failed", {
        correlationId,
        code: "rpc_native_failure",
      });

      return {
        outcome: "unavailable",
        contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
        projectionEpoch: 0,
        supportEpoch: 0,
        correlationId,
        retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
      };
    }
  }

  async getBrowsePage(
    query: BrowsePageQuery,
    suppliedCorrelationId?: string,
    clientDeadlineMs?: number,
  ): Promise<BrowsePageRpcOutcome> {
    const parsedDeadlineMs = Number(this.env.RPC_DEADLINE_MS);
    const configuredDeadlineMs =
      Number.isFinite(parsedDeadlineMs) && parsedDeadlineMs > 0
        ? parsedDeadlineMs
        : 2000;
    const clientBudget =
      typeof clientDeadlineMs === "number" &&
      Number.isFinite(clientDeadlineMs) &&
      clientDeadlineMs > 0
        ? Math.ceil(clientDeadlineMs)
        : configuredDeadlineMs;
    const deadlineMs = Math.min(configuredDeadlineMs, clientBudget);
    const catalog = createD1BrowseCatalog(this.env.DB);
    const parsedCorrelationId = CorrelationIdSchema.safeParse(suppliedCorrelationId);
    const correlationId = parsedCorrelationId.success
      ? parsedCorrelationId.data
      : crypto.randomUUID();

    const parsed = parseBrowsePageQuery(query ?? {});
    if (!parsed.ok) {
      return {
        outcome: "invalid",
        contractVersion: BROWSE_PAGE_CONTRACT_VERSION,
        projectionEpoch: 0,
        supportEpoch: 0,
        correlationId,
        errors: parsed.errors,
      };
    }

    try {
      return await withDeadline(
        getBrowsePage(catalog, {
          correlationId,
          kind: parsed.query.kind,
          slug: parsed.query.slug,
          cursor: parsed.query.cursor,
          limit: parsed.query.limit,
          type: parsed.query.type,
        }),
        deadlineMs,
      );
    } catch {
      console.error("IngestService.getBrowsePage failed", {
        correlationId,
        code: "rpc_native_failure",
      });

      return {
        outcome: "unavailable",
        contractVersion: BROWSE_PAGE_CONTRACT_VERSION,
        projectionEpoch: 0,
        supportEpoch: 0,
        correlationId,
        retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
      };
    }
  }
}

async function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error("RPC deadline exceeded");
          err.name = "DeadlineExceededError";
          reject(err);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Non-public Worker: no public HTTP routes.
 * scheduled/queue handlers lazy-load Store/coordinator paths (no eager Store import).
 */
export default {
  async fetch() {
    return new Response("Not Found", { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: IngestEnv) {
    try {
      const { handleScheduled } = await import(
        "../src/adapters/queue/handlers"
      );
      if (!env.INGEST_QUEUE || env.RECOVERY_EPOCH === undefined) {
        console.error("scheduled skipped: missing queue or RECOVERY_EPOCH");
        return;
      }
      await handleScheduled(
        {
          DB: env.DB,
          RECOVERY_EPOCH: env.RECOVERY_EPOCH,
          INGEST_QUEUE: env.INGEST_QUEUE,
        },
        controller.scheduledTime,
      );
    } catch {
      console.error("scheduled handler failed", { error: "redacted" });
    }
  },

  async queue(batch: MessageBatch<unknown>, env: IngestEnv) {
    try {
      const { handleQueueBatch } = await import(
        "../src/adapters/queue/handlers"
      );
      if (!env.INGEST_QUEUE || env.RECOVERY_EPOCH === undefined) {
        for (const message of batch.messages) message.retry();
        return;
      }
      await handleQueueBatch(batch, {
        DB: env.DB,
        RECOVERY_EPOCH: env.RECOVERY_EPOCH,
        INGEST_QUEUE: env.INGEST_QUEUE,
      });
    } catch {
      console.error("queue handler failed", { error: "redacted" });
      for (const message of batch.messages) message.retry();
    }
  },
} satisfies ExportedHandler<IngestEnv>;
