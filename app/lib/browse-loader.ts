import { env } from "cloudflare:workers";
import { data, redirect } from "react-router";

import {
  BROWSE_PAGE_CONTRACT_VERSION,
  SEARCH_CURSOR_MAX_UTF8_BYTES,
  parseBrowsePageQuery,
  type BrowsePageRpcOutcome,
} from "../../src/contracts";
import {
  callGetBrowsePage,
  nativeBrowseFailureToUnavailable,
} from "../../src/adapters/service-binding/client";
import { isIllegalSlugInput } from "../../src/domain/taxonomy";
import { NO_STORE_HEADERS, noStoreInit } from "./search-loader";

export type BrowseLoaderSuccess = {
  kind: "ok" | "degraded" | "no-match";
  outcome: Extract<BrowsePageRpcOutcome, { outcome: "ok" | "degraded" }>;
  slug: string;
  browseKind: "material" | "brand";
  type: string | null;
  cursor: string | null;
};

export type BrowseLoaderError = {
  kind: "invalid" | "unavailable" | "notFound" | "gone";
  outcome: BrowsePageRpcOutcome;
  slug: string;
  browseKind: "material" | "brand";
  type: string | null;
  cursor: string | null;
  retryAfterSeconds?: number;
};

export type BrowseLoaderResult = BrowseLoaderSuccess | BrowseLoaderError;

function parseBrowseParams(
  request: Request,
): {
  cursor?: string;
  type?: string;
  hasInvalidParameters: boolean;
} {
  const url = new URL(request.url);
  const keys = [...url.searchParams.keys()];
  const allowed = new Set(["cursor", "type"]);
  const unknown = keys.filter((k) => !allowed.has(k));
  const cursorAll = url.searchParams.getAll("cursor");
  const typeAll = url.searchParams.getAll("type");
  if (unknown.length > 0 || cursorAll.length > 1 || typeAll.length > 1) {
    return { hasInvalidParameters: true, cursor: cursorAll[0], type: typeAll[0] };
  }
  const cursor = cursorAll[0];
  if (
    cursor !== undefined &&
    new TextEncoder().encode(cursor).byteLength > SEARCH_CURSOR_MAX_UTF8_BYTES
  ) {
    return { hasInvalidParameters: true, cursor, type: typeAll[0] };
  }
  return { hasInvalidParameters: false, cursor, type: typeAll[0] };
}

function internalBrowsePath(
  kind: "material" | "brand",
  slug: string,
  type?: string | null,
): string {
  const base = kind === "material" ? `/materials/${slug}` : `/brands/${slug}`;
  if (!type) return base;
  return `${base}?type=${encodeURIComponent(type)}`;
}

function throwInvalid(
  kind: "material" | "brand",
  slug: string,
  type: string | undefined,
  cursor: string | undefined,
): never {
  const outcome: BrowsePageRpcOutcome = {
    outcome: "invalid",
    contractVersion: BROWSE_PAGE_CONTRACT_VERSION,
    projectionEpoch: 0,
    supportEpoch: 0,
    correlationId: crypto.randomUUID(),
    errors: ["Parâmetros de navegação inválidos."],
  };
  throw data(
    {
      kind: "invalid",
      outcome,
      slug,
      browseKind: kind,
      type: type ?? null,
      cursor: cursor ?? null,
    } satisfies BrowseLoaderError,
    noStoreInit({ status: 400 }),
  );
}

export async function loadBrowsePage(
  request: Request,
  kind: "material" | "brand",
  rawSlug: string,
): Promise<BrowseLoaderResult> {
  if (isIllegalSlugInput(rawSlug)) {
    throwInvalid(kind, rawSlug, undefined, undefined);
  }
  const slug = rawSlug.toLowerCase();
  const parsed = parseBrowseParams(request);
  if (parsed.hasInvalidParameters) {
    throwInvalid(kind, slug, parsed.type, parsed.cursor);
  }

  const queryBody = {
    kind,
    slug,
    ...(parsed.cursor !== undefined ? { cursor: parsed.cursor } : {}),
    ...(parsed.type !== undefined ? { type: parsed.type } : {}),
  };
  const validated = parseBrowsePageQuery(queryBody);
  if (!validated.ok) {
    throwInvalid(kind, slug, parsed.type, parsed.cursor);
  }

  let outcome: BrowsePageRpcOutcome;
  try {
    outcome = await callGetBrowsePage(env.INGEST, validated.query);
  } catch {
    const correlationId = crypto.randomUUID();
    console.error("getBrowsePage RPC threw", {
      correlationId,
      code: "loader_rpc_throw",
    });
    outcome = nativeBrowseFailureToUnavailable(correlationId);
  }

  if (outcome.outcome === "redirect") {
    throw redirect(
      internalBrowsePath(outcome.kind, outcome.canonicalSlug, parsed.type),
      noStoreInit({ status: 301 }),
    );
  }

  if (outcome.outcome === "invalid") {
    throw data(
      {
        kind: "invalid",
        outcome,
        slug,
        browseKind: kind,
        type: parsed.type ?? null,
        cursor: parsed.cursor ?? null,
      } satisfies BrowseLoaderError,
      noStoreInit({ status: 400 }),
    );
  }

  if (outcome.outcome === "notFound") {
    throw data(
      {
        kind: "notFound",
        outcome,
        slug,
        browseKind: kind,
        type: parsed.type ?? null,
        cursor: parsed.cursor ?? null,
      } satisfies BrowseLoaderError,
      noStoreInit({ status: 404 }),
    );
  }

  if (outcome.outcome === "gone") {
    throw data(
      {
        kind: "gone",
        outcome,
        slug,
        browseKind: kind,
        type: parsed.type ?? null,
        cursor: parsed.cursor ?? null,
      } satisfies BrowseLoaderError,
      noStoreInit({ status: 410 }),
    );
  }

  if (outcome.outcome === "overloaded" || outcome.outcome === "unavailable") {
    const headers = new Headers(NO_STORE_HEADERS);
    headers.set("Retry-After", String(outcome.retryAfterSeconds));
    throw data(
      {
        kind: "unavailable",
        outcome,
        slug,
        browseKind: kind,
        type: parsed.type ?? null,
        cursor: parsed.cursor ?? null,
        retryAfterSeconds: outcome.retryAfterSeconds,
      } satisfies BrowseLoaderError,
      { status: 503, headers },
    );
  }

  if (outcome.outcome === "ok" || outcome.outcome === "degraded") {
    if (outcome.outcome === "degraded") {
      return {
        kind: "degraded",
        outcome,
        slug,
        browseKind: kind,
        type: parsed.type ?? null,
        cursor: parsed.cursor ?? null,
      };
    }
    if (outcome.data.totalCount === 0) {
      return {
        kind: "no-match",
        outcome,
        slug,
        browseKind: kind,
        type: parsed.type ?? null,
        cursor: parsed.cursor ?? null,
      };
    }
    return {
      kind: "ok",
      outcome,
      slug,
      browseKind: kind,
      type: parsed.type ?? null,
      cursor: parsed.cursor ?? null,
    };
  }

  const headers = new Headers(NO_STORE_HEADERS);
  headers.set("Retry-After", "5");
  throw data(
    {
      kind: "unavailable",
      outcome: nativeBrowseFailureToUnavailable(crypto.randomUUID()),
      slug,
      browseKind: kind,
      type: parsed.type ?? null,
      cursor: parsed.cursor ?? null,
      retryAfterSeconds: 5,
    } satisfies BrowseLoaderError,
    { status: 503, headers },
  );
}

export { buildBrowseRetryPath } from "./search-url";
