import { z } from "zod";

/** Current SearchPage wire version (Story 1.4). */
export const SEARCH_PAGE_CONTRACT_VERSION = 2 as const;

export const SEARCH_QUERY_MAX_SCALARS = 120;
export const SEARCH_QUERY_MAX_UTF8_BYTES = 512;
export const SEARCH_CURSOR_MAX_UTF8_BYTES = 1024;
export const SEARCH_PAGE_MAX_HITS = 50;
export const SEARCH_PAGE_MAX_SUGGESTIONS = 20;
export const SEARCH_PAGE_MAX_STORE_SUPPORT = 10;
export const SEARCH_PAGE_MAX_TOKENS = 12;
export const SEARCH_TOKEN_MAX_UTF8_BYTES = 48;
export const SEARCH_QUALIFICATION_MAX_UTF8_BYTES = 1024;
export const SEARCH_ERROR_MAX_UTF8_BYTES = 512;
export const SEARCH_MAX_ERRORS = 8;
export const SEARCH_MAX_TOTAL_COUNT = 1_000_000;
export const MONEY_CENTAVOS_MAX = 2_147_483_647;
export const SEARCH_RPC_MAX_UTF8_BYTES = 256 * 1024;
export const SEARCH_RPC_ENVELOPE_HEADROOM_BYTES = 2 * 1024;
export const DEFAULT_RETRY_AFTER_SECONDS = 5;
export const SEARCH_INDEX_VERSION = 1 as const;
export const SEARCH_PARSER_VERSION = 1 as const;

export const RpcOutcomeKindSchema = z.enum([
  "ok",
  "degraded",
  "invalid",
  "notFound",
  "gone",
  "overloaded",
  "unavailable",
]);

export type RpcOutcomeKind = z.infer<typeof RpcOutcomeKindSchema>;

/** Outcomes that getSearchPage may emit. */
export const SearchPageAllowedOutcomeSchema = z.enum([
  "ok",
  "degraded",
  "invalid",
  "overloaded",
  "unavailable",
]);

export type SearchPageAllowedOutcome = z.infer<
  typeof SearchPageAllowedOutcomeSchema
>;

/** Positive integer BRL centavos (AR17). */
export const MoneyCentavosSchema = z.number().int().safe().positive().max(MONEY_CENTAVOS_MAX);

/** Positive integer grams (AR17). */
export const MassGramsSchema = z.number().int().safe().positive().max(2_147_483_647);

/** Accepted ISO-8601 offsets are normalized to one sortable UTC representation. */
export const UtcInstantSchema = z.string().datetime({ offset: true }).transform((value) =>
  new Date(value).toISOString()
);

export function canonicalizeUtcInstant(value: string): string | null {
  const parsed = UtcInstantSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const CorrelationIdSchema = z.string().uuid();

export const AvailabilityDisplaySchema = z.enum([
  "available",
  "unavailable",
  "unknown",
]);

export type AvailabilityDisplay = z.infer<typeof AvailabilityDisplaySchema>;

export const StoreSupportStateDisplaySchema = z.enum([
  "active",
  "degraded",
  "unsupported",
  "deactivated",
]);

// ─── Query (v2 current + v1 prior) ───────────────────────────────────────────

const CursorSchema = z
  .string()
  .min(1)
  .refine(
    (value) => new TextEncoder().encode(value).byteLength <= SEARCH_CURSOR_MAX_UTF8_BYTES,
    { message: "cursor_over_limit" },
  );

const QueryTextSchema = z.string().superRefine((value, ctx) => {
  if (
    [...value].length > SEARCH_QUERY_MAX_SCALARS ||
    new TextEncoder().encode(value).byteLength > SEARCH_QUERY_MAX_UTF8_BYTES
  ) {
    ctx.addIssue({ code: "custom", message: "query_over_limit" });
  }
});

function boundedUtf8(maxBytes: number) {
  return z.string().min(1).refine(
    (value) => new TextEncoder().encode(value).byteLength <= maxBytes,
    { message: "utf8_over_limit" },
  );
}

/** Strict v2 request — optional cursor/limit; reject unknown keys. */
export const SearchPageQueryV2Schema = z.strictObject({
  q: QueryTextSchema.optional(),
  cursor: CursorSchema.optional(),
  limit: z.number().int().positive().max(SEARCH_PAGE_MAX_HITS).optional(),
});

export type SearchPageQueryV2 = z.infer<typeof SearchPageQueryV2Schema>;

/** Current query shape (v2). */
export const SearchPageQuerySchema = SearchPageQueryV2Schema;
export type SearchPageQuery = SearchPageQueryV2;

/**
 * Accept only the initial v2 request body. Compatibility starts after the
 * first released SearchPage wire; pre-launch v1 values fail closed.
 */
export function parseSearchPageQuery(
  raw: unknown,
):
  | { ok: true; query: SearchPageQuery }
  | { ok: false; errors: string[] } {
  const v2 = SearchPageQueryV2Schema.safeParse(raw);
  if (v2.success) {
    return { ok: true, query: v2.data };
  }
  return { ok: false, errors: ["Parâmetros de busca inválidos."] };
}

// ─── Hits / page (v2 current) ────────────────────────────────────────────────

export const SearchHitV2Schema = z.strictObject({
  kind: z.enum(["offer", "merge"]),
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(512),
  brandName: z.string().min(1).max(512).nullable(),
  materialFamily: z.string().min(1).max(64).nullable(),
  /** Genuine formulation subtype when known; never product-kind filament|kit. */
  specificTypeLabel: z.string().min(1).max(128).nullable(),
  color: z.string().min(1).max(512).nullable(),
  diameterMm: z.number().finite().positive().max(1000).nullable(),
  massGrams: MassGramsSchema.nullable(),
  listingPriceCentavos: MoneyCentavosSchema.nullable(),
  pricePerKgCentavos: MoneyCentavosSchema.nullable(),
  availability: AvailabilityDisplaySchema,
  stale: z.boolean(),
  storeId: z.string().min(1).max(128),
  storeName: z.string().min(1).max(512).nullable(),
  observedAt: UtcInstantSchema.nullable(),
});

export type SearchHitV2 = z.infer<typeof SearchHitV2Schema>;
export type SearchHit = SearchHitV2;
export const SearchHitSchema = SearchHitV2Schema;

export const MaterialFamilySuggestionSchema = z.strictObject({
  id: z.string().min(1).max(128),
  /** Published label used as /search?q=… target until Story 1.6 slugs exist. */
  slug: z.string().min(1).max(128),
  label: z.string().min(1).max(64),
});

export type MaterialFamilySuggestion = z.infer<
  typeof MaterialFamilySuggestionSchema
>;

export const StoreSupportSummarySchema = z.strictObject({
  storeId: z.string().min(1).max(128),
  displayName: z.string().min(1).max(512),
  supportState: StoreSupportStateDisplaySchema,
});

export type StoreSupportSummary = z.infer<typeof StoreSupportSummarySchema>;

export const SearchPageLimitsV2Schema = z.strictObject({
  maxHits: z.literal(SEARCH_PAGE_MAX_HITS),
  maxQueryScalars: z.literal(SEARCH_QUERY_MAX_SCALARS),
  maxQueryUtf8Bytes: z.literal(SEARCH_QUERY_MAX_UTF8_BYTES),
  maxCursorUtf8Bytes: z.literal(SEARCH_CURSOR_MAX_UTF8_BYTES),
});

export const SearchPageV2Schema = z.strictObject({
  query: QueryTextSchema.nullable(),
  hits: z.array(SearchHitV2Schema).max(SEARCH_PAGE_MAX_HITS),
  totalCount: z.number().int().safe().nonnegative().max(SEARCH_MAX_TOTAL_COUNT),
  materialFamilySuggestions: z
    .array(MaterialFamilySuggestionSchema)
    .max(SEARCH_PAGE_MAX_SUGGESTIONS),
  storeSupport: z
    .array(StoreSupportSummarySchema)
    .max(SEARCH_PAGE_MAX_STORE_SUPPORT),
  nextCursor: CursorSchema.nullable(),
  hasNextPage: z.boolean(),
  limits: SearchPageLimitsV2Schema,
}).superRefine((page, ctx) => {
  if (page.hasNextPage !== (page.nextCursor !== null)) {
    ctx.addIssue({
      code: "custom",
      path: ["hasNextPage"],
      message: "hasNextPage must equal (nextCursor !== null)",
    });
  }
});

export type SearchPageV2 = z.infer<typeof SearchPageV2Schema>;
export type SearchPage = SearchPageV2;
export const SearchPageSchema = SearchPageV2Schema;

export const RpcEnvelopeMetaV2Schema = z.strictObject({
  contractVersion: z.literal(SEARCH_PAGE_CONTRACT_VERSION),
  projectionEpoch: z.number().int().safe().nonnegative(),
  supportEpoch: z.number().int().safe().nonnegative(),
  correlationId: CorrelationIdSchema,
});

export type RpcEnvelopeMeta = z.infer<typeof RpcEnvelopeMetaV2Schema>;

const RpcOutcomeOkV2Schema = RpcEnvelopeMetaV2Schema.extend({
  outcome: z.literal("ok"),
  data: SearchPageV2Schema,
});

const RpcOutcomeDegradedV2Schema = RpcEnvelopeMetaV2Schema.extend({
  outcome: z.literal("degraded"),
  data: SearchPageV2Schema,
  qualification: boundedUtf8(SEARCH_QUALIFICATION_MAX_UTF8_BYTES),
});

const RpcOutcomeInvalidV2Schema = RpcEnvelopeMetaV2Schema.extend({
  outcome: z.literal("invalid"),
  errors: z.array(boundedUtf8(SEARCH_ERROR_MAX_UTF8_BYTES)).min(1).max(SEARCH_MAX_ERRORS),
});

const RpcOutcomeOverloadedV2Schema = RpcEnvelopeMetaV2Schema.extend({
  outcome: z.literal("overloaded"),
  retryAfterSeconds: z.number().int().safe().positive().max(3600),
});

const RpcOutcomeUnavailableV2Schema = RpcEnvelopeMetaV2Schema.extend({
  outcome: z.literal("unavailable"),
  retryAfterSeconds: z.number().int().safe().positive().max(3600),
});

export const SearchPageRpcOutcomeV2Schema = z.discriminatedUnion("outcome", [
  RpcOutcomeOkV2Schema,
  RpcOutcomeDegradedV2Schema,
  RpcOutcomeInvalidV2Schema,
  RpcOutcomeOverloadedV2Schema,
  RpcOutcomeUnavailableV2Schema,
]);

export type SearchPageRpcOutcomeV2 = z.infer<typeof SearchPageRpcOutcomeV2Schema>;
export type SearchPageRpcOutcome = SearchPageRpcOutcomeV2;
export const SearchPageRpcOutcomeSchema = SearchPageRpcOutcomeV2Schema;

// ─── Strict v1 (N-1) — real prior wire, not an alias of v2 ───────────────────

/** Decode the initial v2 wire. Unknown versions and unknown keys fail closed. */
export function decodeSearchPageRpcOutcome(
  raw: unknown,
):
  | { ok: true; value: SearchPageRpcOutcome }
  | { ok: false; reason: "unknown_version" | "invalid_shape" } {
  if (
    raw === null ||
    typeof raw !== "object" ||
    !("contractVersion" in raw) ||
    typeof (raw as { contractVersion: unknown }).contractVersion !== "number"
  ) {
    return { ok: false, reason: "invalid_shape" };
  }

  if (
    (raw as { contractVersion: number }).contractVersion !==
    SEARCH_PAGE_CONTRACT_VERSION
  ) {
    return { ok: false, reason: "unknown_version" };
  }

  const parsed = SearchPageRpcOutcomeV2Schema.safeParse(raw);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, reason: "invalid_shape" };
}

/** Invalid for getSearchPage — contract tests must reject these. */
export const RpcOutcomeNotFoundSchema = z.strictObject({
  contractVersion: z.literal(SEARCH_PAGE_CONTRACT_VERSION),
  projectionEpoch: z.number().int().safe().nonnegative(),
  supportEpoch: z.number().int().safe().nonnegative(),
  correlationId: CorrelationIdSchema,
  outcome: z.literal("notFound"),
});

export const RpcOutcomeGoneSchema = z.strictObject({
  contractVersion: z.literal(SEARCH_PAGE_CONTRACT_VERSION),
  projectionEpoch: z.number().int().safe().nonnegative(),
  supportEpoch: z.number().int().safe().nonnegative(),
  correlationId: CorrelationIdSchema,
  outcome: z.literal("gone"),
});
