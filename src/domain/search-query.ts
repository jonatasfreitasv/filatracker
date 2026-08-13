import {
  SEARCH_PAGE_MAX_TOKENS,
  SEARCH_QUERY_MAX_SCALARS,
  SEARCH_QUERY_MAX_UTF8_BYTES,
  SEARCH_TOKEN_MAX_UTF8_BYTES,
} from "../contracts/search-page";

export type QueryNormalizationResult =
  | { ok: true; canonical: string | null }
  | { ok: false; reason: "control_character" | "over_limit" };

export type TokenizeResult =
  | {
      ok: true;
      canonical: string | null;
      tokens: string[];
      /** Compact deterministic digest of canonical tokens for cursor binding. */
      queryDigest: string;
    }
  | { ok: false; reason: "control_character" | "over_limit" | "too_many_tokens" };

function lexCanonical(value: string): string[] {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}+-]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token));
}

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

  // Reject the raw value before NFKC/trim/collapse can shrink abusive input.
  if (
    [...raw].length > SEARCH_QUERY_MAX_SCALARS ||
    new TextEncoder().encode(raw).byteLength > SEARCH_QUERY_MAX_UTF8_BYTES
  ) {
    return { ok: false, reason: "over_limit" };
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

/**
 * Canonical tokenizer shared by FTS and relational fallback.
 *
 * - NFKC + trim + whitespace collapse (via normalizeSearchQuery)
 * - pt-BR: case-fold via toLocaleLowerCase("pt-BR"); unicode61 remove_diacritics
 *   equivalence is matched by stripping combining marks after NFD for match keys
 * - punctuation / quotes / operators escaped (never inherit raw FTS/LIKE operators)
 * - hyphens and `PLA+` kept as token characters where alphanumeric-adjacent
 * - at most 12 tokens; AND semantics across tokens
 */
export function tokenizeSearchQuery(
  raw: string | null | undefined,
): TokenizeResult {
  const normalized = normalizeSearchQuery(raw);
  if (!normalized.ok) return normalized;
  if (normalized.canonical === null) {
    return {
      ok: true,
      canonical: null,
      tokens: [],
      queryDigest: "0000000000000000",
    };
  }

  const rough = lexCanonical(normalized.canonical);

  const tokens: string[] = [];
  for (const piece of rough) {
    // Drop pure punctuation leftovers like "+" or "-"
    if (!/[\p{L}\p{N}]/u.test(piece)) continue;
    const utf8 = new TextEncoder().encode(piece).byteLength;
    if (utf8 > SEARCH_TOKEN_MAX_UTF8_BYTES) {
      return { ok: false, reason: "over_limit" };
    }
    tokens.push(piece);
    if (tokens.length > SEARCH_PAGE_MAX_TOKENS) {
      return { ok: false, reason: "too_many_tokens" };
    }
  }

  if (tokens.length === 0) {
    // Keep the normalized query when punctuation/operator-only input survives
    // normalize but yields no alphanumeric tokens — callers treat that as
    // honest no-match, not the Home null-query invariant.
    return {
      ok: true,
      canonical: normalized.canonical,
      tokens: [],
      queryDigest: "0000000000000000",
    };
  }

  return {
    ok: true,
    canonical: normalized.canonical,
    tokens,
    queryDigest: digestQueryTokens(tokens),
  };
}

/** 64-bit FNV-1a over UTF-8 canonical tokens; compact and deterministic. */
export function digestQueryTokens(tokens: readonly string[]): string {
  let hash = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(tokens.join("\u001f"));
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Escape a canonical token for FTS5 MATCH — strip operators, quote phrase.
 * unicode61 treats the quoted token as a literal term.
 */
export function toFtsMatchTerm(token: string): string {
  if (!token || !/[\p{L}\p{N}]/u.test(token)) return '""';
  return `"${token.replace(/"/g, "")}"`;
}

/** Build AND MATCH expression from canonical tokens. */
export function buildFtsMatchQuery(tokens: readonly string[]): string {
  return tokens.map(toFtsMatchTerm).filter((t) => t !== '""').join(" AND ");
}

/**
 * Escape a canonical token for SQL LIKE fallback.
 * Caps already enforced at tokenize time so pattern + % stays ≤ 50 bytes.
 */
export function toLikePattern(token: string): string {
  const escaped = token
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  return `%${escaped}%`;
}

/**
 * Build the one persisted searchable document used by FTS and fallback.
 * Field boundaries are token boundaries; raw merchant punctuation/operators
 * never survive as query syntax.
 */
export function buildSearchDocument(
  fields: readonly (string | null | undefined)[],
): string {
  const tokens = new Set<string>();
  for (const field of fields) {
    if (!field) continue;
    if ([...field].some((ch) => isDisallowedControl(ch.codePointAt(0)!))) continue;
    const normalized = field.normalize("NFKC").trim().replace(/\s+/g, " ");
    for (const token of lexCanonical(normalized)) {
      if (new TextEncoder().encode(token).byteLength <= SEARCH_TOKEN_MAX_UTF8_BYTES) {
        tokens.add(token);
      }
    }
  }

  const bounded: string[] = [];
  let scalarCount = 0;
  for (const token of tokens) {
    const tokenScalars = [...token].length;
    const separator = bounded.length === 0 ? 0 : 1;
    if (scalarCount + separator + tokenScalars > 2048) break;
    bounded.push(token);
    scalarCount += separator + tokenScalars;
  }
  return bounded.join(" ");
}
