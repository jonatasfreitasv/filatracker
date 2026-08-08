import type { SearchPageQuery, SearchPageRpcOutcome } from "../../contracts";

/**
 * Typed Service Binding RPC target surface for the ingest Worker.
 * Capability secret is verified on command methods when later stories add them.
 */
export interface IngestServiceBinding {
  getSearchPage(query: SearchPageQuery): Promise<SearchPageRpcOutcome>;
}

export type CallSearchPageOptions = {
  /** At most one in-budget retry for this idempotent query. */
  maxRetries?: 0 | 1;
  retryAfterSeconds?: number;
};

function isRetryable(outcome: SearchPageRpcOutcome): boolean {
  return outcome.outcome === "unavailable" || outcome.outcome === "overloaded";
}

/**
 * Web-side typed client. Never touches D1.
 * Performs ≤1 in-budget retry for idempotent getSearchPage only.
 */
export async function callGetSearchPage(
  ingest: IngestServiceBinding,
  query: SearchPageQuery,
  options: CallSearchPageOptions = {},
): Promise<SearchPageRpcOutcome> {
  const maxRetries = options.maxRetries ?? 1;

  // Bounded intra-request backoff before the single retry. Not the full
  // client-facing retryAfterSeconds guidance (too slow for one request's
  // budget) — just enough to avoid immediately re-hammering an overloaded
  // backend.
  const RETRY_BACKOFF_MS = 250;

  async function attemptOnce(): Promise<SearchPageRpcOutcome> {
    try {
      return await ingest.getSearchPage(query);
    } catch (error) {
      console.error("Service Binding getSearchPage threw", { error });
      return nativeFailureToUnavailable(crypto.randomUUID());
    }
  }

  let attempt = 0;
  let result = await attemptOnce();

  while (attempt < maxRetries && isRetryable(result)) {
    attempt += 1;
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    result = await attemptOnce();
  }

  return result;
}

/**
 * Normalize a native Service Binding / RPC failure into a typed unavailable outcome.
 */
export function nativeFailureToUnavailable(
  correlationId: string,
  retryAfterSeconds = 5,
): SearchPageRpcOutcome {
  return {
    outcome: "unavailable",
    contractVersion: 1,
    projectionEpoch: 0,
    supportEpoch: 0,
    correlationId,
    retryAfterSeconds,
  };
}
