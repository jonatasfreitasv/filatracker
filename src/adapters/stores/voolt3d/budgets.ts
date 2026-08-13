/**
 * Voolt3D adapter resource budgets.
 * Chosen from measured 2026-08-10 catalog evidence with explicit safety margin.
 *
 * Measured: 213 product URLs matching /produtos/<slug>/ in sitemap.xml;
 * PDP HTML ~0.47–0.51 MB encoded; robots.txt small.
 */

export const VOOLT3D_BUDGETS = {
  maxEncodedBytesPerFetch: 1_500_000, // ~0.51MB measured + ~3x margin
  maxDecompressedBytesPerFetch: 1_500_000,
  maxRedirectHops: 5,
  maxDnsChecksPerRun: 256,
  maxFieldStringLength: 512,
  maxUrlLength: 2048,
  maxArrayCardinality: 500,
  maxJsonLdNesting: 12,
  maxParserSelectors: 32,
  maxCandidatesPerRun: 256,
  maxObservationsPerRun: 256,
  /** Measured catalog bound 213 + 20% margin → 256. */
  measuredCatalogBound: 213,
  catalogBoundWithMargin: 256,
  maxStagedBytesEstimate: 2_000_000,
  maxSubrequestsPerRun: 280,
  maxConcurrency: 2,
  maxWallClockMs: 60_000,
  maxProbePages: 5,
  maxProbeDurationMs: 30_000,
  maxLogEventBytes: 8_192,
  maxRobotsBodyBytes: 64_000,
} as const;

export type Voolt3dBudgets = typeof VOOLT3D_BUDGETS;
