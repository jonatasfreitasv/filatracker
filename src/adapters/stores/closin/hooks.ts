/**
 * Closin typed discovery/extraction hooks.
 *
 * Extraction strategy (closes architecture Deferred):
 * 1) Prefer bounded JSON-LD (`application/ld+json`) parsed strictly as inert text.
 * 2) Deterministic HTML data-hook selectors only for documented gaps (price display).
 * 3) Never execute script, merchant markup, or runtime LLM logic.
 * 4) Browser fallback is NOT enabled — no evidence requires it for Closin v1.
 *
 * See `extraction-decision.md` in this folder.
 */

import {
  RAW_OFFER_OBSERVATION_CONTRACT_VERSION,
  type Availability,
  type RawOfferObservation,
} from "../../../contracts/raw-offer-observation";
import { CLOSIN_MAP_VERSION, CLOSIN_PARSER_VERSION, CLOSIN_STORE_ID } from "./map";
import { CLOSIN_BUDGETS } from "./budgets";

export type ExtractedCandidate = {
  sourceUrl: string;
  merchantVariantId: string | null;
  titleEvidence: string | null;
  descriptionEvidence: string | null;
  brandEvidence: string | null;
  materialEvidence: string | null;
  weightEvidence: string | null;
  colorEvidence: string | null;
  diameterEvidence: string | null;
  massGrams: number | null;
  availability: Availability;
  listingPriceCentavos: number | null;
  originalPriceCentavos: number | null;
  listingPriceRaw: string | null;
  originalPriceRaw: string | null;
};

const LD_JSON_RE =
  /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Extract inert JSON-LD blocks only — never evaluate as script. */
export function extractJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  for (const match of html.matchAll(LD_JSON_RE)) {
    if (out.length >= CLOSIN_BUDGETS.maxArrayCardinality) break;
    const raw = match[1]?.trim();
    if (!raw) continue;
    if (raw.length > 100_000) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      // malformed JSON-LD is ignored as evidence, not executed
    }
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickProduct(
  nodes: unknown[],
  depth = 0,
): Record<string, unknown> | null {
  if (depth > CLOSIN_BUDGETS.maxJsonLdNesting) return null;
  for (const node of nodes.slice(0, CLOSIN_BUDGETS.maxArrayCardinality)) {
    const rec = asRecord(node);
    if (!rec) continue;
    const type = rec["@type"];
    if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
      return rec;
    }
    if (Array.isArray(rec["@graph"])) {
      const nested = pickProduct(rec["@graph"] as unknown[], depth + 1);
      if (nested) return nested;
    }
  }
  return null;
}

function parseBrlToCentavos(raw: string | null | undefined): {
  centavos: number | null;
  raw: string | null;
} {
  if (raw === null || raw === undefined) return { centavos: null, raw: null };
  const trimmed = String(raw).trim();
  if (!trimmed) return { centavos: null, raw: null };
  // Accept "66.7", "66.70", "R$ 66,70", "80.3"
  const normalized = trimmed
    .replace(/[^\d.,-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const num = Number(normalized);
  if (!Number.isFinite(num) || num <= 0) {
    return { centavos: null, raw: trimmed.slice(0, CLOSIN_BUDGETS.maxFieldStringLength) };
  }
  const centavos = Math.round(num * 100);
  if (!Number.isInteger(centavos) || centavos <= 0) {
    return { centavos: null, raw: trimmed.slice(0, CLOSIN_BUDGETS.maxFieldStringLength) };
  }
  return { centavos, raw: trimmed.slice(0, CLOSIN_BUDGETS.maxFieldStringLength) };
}

function availabilityFromSchema(value: unknown): Availability {
  if (typeof value !== "string") return "unknown";
  const v = value.toLowerCase();
  if (v.includes("outofstock")) return "unavailable";
  if (v.includes("instock") || v.includes("limitedavailability")) return "available";
  if (v.includes("discontinued") || v.includes("soldout")) return "unavailable";
  return "unknown";
}

function parseMassGramsFromText(...parts: Array<string | null>): {
  massGrams: number | null;
  weightEvidence: string | null;
} {
  const blob = parts.filter(Boolean).join(" ");
  if (!blob) return { massGrams: null, weightEvidence: null };

  // Kit / multi-unit ambiguity: multiple mass markers or "kit" without clear per-unit.
  const kitLike =
    /\bkit\b|\bpack\b|\bcombo\b|\bconjunto\b|\b\d+\s*unidades\b|\bmulti[- ]?pack\b/i.test(
      blob,
    );
  const matches = [...blob.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/gi)];
  if (kitLike && matches.length !== 1) {
    return { massGrams: null, weightEvidence: blob.slice(0, CLOSIN_BUDGETS.maxFieldStringLength) };
  }

  if (matches.length === 0) {
    return { massGrams: null, weightEvidence: blob.slice(0, CLOSIN_BUDGETS.maxFieldStringLength) || null };
  }

  // Prefer the first clear mass token.
  const m = matches[0]!;
  const amount = Number(m[1]!.replace(",", "."));
  const unit = m[2]!.toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) {
    return { massGrams: null, weightEvidence: blob.slice(0, CLOSIN_BUDGETS.maxFieldStringLength) };
  }
  const grams = unit === "kg" ? Math.round(amount * 1000) : Math.round(amount);
  if (!Number.isInteger(grams) || grams <= 0) {
    return { massGrams: null, weightEvidence: blob.slice(0, CLOSIN_BUDGETS.maxFieldStringLength) };
  }
  return { massGrams: grams, weightEvidence: m[0]!.slice(0, CLOSIN_BUDGETS.maxFieldStringLength) };
}

function inferMaterialColor(name: string | null): {
  materialEvidence: string | null;
  colorEvidence: string | null;
} {
  if (!name) return { materialEvidence: null, colorEvidence: null };
  const parts = name.split("-").map((p) => p.trim()).filter(Boolean);
  const materialEvidence = parts[0]?.slice(0, CLOSIN_BUDGETS.maxFieldStringLength) ?? null;
  const colorEvidence =
    parts.length >= 2 ? parts.slice(1, -1).join(" - ").slice(0, CLOSIN_BUDGETS.maxFieldStringLength) || parts[1]!.slice(0, CLOSIN_BUDGETS.maxFieldStringLength) : null;
  return { materialEvidence, colorEvidence };
}

function readOfferField(
  offer: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    if (key in offer) return offer[key];
  }
  return undefined;
}

/** Fixed HTML data-hook selectors used as fallback extraction. */
const PRICE_HOOK_SELECTORS = [
  /data-hook=["']formatted-primary-price["'][^>]*>([^<]+)</i,
  /data-hook=["']formatted-secondary-price["'][^>]*>([^<]+)</i,
] as const;

if (PRICE_HOOK_SELECTORS.length > CLOSIN_BUDGETS.maxParserSelectors) {
  throw new Error("Closin parser selector count exceeds maxParserSelectors");
}

/** HTML data-hook fallback for listing price text when JSON-LD price is absent. */
export function extractPriceHooks(html: string): {
  listingPriceRaw: string | null;
  originalPriceRaw: string | null;
} {
  const [primaryRe, compareRe] = PRICE_HOOK_SELECTORS;
  const primary = html.match(primaryRe);
  const compare = html.match(compareRe);
  return {
    listingPriceRaw: primary?.[1]?.replace(/\u00a0/g, " ").trim() ?? null,
    originalPriceRaw: compare?.[1]?.replace(/\u00a0/g, " ").trim() ?? null,
  };
}

export function extractClosinPdp(html: string, sourceUrl: string): ExtractedCandidate {
  const blocks = extractJsonLdBlocks(html);
  const product = pickProduct(blocks);
  const name =
    typeof product?.name === "string" ? product.name.slice(0, CLOSIN_BUDGETS.maxFieldStringLength) : null;
  const description =
    typeof product?.description === "string"
      ? product.description.slice(0, CLOSIN_BUDGETS.maxFieldStringLength)
      : null;
  const sku =
    typeof product?.sku === "string" ? product.sku.slice(0, 256) : null;
  const brandRec = asRecord(product?.brand);
  const brandEvidence =
    typeof brandRec?.name === "string"
      ? brandRec.name.slice(0, CLOSIN_BUDGETS.maxFieldStringLength)
      : typeof product?.brand === "string"
        ? product.brand.slice(0, CLOSIN_BUDGETS.maxFieldStringLength)
        : null;

  const offersRaw = product?.Offers ?? product?.offers;
  const offer = Array.isArray(offersRaw)
    ? asRecord(offersRaw[0])
    : asRecord(offersRaw);

  const priceRaw =
    offer && typeof readOfferField(offer, "price", "Price") === "string"
      ? String(readOfferField(offer, "price", "Price"))
      : offer && typeof readOfferField(offer, "price", "Price") === "number"
        ? String(readOfferField(offer, "price", "Price"))
        : null;

  const availability = availabilityFromSchema(
    readOfferField(offer ?? {}, "availability", "Availability"),
  );

  const hooks = extractPriceHooks(html);
  const listingParsed = parseBrlToCentavos(priceRaw ?? hooks.listingPriceRaw);
  const originalParsed = parseBrlToCentavos(hooks.originalPriceRaw);

  const { materialEvidence, colorEvidence } = inferMaterialColor(name);
  const mass = parseMassGramsFromText(name, description);

  return {
    sourceUrl,
    merchantVariantId: sku,
    titleEvidence: name,
    descriptionEvidence: description,
    brandEvidence,
    materialEvidence,
    weightEvidence: mass.weightEvidence,
    colorEvidence,
    diameterEvidence: null,
    massGrams: mass.massGrams,
    availability,
    listingPriceCentavos: listingParsed.centavos,
    originalPriceCentavos: originalParsed.centavos,
    listingPriceRaw: listingParsed.raw ?? hooks.listingPriceRaw,
    originalPriceRaw: originalParsed.raw,
  };
}

export function toRawObservation(input: {
  candidate: ExtractedCandidate;
  runId: string;
  probeId: string | null;
  observedAt: string;
}): RawOfferObservation {
  const c = input.candidate;
  return {
    contractVersion: RAW_OFFER_OBSERVATION_CONTRACT_VERSION,
    storeId: CLOSIN_STORE_ID,
    runId: input.runId,
    probeId: input.probeId,
    sourceUrl: c.sourceUrl,
    merchantVariantId: c.merchantVariantId,
    availability: c.availability,
    price: {
      listingPriceCentavos: c.listingPriceCentavos,
      originalPriceCentavos: c.originalPriceCentavos,
      listingPriceRaw: c.listingPriceRaw,
      originalPriceRaw: c.originalPriceRaw,
    },
    brandEvidence: c.brandEvidence,
    materialEvidence: c.materialEvidence,
    weightEvidence: c.weightEvidence,
    colorEvidence: c.colorEvidence,
    diameterEvidence: c.diameterEvidence,
    massGrams: c.massGrams,
    observedAt: input.observedAt,
    mapVersion: CLOSIN_MAP_VERSION,
    parserVersion: CLOSIN_PARSER_VERSION,
  };
}

export function discoverProductUrlsFromSitemap(xml: string, max: number): string[] {
  const urls: string[] = [];
  const re = /<loc>\s*(https:\/\/www\.closin\.com\.br\/product-page\/[^<\s]+)\s*<\/loc>/gi;
  for (const match of xml.matchAll(re)) {
    const url = match[1];
    if (!url) continue;
    urls.push(url);
    if (urls.length >= max) break;
  }
  return urls;
}
