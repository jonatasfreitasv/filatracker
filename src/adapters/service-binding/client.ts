import {
  BROWSE_PAGE_CONTRACT_VERSION,
  DEFAULT_RETRY_AFTER_SECONDS,
  SEARCH_PAGE_CONTRACT_VERSION,
  decodeBrowsePageRpcOutcome,
  decodeSearchPageRpcOutcome,
  type BrowsePageQuery,
  type BrowsePageRpcOutcome,
  type SearchPageQuery,
  type SearchPageRpcOutcome,
} from "../../contracts";

/**
 * Typed Service Binding RPC target surface for the ingest Worker.
 * Capability secret is verified on command methods when later stories add them.
 */
export interface IngestServiceBinding {
  getSearchPage(
    query: SearchPageQuery,
    correlationId: string,
    /** Remaining client deadline budget in ms; ingest caps to its configured max. */
    deadlineMs?: number,
  ): Promise<unknown>;
  getBrowsePage(
    query: BrowsePageQuery,
    correlationId: string,
    deadlineMs?: number,
  ): Promise<unknown>;
}

export type CallSearchPageOptions = {
  /** At most one in-budget retry for this idempotent query. */
  maxRetries?: 0 | 1;
  /** Total deadline budget for both attempts (ms). */
  deadlineMs?: number;
};

function isRetryable(outcome: SearchPageRpcOutcome): boolean {
  return outcome.outcome === "unavailable" || outcome.outcome === "overloaded";
}

/**
 * Web-side typed client. Never touches D1.
 * Performs ≤1 in-budget retry for idempotent getSearchPage only.
 * Decodes strict v2 responses; native parse/deadline failures → unavailable.
 */
export async function callGetSearchPage(
  ingest: IngestServiceBinding,
  query: SearchPageQuery,
  options: CallSearchPageOptions = {},
): Promise<SearchPageRpcOutcome> {
  const maxRetries = options.maxRetries ?? 1;
  const deadlineMs = Math.min(Math.max(options.deadlineMs ?? 2000, 1), 2000);
  const started = Date.now();
  const correlationId = crypto.randomUUID();

  // Bounded intra-request backoff before the single retry. Not the full
  // client-facing retryAfterSeconds guidance (too slow for one request's
  // budget) — just enough to avoid immediately re-hammering an overloaded
  // backend.
  const RETRY_BACKOFF_MS = 250;

  async function attemptOnce(): Promise<SearchPageRpcOutcome> {
    const remainingMs = deadlineMs - (Date.now() - started);
    if (remainingMs <= 0) return nativeFailureToUnavailable(correlationId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const raw = await Promise.race([
        ingest.getSearchPage(query, correlationId, Math.ceil(remainingMs)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error("deadline");
            error.name = "DeadlineExceededError";
            reject(error);
          }, remainingMs);
        }),
      ]);
      const decoded = decodeSearchPageRpcOutcome(raw);
      if (!decoded.ok) {
        console.error("Service Binding getSearchPage decode failed", {
          code: decoded.reason,
          correlationId,
        });
        return nativeFailureToUnavailable(correlationId);
      }
      if (decoded.value.correlationId !== correlationId) {
        console.error("Service Binding getSearchPage decode failed", {
          code: "correlation_mismatch",
          correlationId,
        });
        return nativeFailureToUnavailable(correlationId);
      }
      return decoded.value;
    } catch {
      console.error("Service Binding getSearchPage threw", {
        code: "rpc_native_failure",
        correlationId,
      });
      return nativeFailureToUnavailable(correlationId);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  let attempt = 0;
  let result = await attemptOnce();

  while (attempt < maxRetries && isRetryable(result)) {
    const elapsed = Date.now() - started;
    if (elapsed + RETRY_BACKOFF_MS >= deadlineMs) break;
    attempt += 1;
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    if (Date.now() - started >= deadlineMs) break;
    result = await attemptOnce();
  }

  return result;
}

/**
 * Normalize a native Service Binding / RPC failure into a typed unavailable outcome.
 */
export function nativeFailureToUnavailable(
  correlationId: string,
  retryAfterSeconds = DEFAULT_RETRY_AFTER_SECONDS,
): SearchPageRpcOutcome {
  return {
    outcome: "unavailable",
    contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
    projectionEpoch: 0,
    supportEpoch: 0,
    correlationId,
    retryAfterSeconds,
  };
}

export function nativeBrowseFailureToUnavailable(
  correlationId: string,
  retryAfterSeconds = DEFAULT_RETRY_AFTER_SECONDS,
): BrowsePageRpcOutcome {
  return {
    outcome: "unavailable",
    contractVersion: BROWSE_PAGE_CONTRACT_VERSION,
    projectionEpoch: 0,
    supportEpoch: 0,
    correlationId,
    retryAfterSeconds,
  };
}

function isBrowseRetryable(outcome: BrowsePageRpcOutcome): boolean {
  return outcome.outcome === "unavailable" || outcome.outcome === "overloaded";
}

/**
 * Web-side typed browse client. Never touches D1.
 * Deploy ingest (callee method) before web callers.
 */
export async function callGetBrowsePage(
  ingest: IngestServiceBinding,
  query: BrowsePageQuery,
  options: CallSearchPageOptions = {},
): Promise<BrowsePageRpcOutcome> {
  const maxRetries = options.maxRetries ?? 1;
  const deadlineMs = Math.min(Math.max(options.deadlineMs ?? 2000, 1), 2000);
  const started = Date.now();
  const correlationId = crypto.randomUUID();
  const RETRY_BACKOFF_MS = 250;

  async function attemptOnce(): Promise<BrowsePageRpcOutcome> {
    const remainingMs = deadlineMs - (Date.now() - started);
    if (remainingMs <= 0) return nativeBrowseFailureToUnavailable(correlationId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const raw = await Promise.race([
        ingest.getBrowsePage(query, correlationId, Math.ceil(remainingMs)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error("deadline");
            error.name = "DeadlineExceededError";
            reject(error);
          }, remainingMs);
        }),
      ]);
      const decoded = decodeBrowsePageRpcOutcome(raw);
      if (!decoded.ok) {
        console.error("Service Binding getBrowsePage decode failed", {
          code: decoded.reason,
          correlationId,
        });
        return nativeBrowseFailureToUnavailable(correlationId);
      }
      if (decoded.value.correlationId !== correlationId) {
        console.error("Service Binding getBrowsePage decode failed", {
          code: "correlation_mismatch",
          correlationId,
        });
        return nativeBrowseFailureToUnavailable(correlationId);
      }
      const serialized = new TextEncoder().encode(JSON.stringify(decoded.value));
      if (serialized.byteLength > 256 * 1024) {
        console.error("Service Binding getBrowsePage decode failed", {
          code: "payload_over_cap",
          correlationId,
        });
        return nativeBrowseFailureToUnavailable(correlationId);
      }
      return decoded.value;
    } catch {
      console.error("Service Binding getBrowsePage threw", {
        code: "rpc_native_failure",
        correlationId,
      });
      return nativeBrowseFailureToUnavailable(correlationId);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  let attempt = 0;
  let result = await attemptOnce();

  while (attempt < maxRetries && isBrowseRetryable(result)) {
    const elapsed = Date.now() - started;
    if (elapsed + RETRY_BACKOFF_MS >= deadlineMs) break;
    attempt += 1;
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    if (Date.now() - started >= deadlineMs) break;
    result = await attemptOnce();
  }

  return result;
}
