import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SearchPageRpcOutcomeNMinus1Schema,
  SearchPageRpcOutcomeSchema,
  SEARCH_PAGE_CONTRACT_VERSION,
} from "../../src/contracts";

describe("SearchPage contract N/N-1", () => {
  const sampleOk = {
    outcome: "ok" as const,
    contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
    projectionEpoch: 1,
    supportEpoch: 1,
    correlationId: "11111111-1111-4111-8111-111111111111",
    data: {
      query: null,
      hits: [],
      totalCount: 0,
      materialFamilySuggestions: [],
      limits: {
        maxHits: 50 as const,
        maxQueryScalars: 120 as const,
        maxQueryUtf8Bytes: 512 as const,
      },
    },
  };

  it("decodes current envelope as N", () => {
    expect(SearchPageRpcOutcomeSchema.parse(sampleOk).outcome).toBe("ok");
  });

  it("decodes current envelope as N-1 (adjacent baseline)", () => {
    expect(SearchPageRpcOutcomeNMinus1Schema.parse(sampleOk).outcome).toBe(
      "ok",
    );
  });

  it("rejects notFound and gone for getSearchPage v1 shape usage in tests", () => {
    const notFound = {
      ...sampleOk,
      outcome: "notFound",
      data: undefined,
    };
    expect(SearchPageRpcOutcomeSchema.safeParse(notFound).success).toBe(false);

    const gone = { ...sampleOk, outcome: "gone", data: undefined };
    expect(SearchPageRpcOutcomeSchema.safeParse(gone).success).toBe(false);
  });
});

describe("binding-denial: web must not bind D1/queues/schedules/Store secrets", () => {
  it("wrangler.web.jsonc has no privileged ingest bindings", () => {
    const raw = readFileSync(
      resolve(process.cwd(), "wrangler.web.jsonc"),
      "utf8",
    );
    // Strip comments for a coarse inventory check
    const jsonish = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    expect(jsonish).not.toMatch(/"d1_databases"/);
    expect(jsonish).not.toMatch(/"queues"/);
    expect(jsonish).not.toMatch(/"triggers"/);
    expect(jsonish).not.toMatch(/"crons"/);
    expect(jsonish).not.toMatch(/STORE_/);
    expect(jsonish).toMatch(/"service":\s*"filatracker-ingest"/);
    expect(jsonish).toMatch(/"binding":\s*"INGEST"/);
  });

  it("exactly two worker configs exist (web + ingest)", () => {
    const web = readFileSync(resolve("wrangler.web.jsonc"), "utf8");
    const ingest = readFileSync(resolve("wrangler.ingest.jsonc"), "utf8");
    expect(web).toMatch(/"name":\s*"filatracker-web"/);
    expect(ingest).toMatch(/"name":\s*"filatracker-ingest"/);
    expect(ingest).toMatch(/"d1_databases"/);
    expect(ingest).toMatch(/"workers_dev":\s*false/);
  });
});
