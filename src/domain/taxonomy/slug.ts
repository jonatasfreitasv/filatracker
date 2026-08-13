/**
 * Canonical taxonomy slug grammar (Story 1.6). Locked — do not bikeshed.
 * NFKC → ASCII fold → lowercase hyphenated `[a-z0-9]+(?:-[a-z0-9]+)*`, max 128.
 */

export const TAXONOMY_SLUG_MAX = 128;
export const TAXONOMY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isCanonicalSlug(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= TAXONOMY_SLUG_MAX &&
    TAXONOMY_SLUG_PATTERN.test(value)
  );
}

/**
 * Fold a label or path segment into the canonical slug grammar.
 * Returns null when the result is empty, over-long, or not a valid slug.
 * Does not invent slugs for punctuation-only labels such as `PLA+` — those
 * are assigned explicitly in reviewed fixtures (`pla-plus`).
 */
export function canonicalizeSlug(raw: string): string | null {
  const folded = raw
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!isCanonicalSlug(folded)) return null;
  return folded;
}

/** True when a raw path segment is illegal before any DB lookup. */
export function isIllegalSlugInput(raw: string): boolean {
  if (raw.length === 0) return true;
  if (/[/\s]/.test(raw)) return true;
  if (raw.includes("..")) return true;
  if (/%2f/i.test(raw)) return true;
  if (raw.includes("%")) return true;
  return false;
}
