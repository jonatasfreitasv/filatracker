/**
 * Shared source-identity policy (AD-16 / AD-7).
 *
 * Derives a source tuple from a canonical reviewed PDP URL + merchant variant.
 * Adapters do NOT assign Offer IDs or Merge membership — Story 1.3 owns durable
 * Offer allocation.
 */

export const SOURCE_IDENTITY_POLICY_VERSION = 1 as const;

const TRACKING_QUERY_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "ref",
  "referrer",
]);

export type SourceTuple = {
  policyVersion: typeof SOURCE_IDENTITY_POLICY_VERSION;
  storeId: string;
  canonicalPdpUrl: string;
  merchantVariantId: string | null;
  /** Stable digest key for collision/stability fixtures — not an Offer ID. */
  sourceKey: string;
};

export type SourceIdentityError =
  | { code: "invalid_url"; detail: string }
  | { code: "incompatible_tuple"; detail: string }
  | { code: "host_not_allowed"; detail: string };

export type SourceIdentityResult =
  | { ok: true; tuple: SourceTuple }
  | { ok: false; error: SourceIdentityError };

export type CanonicalPdpResult =
  | { ok: true; canonicalPdpUrl: string }
  | { ok: false; error: SourceIdentityError };

function stripTrailingDot(host: string): string {
  return host.endsWith(".") ? host.slice(0, -1) : host;
}

/**
 * Canonicalize a reviewed PDP URL:
 * - https only
 * - lowercase host
 * - strip default :443
 * - remove fragments
 * - remove tracking query keys
 * - sort remaining query keys
 * - collapse apex→www when allowlist says www is canonical (caller supplies hosts)
 */
export function canonicalizeReviewedPdpUrl(
  rawUrl: string,
  options: {
    allowedHosts: readonly string[];
    /** When set, rewrite this apex host to the www host. */
    apexToWww?: { apex: string; www: string };
  },
): CanonicalPdpResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: { code: "invalid_url", detail: "parse_failed" } };
  }

  if (url.protocol !== "https:") {
    return {
      ok: false,
      error: { code: "invalid_url", detail: "scheme_not_https" },
    };
  }

  if (url.username || url.password) {
    return {
      ok: false,
      error: { code: "invalid_url", detail: "credentials_forbidden" },
    };
  }

  if (url.hash) {
    return {
      ok: false,
      error: { code: "invalid_url", detail: "fragment_forbidden" },
    };
  }

  let host = stripTrailingDot(url.hostname.toLowerCase());
  if (options.apexToWww && host === options.apexToWww.apex) {
    host = options.apexToWww.www;
  }

  if (!options.allowedHosts.includes(host)) {
    return {
      ok: false,
      error: { code: "host_not_allowed", detail: host },
    };
  }

  if (url.port && url.port !== "443") {
    return {
      ok: false,
      error: { code: "invalid_url", detail: `non_443_port:${url.port}` },
    };
  }

  const params = new URLSearchParams();
  const entries = [...url.searchParams.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [key, value] of entries) {
    if (TRACKING_QUERY_KEYS.has(key.toLowerCase())) continue;
    params.append(key, value);
  }

  const search = params.toString();
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const canonical = `https://${host}${pathname}${search ? `?${search}` : ""}`;

  return { ok: true, canonicalPdpUrl: canonical };
}

export function deriveSourceTuple(input: {
  storeId: string;
  pdpUrl: string;
  merchantVariantId: string | null;
  allowedHosts: readonly string[];
  apexToWww?: { apex: string; www: string };
}): SourceIdentityResult {
  const canonical = canonicalizeReviewedPdpUrl(input.pdpUrl, {
    allowedHosts: input.allowedHosts,
    apexToWww: input.apexToWww,
  });
  if (!canonical.ok) return canonical;

  const trimmedVariant = (input.merchantVariantId ?? "").trim();
  const variant = trimmedVariant === "" ? null : trimmedVariant;

  const sourceKey = `${input.storeId}|${canonical.canonicalPdpUrl}|${variant ?? ""}`;

  return {
    ok: true,
    tuple: {
      policyVersion: SOURCE_IDENTITY_POLICY_VERSION,
      storeId: input.storeId,
      canonicalPdpUrl: canonical.canonicalPdpUrl,
      merchantVariantId: variant,
      sourceKey,
    },
  };
}

/**
 * Detect incompatible reuse: same sourceKey must not map to conflicting
 * (storeId, url, variant) evidence within a run.
 */
export function assertCompatibleTupleReuse(
  existing: SourceTuple,
  candidate: SourceTuple,
): SourceIdentityResult {
  if (existing.sourceKey !== candidate.sourceKey) {
    return { ok: true, tuple: candidate };
  }
  if (
    existing.storeId !== candidate.storeId ||
    existing.canonicalPdpUrl !== candidate.canonicalPdpUrl ||
    existing.merchantVariantId !== candidate.merchantVariantId
  ) {
    return {
      ok: false,
      error: {
        code: "incompatible_tuple",
        detail: existing.sourceKey,
      },
    };
  }
  return { ok: true, tuple: existing };
}
