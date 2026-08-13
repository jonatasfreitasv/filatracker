import {
  BRAND_BY_ID,
  FAMILY_BY_ID,
  TAXONOMY_ALIASES,
  TYPE_BY_ID,
} from "./fixtures";

/** Labels, slugs, and reviewed aliases for FTS/fallback documents. Never product-kind. */
export function taxonomySearchFields(input: {
  brandId: string | null;
  materialFamilyId: string | null;
  formulationSpecificTypeId: string | null;
}): string[] {
  const fields: string[] = [];
  const brand = input.brandId ? BRAND_BY_ID.get(input.brandId) : undefined;
  const family = input.materialFamilyId
    ? FAMILY_BY_ID.get(input.materialFamilyId)
    : undefined;
  const type = input.formulationSpecificTypeId
    ? TYPE_BY_ID.get(input.formulationSpecificTypeId)
    : undefined;

  if (brand) {
    fields.push(brand.label, brand.slug);
    for (const alias of TAXONOMY_ALIASES) {
      if (alias.kind === "brand" && alias.targetId === brand.id) {
        fields.push(alias.aliasSlug);
      }
    }
  }
  if (family) {
    fields.push(family.label, family.slug);
  }
  if (type) {
    fields.push(type.label, type.slug);
    for (const alias of TAXONOMY_ALIASES) {
      if (alias.kind === "specific_type" && alias.targetId === type.id) {
        fields.push(alias.aliasSlug);
      }
    }
  }
  return fields;
}
