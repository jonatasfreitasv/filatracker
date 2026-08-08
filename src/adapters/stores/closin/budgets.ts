/**
 * Closin adapter resource budgets (architecture Deferred → decided here).
 * Chosen from measured 2026-08-08 catalog evidence with explicit safety margin.
 *
 * Measured: 111 product-page URLs in store-products-sitemap.xml;
 * PDP HTML ~2.0–2.1 MB encoded; home ~2.07 MB; robots.txt small.
 */

export const CLOSIN_BUDGETS = {
  maxEncodedBytesPerFetch: 3_000_000, // ~2.1MB measured + ~40% margin
  maxDecompressedBytesPerFetch: 3_000_000,
  maxRedirectHops: 5,
  maxDnsChecksPerRun: 256,
  maxFieldStringLength: 512,
  maxUrlLength: 2048,
  maxArrayCardinality: 500,
  maxJsonLdNesting: 12,
  maxParserSelectors: 32,
  maxCandidatesPerRun: 200,
  maxObservationsPerRun: 150,
  /** Measured catalog bound 111 + 20% margin → 134, capped by observations. */
  measuredCatalogBound: 111,
  catalogBoundWithMargin: 134,
  maxStagedBytesEstimate: 2_000_000,
  maxSubrequestsPerRun: 160,
  maxConcurrency: 2,
  maxWallClockMs: 60_000,
  maxProbePages: 5,
  maxProbeDurationMs: 30_000,
  maxLogEventBytes: 8_192,
  maxRobotsBodyBytes: 64_000,
} as const;

export type ClosinBudgets = typeof CLOSIN_BUDGETS;
