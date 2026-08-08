import { WorkerEntrypoint } from "cloudflare:workers";

import { getSearchPage } from "../src/application/get-search-page";
import { createD1SearchCatalog } from "../src/adapters/persistence/d1-search-catalog";
import {
  DEFAULT_RETRY_AFTER_SECONDS,
  SEARCH_PAGE_CONTRACT_VERSION,
  type SearchPageQuery,
  type SearchPageRpcOutcome,
} from "../src/contracts";

export interface IngestEnv {
  DB: D1Database;
  RPC_DEADLINE_MS?: string;
  /** Provisioned for later command methods; unused by getSearchPage. */
  RPC_CAPABILITY_SECRET?: string;
}

/**
 * Non-public typed RPC entrypoint. Exposes only getSearchPage in Story 1.1.
 * Do not add Store/schedule/queue/command/generic-fetch handlers here yet.
 */
export class IngestService extends WorkerEntrypoint<IngestEnv> {
  async getSearchPage(query: SearchPageQuery): Promise<SearchPageRpcOutcome> {
    const parsedDeadlineMs = Number(this.env.RPC_DEADLINE_MS);
    const deadlineMs =
      Number.isFinite(parsedDeadlineMs) && parsedDeadlineMs > 0
        ? parsedDeadlineMs
        : 2000;
    const catalog = createD1SearchCatalog(this.env.DB);

    try {
      return await withDeadline(
        getSearchPage(catalog, { q: query.q }),
        deadlineMs,
      );
    } catch (error) {
      const overloaded =
        error instanceof Error &&
        (error.name === "OverloadedError" ||
          /overloaded|capacity|429/i.test(error.message));
      const correlationId = crypto.randomUUID();

      console.error("IngestService.getSearchPage failed", {
        correlationId,
        error,
      });

      return {
        outcome: overloaded ? "overloaded" : "unavailable",
        contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
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
 */
export default {
  async fetch() {
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<IngestEnv>;
