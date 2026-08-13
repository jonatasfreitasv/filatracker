/** One-batch SearchCatalog aggregate (AD-25 / Story 1.6 family-intent). */

import type { SearchPage } from "../../contracts";
import {
  SEARCH_INDEX_VERSION,
  SEARCH_MAX_TOTAL_COUNT,
  SEARCH_PAGE_MAX_HITS,
  SEARCH_PARSER_VERSION,
  SEARCH_RPC_ENVELOPE_HEADROOM_BYTES,
  SEARCH_RPC_MAX_UTF8_BYTES,
  SearchPageSchema,
} from "../../contracts/search-page";
import type {
  SearchCatalogPort,
  SearchPageSnapshot,
  SearchPageSnapshotInput,
} from "../../application/ports";
import { buildFtsMatchQuery, tokenizeSearchQuery } from "../../domain/search-query";
import { FAMILY_BY_ID, resolveSearchIntent, TYPE_BY_SLUG } from "../../domain/taxonomy";
import {
  ftsTable,
  readSearchProjectionMeta,
  selectActiveFtsSlot,
  type FtsSlot,
} from "./fts-writer";
import {
  cursorMatchesContext,
  decodeSearchCursor,
  encodeSearchCursor,
  type SearchIntentKind,
  type SearchSortTuple,
} from "./search-cursor";
import {
  ELIGIBLE_JOIN,
  OFFER_SELECT,
  ORDER_SQL,
  type AggregateMeta,
  type OfferRow,
  brandSuggestionsFrom,
  brandSuggestionsStatement,
  cursorSortFrom,
  cursorSql,
  facetFrom,
  familySuggestionsStatement,
  firstRow,
  hydrateHit,
  isClassifiedFtsFailure,
  matchingSql,
  metaStatement,
  rows,
  sameOrderedBoundary,
  suggestionsFrom,
  supportFrom,
  supportStatement,
  validResponseMeta,
} from "./catalog-shared";

const MAX_PAGE_SERIALIZED_BYTES =
  SEARCH_RPC_MAX_UTF8_BYTES - SEARCH_RPC_ENVELOPE_HEADROOM_BYTES;
const DEGRADED_QUALIFICATION = "Busca em modo degradado — resultados via caminho relacional.";

type Scope = {
  familyId: string | null;
  typeId: string | null;
  intentKind: SearchIntentKind;
  typeSlug: string | null;
  tokens: string[];
  useTextMatch: boolean;
};

function logSearchError(code: string, correlationId: string): void {
  console.error("search_catalog", { code, correlationId });
}

function validFtsMeta(meta: AggregateMeta, selectedSlot: FtsSlot): boolean {
  return validResponseMeta(meta) && meta.active_slot === selectedSlot &&
    meta.index_version === SEARCH_INDEX_VERSION &&
    meta.parser_version === SEARCH_PARSER_VERSION &&
    meta.search_projection_epoch === meta.projection_epoch;
}

function scopeSql(scope: Scope): { sql: string; binds: unknown[] } {
  const parts: string[] = [];
  const binds: unknown[] = [];
  if (scope.familyId) {
    parts.push("o.material_family_id = ?");
    binds.push(scope.familyId);
  }
  if (scope.typeId) {
    parts.push("o.formulation_specific_type_id = ?");
    binds.push(scope.typeId);
  }
  if (scope.useTextMatch && scope.tokens.length > 0) {
    parts.push(`(${matchingSql(scope.tokens.length)})`);
    binds.push(...scope.tokens);
  }
  return {
    sql: parts.length === 0 ? "1" : parts.join(" AND "),
    binds,
  };
}

function facetStatement(db: D1Database, scope: Scope): D1PreparedStatement {
  if (scope.intentKind !== "family" && scope.intentKind !== "type") {
    return db.prepare(`SELECT NULL AS slug, NULL AS label, 0 AS count WHERE 0`);
  }
  const scoped = scopeSql({ ...scope, typeId: null, typeSlug: null, useTextMatch: false, tokens: [] });
  return db.prepare(
    `SELECT st.slug AS slug, st.label AS label, COUNT(*) AS count
     ${ELIGIBLE_JOIN}
       AND o.formulation_specific_type_id IS NOT NULL
       AND ${scoped.sql}
     GROUP BY st.slug, st.label
     ORDER BY count DESC, st.label ASC
     LIMIT 20`,
  ).bind(...scoped.binds);
}

function countStatement(db: D1Database, scope: Scope): D1PreparedStatement {
  const scoped = scopeSql(scope);
  return db.prepare(
    `SELECT COUNT(*) AS n ${ELIGIBLE_JOIN} AND ${scoped.sql}`,
  ).bind(...scoped.binds);
}

function pageStatement(
  db: D1Database,
  scope: Scope,
  sort: SearchSortTuple | null,
  limit: number,
): D1PreparedStatement {
  const scoped = scopeSql(scope);
  const cursor = cursorSql(sort);
  return db.prepare(
    `${OFFER_SELECT} ${ELIGIBLE_JOIN}
       AND ${scoped.sql} ${cursor.sql}
     ORDER BY ${ORDER_SQL} LIMIT ?`,
  ).bind(...scoped.binds, ...cursor.binds, limit + 1);
}

function ftsCountStatement(
  db: D1Database,
  slot: FtsSlot,
  scope: Scope,
): D1PreparedStatement {
  const table = ftsTable(slot);
  const scoped = scopeSql({ ...scope, useTextMatch: false, tokens: [] });
  if (scope.useTextMatch && scope.tokens.length > 0) {
    return db.prepare(
      `SELECT COUNT(*) AS n ${ELIGIBLE_JOIN}
         AND ${scoped.sql}
         AND o.offer_id IN (SELECT offer_id FROM ${table} WHERE ${table} MATCH ?)`,
    ).bind(...scoped.binds, buildFtsMatchQuery(scope.tokens));
  }
  return db.prepare(
    `SELECT COUNT(*) AS n ${ELIGIBLE_JOIN}
       AND ${scoped.sql}
       AND o.offer_id IN (SELECT offer_id FROM ${table})`,
  ).bind(...scoped.binds);
}

function ftsPageStatement(
  db: D1Database,
  slot: FtsSlot,
  scope: Scope,
  sort: SearchSortTuple | null,
  limit: number,
): D1PreparedStatement {
  const table = ftsTable(slot);
  const scoped = scopeSql({ ...scope, useTextMatch: false, tokens: [] });
  const cursor = cursorSql(sort);
  if (scope.useTextMatch && scope.tokens.length > 0) {
    return db.prepare(
      `${OFFER_SELECT} ${ELIGIBLE_JOIN}
         AND ${scoped.sql}
         AND o.offer_id IN (SELECT offer_id FROM ${table} WHERE ${table} MATCH ?)
         ${cursor.sql}
       ORDER BY ${ORDER_SQL} LIMIT ?`,
    ).bind(...scoped.binds, buildFtsMatchQuery(scope.tokens), ...cursor.binds, limit + 1);
  }
  return db.prepare(
    `${OFFER_SELECT} ${ELIGIBLE_JOIN}
       AND ${scoped.sql}
       AND o.offer_id IN (SELECT offer_id FROM ${table})
       ${cursor.sql}
     ORDER BY ${ORDER_SQL} LIMIT ?`,
  ).bind(...scoped.binds, ...cursor.binds, limit + 1);
}

function ftsSymmetricDifferenceStatement(
  db: D1Database,
  slot: FtsSlot,
  scope: Scope,
): D1PreparedStatement {
  const table = ftsTable(slot);
  const rel = scopeSql(scope);
  const idOnly = scopeSql({ ...scope, useTextMatch: false, tokens: [] });
  if (scope.useTextMatch && scope.tokens.length > 0) {
    const match = buildFtsMatchQuery(scope.tokens);
    return db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM (
            SELECT o.offer_id ${ELIGIBLE_JOIN} AND ${rel.sql}
            EXCEPT
            SELECT offer_id FROM ${table} WHERE ${table} MATCH ?
          )) AS relational_only_count,
         (SELECT COUNT(*) FROM (
            SELECT offer_id FROM ${table} WHERE ${table} MATCH ?
            EXCEPT
            SELECT o.offer_id ${ELIGIBLE_JOIN} AND ${rel.sql}
          )) AS fts_only_count`,
    ).bind(...rel.binds, match, match, ...rel.binds);
  }
  return db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM (
          SELECT o.offer_id ${ELIGIBLE_JOIN} AND ${idOnly.sql}
          EXCEPT
          SELECT o.offer_id ${ELIGIBLE_JOIN} AND ${idOnly.sql}
            AND o.offer_id IN (SELECT offer_id FROM ${table})
        )) AS relational_only_count,
       (SELECT COUNT(*) FROM (
          SELECT o.offer_id ${ELIGIBLE_JOIN} AND ${idOnly.sql}
            AND o.offer_id IN (SELECT offer_id FROM ${table})
          EXCEPT
          SELECT o.offer_id ${ELIGIBLE_JOIN} AND ${idOnly.sql}
        )) AS fts_only_count`,
  ).bind(...idOnly.binds, ...idOnly.binds, ...idOnly.binds, ...idOnly.binds);
}

function emptyPage(
  query: string | null,
  storeSupport: SearchPage["storeSupport"],
  suggestions: SearchPage["materialFamilySuggestions"],
  brands: SearchPage["brandSuggestions"],
): SearchPage {
  return {
    query,
    hits: [],
    totalCount: 0,
    materialFamilySuggestions: suggestions,
    brandSuggestions: brands,
    specificTypeFacet: [],
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

function resolveScope(input: SearchPageSnapshotInput):
  | { ok: true; scope: Scope; tokenized: Extract<ReturnType<typeof tokenizeSearchQuery>, { ok: true }> }
  | { ok: false; reason: "invalid" } {
  const tokenized = tokenizeSearchQuery(input.q);
  if (!tokenized.ok) return { ok: false, reason: "invalid" };

  let typeId: string | null = null;
  let typeSlug: string | null = null;
  if (input.type) {
    const type = TYPE_BY_SLUG.get(input.type);
    if (!type) return { ok: false, reason: "invalid" };
    typeId = type.id;
    typeSlug = type.slug;
  }

  const joined = tokenized.tokens.join(" ");
  const intent = resolveSearchIntent(joined);
  let familyId: string | null = null;
  let intentKind: SearchIntentKind = "text";

  if (intent.kind === "family") {
    familyId = intent.family.id;
    intentKind = "family";
  } else if (intent.kind === "type") {
    familyId = FAMILY_BY_ID.get(intent.type.familyId)?.id ?? null;
    typeId = intent.type.id;
    typeSlug = intent.type.slug;
    intentKind = "type";
  }

  const useTextMatch = intentKind === "text" && tokenized.tokens.length > 0;
  return {
    ok: true,
    tokenized,
    scope: { familyId, typeId, intentKind, typeSlug, tokens: tokenized.tokens, useTextMatch },
  };
}

export function createD1SearchCatalog(db: D1Database): SearchCatalogPort {
  return {
    async getSearchPageSnapshot(input: SearchPageSnapshotInput): Promise<SearchPageSnapshot> {
      const resolved = resolveScope(input);
      if (!resolved.ok) {
        return { outcome: "invalid", projectionEpoch: 0, supportEpoch: 0, searchWriteGeneration: 0,
          errors: ["Revise sua busca e tente novamente."] };
      }
      const { scope, tokenized } = resolved;

      const decodedCursor = input.cursor ? decodeSearchCursor(input.cursor) : null;
      if (decodedCursor && !decodedCursor.ok) {
        return { outcome: "invalid", projectionEpoch: 0, supportEpoch: 0, searchWriteGeneration: 0,
          errors: ["Cursor inválido. Refaça a busca."] };
      }
      const sort = decodedCursor?.ok ? decodedCursor.payload.sort : null;
      const limit = Math.min(input.limit ?? SEARCH_PAGE_MAX_HITS, SEARCH_PAGE_MAX_HITS);

      const isHome =
        tokenized.canonical === null &&
        tokenized.tokens.length === 0 &&
        !scope.typeId &&
        scope.intentKind === "text";

      if (isHome) {
        if (input.cursor !== undefined) {
          return { outcome: "invalid", projectionEpoch: 0, supportEpoch: 0,
            searchWriteGeneration: 0, errors: ["Cursor inválido. Refaça a busca."] };
        }
        try {
          const result = await db.batch([
            metaStatement(db), supportStatement(db),
            familySuggestionsStatement(db), brandSuggestionsStatement(db),
          ]);
          const meta = firstRow<AggregateMeta>(result[0]);
          if (!meta || !validResponseMeta(meta)) throw new Error("meta");
          const page = emptyPage(
            tokenized.canonical,
            supportFrom(result[1]),
            suggestionsFrom(result[2]),
            brandSuggestionsFrom(result[3]),
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

      if (tokenized.tokens.length === 0 && !scope.familyId && !scope.typeId) {
        if (input.cursor !== undefined) {
          return { outcome: "invalid", projectionEpoch: 0, supportEpoch: 0,
            searchWriteGeneration: 0, errors: ["Cursor inválido. Refaça a busca."] };
        }
        try {
          const result = await db.batch([
            metaStatement(db), supportStatement(db),
            familySuggestionsStatement(db), brandSuggestionsStatement(db),
          ]);
          const meta = firstRow<AggregateMeta>(result[0]);
          if (!meta || !validResponseMeta(meta)) throw new Error("meta");
          const page = emptyPage(
            tokenized.canonical,
            supportFrom(result[1]),
            suggestionsFrom(result[2]),
            brandSuggestionsFrom(result[3]),
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
          metaStatement(db), supportStatement(db),
          familySuggestionsStatement(db), brandSuggestionsStatement(db),
          facetStatement(db, scope),
          countStatement(db, scope), pageStatement(db, scope, sort, limit),
        ];
        if (selectedSlot !== null) {
          statements.push(ftsCountStatement(db, selectedSlot, scope));
          statements.push(ftsPageStatement(db, selectedSlot, scope, sort, limit));
          statements.push(ftsSymmetricDifferenceStatement(db, selectedSlot, scope));
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
        intentKind: scope.intentKind,
        typeSlug: scope.typeSlug,
        taxonomyVersion: meta.taxonomy_version,
        projectionEpoch: meta.projection_epoch,
        supportEpoch: meta.support_epoch,
        searchWriteGeneration: meta.search_write_generation,
        limit,
      })) {
        return { outcome: "invalid", projectionEpoch: meta.projection_epoch,
          supportEpoch: meta.support_epoch, searchWriteGeneration: meta.search_write_generation,
          errors: ["Cursor expirado. Refaça a busca."] };
      }

      const relationalRows = rows<OfferRow>(result[6]);
      const totalCount = firstRow<{ n: number }>(result[5])?.n ?? 0;
      if (
        !Number.isSafeInteger(totalCount) || totalCount < 0 ||
        totalCount > SEARCH_MAX_TOTAL_COUNT
      ) {
        return { outcome: "overloaded", projectionEpoch: meta.projection_epoch,
          supportEpoch: meta.support_epoch, searchWriteGeneration: meta.search_write_generation };
      }
      const activeCount = ftsBatchFailed || selectedSlot === null
        ? null
        : firstRow<{ n: number }>(result[7])?.n ?? null;
      const activeRows = ftsBatchFailed || selectedSlot === null
        ? []
        : rows<OfferRow>(result[8]);
      const symmetricDifference = ftsBatchFailed || selectedSlot === null
        ? null
        : firstRow<{ relational_only_count: number; fts_only_count: number }>(result[9]);
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
            v: 2, queryDigest: tokenized.queryDigest,
            intentKind: scope.intentKind,
            typeSlug: scope.typeSlug,
            taxonomyVersion: meta.taxonomy_version,
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
        brandSuggestions: brandSuggestionsFrom(result[3]),
        specificTypeFacet: facetFrom(result[4]),
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

export { readSearchProjectionMeta, ELIGIBLE_JOIN, ORDER_SQL, hydrateHit };
