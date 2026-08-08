import {
  SEARCH_QUERY_MAX_SCALARS,
  SEARCH_QUERY_MAX_UTF8_BYTES,
} from "../contracts/search-page";

export type QueryNormalizationResult =
  | { ok: true; canonical: string | null }
  | { ok: false; reason: "control_character" | "over_limit" };

function isDisallowedControl(code: number): boolean {
  // Allow TAB/LF/CR — they participate in whitespace collapse/trim.
  if (code === 0x09 || code === 0x0a || code === 0x0d) return false;
  return (code >= 0x00 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f);
}

/**
 * Unicode NFKC, trim, collapse whitespace.
 * Empty → null (Home). Rejects non-whitespace control characters and over-limit input.
 */
export function normalizeSearchQuery(
  raw: string | null | undefined,
): QueryNormalizationResult {
  if (raw === null || raw === undefined) {
    return { ok: true, canonical: null };
  }

  for (const ch of raw) {
    const code = ch.codePointAt(0)!;
    if (isDisallowedControl(code)) {
      return { ok: false, reason: "control_character" };
    }
  }

  const normalized = raw.normalize("NFKC").trim().replace(/\s+/g, " ");

  if (normalized.length === 0) {
    return { ok: true, canonical: null };
  }

  const scalarCount = [...normalized].length;
  const utf8Bytes = new TextEncoder().encode(normalized).byteLength;

  if (
    scalarCount > SEARCH_QUERY_MAX_SCALARS ||
    utf8Bytes > SEARCH_QUERY_MAX_UTF8_BYTES
  ) {
    return { ok: false, reason: "over_limit" };
  }

  return { ok: true, canonical: normalized };
}
