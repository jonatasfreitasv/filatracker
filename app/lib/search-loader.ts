import { env } from "cloudflare:workers";
import { data, redirect } from "react-router";

import {
  SEARCH_PAGE_CONTRACT_VERSION,
  SEARCH_CURSOR_MAX_UTF8_BYTES,
  parseSearchPageQuery,
  type SearchPageRpcOutcome,
} from "../../src/contracts";
import {
  callGetSearchPage,
  nativeFailureToUnavailable,
} from "../../src/adapters/service-binding/client";
import { normalizeSearchQuery } from "../../src/domain/search-query";
import {
  createSearchLoaderError,
  type SearchLoaderError,
} from "./search-error";

export type { SearchLoaderError } from "./search-error";

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
  cursor: string | null;
  type: string | null;
};

export type SearchLoaderResult = SearchLoaderSuccess | SearchLoaderError;

function parseSearchParams(request: Request): {
  q?: string;
  cursor?: string;
  type?: string;
  hasInvalidParameters: boolean;
} {
  const url = new URL(request.url);
  const keys = [...url.searchParams.keys()];
  const allowed = new Set(["q", "cursor", "type"]);
  const unknown = keys.filter((k) => !allowed.has(k));
  const qAll = url.searchParams.getAll("q");
  const cursorAll = url.searchParams.getAll("cursor");
  const typeAll = url.searchParams.getAll("type");

  if (
    unknown.length > 0 ||
    qAll.length > 1 ||
    cursorAll.length > 1 ||
    typeAll.length > 1
  ) {
    return {
      hasInvalidParameters: true,
      q: qAll[0],
      cursor: cursorAll[0],
      type: typeAll[0],
    };
  }

  const cursor = cursorAll[0];
  if (
    cursor !== undefined &&
    new TextEncoder().encode(cursor).byteLength > SEARCH_CURSOR_MAX_UTF8_BYTES
  ) {
    return { hasInvalidParameters: true, q: qAll[0], cursor, type: typeAll[0] };
  }

  return {
    hasInvalidParameters: false,
    q: qAll.length === 0 ? undefined : qAll[0],
    cursor,
    type: typeAll[0],
  };
}

function throwInvalid(
  query: string | undefined,
  cursor: string | undefined,
  type: string | undefined,
): never {
  const outcome: SearchPageRpcOutcome = {
    outcome: "invalid",
    contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
    projectionEpoch: 0,
    supportEpoch: 0,
    correlationId: crypto.randomUUID(),
    errors: ["Parâmetros de busca inválidos."],
  };
  throw data(
    createSearchLoaderError({
      kind: "invalid",
      outcome,
      query,
      cursor,
      type,
    }),
    noStoreInit({ status: 400 }),
  );
}

export async function loadSearchPage(
  request: Request,
  options: { canonicalizeEmptyToHome: boolean },
): Promise<SearchLoaderResult> {
  const parsed = parseSearchParams(request);

  if (parsed.hasInvalidParameters) {
    throwInvalid(parsed.q, parsed.cursor, parsed.type);
  }

  const rawQ = parsed.q;
  const trimmed = rawQ?.trim() ?? "";

  if (options.canonicalizeEmptyToHome && trimmed === "" && !parsed.cursor && parsed.type === undefined) {
    throw redirect("/", 302);
  }

  // Bound/control-check before Service Binding so oversized or abusive q never
  // crosses the RPC boundary.
  if (rawQ !== undefined) {
    const normalized = normalizeSearchQuery(rawQ);
    if (!normalized.ok) {
      throwInvalid(rawQ, parsed.cursor, parsed.type);
    }
  }

  const queryBody = {
    ...(rawQ !== undefined ? { q: rawQ } : {}),
    ...(parsed.cursor !== undefined ? { cursor: parsed.cursor } : {}),
    ...(parsed.type !== undefined ? { type: parsed.type } : {}),
  };
  const validated = parseSearchPageQuery(queryBody);
  if (!validated.ok) {
    throwInvalid(rawQ, parsed.cursor, parsed.type);
  }

  let outcome: SearchPageRpcOutcome;
  try {
    outcome = await callGetSearchPage(env.INGEST, validated.query);
  } catch {
    const correlationId = crypto.randomUUID();
    console.error("getSearchPage RPC threw", {
      correlationId,
      code: "loader_rpc_throw",
    });
    outcome = nativeFailureToUnavailable(correlationId);
  }

  if (outcome.outcome === "invalid") {
    throw data(
      createSearchLoaderError({
        kind: "invalid",
        outcome,
        query: rawQ,
        cursor: parsed.cursor,
        type: parsed.type,
      }),
      noStoreInit({ status: 400 }),
    );
  }

  if (outcome.outcome === "overloaded" || outcome.outcome === "unavailable") {
    const headers = new Headers(NO_STORE_HEADERS);
    headers.set("Retry-After", String(outcome.retryAfterSeconds));
    throw data(
      createSearchLoaderError({
        kind: "unavailable",
        outcome,
        query: rawQ,
        cursor: parsed.cursor,
        type: parsed.type,
        retryAfterSeconds: outcome.retryAfterSeconds,
      }),
      { status: 503, headers },
    );
  }

  if (outcome.outcome === "ok" || outcome.outcome === "degraded") {
    const query = outcome.data.query;
    if (query === null) {
      return {
        kind: "empty-home",
        outcome,
        query,
        cursor: parsed.cursor ?? null,
        type: parsed.type ?? null,
      };
    }
    // degraded + zero hits must NEVER be reclassified as honest no-match.
    if (outcome.outcome === "degraded") {
      return {
        kind: "degraded",
        outcome,
        query,
        cursor: parsed.cursor ?? null,
        type: parsed.type ?? null,
      };
    }
    if (outcome.data.totalCount === 0) {
      return {
        kind: "no-match",
        outcome,
        query,
        cursor: parsed.cursor ?? null,
        type: parsed.type ?? null,
      };
    }
    return {
      kind: "ok",
      outcome,
      query,
      cursor: parsed.cursor ?? null,
      type: parsed.type ?? null,
    };
  }

  const headers = new Headers(NO_STORE_HEADERS);
  headers.set("Retry-After", "5");
  throw data(
    createSearchLoaderError({
      kind: "unavailable",
      outcome: nativeFailureToUnavailable(crypto.randomUUID()),
      query: rawQ,
      cursor: parsed.cursor,
      type: parsed.type,
      retryAfterSeconds: 5,
    }),
    { status: 503, headers },
  );
}
