/** One-batch BrowseCatalog — reuses search eligibility, order, and hydration. */

import type { BrowsePage } from "../../contracts";
import {
  BROWSE_LIMITS,
  BrowsePageSchema,
  SEARCH_INDEX_VERSION,
  SEARCH_MAX_TOTAL_COUNT,
  SEARCH_PAGE_MAX_HITS,
  SEARCH_PARSER_VERSION,
  SEARCH_RPC_ENVELOPE_HEADROOM_BYTES,
  SEARCH_RPC_MAX_UTF8_BYTES,
} from "../../contracts";
import type {
  BrowseCatalogPort,
  BrowsePageSnapshot,
  BrowsePageSnapshotInput,
} from "../../application/ports";
import { digestQueryTokens } from "../../domain/search-query";
import { TYPE_BY_SLUG } from "../../domain/taxonomy";
import {
  ftsTable,
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
const DEGRADED_QUALIFICATION =
  "Navegação em modo degradado — resultados via caminho relacional.";

type ResolvedEntity =
  | { outcome: "canonical"; id: string; slug: string; label: string }
  | { outcome: "alias"; id: string; slug: string; label: string }
  | { outcome: "gone" }
  | { outcome: "unknown" };

function logBrowseError(code: string, correlationId: string): void {
  console.error("browse_catalog", { code, correlationId });
}

function validFtsMeta(meta: AggregateMeta, selectedSlot: FtsSlot): boolean {
  return validResponseMeta(meta) && meta.active_slot === selectedSlot &&
    meta.index_version === SEARCH_INDEX_VERSION &&
    meta.parser_version === SEARCH_PARSER_VERSION &&
    meta.search_projection_epoch === meta.projection_epoch;
}

async function resolveEntity(
  db: D1Database,
  kind: "material" | "brand",
  slug: string,
): Promise<ResolvedEntity> {
  const gone = await db.prepare(
    `SELECT 1 AS present FROM taxonomy_gone WHERE kind = ? AND gone_slug = ? LIMIT 1`,
  ).bind(kind === "material" ? "family" : "brand", slug).first<{ present: number }>();
  if (gone) return { outcome: "gone" };

  if (kind === "material") {
    const canonical = await db.prepare(
      `SELECT family_id AS id, slug, label FROM material_families WHERE slug = ? LIMIT 1`,
    ).bind(slug).first<{ id: string; slug: string; label: string }>();
    if (canonical) return { outcome: "canonical", ...canonical };
    const alias = await db.prepare(
      `SELECT mf.family_id AS id, mf.slug, mf.label
       FROM taxonomy_aliases a
       INNER JOIN material_families mf ON mf.family_id = a.target_id
       WHERE a.kind = 'family' AND a.alias_slug = ? AND a.reviewed = 1
         AND mf.slug <> a.alias_slug
       LIMIT 1`,
    ).bind(slug).first<{ id: string; slug: string; label: string }>();
    if (alias) return { outcome: "alias", ...alias };
    return { outcome: "unknown" };
  }

  const canonical = await db.prepare(
    `SELECT brand_id AS id, slug, label FROM brands WHERE slug = ? LIMIT 1`,
  ).bind(slug).first<{ id: string; slug: string; label: string }>();
  if (canonical) return { outcome: "canonical", ...canonical };
  const alias = await db.prepare(
    `SELECT b.brand_id AS id, b.slug, b.label
     FROM taxonomy_aliases a
     INNER JOIN brands b ON b.brand_id = a.target_id
     WHERE a.kind = 'brand' AND a.alias_slug = ? AND a.reviewed = 1
       AND b.slug <> a.alias_slug
     LIMIT 1`,
  ).bind(slug).first<{ id: string; slug: string; label: string }>();
  if (alias) return { outcome: "alias", ...alias };
  return { outcome: "unknown" };
}

function scopeSql(input: {
  kind: "material" | "brand";
  entityId: string;
  typeId: string | null;
}): { sql: string; binds: unknown[] } {
  const parts: string[] = [];
  const binds: unknown[] = [];
  if (input.kind === "material") {
    parts.push("o.material_family_id = ?");
  } else {
    parts.push("o.brand_id = ?");
  }
  binds.push(input.entityId);
  if (input.typeId) {
    parts.push("o.formulation_specific_type_id = ?");
    binds.push(input.typeId);
  }
  return { sql: parts.join(" AND "), binds };
}

function facetStatement(
  db: D1Database,
  kind: "material" | "brand",
  entityId: string,
): D1PreparedStatement {
  const column = kind === "material" ? "o.material_family_id" : "o.brand_id";
  return db.prepare(
    `SELECT st.slug AS slug, st.label AS label, COUNT(*) AS count
     ${ELIGIBLE_JOIN}
       AND o.formulation_specific_type_id IS NOT NULL
       AND ${column} = ?
     GROUP BY st.slug, st.label
     ORDER BY count DESC, st.label ASC
     LIMIT 20`,
  ).bind(entityId);
}

function countStatement(
  db: D1Database,
  scope: { sql: string; binds: unknown[] },
): D1PreparedStatement {
  return db.prepare(
    `SELECT COUNT(*) AS n ${ELIGIBLE_JOIN} AND ${scope.sql}`,
  ).bind(...scope.binds);
}

function pageStatement(
  db: D1Database,
  scope: { sql: string; binds: unknown[] },
  sort: SearchSortTuple | null,
  limit: number,
): D1PreparedStatement {
  const cursor = cursorSql(sort);
  return db.prepare(
    `${OFFER_SELECT} ${ELIGIBLE_JOIN}
       AND ${scope.sql} ${cursor.sql}
     ORDER BY ${ORDER_SQL} LIMIT ?`,
  ).bind(...scope.binds, ...cursor.binds, limit + 1);
}

function ftsCountStatement(
  db: D1Database,
  slot: FtsSlot,
  scope: { sql: string; binds: unknown[] },
): D1PreparedStatement {
  const table = ftsTable(slot);
  return db.prepare(
    `SELECT COUNT(*) AS n ${ELIGIBLE_JOIN}
       AND ${scope.sql}
       AND o.offer_id IN (SELECT offer_id FROM ${table})`,
  ).bind(...scope.binds);
}

function ftsPageStatement(
  db: D1Database,
  slot: FtsSlot,
  scope: { sql: string; binds: unknown[] },
  sort: SearchSortTuple | null,
  limit: number,
): D1PreparedStatement {
  const table = ftsTable(slot);
  const cursor = cursorSql(sort);
  return db.prepare(
    `${OFFER_SELECT} ${ELIGIBLE_JOIN}
       AND ${scope.sql}
       AND o.offer_id IN (SELECT offer_id FROM ${table})
       ${cursor.sql}
     ORDER BY ${ORDER_SQL} LIMIT ?`,
  ).bind(...scope.binds, ...cursor.binds, limit + 1);
}

function ftsSymmetricDifferenceStatement(
  db: D1Database,
  slot: FtsSlot,
  scope: { sql: string; binds: unknown[] },
): D1PreparedStatement {
  const table = ftsTable(slot);
  return db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM (
          SELECT o.offer_id ${ELIGIBLE_JOIN} AND ${scope.sql}
          EXCEPT
          SELECT o.offer_id ${ELIGIBLE_JOIN} AND ${scope.sql}
            AND o.offer_id IN (SELECT offer_id FROM ${table})
        )) AS relational_only_count,
       (SELECT COUNT(*) FROM (
          SELECT o.offer_id ${ELIGIBLE_JOIN} AND ${scope.sql}
            AND o.offer_id IN (SELECT offer_id FROM ${table})
          EXCEPT
          SELECT o.offer_id ${ELIGIBLE_JOIN} AND ${scope.sql}
        )) AS fts_only_count`,
  ).bind(...scope.binds, ...scope.binds, ...scope.binds, ...scope.binds);
}

function pageWithinWireBounds(page: BrowsePage): boolean {
  return BrowsePageSchema.safeParse(page).success &&
    new TextEncoder().encode(JSON.stringify(page)).byteLength <= MAX_PAGE_SERIALIZED_BYTES;
}

export function createD1BrowseCatalog(db: D1Database): BrowseCatalogPort {
  return {
    async getBrowsePageSnapshot(input: BrowsePageSnapshotInput): Promise<BrowsePageSnapshot> {
      let typeId: string | null = null;
      let typeSlug: string | null = null;
      if (input.type) {
        const type = TYPE_BY_SLUG.get(input.type);
        if (!type) {
          return { outcome: "invalid", projectionEpoch: 0, supportEpoch: 0,
            searchWriteGeneration: 0, errors: ["Parâmetros de navegação inválidos."] };
        }
        typeId = type.id;
        typeSlug = type.slug;
      }

      const decodedCursor = input.cursor ? decodeSearchCursor(input.cursor) : null;
      if (decodedCursor && !decodedCursor.ok) {
        return { outcome: "invalid", projectionEpoch: 0, supportEpoch: 0,
          searchWriteGeneration: 0, errors: ["Cursor inválido. Refaça a busca."] };
      }
      const sort = decodedCursor?.ok ? decodedCursor.payload.sort : null;
      const limit = Math.min(input.limit ?? SEARCH_PAGE_MAX_HITS, SEARCH_PAGE_MAX_HITS);
      const intentKind: SearchIntentKind =
        input.kind === "material" ? "browse-family" : "browse-brand";

      let entity: ResolvedEntity;
      try {
        entity = await resolveEntity(db, input.kind, input.slug);
      } catch {
        logBrowseError("entity_resolve_failed", input.correlationId);
        return { outcome: "unavailable", projectionEpoch: 0, supportEpoch: 0, searchWriteGeneration: 0 };
      }

      if (entity.outcome === "gone") {
        return { outcome: "gone", projectionEpoch: 0, supportEpoch: 0, searchWriteGeneration: 0 };
      }
      if (entity.outcome === "unknown") {
        return { outcome: "notFound", projectionEpoch: 0, supportEpoch: 0, searchWriteGeneration: 0 };
      }
      if (entity.outcome === "alias") {
        return {
          outcome: "redirect",
          projectionEpoch: 0,
          supportEpoch: 0,
          searchWriteGeneration: 0,
          canonicalSlug: entity.slug,
          kind: input.kind,
        };
      }

      const scope = scopeSql({ kind: input.kind, entityId: entity.id, typeId });
      const queryDigest = digestQueryTokens([
        input.kind,
        entity.slug,
        typeSlug ?? "",
      ]);

      const executeAggregate = async (selectedSlot: FtsSlot | null): Promise<D1Result[]> => {
        const statements = [
          metaStatement(db), supportStatement(db),
          familySuggestionsStatement(db), brandSuggestionsStatement(db),
          facetStatement(db, input.kind, entity.id),
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
        logBrowseError("fts_selector_failed", input.correlationId);
      }

      let result: D1Result[];
      let ftsBatchFailed = false;
      try {
        result = await executeAggregate(selectedSlot);
      } catch (error) {
        if (selectedSlot === null || !isClassifiedFtsFailure(error)) {
          logBrowseError("aggregate_batch_failed", input.correlationId);
          return { outcome: "unavailable", projectionEpoch: 0, supportEpoch: 0, searchWriteGeneration: 0 };
        }
        ftsBatchFailed = true;
        logBrowseError("fts_batch_failed", input.correlationId);
        try {
          result = await executeAggregate(null);
        } catch {
          logBrowseError("fallback_batch_failed", input.correlationId);
          return { outcome: "unavailable", projectionEpoch: 0, supportEpoch: 0, searchWriteGeneration: 0 };
        }
      }

      const meta = firstRow<AggregateMeta>(result[0]);
      if (!meta || !validResponseMeta(meta)) {
        return { outcome: "unavailable", projectionEpoch: 0, supportEpoch: 0, searchWriteGeneration: 0 };
      }
      if (decodedCursor?.ok && !cursorMatchesContext(decodedCursor.payload, {
        queryDigest,
        intentKind,
        typeSlug,
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
            v: 2,
            queryDigest,
            intentKind,
            typeSlug,
            taxonomyVersion: meta.taxonomy_version,
            parserVersion: SEARCH_PARSER_VERSION,
            indexVersion: SEARCH_INDEX_VERSION,
            projectionEpoch: meta.projection_epoch,
            supportEpoch: meta.support_epoch,
            searchWriteGeneration: meta.search_write_generation,
            limit,
            sort: cursorSort,
          });
        } catch {
          return { outcome: "overloaded", projectionEpoch: meta.projection_epoch,
            supportEpoch: meta.support_epoch, searchWriteGeneration: meta.search_write_generation };
        }
      }

      const page: BrowsePage = {
        entity: {
          id: entity.id,
          slug: entity.slug,
          label: entity.label,
          kind: input.kind,
        },
        hits: pageRows.map((row) => hydrateHit(row, input.evaluatedAt)),
        totalCount,
        specificTypeFacet: facetFrom(result[4]),
        materialFamilySuggestions: suggestionsFrom(result[2]),
        brandSuggestions: brandSuggestionsFrom(result[3]),
        storeSupport: supportFrom(result[1]),
        nextCursor,
        hasNextPage,
        limits: BROWSE_LIMITS,
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
