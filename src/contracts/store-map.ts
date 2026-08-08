import { z } from "zod";

/**
 * Store declarative map contract v1.
 *
 * Decision (closes architecture Deferred): maps are versioned JSON objects
 * validated by Zod. Discovery/pagination/variant coverage is declarative so a
 * run can compile completeness evidence (`authoritative-complete` vs
 * `positive-only`) from expected-vs-completed work — adapters must not hardcode
 * a static completeness label independent of run evidence.
 *
 * No predecessor version exists; unknown versions and unknown keys are rejected.
 */
export const STORE_MAP_CONTRACT_VERSION = 1 as const;
export const STORE_MAP_NO_PREDECESSOR = true as const;

const HostSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9.-]+$/);

export const ReviewedDestinationSchema = z.strictObject({
  scheme: z.literal("https"),
  host: HostSchema,
  port: z.literal(443),
});

export type ReviewedDestination = z.infer<typeof ReviewedDestinationSchema>;

export const DiscoveryRuleSchema = z.strictObject({
  kind: z.enum(["sitemap", "listing", "seed"]),
  path: z.string().min(1).max(512),
  /** Maximum catalog-bearing pages this rule may produce for a run. */
  maxPages: z.number().int().positive().max(500),
});

export type DiscoveryRule = z.infer<typeof DiscoveryRuleSchema>;

export const PaginationRuleSchema = z.strictObject({
  kind: z.enum(["none", "query-param", "sitemap-index"]),
  param: z.string().max(64).nullable(),
  maxPages: z.number().int().positive().max(500),
});

export type PaginationRule = z.infer<typeof PaginationRuleSchema>;

export const VariantCoverageRuleSchema = z.strictObject({
  /** How merchant variants are identified in evidence. */
  strategy: z.enum(["sku", "url-slug", "none"]),
  maxVariantsPerProduct: z.number().int().positive().max(100),
});

export type VariantCoverageRule = z.infer<typeof VariantCoverageRuleSchema>;

/**
 * Completeness evidence needed to compile a run as authoritative-complete
 * or positive-only. The adapter emits expected/completed counts; the future
 * coordinator owns the AD-17 publication class.
 */
export const CompletenessEvidenceSpecSchema = z.strictObject({
  requiresExpectedCatalogWork: z.literal(true),
  allowsBoundedOmissions: z.boolean(),
  omissionCodes: z.array(z.string().min(1).max(64)).max(32),
});

export type CompletenessEvidenceSpec = z.infer<
  typeof CompletenessEvidenceSpecSchema
>;

export const StoreMapSchema = z.strictObject({
  contractVersion: z.literal(STORE_MAP_CONTRACT_VERSION),
  mapVersion: z.number().int().positive(),
  storeId: z.string().min(1).max(64),
  displayName: z.string().min(1).max(128),
  canonicalOrigin: z.string().url().max(2048),
  reviewedDestinations: z.array(ReviewedDestinationSchema).min(1).max(16),
  /** Exact redirect chain observed during homologation (host:port hops). */
  reviewedRedirectChain: z.array(z.string().min(1).max(512)).max(16),
  robotsUrlPath: z.literal("/robots.txt"),
  discovery: z.array(DiscoveryRuleSchema).min(1).max(16),
  pagination: PaginationRuleSchema,
  variantCoverage: VariantCoverageRuleSchema,
  completeness: CompletenessEvidenceSpecSchema,
  parserVersion: z.number().int().positive(),
  pathAllowPrefixes: z.array(z.string().min(1).max(256)).min(1).max(32),
  queryAllowKeys: z.array(z.string().min(1).max(64)).max(32),
});

export type StoreMap = z.infer<typeof StoreMapSchema>;

export const StoreMapDecoders = {
  1: StoreMapSchema,
} as const;
