/**
 * Voolt3D typed discovery/extraction hooks.
 *
 * Extraction strategy (see `extraction-decision.md`):
 * 1) Prefer bounded JSON-LD (`application/ld+json`) parsed strictly as inert text.
 * 2) Select the Product whose @id / offers.url matches the PDP URL (related-product noise).
 * 3) Documented price gap: inert `LS.variants = [...]` text when promo listing ≠ JSON-LD price.
 * 4) Never execute script, merchant markup, or runtime LLM logic.
 */

import {
  RAW_OFFER_OBSERVATION_CONTRACT_VERSION_V2,
  type Availability,
  type RawOfferObservationV2,
} from "../../../contracts/raw-offer-observation";
import {
  VOOLT3D_MAP_VERSION,
  VOOLT3D_PARSER_VERSION,
  VOOLT3D_STORE_ID,
} from "./map";
import { VOOLT3D_BUDGETS } from "./budgets";

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

const LS_VARIANTS_RE = /LS\.variants\s*=\s*(\[[\s\S]*?\])\s*;/i;

/** Extract inert JSON-LD blocks only — never evaluate as script. */
export function extractJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  for (const match of html.matchAll(LD_JSON_RE)) {
    if (out.length >= VOOLT3D_BUDGETS.maxArrayCardinality) break;
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

function collectProducts(
  nodes: unknown[],
  depth = 0,
  out: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  if (depth > VOOLT3D_BUDGETS.maxJsonLdNesting) return out;
  for (const node of nodes.slice(0, VOOLT3D_BUDGETS.maxArrayCardinality)) {
    const rec = asRecord(node);
    if (!rec) continue;
    const type = rec["@type"];
    if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
      out.push(rec);
    }
    if (Array.isArray(rec["@graph"])) {
      collectProducts(rec["@graph"] as unknown[], depth + 1, out);
    }
    const main = asRecord(rec.mainEntity);
    if (main) collectProducts([main], depth + 1, out);
  }
  return out;
}

function normalizeUrlForMatch(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    // Collapse www↔apex so related-product matching still works when the
    // fetch host differs from JSON-LD @id/offers.url host.
    let host = u.hostname.toLowerCase();
    if (host === "www.voolt3d.com.br") host = "voolt3d.com.br";
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return `${u.protocol}//${host}${path}`;
  } catch {
    return raw;
  }
}

function productMatchesPage(
  product: Record<string, unknown>,
  sourceUrl: string,
): boolean {
  const target = normalizeUrlForMatch(sourceUrl);
  const id = typeof product["@id"] === "string" ? product["@id"] : null;
  if (id && normalizeUrlForMatch(id) === target) return true;
  const offersRaw = product.offers ?? product.Offers;
  const offer = Array.isArray(offersRaw)
    ? asRecord(offersRaw[0])
    : asRecord(offersRaw);
  const offerUrl = offer && typeof offer.url === "string" ? offer.url : null;
  if (offerUrl && normalizeUrlForMatch(offerUrl) === target) return true;
  const page = asRecord(product.mainEntityOfPage);
  const pageId = page && typeof page["@id"] === "string" ? page["@id"] : null;
  if (pageId && normalizeUrlForMatch(pageId) === target) return true;
  return false;
}

function pickProductForPage(
  nodes: unknown[],
  sourceUrl: string,
): Record<string, unknown> | null {
  const products = collectProducts(nodes);
  const matched = products.find((p) => productMatchesPage(p, sourceUrl));
  return matched ?? null;
}

function parseBrlToCentavos(raw: string | number | null | undefined): {
  centavos: number | null;
  raw: string | null;
} {
  if (raw === null || raw === undefined) return { centavos: null, raw: null };
  const trimmed = String(raw).trim();
  if (!trimmed) return { centavos: null, raw: null };
  const normalized = trimmed
    .replace(/[^\d.,-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const num = Number(normalized);
  if (!Number.isFinite(num) || num <= 0) {
    return {
      centavos: null,
      raw: trimmed.slice(0, VOOLT3D_BUDGETS.maxFieldStringLength),
    };
  }
  const centavos = Math.round(num * 100);
  if (!Number.isInteger(centavos) || centavos <= 0) {
    return {
      centavos: null,
      raw: trimmed.slice(0, VOOLT3D_BUDGETS.maxFieldStringLength),
    };
  }
  return {
    centavos,
    raw: trimmed.slice(0, VOOLT3D_BUDGETS.maxFieldStringLength),
  };
}

function availabilityFromSchema(value: unknown): Availability {
  if (typeof value !== "string") return "unknown";
  const v = value.toLowerCase();
  if (v.includes("outofstock")) return "unavailable";
  if (v.includes("instock") || v.includes("limitedavailability"))
    return "available";
  if (v.includes("discontinued") || v.includes("soldout")) return "unavailable";
  return "unknown";
}

function parseMassGramsFromText(...parts: Array<string | null>): {
  massGrams: number | null;
  weightEvidence: string | null;
} {
  const blob = parts.filter(Boolean).join(" ");
  if (!blob) return { massGrams: null, weightEvidence: null };

  const kitLike =
    /\bkit\b|\bpack\b|\bcombo\b|\bconjunto\b|\bcaixa\s+master\b|\b\d+\s*unidades\b|\bmulti[- ]?pack\b/i.test(
      blob,
    );
  const matches = [...blob.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/gi)];
  if (kitLike && matches.length !== 1) {
    return {
      massGrams: null,
      weightEvidence: blob.slice(0, VOOLT3D_BUDGETS.maxFieldStringLength),
    };
  }
  // Kit with a single mass token that represents multi-unit packaging (e.g. "KIT ... 3Kg")
  // still retains null mass — shared price-per-kg omits later.
  if (kitLike) {
    return {
      massGrams: null,
      weightEvidence: blob.slice(0, VOOLT3D_BUDGETS.maxFieldStringLength),
    };
  }

  if (matches.length === 0) {
    return {
      massGrams: null,
      weightEvidence:
        blob.slice(0, VOOLT3D_BUDGETS.maxFieldStringLength) || null,
    };
  }

  const m = matches[0]!;
  const amount = Number(m[1]!.replace(",", "."));
  const unit = m[2]!.toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      massGrams: null,
      weightEvidence: blob.slice(0, VOOLT3D_BUDGETS.maxFieldStringLength),
    };
  }
  const grams = unit === "kg" ? Math.round(amount * 1000) : Math.round(amount);
  if (!Number.isInteger(grams) || grams <= 0) {
    return {
      massGrams: null,
      weightEvidence: blob.slice(0, VOOLT3D_BUDGETS.maxFieldStringLength),
    };
  }
  return {
    massGrams: grams,
    weightEvidence: m[0]!.slice(0, VOOLT3D_BUDGETS.maxFieldStringLength),
  };
}

function inferMaterialColor(name: string | null): {
  materialEvidence: string | null;
  colorEvidence: string | null;
} {
  if (!name) return { materialEvidence: null, colorEvidence: null };
  const materialMatch = name.match(
    /\b(PLA|PETG|ABS|TPU|ASA|PA(?:6)?(?:-?\s*CF)?|NYLON|PCTG|PC)\b/i,
  );
  const materialEvidence = materialMatch
    ? materialMatch[1]!.slice(0, VOOLT3D_BUDGETS.maxFieldStringLength)
    : null;

  // "Filamento PLA Branco Dental High Speed Premium - 1Kg" → color after material
  let colorEvidence: string | null = null;
  if (materialMatch && materialMatch.index !== undefined) {
    const after = name
      .slice(materialMatch.index + materialMatch[0].length)
      .replace(/^\s*[-–]?\s*/, "");
    const colorPart = after
      .split(/\s+[-–]\s+|\s+High\s+Speed|\s+Premium|\s+\d+\s*Kg/i)[0]
      ?.trim();
    if (colorPart && colorPart.length > 0 && colorPart.length < 80) {
      colorEvidence = colorPart.slice(0, VOOLT3D_BUDGETS.maxFieldStringLength);
    }
  }
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

/** Bounded inert parse of LS.variants — never execute as script. */
export function extractLsVariantsPrice(html: string): {
  listingPriceRaw: string | null;
  originalPriceRaw: string | null;
  listingPriceCentavos: number | null;
  originalPriceCentavos: number | null;
} {
  const match = html.match(LS_VARIANTS_RE);
  if (!match?.[1] || match[1].length > 100_000) {
    return {
      listingPriceRaw: null,
      originalPriceRaw: null,
      listingPriceCentavos: null,
      originalPriceCentavos: null,
    };
  }
  try {
    const variants = JSON.parse(match[1]) as unknown;
    if (!Array.isArray(variants) || variants.length === 0) {
      return {
        listingPriceRaw: null,
        originalPriceRaw: null,
        listingPriceCentavos: null,
        originalPriceCentavos: null,
      };
    }
    const first = asRecord(variants[0]);
    if (!first) {
      return {
        listingPriceRaw: null,
        originalPriceRaw: null,
        listingPriceCentavos: null,
        originalPriceCentavos: null,
      };
    }
    const listingRaw =
      typeof first.price_short === "string"
        ? first.price_short
        : typeof first.price_number === "number"
          ? String(first.price_number)
          : null;
    const compareRaw =
      typeof first.compare_at_price_short === "string"
        ? first.compare_at_price_short
        : typeof first.compare_at_price_number === "number"
          ? String(first.compare_at_price_number)
          : null;
    const listing = parseBrlToCentavos(
      typeof first.price_number === "number"
        ? first.price_number
        : listingRaw,
    );
    const original = parseBrlToCentavos(
      typeof first.compare_at_price_number === "number"
        ? first.compare_at_price_number
        : compareRaw,
    );
    return {
      listingPriceRaw: listing.raw ?? listingRaw,
      originalPriceRaw: original.raw ?? compareRaw,
      listingPriceCentavos: listing.centavos,
      originalPriceCentavos: original.centavos,
    };
  } catch {
    return {
      listingPriceRaw: null,
      originalPriceRaw: null,
      listingPriceCentavos: null,
      originalPriceCentavos: null,
    };
  }
}

const PRICE_HOOK_SELECTORS = [
  /class=["'][^"']*js-price-display[^"']*["'][^>]*>([^<]+)</i,
  /class=["'][^"']*js-compare-price-display[^"']*["'][^>]*>([^<]+)</i,
] as const;

if (PRICE_HOOK_SELECTORS.length > VOOLT3D_BUDGETS.maxParserSelectors) {
  throw new Error("Voolt3D parser selector count exceeds maxParserSelectors");
}

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

export function extractVoolt3dPdp(
  html: string,
  sourceUrl: string,
): ExtractedCandidate {
  const blocks = extractJsonLdBlocks(html);
  const product = pickProductForPage(blocks, sourceUrl);
  const name =
    typeof product?.name === "string"
      ? product.name.slice(0, VOOLT3D_BUDGETS.maxFieldStringLength)
      : null;
  const description =
    typeof product?.description === "string"
      ? product.description.slice(0, VOOLT3D_BUDGETS.maxFieldStringLength)
      : null;
  const sku =
    typeof product?.sku === "string" ? product.sku.slice(0, 256) : null;
  const brandRec = asRecord(product?.brand);
  const brandEvidence =
    typeof brandRec?.name === "string"
      ? brandRec.name.slice(0, VOOLT3D_BUDGETS.maxFieldStringLength)
      : typeof product?.brand === "string"
        ? product.brand.slice(0, VOOLT3D_BUDGETS.maxFieldStringLength)
        : null;

  const offersRaw = product?.offers ?? product?.Offers;
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

  const ls = extractLsVariantsPrice(html);
  const hooks = extractPriceHooks(html);

  let listingParsed = parseBrlToCentavos(priceRaw);
  const hookOriginalParsed = parseBrlToCentavos(hooks.originalPriceRaw);
  let originalParsed = hookOriginalParsed;

  // Documented gap: prefer LS.variants listing when present (promo-aware).
  if (ls.listingPriceCentavos !== null) {
    listingParsed = {
      centavos: ls.listingPriceCentavos,
      raw: ls.listingPriceRaw,
    };
    if (ls.originalPriceCentavos !== null) {
      originalParsed = {
        centavos: ls.originalPriceCentavos,
        raw: ls.originalPriceRaw,
      };
    }
  } else if (listingParsed.centavos === null) {
    listingParsed = parseBrlToCentavos(hooks.listingPriceRaw);
    originalParsed = hookOriginalParsed;
  }

  const { materialEvidence, colorEvidence } = inferMaterialColor(name);
  const mass = parseMassGramsFromText(name, description);

  const diameterMatch = `${name ?? ""} ${description ?? ""}`.match(
    /(\d+(?:[.,]\d+)?)\s*mm\b/i,
  );
  const diameterEvidence = diameterMatch
    ? diameterMatch[0]!.slice(0, VOOLT3D_BUDGETS.maxFieldStringLength)
    : null;

  return {
    sourceUrl,
    merchantVariantId: sku,
    titleEvidence: name,
    descriptionEvidence: description,
    brandEvidence,
    materialEvidence,
    weightEvidence: mass.weightEvidence,
    colorEvidence,
    diameterEvidence,
    massGrams: mass.massGrams,
    availability,
    listingPriceCentavos: listingParsed.centavos,
    originalPriceCentavos: originalParsed.centavos,
    listingPriceRaw: listingParsed.raw ?? hooks.listingPriceRaw,
    originalPriceRaw: originalParsed.raw ?? hooks.originalPriceRaw,
  };
}

export function toRawObservation(input: {
  candidate: ExtractedCandidate;
  runId: string;
  probeId: string | null;
  observedAt: string;
}): RawOfferObservationV2 {
  const c = input.candidate;
  return {
    contractVersion: RAW_OFFER_OBSERVATION_CONTRACT_VERSION_V2,
    storeId: VOOLT3D_STORE_ID,
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
    titleEvidence: c.titleEvidence,
    descriptionEvidence: c.descriptionEvidence,
    observedAt: input.observedAt,
    mapVersion: VOOLT3D_MAP_VERSION,
    parserVersion: VOOLT3D_PARSER_VERSION,
  };
}

/** Discover PDP URLs from Nuvemshop sitemap — /produtos/<slug>/ only. */
export function discoverProductUrlsFromSitemap(
  xml: string,
  max: number,
): string[] {
  const urls: string[] = [];
  const re =
    /<loc>\s*(https:\/\/(?:www\.)?voolt3d\.com\.br\/produtos\/[^<\s/]+\/?)\s*<\/loc>/gi;
  const seen = new Set<string>();
  for (const match of xml.matchAll(re)) {
    const url = match[1];
    if (!url) continue;
    // Exclude bare /produtos/
    if (/\/produtos\/?$/i.test(url.replace(/\/$/, ""))) continue;
    const normalized = url.endsWith("/") ? url : `${url}/`;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
    if (urls.length >= max) break;
  }
  return urls;
}
