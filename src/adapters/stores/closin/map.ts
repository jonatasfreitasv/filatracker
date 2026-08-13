import { StoreMapSchema, type StoreMap } from "../../../contracts/store-map";

/**
 * Closin declarative map v1 (schema-validated).
 *
 * Reviewed destination evidence 2026-08-08:
 * closin.com.br:443 → www.closin.com.br:443
 * Never widen to *.closin.com.br or unrelated Wix/static hosts without a
 * deliberate map-version review.
 */
export const CLOSIN_MAP_VERSION = 1 as const;
export const CLOSIN_PARSER_VERSION = 1 as const;
export const CLOSIN_STORE_ID = "closin" as const;

const rawMap = {
  contractVersion: 1 as const,
  mapVersion: CLOSIN_MAP_VERSION,
  storeId: CLOSIN_STORE_ID,
  displayName: "Closin",
  canonicalOrigin: "https://www.closin.com.br/",
  reviewedDestinations: [
    { scheme: "https" as const, host: "closin.com.br", port: 443 as const },
    { scheme: "https" as const, host: "www.closin.com.br", port: 443 as const },
  ],
  reviewedRedirectChain: ["closin.com.br:443", "www.closin.com.br:443"],
  robotsUrlPath: "/robots.txt" as const,
  discovery: [
    {
      kind: "sitemap" as const,
      path: "/store-products-sitemap.xml",
      maxPages: 1,
    },
  ],
  pagination: {
    kind: "sitemap-index" as const,
    param: null,
    maxPages: 5,
  },
  variantCoverage: {
    strategy: "sku" as const,
    maxVariantsPerProduct: 1,
  },
  completeness: {
    requiresExpectedCatalogWork: true as const,
    allowsBoundedOmissions: true,
    catalogWorkLimit: 134,
    omissionCodes: [
      "non_filament",
      "ambiguous_mass_retained",
      "fetch_failed",
      "source_identity_rejected",
      "duplicate_source_tuple",
      "catalog_truncated",
    ],
    failureCodes: ["fetch_failed", "budget_overflow"],
  },
  parserVersion: CLOSIN_PARSER_VERSION,
  pathAllowPrefixes: [
    "/robots.txt",
    "/sitemap.xml",
    "/store-products-sitemap.xml",
    "/product-page/",
    "/categoria/",
    "/shop",
  ],
  queryAllowKeys: [],
} satisfies StoreMap;

export const closinMap: StoreMap = StoreMapSchema.parse(rawMap);

export function loadClosinMap(): StoreMap {
  return StoreMapSchema.parse(closinMap);
}
