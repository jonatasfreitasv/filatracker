import type { SearchPageRpcOutcome } from "../../src/contracts";

export type SearchLoaderError = {
  kind: "invalid" | "unavailable";
  outcome: SearchPageRpcOutcome;
  query: string | null;
  cursor: string | null;
  retryAfterSeconds?: number;
};

export function createSearchLoaderError(input: {
  kind: SearchLoaderError["kind"];
  outcome: SearchPageRpcOutcome;
  query: string | undefined;
  cursor: string | undefined;
  retryAfterSeconds?: number;
}): SearchLoaderError {
  return {
    kind: input.kind,
    outcome: input.outcome,
    query: input.query ?? null,
    cursor: input.cursor ?? null,
    ...(input.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: input.retryAfterSeconds }),
  };
}
