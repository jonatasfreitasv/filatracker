/**
 * Opaque versioned search/browse cursor (Story 1.6).
 * Binds last sort tuple + query digest + intent + type + taxonomy version
 * + parser/index versions + epochs + page limit.
 */

import {
  MONEY_CENTAVOS_MAX,
  SEARCH_CURSOR_MAX_UTF8_BYTES,
  SEARCH_INDEX_VERSION,
  SEARCH_PAGE_MAX_HITS,
  SEARCH_PARSER_VERSION,
} from "../../contracts/search-page";
import { z } from "zod";

export type SearchSortTuple = {
  availabilityRank: number;
  listingPriceCentavos: number | null;
  observedAt: string;
  offerId: string;
};

export type SearchIntentKind = "text" | "family" | "type" | "browse-family" | "browse-brand";

export type SearchCursorPayload = {
  v: 2;
  queryDigest: string;
  intentKind: SearchIntentKind;
  typeSlug: string | null;
  taxonomyVersion: number;
  parserVersion: number;
  indexVersion: number;
  projectionEpoch: number;
  supportEpoch: number;
  searchWriteGeneration: number;
  /** Page limit bound into the cursor so clients cannot reshuffle pagination mid-stream. */
  limit: number;
  sort: SearchSortTuple;
};

const SafeEpochSchema = z.number().int().safe().nonnegative();
const SearchCursorPayloadSchema = z.strictObject({
  v: z.literal(2),
  queryDigest: z.string().regex(/^[0-9a-f]{16}$/),
  intentKind: z.enum(["text", "family", "type", "browse-family", "browse-brand"]),
  typeSlug: z.string().min(1).max(128).nullable(),
  taxonomyVersion: SafeEpochSchema,
  parserVersion: z.literal(SEARCH_PARSER_VERSION),
  indexVersion: z.literal(SEARCH_INDEX_VERSION),
  projectionEpoch: SafeEpochSchema,
  supportEpoch: SafeEpochSchema,
  searchWriteGeneration: SafeEpochSchema,
  limit: z.number().int().positive().max(SEARCH_PAGE_MAX_HITS),
  sort: z.strictObject({
    availabilityRank: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    listingPriceCentavos: z.number().int().safe().positive().max(MONEY_CENTAVOS_MAX).nullable(),
    observedAt: z.string().datetime({ offset: true }).transform((value) =>
      new Date(value).toISOString()
    ),
    offerId: z.string().min(1).max(128),
  }),
});

export function availabilityRank(
  availability: "available" | "unavailable" | "unknown",
): number {
  if (availability === "available") return 0;
  if (availability === "unknown") return 1;
  return 2;
}

export function encodeSearchCursor(payload: SearchCursorPayload): string {
  const json = JSON.stringify(SearchCursorPayloadSchema.parse(payload));
  const b64 = bytesToBase64Url(new TextEncoder().encode(json));
  if (new TextEncoder().encode(b64).byteLength > SEARCH_CURSOR_MAX_UTF8_BYTES) {
    throw new Error("cursor_over_limit");
  }
  return b64;
}

export function decodeSearchCursor(
  raw: string,
):
  | { ok: true; payload: SearchCursorPayload }
  | { ok: false; reason: "malformed" | "over_limit" | "version" } {
  if (new TextEncoder().encode(raw).byteLength > SEARCH_CURSOR_MAX_UTF8_BYTES) {
    return { ok: false, reason: "over_limit" };
  }
  if (raw.length === 0 || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    return { ok: false, reason: "malformed" };
  }
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(
      base64UrlToBytes(raw),
    );
    const value = JSON.parse(json) as unknown;
    if (
      value !== null && typeof value === "object" && "v" in value &&
      (value as { v: unknown }).v !== 2
    ) {
      return { ok: false, reason: "version" };
    }
    const parsed = SearchCursorPayloadSchema.safeParse(value);
    if (!parsed.success) {
      return { ok: false, reason: "malformed" };
    }
    return { ok: true, payload: parsed.data };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

export function cursorMatchesContext(
  payload: SearchCursorPayload,
  ctx: {
    queryDigest: string;
    intentKind: SearchIntentKind;
    typeSlug: string | null;
    taxonomyVersion: number;
    projectionEpoch: number;
    supportEpoch: number;
    searchWriteGeneration: number;
    limit: number;
  },
): boolean {
  return (
    payload.queryDigest === ctx.queryDigest &&
    payload.intentKind === ctx.intentKind &&
    payload.typeSlug === ctx.typeSlug &&
    payload.taxonomyVersion === ctx.taxonomyVersion &&
    payload.parserVersion === SEARCH_PARSER_VERSION &&
    payload.indexVersion === SEARCH_INDEX_VERSION &&
    payload.projectionEpoch === ctx.projectionEpoch &&
    payload.supportEpoch === ctx.supportEpoch &&
    payload.searchWriteGeneration === ctx.searchWriteGeneration &&
    payload.limit === ctx.limit
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(raw: string): Uint8Array {
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
