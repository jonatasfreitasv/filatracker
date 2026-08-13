import { StoreMapSchema, type StoreMap } from "../../../contracts/store-map";

/**
 * Voolt3D declarative map v1 (schema-validated).
 *
 * Reviewed destination evidence 2026-08-10:
 * voolt3d.com.br:443 and www.voolt3d.com.br:443 both serve HTTPS 200
 * (no forced apex↔www redirect). Canonical product URLs in sitemap use apex.
 * Never widen to *.voolt3d.com.br or mitiendanube/CDN hosts without a
 * deliberate map-version review.
 */
export const VOOLT3D_MAP_VERSION = 1 as const;
export const VOOLT3D_PARSER_VERSION = 1 as const;
export const VOOLT3D_STORE_ID = "voolt3d" as const;

const rawMap = {
  contractVersion: 1 as const,
  mapVersion: VOOLT3D_MAP_VERSION,
  storeId: VOOLT3D_STORE_ID,
  displayName: "Voolt3D",
  canonicalOrigin: "https://voolt3d.com.br/",
  reviewedDestinations: [
    { scheme: "https" as const, host: "voolt3d.com.br", port: 443 as const },
    { scheme: "https" as const, host: "www.voolt3d.com.br", port: 443 as const },
  ],
  reviewedRedirectChain: ["voolt3d.com.br:443", "www.voolt3d.com.br:443"],
  robotsUrlPath: "/robots.txt" as const,
  discovery: [
    {
      kind: "sitemap" as const,
      path: "/sitemap.xml",
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
    catalogWorkLimit: 256,
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
  parserVersion: VOOLT3D_PARSER_VERSION,
  pathAllowPrefixes: [
    "/robots.txt",
    "/sitemap.xml",
    "/produtos/",
  ],
  queryAllowKeys: [],
} satisfies StoreMap;

export const voolt3dMap: StoreMap = StoreMapSchema.parse(rawMap);

export function loadVoolt3dMap(): StoreMap {
  return StoreMapSchema.parse(voolt3dMap);
}

/**
 * Host rewrite for shared canonicalizeReviewedPdpUrl:
 * sitemap/canonical PDPs use apex; rewrite www → apex (API field names are
 * apex/www but the transform is simply hostA → hostB).
 */
export const VOOLT3D_HOST_REWRITE = {
  apex: "www.voolt3d.com.br",
  www: "voolt3d.com.br",
} as const;
