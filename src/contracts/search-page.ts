import { z } from "zod";

/** Current SearchPage wire version (Story 1.6 additive v3). */
export const SEARCH_PAGE_CONTRACT_VERSION = 3 as const;
/** Released predecessor — web still hydrates v2 pages. */
export const SEARCH_PAGE_CONTRACT_VERSION_V2 = 2 as const;

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

const TypeSlugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** Strict v3 request — additive optional formulation type slug. */
export const SearchPageQueryV3Schema = z.strictObject({
  q: QueryTextSchema.optional(),
  cursor: CursorSchema.optional(),
  limit: z.number().int().positive().max(SEARCH_PAGE_MAX_HITS).optional(),
  type: TypeSlugSchema.optional(),
});

export type SearchPageQueryV3 = z.infer<typeof SearchPageQueryV3Schema>;

/** Current query shape (v3). */
export const SearchPageQuerySchema = SearchPageQueryV3Schema;
export type SearchPageQuery = SearchPageQueryV3;

/**
 * Accept v3 (and v2-shaped bodies without `type`). Unknown keys fail closed.
 */
export function parseSearchPageQuery(
  raw: unknown,
):
  | { ok: true; query: SearchPageQuery }
  | { ok: false; errors: string[] } {
  const v3 = SearchPageQueryV3Schema.safeParse(raw);
  if (v3.success) {
    return { ok: true, query: v3.data };
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
  /** Durable published slug for /materials/:slug. */
  slug: z.string().min(1).max(128),
  label: z.string().min(1).max(64),
});

export type MaterialFamilySuggestion = z.infer<
  typeof MaterialFamilySuggestionSchema
>;

export const BrandSuggestionSchema = z.strictObject({
  id: z.string().min(1).max(128),
  slug: z.string().min(1).max(128),
  label: z.string().min(1).max(512),
});

export type BrandSuggestion = z.infer<typeof BrandSuggestionSchema>;

export const SpecificTypeFacetSchema = z.strictObject({
  slug: z.string().min(1).max(128),
  label: z.string().min(1).max(128),
  count: z.number().int().safe().nonnegative().max(SEARCH_MAX_TOTAL_COUNT),
});

export type SpecificTypeFacet = z.infer<typeof SpecificTypeFacetSchema>;

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

export const SearchPageV3Schema = z.strictObject({
  query: QueryTextSchema.nullable(),
  hits: z.array(SearchHitV2Schema).max(SEARCH_PAGE_MAX_HITS),
  totalCount: z.number().int().safe().nonnegative().max(SEARCH_MAX_TOTAL_COUNT),
  materialFamilySuggestions: z
    .array(MaterialFamilySuggestionSchema)
    .max(SEARCH_PAGE_MAX_SUGGESTIONS),
  brandSuggestions: z
    .array(BrandSuggestionSchema)
    .max(SEARCH_PAGE_MAX_SUGGESTIONS),
  specificTypeFacet: z
    .array(SpecificTypeFacetSchema)
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

export type SearchPageV3 = z.infer<typeof SearchPageV3Schema>;
export type SearchPage = SearchPageV3;
export const SearchPageSchema = SearchPageV3Schema;

export const RpcEnvelopeMetaV2Schema = z.strictObject({
  contractVersion: z.literal(SEARCH_PAGE_CONTRACT_VERSION_V2),
  projectionEpoch: z.number().int().safe().nonnegative(),
  supportEpoch: z.number().int().safe().nonnegative(),
  correlationId: CorrelationIdSchema,
});

export const RpcEnvelopeMetaV3Schema = z.strictObject({
  contractVersion: z.literal(SEARCH_PAGE_CONTRACT_VERSION),
  projectionEpoch: z.number().int().safe().nonnegative(),
  supportEpoch: z.number().int().safe().nonnegative(),
  correlationId: CorrelationIdSchema,
});

export type RpcEnvelopeMeta = z.infer<typeof RpcEnvelopeMetaV3Schema>;

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

const RpcOutcomeOkV3Schema = RpcEnvelopeMetaV3Schema.extend({
  outcome: z.literal("ok"),
  data: SearchPageV3Schema,
});

const RpcOutcomeDegradedV3Schema = RpcEnvelopeMetaV3Schema.extend({
  outcome: z.literal("degraded"),
  data: SearchPageV3Schema,
  qualification: boundedUtf8(SEARCH_QUALIFICATION_MAX_UTF8_BYTES),
});

const RpcOutcomeInvalidV3Schema = RpcEnvelopeMetaV3Schema.extend({
  outcome: z.literal("invalid"),
  errors: z.array(boundedUtf8(SEARCH_ERROR_MAX_UTF8_BYTES)).min(1).max(SEARCH_MAX_ERRORS),
});

const RpcOutcomeOverloadedV3Schema = RpcEnvelopeMetaV3Schema.extend({
  outcome: z.literal("overloaded"),
  retryAfterSeconds: z.number().int().safe().positive().max(3600),
});

const RpcOutcomeUnavailableV3Schema = RpcEnvelopeMetaV3Schema.extend({
  outcome: z.literal("unavailable"),
  retryAfterSeconds: z.number().int().safe().positive().max(3600),
});

export const SearchPageRpcOutcomeV3Schema = z.discriminatedUnion("outcome", [
  RpcOutcomeOkV3Schema,
  RpcOutcomeDegradedV3Schema,
  RpcOutcomeInvalidV3Schema,
  RpcOutcomeOverloadedV3Schema,
  RpcOutcomeUnavailableV3Schema,
]);

export type SearchPageRpcOutcomeV2 = z.infer<typeof SearchPageRpcOutcomeV2Schema>;
export type SearchPageRpcOutcomeV3 = z.infer<typeof SearchPageRpcOutcomeV3Schema>;
export type SearchPageRpcOutcome = SearchPageRpcOutcomeV3;
export const SearchPageRpcOutcomeSchema = SearchPageRpcOutcomeV3Schema;

function hydrateV2Page(page: SearchPageV2): SearchPageV3 {
  return { ...page, brandSuggestions: [], specificTypeFacet: [] };
}

function hydrateV2Outcome(outcome: SearchPageRpcOutcomeV2): SearchPageRpcOutcomeV3 {
  if (outcome.outcome === "ok") {
    return { ...outcome, contractVersion: SEARCH_PAGE_CONTRACT_VERSION, data: hydrateV2Page(outcome.data) };
  }
  if (outcome.outcome === "degraded") {
    return { ...outcome, contractVersion: SEARCH_PAGE_CONTRACT_VERSION, data: hydrateV2Page(outcome.data) };
  }
  return { ...outcome, contractVersion: SEARCH_PAGE_CONTRACT_VERSION };
}

/** Decode v3 (current) or hydrate released v2 predecessor. Unknown versions fail closed. */
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

  const version = (raw as { contractVersion: number }).contractVersion;
  if (version === SEARCH_PAGE_CONTRACT_VERSION) {
    const parsed = SearchPageRpcOutcomeV3Schema.safeParse(raw);
    return parsed.success
      ? { ok: true, value: parsed.data }
      : { ok: false, reason: "invalid_shape" };
  }
  if (version === SEARCH_PAGE_CONTRACT_VERSION_V2) {
    const parsed = SearchPageRpcOutcomeV2Schema.safeParse(raw);
    return parsed.success
      ? { ok: true, value: hydrateV2Outcome(parsed.data) }
      : { ok: false, reason: "invalid_shape" };
  }
  return { ok: false, reason: "unknown_version" };
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
