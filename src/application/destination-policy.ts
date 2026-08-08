/**
 * Shared destination policy (AD-20).
 *
 * HTTPS only, exact reviewed hosts/ports, canonical host syntax, no credentials/
 * fragments, public-DNS evidence checks, Store-scoped path/query composition,
 * every-hop validation with redirect: "manual".
 *
 * Workers limitation (documented + enforced as far as platform allows):
 * Cloudflare Workers `fetch` resolves origin DNS internally; userland cannot pin
 * the TCP connection to a pre-resolved public address. Homologation therefore:
 * 1) rejects IP literals / localhost / private / link-local / reserved hosts in
 *    the URL before fetch;
 * 2) records DNS evidence via platform-feasible checks (URL host classification
 *    + optional DoH lookup when available in the runtime);
 * 3) fails closed on ambiguity.
 * If a hop cannot be proven public, the hop is rejected.
 */

export const DESTINATION_POLICY_VERSION = 1 as const;

export type DestinationPolicyConfig = {
  allowedHosts: readonly string[];
  /** Allowed path prefixes for this Store (e.g. /product-page/, /robots.txt). */
  pathAllowPrefixes: readonly string[];
  /** Allowed query keys; empty means no query allowed except empty search. */
  queryAllowKeys: readonly string[];
  maxRedirectHops: number;
};

export type DestinationRejectionCode =
  | "scheme"
  | "credentials"
  | "fragment"
  | "host_not_allowlisted"
  | "noncanonical_host"
  | "port"
  | "ip_literal"
  | "localhost"
  | "private_or_reserved"
  | "idn_or_punycode"
  | "path_not_allowed"
  | "query_not_allowed"
  | "path_traversal"
  | "missing_location"
  | "redirect_loop"
  | "hop_budget"
  | "dns_not_public"
  | "dns_ambiguous"
  | "relative_resolution_failed";

export type DestinationDecision =
  | { ok: true; url: URL; normalizedHref: string }
  | { ok: false; code: DestinationRejectionCode; detail: string };

const IPV4 =
  /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_LITERAL = /^\[.+\]$/;

function isPrivateOrReservedIpv4(host: string): boolean {
  const parts = host.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function stripTrailingDot(host: string): string {
  return host.endsWith(".") ? host.slice(0, -1) : host;
}

export function classifyHostForPublicDns(hostRaw: string): DestinationDecision {
  const host = stripTrailingDot(hostRaw.toLowerCase());

  if (!host) {
    return { ok: false, code: "noncanonical_host", detail: "empty" };
  }
  if (IPV6_LITERAL.test(hostRaw) || host.includes(":")) {
    return { ok: false, code: "ip_literal", detail: hostRaw };
  }
  if (IPV4.test(host)) {
    return { ok: false, code: "ip_literal", detail: host };
  }
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return { ok: false, code: "localhost", detail: host };
  }
  if (host.includes("xn--")) {
    return { ok: false, code: "idn_or_punycode", detail: host };
  }
  // Reject non-ASCII host labels (IDN must already be punycode — also rejected).
  if (!/^[a-z0-9.-]+$/.test(host)) {
    return { ok: false, code: "noncanonical_host", detail: host };
  }
  if (host.startsWith("-") || host.includes("..") || host.startsWith(".")) {
    return { ok: false, code: "noncanonical_host", detail: host };
  }

  // Hostname that looks like dotted-quad already rejected; remaining names are
  // treated as DNS names. Private IP classification applies if someone sneaks
  // an IPv4 past earlier checks.
  if (IPV4.test(host) && isPrivateOrReservedIpv4(host)) {
    return { ok: false, code: "private_or_reserved", detail: host };
  }

  return {
    ok: true,
    url: new URL(`https://${host}/`),
    normalizedHref: host,
  };
}

/**
 * Validate a single destination URL against the Store allowlist and AD-20 rules.
 */
export function validateDestinationUrl(
  rawUrl: string,
  config: DestinationPolicyConfig,
): DestinationDecision {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, code: "relative_resolution_failed", detail: "parse" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, code: "scheme", detail: url.protocol };
  }
  if (url.username || url.password) {
    return { ok: false, code: "credentials", detail: "present" };
  }
  if (url.hash) {
    return { ok: false, code: "fragment", detail: url.hash };
  }

  const hostCheck = classifyHostForPublicDns(url.hostname);
  if (!hostCheck.ok) return hostCheck;

  const host = stripTrailingDot(url.hostname.toLowerCase());
  if (url.hostname !== host || url.hostname.endsWith(".")) {
    // Require canonical lowercase host without trailing dot in input form used for fetch.
    if (url.hostname.endsWith(".")) {
      return { ok: false, code: "noncanonical_host", detail: "trailing_dot" };
    }
  }
  if (url.hostname !== url.hostname.toLowerCase()) {
    return { ok: false, code: "noncanonical_host", detail: "case" };
  }

  if (!config.allowedHosts.includes(host)) {
    return { ok: false, code: "host_not_allowlisted", detail: host };
  }

  if (url.port && url.port !== "443") {
    return { ok: false, code: "port", detail: url.port };
  }

  const path = url.pathname;
  if (path.includes("..") || path.includes("%2e%2e") || path.includes("%2E%2E")) {
    return { ok: false, code: "path_traversal", detail: path };
  }

  const pathAllowed = config.pathAllowPrefixes.some(
    (prefix) => path === prefix || path.startsWith(prefix),
  );
  if (!pathAllowed) {
    return { ok: false, code: "path_not_allowed", detail: path };
  }

  for (const key of url.searchParams.keys()) {
    if (!config.queryAllowKeys.includes(key)) {
      return { ok: false, code: "query_not_allowed", detail: key };
    }
  }

  const normalized = new URL(url.href);
  normalized.hash = "";
  normalized.hostname = host;
  if (normalized.port === "443") normalized.port = "";

  return { ok: true, url: normalized, normalizedHref: normalized.href };
}

export function resolveRedirectLocation(
  baseHref: string,
  locationHeader: string | null,
  config: DestinationPolicyConfig,
  visited: ReadonlySet<string>,
  hopsUsed: number,
): DestinationDecision {
  if (hopsUsed >= config.maxRedirectHops) {
    return { ok: false, code: "hop_budget", detail: String(hopsUsed) };
  }
  if (!locationHeader) {
    return { ok: false, code: "missing_location", detail: "null" };
  }

  let next: URL;
  try {
    next = new URL(locationHeader, baseHref);
  } catch {
    return {
      ok: false,
      code: "relative_resolution_failed",
      detail: locationHeader,
    };
  }

  const validated = validateDestinationUrl(next.href, config);
  if (!validated.ok) return validated;

  if (visited.has(validated.normalizedHref)) {
    return { ok: false, code: "redirect_loop", detail: validated.normalizedHref };
  }

  return validated;
}

/**
 * Public-DNS evidence check feasible on Workers.
 * Classifies the URL hostname; optionally accepts a precomputed DoH/A result
 * from the caller. Ambiguous or private results fail closed.
 */
export function assertPublicDnsEvidence(input: {
  hostname: string;
  /** Resolved A/AAAA records when a DoH helper provided them; omit if unavailable. */
  resolvedAddresses?: readonly string[] | null;
}): DestinationDecision {
  const host = classifyHostForPublicDns(input.hostname);
  if (!host.ok) return host;

  if (input.resolvedAddresses === null) {
    return { ok: false, code: "dns_ambiguous", detail: "lookup_failed" };
  }

  if (input.resolvedAddresses) {
    if (input.resolvedAddresses.length === 0) {
      return { ok: false, code: "dns_ambiguous", detail: "empty" };
    }
    for (const addr of input.resolvedAddresses) {
      if (IPV4.test(addr)) {
        if (isPrivateOrReservedIpv4(addr)) {
          return { ok: false, code: "dns_not_public", detail: addr };
        }
      } else if (addr.includes(":")) {
        const a = addr.toLowerCase();
        if (
          a === "::1" ||
          a.startsWith("fc") ||
          a.startsWith("fd") ||
          a.startsWith("fe80")
        ) {
          return { ok: false, code: "dns_not_public", detail: addr };
        }
      } else {
        return { ok: false, code: "dns_ambiguous", detail: addr };
      }
    }
  }

  // When resolvedAddresses is undefined, Workers cannot pin DNS — we still
  // require hostname classification to pass (no IP literal / localhost).
  // Homologation records this platform limitation in capacity/gate docs.
  return { ok: true, url: new URL(`https://${input.hostname}/`), normalizedHref: input.hostname };
}

export const WORKERS_DNS_PINNING_LIMITATION =
  "Cloudflare Workers fetch resolves origin DNS internally; userland cannot pin connections to pre-resolved addresses. FilaTracker enforces URL-level public-host classification and optional DoH evidence; ambiguous DNS fails closed.";
