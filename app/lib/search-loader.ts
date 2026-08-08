import { env } from "cloudflare:workers";
import { data, redirect } from "react-router";

import type { SearchPageRpcOutcome } from "../../src/contracts";
import {
  callGetSearchPage,
  nativeFailureToUnavailable,
} from "../../src/adapters/service-binding/client";

export const NO_STORE_HEADERS: HeadersInit = {
  "Cache-Control": "no-store",
};

export function noStoreInit(init: ResponseInit = {}): ResponseInit {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return { ...init, headers };
}

export type SearchLoaderSuccess = {
  kind: "ok" | "degraded" | "empty-home" | "no-match";
  outcome: SearchPageRpcOutcome;
  query: string | null;
};

export type SearchLoaderError = {
  kind: "invalid" | "unavailable";
  outcome: SearchPageRpcOutcome;
  query: string | null;
  retryAfterSeconds?: number;
};

export type SearchLoaderResult = SearchLoaderSuccess | SearchLoaderError;

function parseSearchParams(request: Request): {
  q?: string;
  hasInvalidParameters: boolean;
} {
  const url = new URL(request.url);
  const keys = [...url.searchParams.keys()];
  const unknown = keys.filter((k) => k !== "q");
  const qAll = url.searchParams.getAll("q");

  if (unknown.length > 0 || qAll.length > 1) {
    return { hasInvalidParameters: true, q: qAll[0] };
  }

  if (qAll.length === 0) {
    return { hasInvalidParameters: false };
  }

  return { hasInvalidParameters: false, q: qAll[0] };
}

export async function loadSearchPage(
  request: Request,
  options: { canonicalizeEmptyToHome: boolean },
): Promise<SearchLoaderResult> {
  const parsed = parseSearchParams(request);

  if (parsed.hasInvalidParameters) {
    const outcome: SearchPageRpcOutcome = {
      outcome: "invalid",
      contractVersion: 1,
      projectionEpoch: 0,
      supportEpoch: 0,
      correlationId: crypto.randomUUID(),
      errors: ["Parâmetros de busca inválidos."],
    };
    throw data(
      {
        kind: "invalid",
        outcome,
        query: parsed.q ?? null,
      } satisfies SearchLoaderError,
      noStoreInit({ status: 400 }),
    );
  }

  const rawQ = parsed.q;
  const trimmed = rawQ?.trim() ?? "";

  if (options.canonicalizeEmptyToHome && trimmed === "") {
    throw redirect("/", 302);
  }

  let outcome: SearchPageRpcOutcome;
  try {
    outcome = await callGetSearchPage(env.INGEST, {
      q: rawQ === undefined ? undefined : rawQ,
    });
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error("getSearchPage RPC threw", { correlationId, error });
    outcome = nativeFailureToUnavailable(correlationId);
  }

  if (outcome.outcome === "invalid") {
    throw data(
      {
        kind: "invalid",
        outcome,
        query: rawQ ?? null,
      } satisfies SearchLoaderError,
      noStoreInit({ status: 400 }),
    );
  }

  if (outcome.outcome === "overloaded" || outcome.outcome === "unavailable") {
    const headers = new Headers(NO_STORE_HEADERS);
    headers.set("Retry-After", String(outcome.retryAfterSeconds));
    throw data(
      {
        kind: "unavailable",
        outcome,
        query: rawQ ?? null,
        retryAfterSeconds: outcome.retryAfterSeconds,
      } satisfies SearchLoaderError,
      { status: 503, headers },
    );
  }

  if (outcome.outcome === "ok" || outcome.outcome === "degraded") {
    const query = outcome.data.query;
    if (query === null) {
      return { kind: "empty-home", outcome, query };
    }
    if (outcome.data.totalCount === 0) {
      return { kind: "no-match", outcome, query };
    }
    return {
      kind: outcome.outcome === "degraded" ? "degraded" : "ok",
      outcome,
      query,
    };
  }

  const headers = new Headers(NO_STORE_HEADERS);
  headers.set("Retry-After", "5");
  throw data(
    {
      kind: "unavailable",
      outcome: nativeFailureToUnavailable(crypto.randomUUID()),
      query: rawQ ?? null,
      retryAfterSeconds: 5,
    } satisfies SearchLoaderError,
    { status: 503, headers },
  );
}
