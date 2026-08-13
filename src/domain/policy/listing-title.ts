/**
 * Bounded listing-title normalization for publish + search (Story 1.4).
 * Source: observation titleEvidence only — never description or raw HTML.
 */

export const LISTING_TITLE_MAX_CHARS = 512 as const;

function isDisallowedControl(code: number): boolean {
  if (code === 0x09 || code === 0x0a || code === 0x0d) return false;
  return (code >= 0x00 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f);
}

/**
 * NFKC, trim, collapse whitespace. Rejects controls and over-bound input.
 * Empty → null (honest omit).
 */
export function normalizeListingTitle(
  raw: string | null | undefined,
): string | null {
  if (raw === null || raw === undefined) return null;

  for (const ch of raw) {
    const code = ch.codePointAt(0)!;
    if (isDisallowedControl(code)) return null;
  }

  const normalized = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (normalized.length === 0) return null;
  if ([...normalized].length > LISTING_TITLE_MAX_CHARS) return null;
  return normalized;
}
