/** One-batch SearchCatalog aggregate (AD-25 / Story 1.4 review hardening). */

import type {
  MaterialFamilySuggestion,
  SearchHit,
  SearchPage,
  StoreSupportSummary,
} from "../../contracts";
import {
  MONEY_CENTAVOS_MAX,
  SEARCH_INDEX_VERSION,
  SEARCH_MAX_TOTAL_COUNT,
  SEARCH_PAGE_MAX_HITS,
  SEARCH_PAGE_MAX_STORE_SUPPORT,
  SEARCH_PAGE_MAX_SUGGESTIONS,
  SEARCH_PARSER_VERSION,
  SEARCH_RPC_ENVELOPE_HEADROOM_BYTES,
  SEARCH_RPC_MAX_UTF8_BYTES,
  SearchPageSchema,
  canonicalizeUtcInstant,
} from "../../contracts/search-page";
import type { SpecificType } from "../../contracts/offer";
import type {
  SearchCatalogPort,
  SearchPageSnapshot,
  SearchPageSnapshotInput,
} from "../../application/ports";
import { derivePricePerKgCentavos } from "../../domain/policy/price-per-kg";
import { deriveStale } from "../../domain/policy/validate";
import { buildFtsMatchQuery, tokenizeSearchQuery } from "../../domain/search-query";
import {
  ftsTable,
  readSearchProjectionMeta,
  selectActiveFtsSlot,
  type FtsSlot,
} from "./fts-writer";
import {
  availabilityRank,
  cursorMatchesContext,
  decodeSearchCursor,
  encodeSearchCursor,
  type SearchSortTuple,
} from "./search-cursor";

const MAX_PAGE_SERIALIZED_BYTES =
  SEARCH_RPC_MAX_UTF8_BYTES - SEARCH_RPC_ENVELOPE_HEADROOM_BYTES;
const DEGRADED_QUALIFICATION = "Busca em modo degradado — resultados via caminho relacional.";

type OfferRow = {
  offer_id: string;
  store_id: string;
  brand: string | null;
  specific_type: string | null;
  material_family: string | null;
  color: string | null;
  diameter_mm: string | null;
  mass_grams: number | null;
  listing_title: string | null;
  listing_price_centavos: number | null;
  availability: "available" | "unavailable" | "unknown";
  observed_at: string;
  stale_after: string;
  display_name: string | null;
};

type AggregateMeta = {
  projection_epoch: number;
  support_epoch: number;
  active_slot: FtsSlot;
  index_version: number;
  parser_version: number;
  search_projection_epoch: number;
  search_write_generation: number;
};

const ELIGIBLE_JOIN = `
  FROM offers o
  INNER JOIN store_state ss ON ss.store_id = o.store_id
  WHERE o.visible = 1 AND o.tombstoned = 0
    AND ss.support_state IN ('active', 'degraded')
`;

const AVAILABILITY_RANK_SQL = `CASE o.availability
  WHEN 'available' THEN 0 WHEN 'unknown' THEN 1 ELSE 2 END`;
const NULL_PRICE_RANK_SQL = `CASE WHEN o.listing_price_centavos IS NULL THEN 1 ELSE 0 END`;
const ORDER_SQL = `${AVAILABILITY_RANK_SQL} ASC,
  ${NULL_PRICE_RANK_SQL} ASC,
  o.listing_price_centavos ASC,
  o.observed_at DESC,
  o.offer_id ASC`;

function matchingSql(tokenCount: number): string {
  return Array.from(
    { length: tokenCount },
    () => `instr(' ' || o.search_text || ' ', ' ' || ? || ' ') > 0`,
  ).join(" AND ");
}

function cursorSql(sort: SearchSortTuple | null): {
  sql: string;
  binds: unknown[];
} {
  if (!sort) return { sql: "", binds: [] };
  const priceNullRank = sort.listingPriceCentavos === null ? 1 : 0;
  const price = sort.listingPriceCentavos ?? 0;
  return {
    sql: `AND (
      ${AVAILABILITY_RANK_SQL} > ?
      OR (${AVAILABILITY_RANK_SQL} = ? AND ${NULL_PRICE_RANK_SQL} > ?)
      OR (${AVAILABILITY_RANK_SQL} = ? AND ${NULL_PRICE_RANK_SQL} = ?
          AND COALESCE(o.listing_price_centavos, 0) > ?)
      OR (${AVAILABILITY_RANK_SQL} = ? AND ${NULL_PRICE_RANK_SQL} = ?
          AND COALESCE(o.listing_price_centavos, 0) = ? AND o.observed_at < ?)
      OR (${AVAILABILITY_RANK_SQL} = ? AND ${NULL_PRICE_RANK_SQL} = ?
          AND COALESCE(o.listing_price_centavos, 0) = ? AND o.observed_at = ?
          AND o.offer_id > ?)
    )`,
    binds: [
      sort.availabilityRank,
      sort.availabilityRank, priceNullRank,
      sort.availabilityRank, priceNullRank, price,
      sort.availabilityRank, priceNullRank, price, sort.observedAt,
      sort.availabilityRank, priceNullRank, price, sort.observedAt, sort.offerId,
    ],
  };
}

function metaStatement(db: D1Database): D1PreparedStatement {
  return db.prepare(
    `SELECT pm.projection_epoch, pm.support_epoch, sm.active_slot,
            sm.index_version, sm.parser_version,
            sm.projection_epoch AS search_projection_epoch,
            sm.search_write_generation
     FROM projection_meta pm
     INNER JOIN search_projection_meta sm ON sm.id = pm.id
     WHERE pm.id = 1`,
  );
}

function supportStatement(db: D1Database): D1PreparedStatement {
  return db.prepare(
    `SELECT store_id, COALESCE(display_name, store_id) AS display_name, support_state
     FROM store_state
     ORDER BY CASE support_state
       WHEN 'active' THEN 0
       WHEN 'degraded' THEN 1
       WHEN 'unsupported' THEN 2
       ELSE 3
     END ASC, store_id ASC
     LIMIT ?`,
  ).bind(SEARCH_PAGE_MAX_STORE_SUPPORT);
}

function suggestionsStatement(db: D1Database): D1PreparedStatement {
  return db.prepare(
    `SELECT DISTINCT o.material_family AS label ${ELIGIBLE_JOIN}
       AND o.material_family IS NOT NULL
     ORDER BY o.material_family ASC LIMIT ?`,
  ).bind(SEARCH_PAGE_MAX_SUGGESTIONS);
}

function countStatement(db: D1Database, tokens: readonly string[]): D1PreparedStatement {
  return db.prepare(
    `SELECT COUNT(*) AS n ${ELIGIBLE_JOIN} AND (${matchingSql(tokens.length)})`,
  ).bind(...tokens);
}

function pageStatement(
  db: D1Database,
  tokens: readonly string[],
  sort: SearchSortTuple | null,
  limit: number,
): D1PreparedStatement {
  const cursor = cursorSql(sort);
  return db.prepare(
    `SELECT o.offer_id, o.store_id, o.brand, o.specific_type, o.material_family,
            o.color, o.diameter_mm, o.mass_grams, o.listing_title,
            o.listing_price_centavos, o.availability, o.observed_at, o.stale_after,
            ss.display_name
     ${ELIGIBLE_JOIN} AND (${matchingSql(tokens.length)}) ${cursor.sql}
     ORDER BY ${ORDER_SQL} LIMIT ?`,
  ).bind(...tokens, ...cursor.binds, limit + 1);
}

function ftsCountStatement(
  db: D1Database,
  slot: FtsSlot,
  tokens: readonly string[],
): D1PreparedStatement {
  const table = ftsTable(slot);
  const match = buildFtsMatchQuery(tokens);
  return db.prepare(
    `SELECT COUNT(*) AS n FROM ${table} WHERE ${table} MATCH ?`,
  ).bind(match);
}

function ftsPageStatement(
  db: D1Database,
  slot: FtsSlot,
  tokens: readonly string[],
  sort: SearchSortTuple | null,
  limit: number,
): D1PreparedStatement {
  const table = ftsTable(slot);
  const cursor = cursorSql(sort);
  return db.prepare(
    `SELECT o.offer_id, o.store_id, o.brand, o.specific_type, o.material_family,
            o.color, o.diameter_mm, o.mass_grams, o.listing_title,
            o.listing_price_centavos, o.availability, o.observed_at, o.stale_after,
            ss.display_name
     ${ELIGIBLE_JOIN}
       AND o.offer_id IN (SELECT offer_id FROM ${table} WHERE ${table} MATCH ?)
       ${cursor.sql}
     ORDER BY ${ORDER_SQL} LIMIT ?`,
  ).bind(buildFtsMatchQuery(tokens), ...cursor.binds, limit + 1);
}

function ftsSymmetricDifferenceStatement(
  db: D1Database,
  slot: FtsSlot,
  tokens: readonly string[],
): D1PreparedStatement {
  const table = ftsTable(slot);
  const match = buildFtsMatchQuery(tokens);
  return db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM (
          SELECT o.offer_id ${ELIGIBLE_JOIN} AND (${matchingSql(tokens.length)})
          EXCEPT
          SELECT offer_id FROM ${table} WHERE ${table} MATCH ?
        )) AS relational_only_count,
       (SELECT COUNT(*) FROM (
          SELECT offer_id FROM ${table} WHERE ${table} MATCH ?
          EXCEPT
          SELECT o.offer_id ${ELIGIBLE_JOIN} AND (${matchingSql(tokens.length)})
        )) AS fts_only_count`,
  ).bind(...tokens, match, match, ...tokens);
}

function firstRow<T>(result: D1Result | undefined): T | null {
  return (result?.results?.[0] as T | undefined) ?? null;
}

function rows<T>(result: D1Result | undefined): T[] {
  return (result?.results as T[] | undefined) ?? [];
}

function hydrateHit(row: OfferRow, evaluatedAt: Date): SearchHit {
  const fallback = [row.brand, row.material_family].filter(Boolean).join(" ") || row.offer_id;
  const title = (row.listing_title?.trim() || fallback).slice(0, 512);
  const diameter = row.diameter_mm === null ? null : Number(row.diameter_mm);
  const massGrams = row.mass_grams !== null && Number.isSafeInteger(row.mass_grams) &&
      row.mass_grams > 0 && row.mass_grams <= MONEY_CENTAVOS_MAX
    ? row.mass_grams
    : null;
  const listingPriceCentavos = row.listing_price_centavos !== null &&
      Number.isSafeInteger(row.listing_price_centavos) && row.listing_price_centavos > 0 &&
      row.listing_price_centavos <= MONEY_CENTAVOS_MAX
    ? row.listing_price_centavos
    : null;
  return {
    kind: "offer",
    id: row.offer_id,
    title,
    brandName: row.brand,
    materialFamily: row.material_family,
    specificTypeLabel: null,
    color: row.color,
    diameterMm: diameter !== null && Number.isFinite(diameter) && diameter > 0 && diameter <= 1000
      ? diameter
      : null,
    massGrams,
    listingPriceCentavos,
    pricePerKgCentavos: derivePricePerKgCentavos({
      listingPriceCentavos,
      massGrams,
      specificType: row.specific_type as SpecificType | null,
    }),
    availability: row.availability,
    stale: deriveStale({ lastPublishedObservedAt: row.observed_at, now: evaluatedAt }),
    storeId: row.store_id,
    storeName: row.display_name,
    observedAt: row.observed_at,
  };
}

function supportFrom(result: D1Result | undefined): StoreSupportSummary[] {
  return rows<{ store_id: string; display_name: string; support_state: StoreSupportSummary["supportState"] }>(result)
    .map((row) => ({
      storeId: row.store_id,
      displayName: row.display_name,
      supportState: row.support_state,
    }));
}

function suggestionsFrom(result: D1Result | undefined): MaterialFamilySuggestion[] {
  return rows<{ label: string }>(result).map(({ label }) => ({ id: label, slug: label, label }));
}

function emptyPage(
  query: string | null,
  storeSupport: StoreSupportSummary[],
  suggestions: MaterialFamilySuggestion[],
): SearchPage {
  return {
    query,
    hits: [],
    totalCount: 0,
    materialFamilySuggestions: suggestions,
    storeSupport,
    nextCursor: null,
    hasNextPage: false,
    limits: { maxHits: 50, maxQueryScalars: 120, maxQueryUtf8Bytes: 512, maxCursorUtf8Bytes: 1024 },
  };
}

function pageWithinWireBounds(page: SearchPage): boolean {
  return SearchPageSchema.safeParse(page).success &&
    new TextEncoder().encode(JSON.stringify(page)).byteLength <= MAX_PAGE_SERIALIZED_BYTES;
}

function cursorSortFrom(row: OfferRow): SearchSortTuple | null {
  const price = row.listing_price_centavos;
  const observedAt = canonicalizeUtcInstant(row.observed_at);
  if (
    (row.availability !== "available" && row.availability !== "unknown" &&
      row.availability !== "unavailable") ||
    (price !== null && (!Number.isSafeInteger(price) || price <= 0 ||
      price > MONEY_CENTAVOS_MAX)) ||
    observedAt === null || observedAt !== row.observed_at ||
    typeof row.offer_id !== "string" || row.offer_id.length < 1 ||
    row.offer_id.length > 128
  ) {
    return null;
  }
  return {
    availabilityRank: availabilityRank(row.availability),
    listingPriceCentavos: price,
    observedAt,
    offerId: row.offer_id,
  };
}

function logSearchError(code: string, correlationId: string): void {
  console.error("search_catalog", { code, correlationId });
}

function safeEpoch(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validResponseMeta(meta: AggregateMeta): boolean {
  return safeEpoch(meta.projection_epoch) && safeEpoch(meta.support_epoch) &&
    safeEpoch(meta.search_projection_epoch) && safeEpoch(meta.search_write_generation);
}

function validFtsMeta(meta: AggregateMeta, selectedSlot: FtsSlot): boolean {
  return validResponseMeta(meta) && meta.active_slot === selectedSlot &&
    meta.index_version === SEARCH_INDEX_VERSION &&
    meta.parser_version === SEARCH_PARSER_VERSION &&
    meta.search_projection_epoch === meta.projection_epoch;
}

function sameOrderedBoundary(
  ftsRows: readonly OfferRow[],
  relationalRows: readonly OfferRow[],
): boolean {
  return ftsRows.length === relationalRows.length &&
    ftsRows.every((row, index) => row.offer_id === relationalRows[index]?.offer_id);
}

function isClassifiedFtsFailure(error: unknown): boolean {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current; depth += 1) {
    if (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
    } else {
      break;
    }
  }
  const text = messages.join(" ");
  return /fts5|search_fts_[ab]|malformed\s+match|unable to use function\s+match/i.test(text);
}

export function createD1SearchCatalog(db: D1Database): SearchCatalogPort {
  return {
    async getSearchPageSnapshot(input: SearchPageSnapshotInput): Promise<SearchPageSnapshot> {
      const tokenized = tokenizeSearchQuery(input.q);
      if (!tokenized.ok) {
        return { outcome: "invalid", projectionEpoch: 0, supportEpoch: 0, searchWriteGeneration: 0,
          errors: ["Revise sua busca e tente novamente."] };
      }

      const decodedCursor = input.cursor ? decodeSearchCursor(input.cursor) : null;
      if (decodedCursor && !decodedCursor.ok) {
        return { outcome: "invalid", projectionEpoch: 0, supportEpoch: 0, searchWriteGeneration: 0,
          errors: ["Cursor inválido. Refaça a busca."] };
      }
      const sort = decodedCursor?.ok ? decodedCursor.payload.sort : null;
      const limit = Math.min(input.limit ?? SEARCH_PAGE_MAX_HITS, SEARCH_PAGE_MAX_HITS);

      // Empty tokens: Home null-query (canonical null) or punctuation-only no-match.
      if (tokenized.tokens.length === 0) {
        if (input.cursor !== undefined) {
          return { outcome: "invalid", projectionEpoch: 0, supportEpoch: 0,
            searchWriteGeneration: 0, errors: ["Cursor inválido. Refaça a busca."] };
        }
        try {
          const result = await db.batch([metaStatement(db), supportStatement(db), suggestionsStatement(db)]);
          const meta = firstRow<AggregateMeta>(result[0]);
          if (!meta || !validResponseMeta(meta)) throw new Error("meta");
          const page = emptyPage(
            tokenized.canonical,
            supportFrom(result[1]),
            suggestionsFrom(result[2]),
          );
          if (!pageWithinWireBounds(page)) {
            return { outcome: "overloaded" as const, projectionEpoch: meta.projection_epoch,
              supportEpoch: meta.support_epoch,
              searchWriteGeneration: meta.search_write_generation };
          }
          return {
            outcome: "ok", projectionEpoch: meta.projection_epoch, supportEpoch: meta.support_epoch,
            searchWriteGeneration: meta.search_write_generation,
            page, qualification: null,
          };
        } catch {
          logSearchError("empty_snapshot_unavailable", input.correlationId);
          return { outcome: "unavailable", projectionEpoch: 0, supportEpoch: 0, searchWriteGeneration: 0 };
        }
      }

      const executeAggregate = async (selectedSlot: FtsSlot | null): Promise<D1Result[]> => {
        const statements = [
          metaStatement(db), supportStatement(db), suggestionsStatement(db),
          countStatement(db, tokenized.tokens), pageStatement(db, tokenized.tokens, sort, limit),
        ];
        if (selectedSlot !== null) {
          statements.push(ftsCountStatement(db, selectedSlot, tokenized.tokens));
          statements.push(ftsPageStatement(db, selectedSlot, tokenized.tokens, sort, limit));
          statements.push(ftsSymmetricDifferenceStatement(db, selectedSlot, tokenized.tokens));
        }
        return db.batch(statements);
      };

      let selectedSlot: FtsSlot | null = null;
      try {
        selectedSlot = await selectActiveFtsSlot(db);
      } catch {
        logSearchError("fts_selector_failed", input.correlationId);
      }

      let result: D1Result[];
      let ftsBatchFailed = false;
      try {
        result = await executeAggregate(selectedSlot);
      } catch (error) {
        if (selectedSlot === null || !isClassifiedFtsFailure(error)) {
          logSearchError("aggregate_batch_failed", input.correlationId);
          return { outcome: "unavailable", projectionEpoch: 0, supportEpoch: 0, searchWriteGeneration: 0 };
        }
        ftsBatchFailed = true;
        logSearchError("fts_batch_failed", input.correlationId);
        try {
          result = await executeAggregate(null);
        } catch {
          logSearchError("fallback_batch_failed", input.correlationId);
          return { outcome: "unavailable", projectionEpoch: 0, supportEpoch: 0, searchWriteGeneration: 0 };
        }
      }

      const meta = firstRow<AggregateMeta>(result[0]);
      if (!meta || !validResponseMeta(meta)) {
        return { outcome: "unavailable", projectionEpoch: 0, supportEpoch: 0, searchWriteGeneration: 0 };
      }
      if (decodedCursor?.ok && !cursorMatchesContext(decodedCursor.payload, {
        queryDigest: tokenized.queryDigest,
        projectionEpoch: meta.projection_epoch,
        supportEpoch: meta.support_epoch,
        searchWriteGeneration: meta.search_write_generation,
        limit,
      })) {
        return { outcome: "invalid", projectionEpoch: meta.projection_epoch,
          supportEpoch: meta.support_epoch, searchWriteGeneration: meta.search_write_generation,
          errors: ["Cursor expirado. Refaça a busca."] };
      }

      const relationalRows = rows<OfferRow>(result[4]);
      const totalCount = firstRow<{ n: number }>(result[3])?.n ?? 0;
      if (
        !Number.isSafeInteger(totalCount) || totalCount < 0 ||
        totalCount > SEARCH_MAX_TOTAL_COUNT
      ) {
        return { outcome: "overloaded", projectionEpoch: meta.projection_epoch,
          supportEpoch: meta.support_epoch, searchWriteGeneration: meta.search_write_generation };
      }
      const activeCount = ftsBatchFailed || selectedSlot === null
        ? null
        : firstRow<{ n: number }>(result[5])?.n ?? null;
      const activeRows = ftsBatchFailed || selectedSlot === null
        ? []
        : rows<OfferRow>(result[6]);
      const symmetricDifference = ftsBatchFailed || selectedSlot === null
        ? null
        : firstRow<{ relational_only_count: number; fts_only_count: number }>(result[7]);
      const healthy = !ftsBatchFailed && selectedSlot !== null &&
        validFtsMeta(meta, selectedSlot) &&
        activeCount === totalCount &&
        symmetricDifference?.relational_only_count === 0 &&
        symmetricDifference.fts_only_count === 0 &&
        sameOrderedBoundary(activeRows, relationalRows);
      const allRows = healthy ? activeRows : relationalRows;
      const hasNextPage = allRows.length > limit;
      const pageRows = hasNextPage ? allRows.slice(0, limit) : allRows;
      const last = pageRows.at(-1);
      const cursorSort = hasNextPage && last ? cursorSortFrom(last) : null;
      if (hasNextPage && cursorSort === null) {
        return { outcome: "overloaded", projectionEpoch: meta.projection_epoch,
          supportEpoch: meta.support_epoch, searchWriteGeneration: meta.search_write_generation };
      }
      let nextCursor: string | null = null;
      if (cursorSort !== null) {
        try {
          nextCursor = encodeSearchCursor({
            v: 1, queryDigest: tokenized.queryDigest,
            parserVersion: SEARCH_PARSER_VERSION, indexVersion: SEARCH_INDEX_VERSION,
            projectionEpoch: meta.projection_epoch, supportEpoch: meta.support_epoch,
            searchWriteGeneration: meta.search_write_generation,
            limit,
            sort: cursorSort,
          });
        } catch {
          return { outcome: "overloaded", projectionEpoch: meta.projection_epoch,
            supportEpoch: meta.support_epoch, searchWriteGeneration: meta.search_write_generation };
        }
      }

      const page: SearchPage = {
        query: tokenized.canonical,
        hits: pageRows.map((row) => hydrateHit(row, input.evaluatedAt)),
        totalCount,
        materialFamilySuggestions: suggestionsFrom(result[2]),
        storeSupport: supportFrom(result[1]),
        nextCursor,
        hasNextPage,
        limits: { maxHits: 50, maxQueryScalars: 120, maxQueryUtf8Bytes: 512, maxCursorUtf8Bytes: 1024 },
      };
      if (!pageWithinWireBounds(page)) {
        return { outcome: "overloaded", projectionEpoch: meta.projection_epoch,
          supportEpoch: meta.support_epoch, searchWriteGeneration: meta.search_write_generation };
      }

      return {
        outcome: healthy ? "ok" : "degraded",
        projectionEpoch: meta.projection_epoch,
        supportEpoch: meta.support_epoch,
        searchWriteGeneration: meta.search_write_generation,
        page,
        qualification: healthy ? null : DEGRADED_QUALIFICATION,
      };
    },
  };
}

export { readSearchProjectionMeta };
