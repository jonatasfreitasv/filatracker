import { describe, expect, it } from "vitest";

import { normalizeSearchQuery } from "../../src/domain/search-query";
import { getSearchPage } from "../../src/application/get-search-page";
import type { SearchCatalogPort } from "../../src/application/ports";

function emptyCatalog(): SearchCatalogPort {
  return {
    async getEpochs() {
      return { projectionEpoch: 1, supportEpoch: 1 };
    },
    async searchPublished() {
      return { hits: [], totalCount: 0, materialFamilySuggestions: [] };
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
  });
});

describe("getSearchPage", () => {
  it("returns ok with zero hits for empty catalog", async () => {
    const result = await getSearchPage(emptyCatalog(), {});
    expect(result.outcome).toBe("ok");
    if (result.outcome === "ok") {
      expect(result.data.hits).toEqual([]);
      expect(result.data.totalCount).toBe(0);
      expect(result.data.materialFamilySuggestions).toEqual([]);
      expect(result.data.query).toBeNull();
    }
  });

  it("returns invalid for over-limit query", async () => {
    const result = await getSearchPage(emptyCatalog(), {
      q: "x".repeat(200),
    });
    expect(result.outcome).toBe("invalid");
  });

  it("returns invalid for unknown parameters flag", async () => {
    const result = await getSearchPage(emptyCatalog(), {
      hasInvalidParameters: true,
    });
    expect(result.outcome).toBe("invalid");
  });

  it("maps catalog failures to unavailable", async () => {
    const catalog: SearchCatalogPort = {
      async getEpochs() {
        throw new Error("boom");
      },
      async searchPublished() {
        return { hits: [], totalCount: 0, materialFamilySuggestions: [] };
      },
    };
    const result = await getSearchPage(catalog, { q: "pla" });
    expect(result.outcome).toBe("unavailable");
  });

  it("never fabricates offers on empty catalog search", async () => {
    const result = await getSearchPage(emptyCatalog(), { q: "closin" });
    expect(result.outcome).toBe("ok");
    if (result.outcome === "ok") {
      expect(result.data.hits).toHaveLength(0);
    }
  });
});
