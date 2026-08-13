export {
  TAXONOMY_SLUG_MAX,
  TAXONOMY_SLUG_PATTERN,
  canonicalizeSlug,
  isCanonicalSlug,
  isIllegalSlugInput,
} from "./slug";

export {
  TAXONOMY_VERSION,
  TAXONOMY_PROVENANCE,
  MATERIAL_FAMILIES,
  FORMULATION_SPECIFIC_TYPES,
  BRANDS,
  TAXONOMY_ALIASES,
  FAMILY_BY_ID,
  FAMILY_BY_SLUG,
  TYPE_BY_ID,
  TYPE_BY_SLUG,
  BRAND_BY_ID,
  BRAND_BY_SLUG,
} from "./fixtures";

export type {
  TaxonomyKind,
  MaterialFamilyRecord,
  FormulationSpecificTypeRecord,
  BrandRecord,
  TaxonomyAliasRecord,
} from "./fixtures";

export {
  lookupBrand,
  lookupMaterialFamily,
  lookupFormulationSpecificType,
  resolveSearchIntent,
  resolveTaxonomySlug,
  fixtureTaxonomyTables,
  materialFamilyLabel,
} from "./lookup";

export type { SearchIntent, SlugResolution, TaxonomyTables } from "./lookup";

export { taxonomySearchFields } from "./search-tokens";
