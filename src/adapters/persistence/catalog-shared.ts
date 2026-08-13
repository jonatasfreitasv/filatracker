/** Shared eligible-offer SQL and hit hydration for search + browse (AD-25). */

import type {
  BrandSuggestion,
  MaterialFamilySuggestion,
  SearchHit,
  SpecificTypeFacet,
  StoreSupportSummary,
} from "../../contracts";
import {
  MONEY_CENTAVOS_MAX,
  SEARCH_PAGE_MAX_STORE_SUPPORT,
  SEARCH_PAGE_MAX_SUGGESTIONS,
  canonicalizeUtcInstant,
} from "../../contracts/search-page";
import type { SpecificType } from "../../contracts/offer";
import { derivePricePerKgCentavos } from "../../domain/policy/price-per-kg";
import { deriveStale } from "../../domain/policy/validate";
import { availabilityRank, type SearchSortTuple } from "./search-cursor";

export type OfferRow = {
  offer_id: string;
  store_id: string;
  brand: string | null;
  specific_type: string | null;
  material_family: string | null;
  formulation_label: string | null;
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

export type AggregateMeta = {
  projection_epoch: number;
  support_epoch: number;
  taxonomy_version: number;
  active_slot: "a" | "b";
  index_version: number;
  parser_version: number;
  search_projection_epoch: number;
  search_write_generation: number;
};

export const ELIGIBLE_JOIN = `
  FROM offers o
  INNER JOIN store_state ss ON ss.store_id = o.store_id
  LEFT JOIN specific_types st ON st.specific_type_id = o.formulation_specific_type_id
  WHERE o.visible = 1 AND o.tombstoned = 0
    AND ss.support_state IN ('active', 'degraded')
`;

export const AVAILABILITY_RANK_SQL = `CASE o.availability
  WHEN 'available' THEN 0 WHEN 'unknown' THEN 1 ELSE 2 END`;
export const NULL_PRICE_RANK_SQL = `CASE WHEN o.listing_price_centavos IS NULL THEN 1 ELSE 0 END`;
export const ORDER_SQL = `${AVAILABILITY_RANK_SQL} ASC,
  ${NULL_PRICE_RANK_SQL} ASC,
  o.listing_price_centavos ASC,
  o.observed_at DESC,
  o.offer_id ASC`;

export const OFFER_SELECT = `SELECT o.offer_id, o.store_id, o.brand, o.specific_type, o.material_family,
            st.label AS formulation_label,
            o.color, o.diameter_mm, o.mass_grams, o.listing_title,
            o.listing_price_centavos, o.availability, o.observed_at, o.stale_after,
            ss.display_name`;

export const FORMULATION_JOIN = `LEFT JOIN specific_types st ON st.specific_type_id = o.formulation_specific_type_id`;

export function matchingSql(tokenCount: number): string {
  return Array.from(
    { length: tokenCount },
    () => `instr(' ' || o.search_text || ' ', ' ' || ? || ' ') > 0`,
  ).join(" AND ");
}

export function cursorSql(sort: SearchSortTuple | null): {
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

export function metaStatement(db: D1Database): D1PreparedStatement {
  return db.prepare(
    `SELECT pm.projection_epoch, pm.support_epoch, pm.taxonomy_version,
            sm.active_slot, sm.index_version, sm.parser_version,
            sm.projection_epoch AS search_projection_epoch,
            sm.search_write_generation
     FROM projection_meta pm
     INNER JOIN search_projection_meta sm ON sm.id = pm.id
     WHERE pm.id = 1`,
  );
}

export function supportStatement(db: D1Database): D1PreparedStatement {
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

export function familySuggestionsStatement(db: D1Database): D1PreparedStatement {
  return db.prepare(
    `SELECT mf.family_id AS id, mf.slug, mf.label
     FROM material_families mf
     WHERE mf.family_id IN (
       SELECT DISTINCT o.material_family_id ${ELIGIBLE_JOIN}
         AND o.material_family_id IS NOT NULL
     )
     ORDER BY mf.label ASC LIMIT ?`,
  ).bind(SEARCH_PAGE_MAX_SUGGESTIONS);
}

export function brandSuggestionsStatement(db: D1Database): D1PreparedStatement {
  return db.prepare(
    `SELECT b.brand_id AS id, b.slug, b.label
     FROM brands b
     WHERE b.brand_id IN (
       SELECT DISTINCT o.brand_id ${ELIGIBLE_JOIN}
         AND o.brand_id IS NOT NULL
     )
     ORDER BY b.label ASC LIMIT ?`,
  ).bind(SEARCH_PAGE_MAX_SUGGESTIONS);
}

export function hydrateHit(row: OfferRow, evaluatedAt: Date): SearchHit {
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
  const formulation = row.formulation_label?.trim() || null;
  return {
    kind: "offer",
    id: row.offer_id,
    title,
    brandName: row.brand,
    materialFamily: row.material_family,
    specificTypeLabel: formulation,
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

export function firstRow<T>(result: D1Result | undefined): T | null {
  return (result?.results?.[0] as T | undefined) ?? null;
}

export function rows<T>(result: D1Result | undefined): T[] {
  return (result?.results as T[] | undefined) ?? [];
}

export function supportFrom(result: D1Result | undefined): StoreSupportSummary[] {
  return rows<{ store_id: string; display_name: string; support_state: StoreSupportSummary["supportState"] }>(result)
    .map((row) => ({
      storeId: row.store_id,
      displayName: row.display_name,
      supportState: row.support_state,
    }));
}

export function suggestionsFrom(result: D1Result | undefined): MaterialFamilySuggestion[] {
  return rows<{ id: string; slug: string; label: string }>(result).map((row) => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
  }));
}

export function brandSuggestionsFrom(result: D1Result | undefined): BrandSuggestion[] {
  return rows<{ id: string; slug: string; label: string }>(result).map((row) => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
  }));
}

export function facetFrom(result: D1Result | undefined): SpecificTypeFacet[] {
  return rows<{ slug: string; label: string; count: number }>(result).map((row) => ({
    slug: row.slug,
    label: row.label,
    count: row.count,
  }));
}

export function cursorSortFrom(row: OfferRow): SearchSortTuple | null {
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

export function safeEpoch(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validResponseMeta(meta: AggregateMeta): boolean {
  return safeEpoch(meta.projection_epoch) && safeEpoch(meta.support_epoch) &&
    safeEpoch(meta.search_projection_epoch) && safeEpoch(meta.search_write_generation) &&
    safeEpoch(meta.taxonomy_version) && meta.taxonomy_version > 0;
}

export function sameOrderedBoundary(
  ftsRows: readonly OfferRow[],
  relationalRows: readonly OfferRow[],
): boolean {
  return ftsRows.length === relationalRows.length &&
    ftsRows.every((row, index) => row.offer_id === relationalRows[index]?.offer_id);
}

export function isClassifiedFtsFailure(error: unknown): boolean {
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
  return /fts5|search_fts_[ab]|malformed\s+match|unable to use function\s+MATCH/i.test(text);
}
