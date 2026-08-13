/**
 * Versioned deterministic normalization dictionaries/policies (AD-7 / AD-15).
 * Unknown or ambiguous values → explicit null. No fuzzy substring invention.
 * Story 1.6 still owns durable browse taxonomy, aliases, and slugs.
 */

export const NORMALIZE_POLICY_VERSION = 1 as const;

import type {
  MaterialFamily,
  SpecificType,
} from "../../contracts/offer";
import { normalizeListingTitle } from "./listing-title";

const BRAND_ALIASES: ReadonlyMap<string, string> = new Map([
  ["closin", "Closin"],
  ["3dfila", "3D Fila"],
  ["3d fila", "3D Fila"],
  ["voolt", "Voolt"],
  ["voolt3d", "Voolt3D"],
  ["printalot", "PrintaLot"],
  ["3dcolors", "3D Colors"],
  ["3d colors", "3D Colors"],
]);

const MATERIAL_FAMILY_ALIASES: ReadonlyMap<string, MaterialFamily> = new Map([
  ["pla", "PLA"],
  ["pla+", "PLA"],
  ["pla plus", "PLA"],
  ["petg", "PETG"],
  ["abs", "ABS"],
  ["asa", "ASA"],
  ["tpu", "TPU"],
  ["pc", "PC"],
  ["nylon", "Nylon"],
  ["pa6", "Nylon"],
  ["pa12", "Nylon"],
  ["pva", "PVA"],
  ["hips", "HIPS"],
]);

const COLOR_ALIASES: ReadonlyMap<string, string> = new Map([
  ["branco", "Branco"],
  ["white", "Branco"],
  ["preto", "Preto"],
  ["black", "Preto"],
  ["vermelho", "Vermelho"],
  ["red", "Vermelho"],
  ["azul", "Azul"],
  ["blue", "Azul"],
  ["verde", "Verde"],
  ["green", "Verde"],
  ["amarelo", "Amarelo"],
  ["yellow", "Amarelo"],
  ["laranja", "Laranja"],
  ["orange", "Laranja"],
  ["cinza", "Cinza"],
  ["gray", "Cinza"],
  ["grey", "Cinza"],
  ["rosa", "Rosa"],
  ["pink", "Rosa"],
  ["roxo", "Roxo"],
  ["purple", "Roxo"],
  ["transparente", "Transparente"],
  ["transparent", "Transparente"],
  ["natural", "Natural"],
]);

const DIAMETER_MM: ReadonlyMap<string, number> = new Map([
  ["1.75", 1.75],
  ["1,75", 1.75],
  ["1.75mm", 1.75],
  ["1,75mm", 1.75],
  ["2.85", 2.85],
  ["2,85", 2.85],
  ["2.85mm", 2.85],
  ["3.00", 3.0],
  ["3mm", 3.0],
]);

function nfkcLower(text: string | null | undefined): string {
  return (text ?? "").normalize("NFKC").trim().toLowerCase();
}

export function normalizeBrand(evidence: string | null): string | null {
  const key = nfkcLower(evidence);
  if (!key) return null;
  return BRAND_ALIASES.get(key) ?? null;
}

export function normalizeMaterialFamily(
  evidence: string | null,
): MaterialFamily | null {
  const key = nfkcLower(evidence);
  if (!key) return null;
  return MATERIAL_FAMILY_ALIASES.get(key) ?? null;
}

export function normalizeColor(evidence: string | null): string | null {
  const key = nfkcLower(evidence);
  if (!key) return null;
  return COLOR_ALIASES.get(key) ?? null;
}

export function normalizeDiameterMm(evidence: string | null): number | null {
  const key = nfkcLower(evidence).replace(/\s+/g, "");
  if (!key) return null;
  return DIAMETER_MM.get(key) ?? null;
}

/**
 * Specific Type from evidence only — kits stay filament_kit; never invent.
 */
export function normalizeSpecificType(input: {
  titleEvidence: string | null;
  descriptionEvidence: string | null;
  massGrams: number | null;
}): SpecificType | null {
  const blob = nfkcLower(
    `${input.titleEvidence ?? ""} ${input.descriptionEvidence ?? ""}`,
  );
  if (!blob.trim()) return null;
  if (/\bkit\b/.test(blob)) return "filament_kit";
  if (
    /\b(pla|petg|abs|asa|tpu|filamento|filament)\b/.test(blob) ||
    input.massGrams !== null
  ) {
    return "filament";
  }
  return null;
}

export type NormalizedOfferFacts = {
  normalizePolicyVersion: typeof NORMALIZE_POLICY_VERSION;
  brand: string | null;
  specificType: SpecificType | null;
  materialFamily: MaterialFamily | null;
  color: string | null;
  diameterMm: number | null;
  massGrams: number | null;
  /** Bounded plain-text listing title from titleEvidence only. */
  listingTitle: string | null;
  listingPriceCentavos: number | null;
  originalPriceCentavos: number | null;
  availability: "available" | "unavailable" | "unknown";
  isPromotion: boolean;
  /** Incomplete canonical key → standalone Offer only. */
  standaloneOnly: boolean;
};

export function normalizeObservation(input: {
  brandEvidence: string | null;
  materialEvidence: string | null;
  colorEvidence: string | null;
  diameterEvidence: string | null;
  titleEvidence: string | null;
  descriptionEvidence: string | null;
  massGrams: number | null;
  listingPriceCentavos: number | null;
  originalPriceCentavos: number | null;
  availability: "available" | "unavailable" | "unknown";
  isPromotion: boolean;
}): NormalizedOfferFacts {
  const brand = normalizeBrand(input.brandEvidence);
  const materialFamily = normalizeMaterialFamily(input.materialEvidence);
  const color = normalizeColor(input.colorEvidence);
  const diameterMm = normalizeDiameterMm(input.diameterEvidence);
  const specificType = normalizeSpecificType({
    titleEvidence: input.titleEvidence,
    descriptionEvidence: input.descriptionEvidence,
    massGrams: input.massGrams,
  });
  const listingTitle = normalizeListingTitle(input.titleEvidence);

  const incompleteCanonical =
    brand === null ||
    materialFamily === null ||
    specificType === null ||
    input.massGrams === null;

  return {
    normalizePolicyVersion: NORMALIZE_POLICY_VERSION,
    brand,
    specificType,
    materialFamily,
    color,
    diameterMm,
    massGrams: input.massGrams,
    listingTitle,
    listingPriceCentavos: input.listingPriceCentavos,
    originalPriceCentavos: input.originalPriceCentavos,
    availability: input.availability,
    isPromotion: input.isPromotion,
    standaloneOnly: incompleteCanonical,
  };
}
