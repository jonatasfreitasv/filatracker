/**
 * BrowsePage v1 — no predecessor (Story 1.6).
 * Outcomes include notFound/gone (unlike SearchPage).
 */

import { z } from "zod";

import {
  BrandSuggestionSchema,
  CorrelationIdSchema,
  DEFAULT_RETRY_AFTER_SECONDS,
  MaterialFamilySuggestionSchema,
  SEARCH_CURSOR_MAX_UTF8_BYTES,
  SEARCH_ERROR_MAX_UTF8_BYTES,
  SEARCH_MAX_ERRORS,
  SEARCH_MAX_TOTAL_COUNT,
  SEARCH_PAGE_MAX_HITS,
  SEARCH_PAGE_MAX_STORE_SUPPORT,
  SEARCH_PAGE_MAX_SUGGESTIONS,
  SEARCH_QUALIFICATION_MAX_UTF8_BYTES,
  SEARCH_QUERY_MAX_SCALARS,
  SEARCH_QUERY_MAX_UTF8_BYTES,
  SearchHitV2Schema,
  SearchPageLimitsV2Schema,
  SpecificTypeFacetSchema,
  StoreSupportSummarySchema,
} from "./search-page";

export const BROWSE_PAGE_CONTRACT_VERSION = 1 as const;
export const BROWSE_PAGE_CONTRACT_NO_PREDECESSOR = true as const;

export { DEFAULT_RETRY_AFTER_SECONDS };

const CursorSchema = z
  .string()
  .min(1)
  .refine(
    (value) => new TextEncoder().encode(value).byteLength <= SEARCH_CURSOR_MAX_UTF8_BYTES,
    { message: "cursor_over_limit" },
  );

const TypeSlugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const SlugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const BrowsePageQuerySchema = z.strictObject({
  kind: z.enum(["material", "brand"]),
  slug: SlugSchema,
  cursor: CursorSchema.optional(),
  limit: z.number().int().positive().max(SEARCH_PAGE_MAX_HITS).optional(),
  type: TypeSlugSchema.optional(),
});

export type BrowsePageQuery = z.infer<typeof BrowsePageQuerySchema>;

export const BrowseEntitySchema = z.strictObject({
  id: z.string().min(1).max(128),
  slug: z.string().min(1).max(128),
  label: z.string().min(1).max(512),
  kind: z.enum(["material", "brand"]),
});

export type BrowseEntity = z.infer<typeof BrowseEntitySchema>;

export const BrowsePageSchema = z.strictObject({
  entity: BrowseEntitySchema,
  hits: z.array(SearchHitV2Schema).max(SEARCH_PAGE_MAX_HITS),
  totalCount: z.number().int().safe().nonnegative().max(SEARCH_MAX_TOTAL_COUNT),
  specificTypeFacet: z
    .array(SpecificTypeFacetSchema)
    .max(SEARCH_PAGE_MAX_SUGGESTIONS),
  materialFamilySuggestions: z
    .array(MaterialFamilySuggestionSchema)
    .max(SEARCH_PAGE_MAX_SUGGESTIONS),
  brandSuggestions: z
    .array(BrandSuggestionSchema)
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

export type BrowsePage = z.infer<typeof BrowsePageSchema>;

function boundedUtf8(maxBytes: number) {
  return z.string().min(1).refine(
    (value) => new TextEncoder().encode(value).byteLength <= maxBytes,
    { message: "utf8_over_limit" },
  );
}

const MetaSchema = z.strictObject({
  contractVersion: z.literal(BROWSE_PAGE_CONTRACT_VERSION),
  projectionEpoch: z.number().int().safe().nonnegative(),
  supportEpoch: z.number().int().safe().nonnegative(),
  correlationId: CorrelationIdSchema,
});

export const BrowsePageRpcOutcomeSchema = z.discriminatedUnion("outcome", [
  MetaSchema.extend({
    outcome: z.literal("ok"),
    data: BrowsePageSchema,
  }),
  MetaSchema.extend({
    outcome: z.literal("degraded"),
    data: BrowsePageSchema,
    qualification: boundedUtf8(SEARCH_QUALIFICATION_MAX_UTF8_BYTES),
  }),
  MetaSchema.extend({
    outcome: z.literal("invalid"),
    errors: z.array(boundedUtf8(SEARCH_ERROR_MAX_UTF8_BYTES)).min(1).max(SEARCH_MAX_ERRORS),
  }),
  MetaSchema.extend({
    outcome: z.literal("notFound"),
  }),
  MetaSchema.extend({
    outcome: z.literal("gone"),
  }),
  MetaSchema.extend({
    outcome: z.literal("redirect"),
    canonicalSlug: z.string().min(1).max(128),
    kind: z.enum(["material", "brand"]),
  }),
  MetaSchema.extend({
    outcome: z.literal("overloaded"),
    retryAfterSeconds: z.number().int().safe().positive().max(3600),
  }),
  MetaSchema.extend({
    outcome: z.literal("unavailable"),
    retryAfterSeconds: z.number().int().safe().positive().max(3600),
  }),
]);

export type BrowsePageRpcOutcome = z.infer<typeof BrowsePageRpcOutcomeSchema>;

export const BrowsePageAllowedOutcomeSchema = z.enum([
  "ok",
  "degraded",
  "invalid",
  "notFound",
  "gone",
  "redirect",
  "overloaded",
  "unavailable",
]);

export function parseBrowsePageQuery(
  raw: unknown,
):
  | { ok: true; query: BrowsePageQuery }
  | { ok: false; errors: string[] } {
  const parsed = BrowsePageQuerySchema.safeParse(raw);
  if (parsed.success) return { ok: true, query: parsed.data };
  return { ok: false, errors: ["Parâmetros de navegação inválidos."] };
}

export function decodeBrowsePageRpcOutcome(
  raw: unknown,
):
  | { ok: true; value: BrowsePageRpcOutcome }
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
    BROWSE_PAGE_CONTRACT_VERSION
  ) {
    return { ok: false, reason: "unknown_version" };
  }
  const parsed = BrowsePageRpcOutcomeSchema.safeParse(raw);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, reason: "invalid_shape" };
}

export const BROWSE_LIMITS = {
  maxHits: SEARCH_PAGE_MAX_HITS,
  maxQueryScalars: SEARCH_QUERY_MAX_SCALARS,
  maxQueryUtf8Bytes: SEARCH_QUERY_MAX_UTF8_BYTES,
  maxCursorUtf8Bytes: SEARCH_CURSOR_MAX_UTF8_BYTES,
} as const;
