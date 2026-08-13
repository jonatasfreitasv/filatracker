/**
 * Reviewed taxonomy fixtures (Story 1.6). Compiled into D1 seed 0005.
 * Exact-key lookup only — no fuzzy substring, no LLM, no best-guess.
 */

import type { MaterialFamily } from "../../contracts/offer";
import { isCanonicalSlug } from "./slug";

export const TAXONOMY_VERSION = 1 as const;
export const TAXONOMY_PROVENANCE = "reviewed-fixture-v1" as const;

export type TaxonomyKind = "family" | "specific_type" | "brand";

export type MaterialFamilyRecord = {
  id: string;
  slug: string;
  label: MaterialFamily;
  taxonomyVersion: typeof TAXONOMY_VERSION;
  provenance: typeof TAXONOMY_PROVENANCE;
};

export type FormulationSpecificTypeRecord = {
  id: string;
  familyId: string;
  slug: string;
  label: string;
  taxonomyVersion: typeof TAXONOMY_VERSION;
  provenance: typeof TAXONOMY_PROVENANCE;
};

export type BrandRecord = {
  id: string;
  slug: string;
  label: string;
  taxonomyVersion: typeof TAXONOMY_VERSION;
  provenance: typeof TAXONOMY_PROVENANCE;
};

export type TaxonomyAliasRecord = {
  aliasSlug: string;
  kind: TaxonomyKind;
  targetId: string;
  reviewed: true;
};

export const MATERIAL_FAMILIES: readonly MaterialFamilyRecord[] = [
  family("fam_pla", "pla", "PLA"),
  family("fam_petg", "petg", "PETG"),
  family("fam_abs", "abs", "ABS"),
  family("fam_asa", "asa", "ASA"),
  family("fam_tpu", "tpu", "TPU"),
  family("fam_pc", "pc", "PC"),
  family("fam_nylon", "nylon", "Nylon"),
  family("fam_pva", "pva", "PVA"),
  family("fam_hips", "hips", "HIPS"),
  family("fam_other", "other", "other"),
];

export const FORMULATION_SPECIFIC_TYPES: readonly FormulationSpecificTypeRecord[] = [
  formulation("typ_pla", "fam_pla", "pla", "PLA"),
  formulation("typ_pla-plus", "fam_pla", "pla-plus", "PLA+"),
  formulation("typ_petg", "fam_petg", "petg", "PETG"),
  formulation("typ_petg-hf", "fam_petg", "petg-hf", "PETG HF"),
  formulation("typ_rapid-petg", "fam_petg", "rapid-petg", "Rapid PETG"),
  formulation("typ_abs", "fam_abs", "abs", "ABS"),
  formulation("typ_asa", "fam_asa", "asa", "ASA"),
  formulation("typ_tpu", "fam_tpu", "tpu", "TPU"),
  formulation("typ_pc", "fam_pc", "pc", "PC"),
  formulation("typ_nylon", "fam_nylon", "nylon", "Nylon"),
  formulation("typ_pa6", "fam_nylon", "pa6", "PA6"),
  formulation("typ_pa12", "fam_nylon", "pa12", "PA12"),
  formulation("typ_pva", "fam_pva", "pva", "PVA"),
  formulation("typ_hips", "fam_hips", "hips", "HIPS"),
  formulation("typ_other", "fam_other", "other", "other"),
];

export const BRANDS: readonly BrandRecord[] = [
  brand("brd_closin", "closin", "Closin"),
  brand("brd_3d-fila", "3d-fila", "3D Fila"),
  brand("brd_voolt3d", "voolt3d", "Voolt3D"),
  brand("brd_printalot", "printalot", "PrintaLot"),
  brand("brd_3d-colors", "3d-colors", "3D Colors"),
];

/**
 * Alternate/old slugs only. Canonical slugs must never appear here
 * (self-alias 301 loop). Ambiguous splits are `taxonomy_gone`, not aliases.
 */
export const TAXONOMY_ALIASES: readonly TaxonomyAliasRecord[] = [
  alias("voolt", "brand", "brd_voolt3d"),
  alias("3dfila", "brand", "brd_3d-fila"),
  alias("3dcolors", "brand", "brd_3d-colors"),
  alias("petghf", "specific_type", "typ_petg-hf"),
  alias("rapidpetg", "specific_type", "typ_rapid-petg"),
  alias("plaplus", "specific_type", "typ_pla-plus"),
];

function family(
  id: string,
  slug: string,
  label: MaterialFamily,
): MaterialFamilyRecord {
  assertSlug(slug, id);
  return {
    id,
    slug,
    label,
    taxonomyVersion: TAXONOMY_VERSION,
    provenance: TAXONOMY_PROVENANCE,
  };
}

function formulation(
  id: string,
  familyId: string,
  slug: string,
  label: string,
): FormulationSpecificTypeRecord {
  assertSlug(slug, id);
  if (slug === "filament" || slug === "kit" || slug === "filament_kit" || slug === "unknown") {
    throw new Error(`forbidden_product_kind_slug:${slug}`);
  }
  return {
    id,
    familyId,
    slug,
    label,
    taxonomyVersion: TAXONOMY_VERSION,
    provenance: TAXONOMY_PROVENANCE,
  };
}

function brand(id: string, slug: string, label: string): BrandRecord {
  assertSlug(slug, id);
  return {
    id,
    slug,
    label,
    taxonomyVersion: TAXONOMY_VERSION,
    provenance: TAXONOMY_PROVENANCE,
  };
}

function alias(
  aliasSlug: string,
  kind: TaxonomyKind,
  targetId: string,
): TaxonomyAliasRecord {
  assertSlug(aliasSlug, aliasSlug);
  return { aliasSlug, kind, targetId, reviewed: true };
}

function assertSlug(slug: string, context: string): void {
  if (!isCanonicalSlug(slug)) {
    throw new Error(`invalid_taxonomy_slug:${context}:${slug}`);
  }
}

export const FAMILY_BY_ID = indexBy(MATERIAL_FAMILIES, (row) => row.id);
export const FAMILY_BY_SLUG = indexBy(MATERIAL_FAMILIES, (row) => row.slug);
export const TYPE_BY_ID = indexBy(FORMULATION_SPECIFIC_TYPES, (row) => row.id);
export const TYPE_BY_SLUG = indexBy(FORMULATION_SPECIFIC_TYPES, (row) => row.slug);
export const BRAND_BY_ID = indexBy(BRANDS, (row) => row.id);
export const BRAND_BY_SLUG = indexBy(BRANDS, (row) => row.slug);

const CANONICAL_SLUGS = new Set<string>([
  ...MATERIAL_FAMILIES.map((row) => row.slug),
  ...FORMULATION_SPECIFIC_TYPES.map((row) => row.slug),
  ...BRANDS.map((row) => row.slug),
]);

for (const row of TAXONOMY_ALIASES) {
  if (CANONICAL_SLUGS.has(row.aliasSlug) && aliasTargetsOwnCanonical(row)) {
    throw new Error(`self_alias_forbidden:${row.aliasSlug}`);
  }
  if (CANONICAL_SLUGS.has(row.aliasSlug)) {
    // Same string may be a canonical slug of a *different* kind (e.g. none today).
    // Never 301 a canonical slug of the same kind onto itself.
    const sameKindCanonical = canonicalSlugFor(row.kind, row.aliasSlug);
    if (sameKindCanonical) {
      throw new Error(`self_alias_forbidden:${row.kind}:${row.aliasSlug}`);
    }
  }
}

function aliasTargetsOwnCanonical(row: TaxonomyAliasRecord): boolean {
  const canonical = canonicalSlugForId(row.kind, row.targetId);
  return canonical === row.aliasSlug;
}

function canonicalSlugFor(kind: TaxonomyKind, slug: string): string | null {
  if (kind === "family") return FAMILY_BY_SLUG.get(slug)?.slug ?? null;
  if (kind === "specific_type") return TYPE_BY_SLUG.get(slug)?.slug ?? null;
  return BRAND_BY_SLUG.get(slug)?.slug ?? null;
}

function canonicalSlugForId(kind: TaxonomyKind, id: string): string | null {
  if (kind === "family") return FAMILY_BY_ID.get(id)?.slug ?? null;
  if (kind === "specific_type") return TYPE_BY_ID.get(id)?.slug ?? null;
  return BRAND_BY_ID.get(id)?.slug ?? null;
}

function indexBy<T>(rows: readonly T[], key: (row: T) => string): ReadonlyMap<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const id = key(row);
    if (map.has(id)) throw new Error(`duplicate_taxonomy_key:${id}`);
    map.set(id, row);
  }
  return map;
}
