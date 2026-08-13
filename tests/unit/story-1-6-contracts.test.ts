import { describe, expect, it } from "vitest";

import {
  BROWSE_PAGE_CONTRACT_VERSION,
  SEARCH_PAGE_CONTRACT_VERSION,
  decodeBrowsePageRpcOutcome,
  decodeSearchPageRpcOutcome,
  parseBrowsePageQuery,
} from "../../src/contracts";
import { rebuildTaxonomyAndFtsShadow } from "../../src/adapters/persistence/fts-writer";

const correlationId = "11111111-1111-4111-8111-111111111111";

describe("BrowsePage v1", () => {
  it("parses kind/slug and rejects unknown keys", () => {
    expect(parseBrowsePageQuery({ kind: "material", slug: "petg" }).ok).toBe(true);
    expect(parseBrowsePageQuery({ kind: "brand", slug: "voolt3d", type: "pla" }).ok).toBe(true);
    expect(parseBrowsePageQuery({ kind: "material", slug: "PETG" }).ok).toBe(false);
    expect(parseBrowsePageQuery({ kind: "store", slug: "closin" }).ok).toBe(false);
  });

  it("decodes notFound and gone for browse and rejects them for search", () => {
    const notFound = {
      outcome: "notFound" as const,
      contractVersion: BROWSE_PAGE_CONTRACT_VERSION,
      projectionEpoch: 1,
      supportEpoch: 1,
      correlationId,
    };
    const gone = {
      outcome: "gone" as const,
      contractVersion: BROWSE_PAGE_CONTRACT_VERSION,
      projectionEpoch: 1,
      supportEpoch: 1,
      correlationId,
    };
    expect(decodeBrowsePageRpcOutcome(notFound).ok).toBe(true);
    expect(decodeBrowsePageRpcOutcome(gone).ok).toBe(true);
    expect(decodeSearchPageRpcOutcome({
      ...notFound,
      contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
    }).ok).toBe(false);
    expect(decodeSearchPageRpcOutcome({
      ...gone,
      contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
    }).ok).toBe(false);
  });

  it("rejects open-redirect alias targets in the browse query slug", () => {
    expect(parseBrowsePageQuery({
      kind: "brand",
      slug: "https://evil.example",
    }).ok).toBe(false);
    expect(parseBrowsePageQuery({
      kind: "material",
      slug: "../petg",
    }).ok).toBe(false);
  });
});

describe("taxonomy rebuild helper", () => {
  it("rejects mixed/invalid taxonomy targets without touching D1", async () => {
    const db = {
      prepare() {
        throw new Error("should_not_query");
      },
    } as unknown as D1Database;
    const result = await rebuildTaxonomyAndFtsShadow(db, "2026-08-13T00:00:00.000Z", {
      expectedTaxonomyVersion: 2,
      targetTaxonomyVersion: 1,
    });
    expect(result).toEqual({
      ok: false,
      code: "mixed_taxonomy",
      detail: "invalid_taxonomy_target",
    });
  });
});
