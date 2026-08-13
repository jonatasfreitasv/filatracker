import { describe, expect, it, vi } from "vitest";
import { buildSearchRetryPath } from "../../app/lib/search-url";
import { createSearchLoaderError } from "../../app/lib/search-error";

import {
  MONEY_CENTAVOS_MAX,
  SEARCH_PAGE_CONTRACT_VERSION,
  SEARCH_PAGE_CONTRACT_VERSION_V2,
  SEARCH_QUALIFICATION_MAX_UTF8_BYTES,
  SEARCH_RPC_ENVELOPE_HEADROOM_BYTES,
  SearchHitV2Schema,
  SearchPageQueryV2Schema,
  SearchPageRpcOutcomeSchema,
  SearchPageRpcOutcomeV2Schema,
  decodeSearchPageRpcOutcome,
  parseSearchPageQuery,
} from "../../src/contracts";
import { normalizeListingTitle } from "../../src/domain/policy/listing-title";
import { derivePricePerKgCentavos } from "../../src/domain/policy/price-per-kg";
import {
  buildSearchDocument,
  tokenizeSearchQuery,
} from "../../src/domain/search-query";
import {
  decodeSearchCursor,
  encodeSearchCursor,
} from "../../src/adapters/persistence/search-cursor";
import { createD1SearchCatalog } from "../../src/adapters/persistence/d1-search-catalog";
import { rebuildSearchFtsShadow } from "../../src/adapters/persistence/fts-writer";
import { transitionStoreSupport } from "../../src/adapters/persistence/store-health";

const correlationId = "11111111-1111-4111-8111-111111111111";

function emptyPageV2() {
  return {
    query: null as string | null,
    hits: [] as [],
    totalCount: 0,
    materialFamilySuggestions: [],
    storeSupport: [],
    nextCursor: null as string | null,
    hasNextPage: false,
    limits: {
      maxHits: 50 as const,
      maxQueryScalars: 120 as const,
      maxQueryUtf8Bytes: 512 as const,
      maxCursorUtf8Bytes: 1024 as const,
    },
  };
}

describe("SearchPage v2 predecessor + v3 current", () => {
  it("accepts strict current ok outcome", () => {
    const sample = {
      outcome: "ok" as const,
      contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
      projectionEpoch: 1,
      supportEpoch: 1,
      correlationId,
      data: {
        ...emptyPageV2(),
        brandSuggestions: [],
        specificTypeFacet: [],
      },
    };
    expect(SearchPageRpcOutcomeSchema.parse(sample).outcome).toBe("ok");
  });

  it("rejects unknown keys on v2 query", () => {
    expect(
      SearchPageQueryV2Schema.safeParse({ q: "pla", foo: 1 }).success,
    ).toBe(false);
  });

  it("rejects oversized raw query and bounded response text violations", () => {
    expect(SearchPageQueryV2Schema.safeParse({ q: " ".repeat(121) }).success).toBe(false);
    expect(SearchPageRpcOutcomeV2Schema.safeParse({
      outcome: "degraded",
      contractVersion: SEARCH_PAGE_CONTRACT_VERSION_V2,
      projectionEpoch: 1,
      supportEpoch: 1,
      correlationId,
      data: emptyPageV2(),
      qualification: "x".repeat(1025),
    }).success).toBe(false);
    expect(SearchPageRpcOutcomeV2Schema.safeParse({
      outcome: "invalid",
      contractVersion: SEARCH_PAGE_CONTRACT_VERSION_V2,
      projectionEpoch: 1,
      supportEpoch: 1,
      correlationId,
      errors: Array.from({ length: 9 }, () => "erro"),
    }).success).toBe(false);
  });

  it("reserves enough page-independent headroom for the largest final envelope", () => {
    const envelopeWithoutPage = {
      outcome: "degraded",
      contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
      projectionEpoch: Number.MAX_SAFE_INTEGER,
      supportEpoch: Number.MAX_SAFE_INTEGER,
      correlationId,
      qualification: "x".repeat(SEARCH_QUALIFICATION_MAX_UTF8_BYTES),
      data: null,
    };
    expect(
      new TextEncoder().encode(JSON.stringify(envelopeWithoutPage)).byteLength,
    ).toBeLessThanOrEqual(SEARCH_RPC_ENVELOPE_HEADROOM_BYTES);
  });

  it("parseSearchPageQuery accepts strict v2 and additive type", () => {
    expect(parseSearchPageQuery({ q: "pla" }).ok).toBe(true);
    expect(parseSearchPageQuery({ q: "pla", limit: 10 }).ok).toBe(true);
    expect(parseSearchPageQuery({ q: "PETG", type: "petg-hf" }).ok).toBe(true);
    expect(parseSearchPageQuery({ q: "pla", bogus: true }).ok).toBe(false);
    expect(parseSearchPageQuery({ type: "PETG HF" }).ok).toBe(false);
  });

  it("hydrates released v2 pages into v3 fields", () => {
    const decoded = decodeSearchPageRpcOutcome({
      outcome: "ok",
      contractVersion: SEARCH_PAGE_CONTRACT_VERSION_V2,
      projectionEpoch: 1,
      supportEpoch: 1,
      correlationId,
      data: emptyPageV2(),
    });
    expect(decoded.ok).toBe(true);
    if (decoded.ok && decoded.value.outcome === "ok") {
      expect(decoded.value.data.brandSuggestions).toEqual([]);
      expect(decoded.value.data.specificTypeFacet).toEqual([]);
    }
  });

  it("rejects N-2 / unknown contract versions", () => {
    const decoded = decodeSearchPageRpcOutcome({
      outcome: "ok",
      contractVersion: 0,
      projectionEpoch: 0,
      supportEpoch: 0,
      correlationId,
      data: emptyPageV2(),
    });
    expect(decoded.ok).toBe(false);
  });

  it("rejects the pre-launch v1 envelope", () => {
    expect(decodeSearchPageRpcOutcome({ contractVersion: 1 }).ok).toBe(false);
  });

  it("rejects incoherent nextCursor/hasNextPage flags", () => {
    const sample = {
      outcome: "ok" as const,
      contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
      projectionEpoch: 1,
      supportEpoch: 1,
      correlationId,
      data: {
        ...emptyPageV2(),
        brandSuggestions: [],
        specificTypeFacet: [],
        nextCursor: "cursor",
        hasNextPage: false,
      },
    };
    expect(SearchPageRpcOutcomeSchema.safeParse(sample).success).toBe(false);
  });

  it("rejects unknown keys on v2 hit", () => {
    expect(
      SearchHitV2Schema.safeParse({
        kind: "offer",
        id: "x",
        title: "t",
        brandName: null,
        materialFamily: null,
        specificTypeLabel: null,
        color: null,
        diameterMm: null,
        massGrams: null,
        listingPriceCentavos: null,
        pricePerKgCentavos: null,
        availability: "unknown",
        stale: false,
        storeId: "closin",
        storeName: null,
        observedAt: null,
        inStock: true,
      }).success,
    ).toBe(false);
  });

  it("preserves offer|merge kind while story emits offer only", () => {
    const hit = SearchHitV2Schema.parse({
      kind: "merge",
      id: "m1",
      title: "x",
      brandName: null,
      materialFamily: null,
      specificTypeLabel: null,
      color: null,
      diameterMm: null,
      massGrams: null,
      listingPriceCentavos: null,
      pricePerKgCentavos: null,
      availability: "unknown",
      stale: false,
      storeId: "closin",
      storeName: null,
      observedAt: null,
    });
    expect(hit.kind).toBe("merge");
  });
});

describe("listing title + R$/kg", () => {
  it("canonicalizes listing title and rejects controls", () => {
    expect(normalizeListingTitle("  PLA\u00A0Branco  ")).toBe("PLA Branco");
    expect(normalizeListingTitle("bad\u0000")).toBeNull();
    expect(normalizeListingTitle('<img src=x onerror=alert(1)>')).toBe(
      "<img src=x onerror=alert(1)>",
    );
  });

  it("omits R$/kg for kits and zero/invalid prices", () => {
    expect(
      derivePricePerKgCentavos({
        listingPriceCentavos: 8000,
        massGrams: 1000,
        specificType: "filament",
      }),
    ).toBe(8000);
    expect(
      derivePricePerKgCentavos({
        listingPriceCentavos: 8000,
        massGrams: 4000,
        specificType: "filament_kit",
      }),
    ).toBeNull();
    expect(
      derivePricePerKgCentavos({
        listingPriceCentavos: 2_147_483_647,
        massGrams: 999,
        specificType: "filament",
      }),
    ).toBeNull();
    expect(
      derivePricePerKgCentavos({
        listingPriceCentavos: Number.MAX_SAFE_INTEGER,
        massGrams: 1,
        specificType: "filament",
      }),
    ).toBeNull();
    expect(
      derivePricePerKgCentavos({
        listingPriceCentavos: 0,
        massGrams: 1000,
        specificType: "filament",
      }),
    ).toBeNull();
  });
});

describe("canonical tokenizer", () => {
  it("folds pt-BR diacritics and keeps PLA+", () => {
    const result = tokenizeSearchQuery("  PETG+  branco  ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tokens).toContain("petg+");
    expect(result.tokens).toContain("branco");
  });

  it("does not apply the 12-query-token cap to indexed documents", () => {
    const words = Array.from({ length: 20 }, (_, index) => `termo${index + 1}`);
    const document = buildSearchDocument([words.join(" ")]);
    expect(document.split(" ")).toEqual(words);
  });

  it("keeps punctuation-only queries as no-match candidates, not Home null", () => {
    const result = tokenizeSearchQuery("!!!");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.canonical).toBe("!!!");
    expect(result.tokens).toEqual([]);
  });

  it("caps tokens at 12", () => {
    const q = Array.from({ length: 13 }, (_, i) => `t${i}`).join(" ");
    expect(tokenizeSearchQuery(q).ok).toBe(false);
  });

  it("rejects abusive raw whitespace before collapse and emits compact digest", () => {
    expect(tokenizeSearchQuery(" ".repeat(121)).ok).toBe(false);
    const max = tokenizeSearchQuery("a".repeat(48));
    expect(max.ok).toBe(true);
    if (!max.ok) return;
    expect(max.queryDigest).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("strict search cursor", () => {
  const valid = {
    v: 2 as const,
    queryDigest: "0123456789abcdef",
    intentKind: "text" as const,
    typeSlug: null,
    taxonomyVersion: 1,
    parserVersion: 1,
    indexVersion: 1,
    projectionEpoch: 1,
    supportEpoch: 2,
    searchWriteGeneration: 3,
    limit: 50,
    sort: {
      availabilityRank: 0,
      listingPriceCentavos: 8990,
      observedAt: "2026-08-09T00:00:00.000Z",
      offerId: "off_1",
    },
  } as const;

  it("round-trips the exact bounded payload", () => {
    expect(decodeSearchCursor(encodeSearchCursor(valid))).toEqual({
      ok: true,
      payload: valid,
    });
  });

  it("rejects unknown keys, unsafe numbers and malformed timestamps", () => {
    for (const payload of [
      { ...valid, unexpected: true },
      { ...valid, projectionEpoch: Number.MAX_VALUE },
      { ...valid, sort: { ...valid.sort, availabilityRank: 7 } },
      { ...valid, sort: { ...valid.sort, listingPriceCentavos: 2_147_483_648 } },
      { ...valid, sort: { ...valid.sort, observedAt: "yesterday" } },
    ]) {
      const raw = btoa(JSON.stringify(payload))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
      expect(decodeSearchCursor(raw).ok).toBe(false);
    }
  });

  it("canonicalizes accepted UTC offsets before keyset comparison", () => {
    const encoded = encodeSearchCursor({
      ...valid,
      sort: { ...valid.sort, observedAt: "2026-08-08T21:00:00-03:00" },
    });
    const decoded = decodeSearchCursor(encoded);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.payload.sort.observedAt).toBe("2026-08-09T00:00:00.000Z");
    }
  });
});

describe("classified FTS fallback", () => {
  it("does not retry an unrelated aggregate batch failure", async () => {
    const statement = { bind: vi.fn() } as unknown as D1PreparedStatement;
    (statement.bind as unknown as ReturnType<typeof vi.fn>).mockReturnValue(statement);
    const batch = vi.fn().mockRejectedValue(new Error("database busy"));
    const db = {
      prepare: vi.fn().mockReturnValue(statement),
      batch,
    } as unknown as D1Database;
    const result = await createD1SearchCatalog(db).getSearchPageSnapshot({
      q: "pla",
      correlationId,
      evaluatedAt: new Date("2026-08-09T00:00:00.000Z"),
    });
    expect(result.outcome).toBe("unavailable");
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it("returns overloaded before constructing a page above the wire total bound", async () => {
    const statement = { bind: vi.fn() } as unknown as D1PreparedStatement;
    (statement.bind as unknown as ReturnType<typeof vi.fn>).mockReturnValue(statement);
    const batch = vi.fn().mockResolvedValue([
      { results: [{ projection_epoch: 1, support_epoch: 1, active_slot: "a",
        index_version: 1, parser_version: 1, search_projection_epoch: 1,
        search_write_generation: 1, taxonomy_version: 1 }] },
      { results: [] },
      { results: [] },
      { results: [] },
      { results: [] },
      { results: [{ n: 1_000_001 }] },
      { results: [] },
      { results: [{ n: 1_000_001 }] },
      { results: [] },
      { results: [{ n: 1_000_001 }] },
    ]);
    const db = { prepare: vi.fn().mockReturnValue(statement), batch } as unknown as D1Database;
    const result = await createD1SearchCatalog(db).getSearchPageSnapshot({
      q: "pla",
      correlationId,
      evaluatedAt: new Date("2026-08-09T00:00:00.000Z"),
    });
    expect(result.outcome).toBe("overloaded");
  });
});

describe("typed rebuild pre-claim failures", () => {
  it("maps metadata-read and ownership-claim exceptions to batch_failed", async () => {
    const metadataFailureDb = {
      prepare: vi.fn().mockReturnValue({ first: vi.fn().mockRejectedValue(new Error("db")) }),
    } as unknown as D1Database;
    await expect(rebuildSearchFtsShadow(
      metadataFailureDb,
      "2026-08-09T00:00:00.000Z",
    )).resolves.toMatchObject({ ok: false, code: "batch_failed", detail: "metadata_read_failed" });

    const meta = { active_slot: "a", index_version: 1, parser_version: 1,
      projection_epoch: 1, search_write_generation: 1, rebuild_owner: null,
      rebuild_lease_expires_at: null };
    const metadataStatement = { first: vi.fn().mockResolvedValue(meta) };
    const claimStatement = { bind: vi.fn() };
    claimStatement.bind.mockReturnValue({ run: vi.fn().mockRejectedValue(new Error("db")) });
    const claimFailureDb = {
      prepare: vi.fn()
        .mockReturnValueOnce(metadataStatement)
        .mockReturnValueOnce(claimStatement),
    } as unknown as D1Database;
    await expect(rebuildSearchFtsShadow(
      claimFailureDb,
      "2026-08-09T00:00:00.000Z",
    )).resolves.toMatchObject({ ok: false, code: "batch_failed", detail: "ownership_claim_failed" });
  });

  it("maps UUID generation failure to batch_failed before claiming", async () => {
    const meta = { active_slot: "a", index_version: 1, parser_version: 1,
      projection_epoch: 1, search_write_generation: 1, rebuild_owner: null,
      rebuild_lease_expires_at: null };
    const db = {
      prepare: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(meta) }),
    } as unknown as D1Database;
    const uuid = vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new Error("entropy unavailable");
    });
    await expect(rebuildSearchFtsShadow(
      db,
      "2026-08-09T00:00:00.000Z",
    )).resolves.toMatchObject({ ok: false, code: "batch_failed", detail: "uuid_generation_failed" });
    expect(db.prepare).toHaveBeenCalledTimes(1);
    uuid.mockRestore();
  });
});

function aggregateMeta(overrides: Record<string, unknown> = {}) {
  return {
    projection_epoch: 7,
    support_epoch: 8,
    taxonomy_version: 1,
    active_slot: "a",
    index_version: 1,
    parser_version: 1,
    search_projection_epoch: 7,
    search_write_generation: 9,
    ...overrides,
  };
}

function aggregateOffer() {
  return {
    offer_id: "off_batch",
    store_id: "closin",
    brand: "Closin",
    specific_type: "filament",
    material_family: "PLA",
    formulation_label: "PLA",
    color: null,
    diameter_mm: "1.75",
    mass_grams: 1000,
    listing_title: "PLA batch",
    listing_price_centavos: 8000,
    availability: "available",
    observed_at: "2026-08-09T00:00:00.000Z",
    stale_after: "2026-08-11T00:00:00.000Z",
    display_name: "Closin",
  };
}

function selectorDb(input: {
  selected?: "a" | "b";
  selectorError?: Error;
  meta?: Record<string, unknown>;
  rows?: Record<string, unknown>[];
}) {
  const preparedSql: string[] = [];
  const prepare = vi.fn((sql: string) => {
    preparedSql.push(sql);
    const statement = {
      bind: vi.fn(),
      first: input.selectorError
        ? vi.fn().mockRejectedValue(input.selectorError)
        : vi.fn().mockResolvedValue({ active_slot: input.selected ?? "a" }),
    };
    statement.bind.mockReturnValue(statement);
    return statement;
  });
  const offerRows = input.rows ?? [aggregateOffer()];
  const hasFts = input.selectorError === undefined;
  const results = [
    { results: [input.meta ?? aggregateMeta()] },
    { results: [] },
    { results: [] },
    { results: [] },
    { results: [] },
    { results: [{ n: offerRows.length }] },
    { results: offerRows },
    ...(hasFts
      ? [
          { results: [{ n: offerRows.length }] },
          { results: offerRows },
          { results: [{ relational_only_count: 0, fts_only_count: 0 }] },
        ]
      : []),
  ];
  const batch = vi.fn().mockResolvedValue(results);
  return {
    db: { prepare, batch } as unknown as D1Database,
    preparedSql,
    batch,
  };
}

describe("active-slot selector fencing", () => {
  it.each([
    ["availability", { availability: "corrupt" }],
    ["price", { listing_price_centavos: MONEY_CENTAVOS_MAX + 1 }],
    ["timestamp", { observed_at: "2026-08-09T03:00:00.000+03:00" }],
    ["offer id", { offer_id: "x".repeat(129) }],
  ])("returns typed overload for an unsafe raw cursor-bound %s", async (_field, override) => {
    const first = { ...aggregateOffer(), ...override };
    const second = { ...aggregateOffer(), offer_id: "off_second" };
    const fake = selectorDb({ rows: [first, second] });
    const result = await createD1SearchCatalog(fake.db).getSearchPageSnapshot({
      q: "pla",
      limit: 1,
      correlationId,
      evaluatedAt: new Date("2026-08-09T00:00:00.000Z"),
    });
    expect(result).toMatchObject({ outcome: "overloaded" });
  });

  it("rejects an invalid empty-query page before returning ok", async () => {
    const statement = { bind: vi.fn() };
    statement.bind.mockReturnValue(statement);
    const db = {
      prepare: vi.fn().mockReturnValue(statement),
      batch: vi.fn().mockResolvedValue([
        { results: [aggregateMeta()] },
        { results: [{ store_id: "closin", display_name: "x".repeat(513), support_state: "active" }] },
        { results: [] },
        { results: [] },
      ]),
    } as unknown as D1Database;
    const result = await createD1SearchCatalog(db).getSearchPageSnapshot({
      correlationId,
      evaluatedAt: new Date("2026-08-09T00:00:00.000Z"),
    });
    expect(result).toMatchObject({ outcome: "overloaded" });
  });

  it("uses only the selected MATCH table and degrades on an in-batch slot change", async () => {
    const fake = selectorDb({ selected: "a", meta: aggregateMeta({
      active_slot: "b", projection_epoch: 70, support_epoch: 80,
      search_projection_epoch: 70, search_write_generation: 90,
    }) });
    const result = await createD1SearchCatalog(fake.db).getSearchPageSnapshot({
      q: "filamento",
      correlationId,
      evaluatedAt: new Date("2026-08-09T00:00:00.000Z"),
    });
    expect(result).toMatchObject({
      outcome: "degraded",
      projectionEpoch: 70,
      supportEpoch: 80,
      searchWriteGeneration: 90,
    });
    expect(fake.preparedSql.filter((sql) => /\bMATCH\b/.test(sql))).toHaveLength(3);
    expect(fake.preparedSql.filter((sql) => /\bMATCH\b/.test(sql)).every(
      (sql) => sql.includes("search_fts_a") && !sql.includes("search_fts_b"),
    )).toBe(true);
  });

  it("uses one complete relational degraded batch when the selector fails", async () => {
    const fake = selectorDb({ selectorError: new Error("selector failed"), meta: aggregateMeta({
      projection_epoch: 17, support_epoch: 18, search_projection_epoch: 17,
      search_write_generation: 19,
    }) });
    const result = await createD1SearchCatalog(fake.db).getSearchPageSnapshot({
      q: "pla",
      correlationId,
      evaluatedAt: new Date("2026-08-09T00:00:00.000Z"),
    });
    expect(result).toMatchObject({
      outcome: "degraded",
      projectionEpoch: 17,
      supportEpoch: 18,
      searchWriteGeneration: 19,
    });
    expect(fake.batch).toHaveBeenCalledTimes(1);
    expect(fake.preparedSql.some((sql) => /\bMATCH\b/.test(sql))).toBe(false);
  });

  it.each(["projection_epoch", "support_epoch"])(
    "returns typed unavailable for unsafe %s",
    async (field) => {
      const fake = selectorDb({ meta: aggregateMeta({ [field]: Number.MAX_SAFE_INTEGER + 1 }) });
      const result = await createD1SearchCatalog(fake.db).getSearchPageSnapshot({
        q: "pla",
        correlationId,
        evaluatedAt: new Date("2026-08-09T00:00:00.000Z"),
      });
      expect(result).toMatchObject({
        outcome: "unavailable",
        projectionEpoch: 0,
        supportEpoch: 0,
      });
    },
  );
});

describe("support transition typed setup failures", () => {
  it("returns batch_failed without batching when transition UUID generation fails", async () => {
    const currentStatement = { bind: vi.fn() };
    currentStatement.bind.mockReturnValue({
      first: vi.fn().mockResolvedValue({ support_state: "active", support_generation: 1 }),
    });
    const selectorStatement = {
      first: vi.fn().mockResolvedValue({ active_slot: "a" }),
    };
    const batch = vi.fn();
    const db = {
      prepare: vi.fn()
        .mockReturnValueOnce(currentStatement)
        .mockReturnValueOnce(selectorStatement),
      batch,
    } as unknown as D1Database;
    const uuid = vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new Error("entropy unavailable");
    });
    await expect(transitionStoreSupport(db, {
      storeId: "closin",
      toState: "degraded",
      actor: "system",
      reason: "test",
      nowIso: "2026-08-09T00:00:00.000Z",
    })).resolves.toEqual({ ok: false, code: "batch_failed" });
    expect(batch).not.toHaveBeenCalled();
    uuid.mockRestore();
  });
});

describe("search continuation retry", () => {
  it("preserves the canonical query and opaque cursor", () => {
    const outcome = {
      outcome: "unavailable" as const,
      contractVersion: 2 as const,
      projectionEpoch: 3,
      supportEpoch: 4,
      correlationId: "33333333-3333-4333-8333-333333333333",
      retryAfterSeconds: 5,
    };
    const thrownPayload = createSearchLoaderError({
      kind: "unavailable",
      outcome,
      query: "PLA+ branco",
      cursor: "opaque/cursor==",
      retryAfterSeconds: 5,
    });
    expect(thrownPayload).toMatchObject({
      kind: "unavailable",
      query: "PLA+ branco",
      cursor: "opaque/cursor==",
    });
    const retry = buildSearchRetryPath(thrownPayload.query, thrownPayload.cursor);
    const url = new URL(retry, "https://filatracker.local");
    expect(url.pathname).toBe("/search");
    expect(url.searchParams.get("q")).toBe("PLA+ branco");
    expect(url.searchParams.get("cursor")).toBe("opaque/cursor==");
  });
});
