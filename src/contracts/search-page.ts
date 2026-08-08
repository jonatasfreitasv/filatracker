import { z } from "zod";

/** Contract version for getSearchPage / RpcOutcome envelopes. */
export const SEARCH_PAGE_CONTRACT_VERSION = 1 as const;

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

/** Outcomes that getSearchPage v1 may emit. */
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
export const MoneyCentavosSchema = z.number().int().positive();

/** Positive integer grams (AR17). */
export const MassGramsSchema = z.number().int().positive();

/** UTC instant as ISO-8601 string. */
export const UtcInstantSchema = z.string().datetime({ offset: true });

export const CorrelationIdSchema = z.string().uuid();

export const RpcEnvelopeMetaSchema = z.object({
  contractVersion: z.literal(SEARCH_PAGE_CONTRACT_VERSION),
  projectionEpoch: z.number().int().nonnegative(),
  supportEpoch: z.number().int().nonnegative(),
  correlationId: CorrelationIdSchema,
});

export type RpcEnvelopeMeta = z.infer<typeof RpcEnvelopeMetaSchema>;

/**
 * Optional query `q` only. Normalization (NFKC, trim, collapse whitespace)
 * happens before validation; empty canonicalizes to Home (absent q).
 */
export const SearchPageQuerySchema = z.object({
  q: z.string().optional(),
});

export type SearchPageQuery = z.infer<typeof SearchPageQuerySchema>;

export const SearchHitSchema = z.object({
  kind: z.enum(["offer", "merge"]),
  id: z.string().min(1),
  title: z.string().min(1),
  brandName: z.string().nullable(),
  materialFamily: z.string().nullable(),
  listingPriceCentavos: MoneyCentavosSchema.nullable(),
  pricePerKgCentavos: MoneyCentavosSchema.nullable(),
  massGrams: MassGramsSchema.nullable(),
  diameterMm: z.number().positive().nullable(),
  inStock: z.boolean().nullable(),
  storeName: z.string().nullable(),
  observedAt: UtcInstantSchema.nullable(),
});

export type SearchHit = z.infer<typeof SearchHitSchema>;

export const MaterialFamilySuggestionSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  label: z.string().min(1),
});

export type MaterialFamilySuggestion = z.infer<
  typeof MaterialFamilySuggestionSchema
>;

export const SearchPageSchema = z.object({
  query: z.string().nullable(),
  hits: z.array(SearchHitSchema).max(50),
  totalCount: z.number().int().nonnegative(),
  materialFamilySuggestions: z.array(MaterialFamilySuggestionSchema).max(20),
  limits: z.object({
    maxHits: z.literal(50),
    maxQueryScalars: z.literal(120),
    maxQueryUtf8Bytes: z.literal(512),
  }),
});

export type SearchPage = z.infer<typeof SearchPageSchema>;

export const RpcOutcomeBaseSchema = RpcEnvelopeMetaSchema.extend({
  outcome: RpcOutcomeKindSchema,
});

export const RpcOutcomeOkSchema = RpcOutcomeBaseSchema.extend({
  outcome: z.literal("ok"),
  data: SearchPageSchema,
});

export const RpcOutcomeDegradedSchema = RpcOutcomeBaseSchema.extend({
  outcome: z.literal("degraded"),
  data: SearchPageSchema,
  qualification: z.string().min(1),
});

export const RpcOutcomeInvalidSchema = RpcOutcomeBaseSchema.extend({
  outcome: z.literal("invalid"),
  errors: z.array(z.string().min(1)).min(1),
});

export const RpcOutcomeOverloadedSchema = RpcOutcomeBaseSchema.extend({
  outcome: z.literal("overloaded"),
  retryAfterSeconds: z.number().int().positive(),
});

export const RpcOutcomeUnavailableSchema = RpcOutcomeBaseSchema.extend({
  outcome: z.literal("unavailable"),
  retryAfterSeconds: z.number().int().positive(),
});

/** Invalid for getSearchPage v1 — contract tests must reject these. */
export const RpcOutcomeNotFoundSchema = RpcOutcomeBaseSchema.extend({
  outcome: z.literal("notFound"),
});

export const RpcOutcomeGoneSchema = RpcOutcomeBaseSchema.extend({
  outcome: z.literal("gone"),
});

export const SearchPageRpcOutcomeSchema = z.discriminatedUnion("outcome", [
  RpcOutcomeOkSchema,
  RpcOutcomeDegradedSchema,
  RpcOutcomeInvalidSchema,
  RpcOutcomeOverloadedSchema,
  RpcOutcomeUnavailableSchema,
]);

export type SearchPageRpcOutcome = z.infer<typeof SearchPageRpcOutcomeSchema>;

/** N-1 adjacent envelope: same shape at v1 baseline (establishes pattern). */
export const SearchPageRpcOutcomeNMinus1Schema = SearchPageRpcOutcomeSchema;

export const SEARCH_QUERY_MAX_SCALARS = 120;
export const SEARCH_QUERY_MAX_UTF8_BYTES = 512;
export const DEFAULT_RETRY_AFTER_SECONDS = 5;
