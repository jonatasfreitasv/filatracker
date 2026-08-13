import { describe, expect, it, vi } from "vitest";

import { normalizeSearchQuery } from "../../src/domain/search-query";
import { getSearchPage } from "../../src/application/get-search-page";
import type {
  SearchCatalogPort,
  SearchPageSnapshot,
} from "../../src/application/ports";
import {
  SEARCH_PAGE_CONTRACT_VERSION,
  type SearchPage,
} from "../../src/contracts";

function emptyPage(query: string | null): SearchPage {
  return {
    query,
    hits: [],
    totalCount: 0,
    materialFamilySuggestions: [],
    brandSuggestions: [],
    specificTypeFacet: [],
    storeSupport: [],
    nextCursor: null,
    hasNextPage: false,
    limits: {
      maxHits: 50,
      maxQueryScalars: 120,
      maxQueryUtf8Bytes: 512,
      maxCursorUtf8Bytes: 1024,
    },
  };
}

function catalogWithSnapshot(
  snapshot: SearchPageSnapshot,
): SearchCatalogPort {
  return {
    async getSearchPageSnapshot() {
      return snapshot;
    },
  };
}

describe("normalizeSearchQuery", () => {
  it("canonicalizes empty and whitespace to null (Home)", () => {
    expect(normalizeSearchQuery("")).toEqual({ ok: true, canonical: null });
    expect(normalizeSearchQuery("   ")).toEqual({ ok: true, canonical: null });
    expect(normalizeSearchQuery("\t\n")).toEqual({ ok: true, canonical: null });
  });

  it("applies NFKC, trim, and whitespace collapse", () => {
    expect(normalizeSearchQuery("  PLA\u00A0plus  ")).toEqual({
      ok: true,
      canonical: "PLA plus",
    });
  });

  it("rejects control characters", () => {
    expect(normalizeSearchQuery("pla\u0000")).toEqual({
      ok: false,
      reason: "control_character",
    });
  });

  it("rejects over-limit scalar and utf-8 input", () => {
    const long = "a".repeat(121);
    expect(normalizeSearchQuery(long)).toEqual({
      ok: false,
      reason: "over_limit",
    });
    expect(normalizeSearchQuery(" ".repeat(121))).toEqual({
      ok: false,
      reason: "over_limit",
    });
  });
});

describe("getSearchPage", () => {
  it("propagates one supplied correlation ID into catalog and envelope", async () => {
    const correlationId = "33333333-3333-4333-8333-333333333333";
    let catalogCorrelationId: string | undefined;
    const catalog: SearchCatalogPort = {
      async getSearchPageSnapshot(input) {
        catalogCorrelationId = input.correlationId;
        return {
          outcome: "ok",
          projectionEpoch: 1,
          supportEpoch: 1,
          searchWriteGeneration: 0,
          page: emptyPage(null),
          qualification: null,
        };
      },
    };
    const result = await getSearchPage(catalog, { correlationId });
    expect(catalogCorrelationId).toBe(correlationId);
    expect(result.correlationId).toBe(correlationId);
  });

  it("returns ok with zero hits for empty catalog", async () => {
    const result = await getSearchPage(
      catalogWithSnapshot({
        outcome: "ok",
        projectionEpoch: 1,
        supportEpoch: 1,
        searchWriteGeneration: 0,
        page: emptyPage(null),
        qualification: null,
      }),
      {},
    );
    expect(result.outcome).toBe("ok");
    expect(result.contractVersion).toBe(SEARCH_PAGE_CONTRACT_VERSION);
    if (result.outcome === "ok") {
      expect(result.data.hits).toEqual([]);
      expect(result.data.totalCount).toBe(0);
      expect(result.data.query).toBeNull();
    }
  });

  it("returns invalid for unknown parameters flag", async () => {
    const result = await getSearchPage(
      catalogWithSnapshot({
        outcome: "ok",
        projectionEpoch: 1,
        supportEpoch: 1,
        searchWriteGeneration: 0,
        page: emptyPage(null),
        qualification: null,
      }),
      { hasInvalidParameters: true },
    );
    expect(result.outcome).toBe("invalid");
  });

  it("maps catalog throws to unavailable without leaking error objects", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const catalog: SearchCatalogPort = {
      async getSearchPageSnapshot() {
        throw new Error("secret query PLA leaked");
      },
    };
    const result = await getSearchPage(catalog, { q: "pla" });
    expect(result.outcome).toBe("unavailable");
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/secret query|PLA leaked/);
    spy.mockRestore();
  });

  it("preserves degraded zero hits (never reclassifies as no-match)", async () => {
    const result = await getSearchPage(
      catalogWithSnapshot({
        outcome: "degraded",
        projectionEpoch: 4,
        supportEpoch: 5,
        searchWriteGeneration: 6,
        page: emptyPage("pla"),
        qualification: "FTS indisponível",
      }),
      { q: "pla" },
    );
    expect(result.outcome).toBe("degraded");
    if (result.outcome === "degraded") {
      expect(result.data.totalCount).toBe(0);
      expect(result.qualification).toMatch(/FTS/);
    }
  });
});
