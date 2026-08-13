import { describe, expect, it } from "vitest";

import {
  NORMALIZE_POLICY_VERSION,
  normalizeBrand,
  normalizeFormulationSpecificType,
  normalizeMaterialFamily,
  normalizeObservation,
  normalizeSpecificType,
} from "../../src/domain/policy/normalize";
import {
  BRANDS,
  FORMULATION_SPECIFIC_TYPES,
  MATERIAL_FAMILIES,
  TAXONOMY_ALIASES,
  TAXONOMY_VERSION,
  canonicalizeSlug,
  fixtureTaxonomyTables,
  isCanonicalSlug,
  isIllegalSlugInput,
  lookupBrand,
  lookupFormulationSpecificType,
  lookupMaterialFamily,
  resolveSearchIntent,
  resolveTaxonomySlug,
} from "../../src/domain/taxonomy";

describe("canonical slug grammar", () => {
  it("accepts locked examples and rejects illegal input", () => {
    for (const slug of [
      "petg",
      "petg-hf",
      "rapid-petg",
      "pla",
      "pla-plus",
      "voolt3d",
      "3d-fila",
    ]) {
      expect(isCanonicalSlug(slug)).toBe(true);
      expect(canonicalizeSlug(slug)).toBe(slug);
    }
    expect(canonicalizeSlug("Voolt3D")).toBe("voolt3d");
    expect(canonicalizeSlug("3D Fila")).toBe("3d-fila");
    expect(canonicalizeSlug("PLA+")).toBe("pla");
    expect(isCanonicalSlug("PLA+")).toBe(false);
    expect(isCanonicalSlug("petg_hf")).toBe(false);
    expect(isCanonicalSlug("-petg")).toBe(false);
    expect(isCanonicalSlug("a".repeat(129))).toBe(false);
    expect(isIllegalSlugInput("petg/hf")).toBe(true);
    expect(isIllegalSlugInput("petg hf")).toBe(true);
    expect(isIllegalSlugInput("..")).toBe(true);
    expect(isIllegalSlugInput("petg%2f")).toBe(true);
  });
});

describe("reviewed taxonomy fixtures", () => {
  it("keeps PETG, PETG HF, and Rapid PETG semantically distinct", () => {
    const petg = lookupFormulationSpecificType("PETG");
    const hf = lookupFormulationSpecificType("PETG HF");
    const rapid = lookupFormulationSpecificType("Rapid PETG");
    expect(petg?.slug).toBe("petg");
    expect(hf?.slug).toBe("petg-hf");
    expect(rapid?.slug).toBe("rapid-petg");
    expect(new Set([petg?.id, hf?.id, rapid?.id]).size).toBe(3);
    expect(petg?.familyId).toBe(hf?.familyId);
    expect(hf?.familyId).toBe(rapid?.familyId);
  });

  it("keeps PLA and PLA+ distinct while both belonging to PLA family", () => {
    const pla = lookupFormulationSpecificType("PLA");
    const plus = lookupFormulationSpecificType("pla+");
    expect(pla?.slug).toBe("pla");
    expect(plus?.slug).toBe("pla-plus");
    expect(pla?.id).not.toBe(plus?.id);
    expect(lookupMaterialFamily("pla+")?.label).toBe("PLA");
    expect(lookupMaterialFamily("pla plus")?.label).toBe("PLA");
  });

  it("keeps PA6 and PA12 distinct under Nylon", () => {
    expect(lookupMaterialFamily("pa6")?.label).toBe("Nylon");
    expect(lookupMaterialFamily("pa12")?.label).toBe("Nylon");
    expect(lookupFormulationSpecificType("pa6")?.slug).toBe("pa6");
    expect(lookupFormulationSpecificType("pa12")?.slug).toBe("pa12");
    expect(lookupFormulationSpecificType("nylon")?.slug).toBe("nylon");
    expect(lookupFormulationSpecificType("pa6")?.id).not.toBe(
      lookupFormulationSpecificType("pa12")?.id,
    );
  });

  it("returns null for unknown, ambiguous, and product-kind evidence", () => {
    expect(lookupMaterialFamily("mystery")).toBeNull();
    expect(lookupFormulationSpecificType("superpetg")).toBeNull();
    expect(lookupFormulationSpecificType("petg-like")).toBeNull();
    expect(lookupFormulationSpecificType("petghf")).toBeNull();
    expect(lookupFormulationSpecificType("filament")).toBeNull();
    expect(lookupFormulationSpecificType("kit")).toBeNull();
    expect(lookupFormulationSpecificType("pla/petg")).toBeNull();
    expect(lookupBrand("UnknownBrandXYZ")).toBeNull();
    expect(lookupBrand("voolt3d")?.label).toBe("Voolt3D");
    expect(lookupBrand("voolt")?.label).toBe("Voolt3D");
    expect(lookupBrand("voolt")?.id).toBe(lookupBrand("voolt3d")?.id);
  });

  it("does not self-alias canonical slugs", () => {
    const canonical = new Set([
      ...MATERIAL_FAMILIES.map((row) => `${"family"}:${row.slug}`),
      ...FORMULATION_SPECIFIC_TYPES.map((row) => `specific_type:${row.slug}`),
      ...BRANDS.map((row) => `brand:${row.slug}`),
    ]);
    for (const row of TAXONOMY_ALIASES) {
      expect(canonical.has(`${row.kind}:${row.aliasSlug}`)).toBe(false);
    }
  });

  it("seeds every required family and identity type", () => {
    expect(MATERIAL_FAMILIES.map((row) => row.label).sort()).toEqual(
      ["ABS", "ASA", "HIPS", "Nylon", "PC", "PETG", "PLA", "PVA", "TPU", "other"].sort(),
    );
    expect(TAXONOMY_VERSION).toBe(1);
    expect(FORMULATION_SPECIFIC_TYPES.some((row) => row.slug === "pla-plus")).toBe(true);
    expect(FORMULATION_SPECIFIC_TYPES.some((row) => row.slug === "petg-hf")).toBe(true);
    expect(FORMULATION_SPECIFIC_TYPES.some((row) => row.slug === "rapid-petg")).toBe(true);
    expect(FORMULATION_SPECIFIC_TYPES.some((row) => row.slug === "pa6")).toBe(true);
    expect(FORMULATION_SPECIFIC_TYPES.some((row) => row.slug === "pa12")).toBe(true);
  });
});

describe("slug resolution (301 / 404 / 410 / 400)", () => {
  const tables = fixtureTaxonomyTables();

  it("resolves canonical, reviewed alias, unknown, gone, and illegal slugs", () => {
    expect(resolveTaxonomySlug("petg", "family", tables).outcome).toBe("canonical");
    expect(resolveTaxonomySlug("VOOLT", "brand", tables)).toMatchObject({
      outcome: "alias",
      slug: "voolt3d",
      kind: "brand",
    });
    expect(resolveTaxonomySlug("no-such-brand", "brand", tables).outcome).toBe("unknown");
    const goneTables = {
      ...tables,
      gone: new Set(["family:split-petg"]),
    };
    expect(resolveTaxonomySlug("split-petg", "family", goneTables)).toEqual({
      outcome: "gone",
      kind: "family",
    });
    expect(resolveTaxonomySlug("petg/hf", "family", tables).outcome).toBe("invalid");
    expect(resolveTaxonomySlug("petg hf", "family", tables).outcome).toBe("invalid");
  });
});

describe("search intent", () => {
  it("treats exact family tokens as family intent and subtype aliases as type intent", () => {
    expect(resolveSearchIntent("petg").kind).toBe("family");
    expect(resolveSearchIntent("PETG").kind).toBe("family");
    expect(resolveSearchIntent("petg hf").kind).toBe("type");
    expect(resolveSearchIntent("pla plus").kind).toBe("type");
    expect(resolveSearchIntent("pla+").kind).toBe("type");
    expect(resolveSearchIntent("pa6").kind).toBe("type");
    expect(resolveSearchIntent("petg branco").kind).toBe("none");
    expect(resolveSearchIntent("nylon").kind).toBe("family");
  });
});

describe("normalize policy v2", () => {
  it("bumps the policy version and stops collapsing subtypes", () => {
    expect(NORMALIZE_POLICY_VERSION).toBe(2);
    expect(normalizeMaterialFamily("pla+")).toBe("PLA");
    expect(normalizeFormulationSpecificType("pla+")?.label).toBe("PLA+");
    expect(normalizeFormulationSpecificType("pa6")?.label).toBe("PA6");
    expect(normalizeMaterialFamily("pa6")).toBe("Nylon");
    expect(normalizeBrand("voolt")).toBe("Voolt3D");
    expect(normalizeBrand("voolt3d")).toBe("Voolt3D");
  });

  it("keeps product-kind specificType independent from formulation type", () => {
    expect(
      normalizeSpecificType({
        titleEvidence: "Kit PETG HF",
        descriptionEvidence: null,
        massGrams: 1000,
      }),
    ).toBe("filament_kit");
    expect(normalizeFormulationSpecificType("PETG HF")?.label).toBe("PETG HF");
    const facts = normalizeObservation({
      brandEvidence: "Voolt3D",
      materialEvidence: "PETG HF",
      colorEvidence: "Preto",
      diameterEvidence: "1.75mm",
      titleEvidence: "PETG HF Preto 1kg",
      descriptionEvidence: null,
      massGrams: 1000,
      listingPriceCentavos: 8990,
      originalPriceCentavos: null,
      availability: "available",
      isPromotion: false,
    });
    expect(facts.specificType).toBe("filament");
    expect(facts.materialFamily).toBe("PETG");
    expect(facts.formulationSpecificType?.label).toBe("PETG HF");
    expect(facts.brandId).toBe(lookupBrand("Voolt3D")?.id);
    expect(facts.materialFamilyId).toBe(lookupMaterialFamily("PETG")?.id);
    expect(facts.formulationSpecificTypeId).toBe(
      lookupFormulationSpecificType("PETG HF")?.id,
    );
  });
});
