/**
 * Exact-key taxonomy lookup. Unknown / ambiguous evidence → null.
 * No fuzzy substring, no LLM, no best-guess.
 */

import type { MaterialFamily } from "../../contracts/offer";
import {
  BRANDS,
  BRAND_BY_ID,
  BRAND_BY_SLUG,
  FAMILY_BY_ID,
  FAMILY_BY_SLUG,
  FORMULATION_SPECIFIC_TYPES,
  MATERIAL_FAMILIES,
  TAXONOMY_ALIASES,
  TYPE_BY_ID,
  TYPE_BY_SLUG,
  type BrandRecord,
  type FormulationSpecificTypeRecord,
  type MaterialFamilyRecord,
  type TaxonomyKind,
} from "./fixtures";
import { canonicalizeSlug, isCanonicalSlug, isIllegalSlugInput } from "./slug";

export type SlugResolution =
  | {
      outcome: "canonical";
      kind: TaxonomyKind;
      id: string;
      slug: string;
      label: string;
    }
  | {
      outcome: "alias";
      kind: TaxonomyKind;
      id: string;
      slug: string;
      label: string;
    }
  | { outcome: "gone"; kind: TaxonomyKind }
  | { outcome: "unknown" }
  | { outcome: "invalid" };

export type TaxonomyTables = {
  families: ReadonlyMap<string, MaterialFamilyRecord>;
  types: ReadonlyMap<string, FormulationSpecificTypeRecord>;
  brands: ReadonlyMap<string, BrandRecord>;
  aliases: ReadonlyMap<string, { kind: TaxonomyKind; targetId: string }>;
  gone: ReadonlySet<string>;
};

function evidenceKey(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const FAMILY_EVIDENCE = new Map<string, MaterialFamilyRecord>();
const TYPE_EVIDENCE = new Map<string, FormulationSpecificTypeRecord>();
const BRAND_EVIDENCE = new Map<string, BrandRecord>();
const FAMILY_INTENT = new Map<string, MaterialFamilyRecord>();
const TYPE_INTENT = new Map<string, FormulationSpecificTypeRecord>();

function addEvidence(
  map: Map<string, MaterialFamilyRecord | FormulationSpecificTypeRecord | BrandRecord>,
  key: string,
  record: MaterialFamilyRecord | FormulationSpecificTypeRecord | BrandRecord,
): void {
  const existing = map.get(key);
  if (existing && existing.id !== record.id) {
    throw new Error(`ambiguous_taxonomy_evidence:${key}`);
  }
  map.set(key, record);
}

for (const row of MATERIAL_FAMILIES) {
  addEvidence(FAMILY_EVIDENCE, evidenceKey(row.label), row);
  addEvidence(FAMILY_EVIDENCE, evidenceKey(row.slug), row);
  FAMILY_INTENT.set(evidenceKey(row.slug), row);
  FAMILY_INTENT.set(evidenceKey(row.label), row);
}

// Family evidence still recognizes subtype spellings (Offer facts), but
// search intent treats those keys as type-only so "pla plus" is PLA+ not all PLA.
for (const key of ["pla+", "pla plus", "pla-plus"]) {
  const pla = FAMILY_BY_SLUG.get("pla");
  if (pla) addEvidence(FAMILY_EVIDENCE, key, pla);
}
for (const key of ["pa6", "pa12"]) {
  const nylon = FAMILY_BY_SLUG.get("nylon");
  if (nylon) addEvidence(FAMILY_EVIDENCE, key, nylon);
}

for (const row of FORMULATION_SPECIFIC_TYPES) {
  addEvidence(TYPE_EVIDENCE, evidenceKey(row.label), row);
  addEvidence(TYPE_EVIDENCE, evidenceKey(row.slug), row);
  TYPE_INTENT.set(evidenceKey(row.slug), row);
  TYPE_INTENT.set(evidenceKey(row.label), row);
}

for (const [key, slug] of [
  ["pla+", "pla-plus"],
  ["pla plus", "pla-plus"],
  ["petg hf", "petg-hf"],
  ["rapid petg", "rapid-petg"],
] as const) {
  const row = TYPE_BY_SLUG.get(slug);
  if (row) {
    addEvidence(TYPE_EVIDENCE, key, row);
    TYPE_INTENT.set(key, row);
  }
}

for (const row of BRANDS) {
  addEvidence(BRAND_EVIDENCE, evidenceKey(row.label), row);
  addEvidence(BRAND_EVIDENCE, evidenceKey(row.slug), row);
}

for (const [key, slug] of [
  ["voolt", "voolt3d"],
  ["3dfila", "3d-fila"],
  ["3d fila", "3d-fila"],
  ["3dcolors", "3d-colors"],
  ["3d colors", "3d-colors"],
] as const) {
  const row = BRANDS.find((brand) => brand.slug === slug);
  if (row) addEvidence(BRAND_EVIDENCE, key, row);
}

const PRODUCT_KIND_KEYS = new Set(["filament", "filament_kit", "kit", "unknown"]);
const AMBIGUOUS_KEYS = new Set([
  "kit",
  "bundle",
  "kit bundle",
  "pla/petg",
  "pla petg",
  "petg/pla",
  "petg pla",
]);

export function lookupMaterialFamily(
  evidence: string | null,
): MaterialFamilyRecord | null {
  const key = evidenceKey(evidence);
  if (!key || AMBIGUOUS_KEYS.has(key)) return null;
  const direct = FAMILY_EVIDENCE.get(key);
  if (direct) return direct;
  const type = TYPE_EVIDENCE.get(key);
  if (!type) return null;
  return FAMILY_BY_ID.get(type.familyId) ?? null;
}

export function lookupFormulationSpecificType(
  evidence: string | null,
): FormulationSpecificTypeRecord | null {
  const key = evidenceKey(evidence);
  if (!key || AMBIGUOUS_KEYS.has(key) || PRODUCT_KIND_KEYS.has(key)) return null;
  return TYPE_EVIDENCE.get(key) ?? null;
}

export function lookupBrand(evidence: string | null): BrandRecord | null {
  const key = evidenceKey(evidence);
  if (!key || AMBIGUOUS_KEYS.has(key)) return null;
  return BRAND_EVIDENCE.get(key) ?? null;
}

export type SearchIntent =
  | { kind: "none" }
  | { kind: "family"; family: MaterialFamilyRecord }
  | { kind: "type"; type: FormulationSpecificTypeRecord };

/**
 * Family-intent: joined tokens equal a family slug/label.
 * Type-intent: joined tokens equal a formulation type slug/label/alias that
 * is not also a family key (`petg` is family; `petg hf` is type).
 */
export function resolveSearchIntent(joinedTokens: string): SearchIntent {
  const key = evidenceKey(joinedTokens);
  if (!key) return { kind: "none" };
  const family = FAMILY_INTENT.get(key);
  if (family) return { kind: "family", family };
  const type = TYPE_INTENT.get(key);
  if (type) return { kind: "type", type };
  return { kind: "none" };
}

export function fixtureTaxonomyTables(): TaxonomyTables {
  const aliases = new Map<string, { kind: TaxonomyKind; targetId: string }>();
  for (const row of TAXONOMY_ALIASES) {
    aliases.set(`${row.kind}:${row.aliasSlug}`, {
      kind: row.kind,
      targetId: row.targetId,
    });
  }
  return {
    families: FAMILY_BY_SLUG,
    types: TYPE_BY_SLUG,
    brands: BRAND_BY_SLUG,
    aliases,
    gone: new Set<string>(),
  };
}

export function resolveTaxonomySlug(
  raw: string,
  kind: TaxonomyKind,
  tables: TaxonomyTables,
  gone: ReadonlySet<string> = tables.gone,
): SlugResolution {
  if (isIllegalSlugInput(raw)) return { outcome: "invalid" };
  const folded = canonicalizeSlug(raw);
  if (folded === null || !isCanonicalSlug(folded)) return { outcome: "invalid" };

  if (gone.has(`${kind}:${folded}`)) {
    return { outcome: "gone", kind };
  }

  const canonical =
    kind === "family"
      ? tables.families.get(folded)
      : kind === "specific_type"
        ? tables.types.get(folded)
        : tables.brands.get(folded);
  if (canonical) {
    return {
      outcome: "canonical",
      kind,
      id: canonical.id,
      slug: canonical.slug,
      label: canonical.label,
    };
  }

  const alias = tables.aliases.get(`${kind}:${folded}`);
  if (alias && alias.kind === kind) {
    const target =
      kind === "family"
        ? FAMILY_BY_ID.get(alias.targetId) ?? [...tables.families.values()].find((row) => row.id === alias.targetId)
        : kind === "specific_type"
          ? TYPE_BY_ID.get(alias.targetId) ?? [...tables.types.values()].find((row) => row.id === alias.targetId)
          : BRAND_BY_ID.get(alias.targetId) ?? [...tables.brands.values()].find((row) => row.id === alias.targetId);
    if (!target) return { outcome: "unknown" };
    if (target.slug === folded) return { outcome: "unknown" };
    return {
      outcome: "alias",
      kind,
      id: target.id,
      slug: target.slug,
      label: target.label,
    };
  }

  return { outcome: "unknown" };
}

export function materialFamilyLabel(
  record: MaterialFamilyRecord | null,
): MaterialFamily | null {
  return record?.label ?? null;
}
