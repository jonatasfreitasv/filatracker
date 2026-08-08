import { describe, expect, it } from "vitest";

import { callGetSearchPage } from "../../src/adapters/service-binding/client";
import type { SearchPageRpcOutcome } from "../../src/contracts";

describe("service-binding client retry", () => {
  it("retries once for unavailable then returns success", async () => {
    let calls = 0;
    const ingest = {
      async getSearchPage(): Promise<SearchPageRpcOutcome> {
        calls += 1;
        if (calls === 1) {
          return {
            outcome: "unavailable",
            contractVersion: 1,
            projectionEpoch: 0,
            supportEpoch: 0,
            correlationId: "11111111-1111-4111-8111-111111111111",
            retryAfterSeconds: 5,
          };
        }
        return {
          outcome: "ok",
          contractVersion: 1,
          projectionEpoch: 1,
          supportEpoch: 1,
          correlationId: "22222222-2222-4222-8222-222222222222",
          data: {
            query: null,
            hits: [],
            totalCount: 0,
            materialFamilySuggestions: [],
            limits: {
              maxHits: 50,
              maxQueryScalars: 120,
              maxQueryUtf8Bytes: 512,
            },
          },
        };
      },
    };

    const result = await callGetSearchPage(ingest, {});
    expect(calls).toBe(2);
    expect(result.outcome).toBe("ok");
  });

  it("does not retry more than once", async () => {
    let calls = 0;
    const ingest = {
      async getSearchPage(): Promise<SearchPageRpcOutcome> {
        calls += 1;
        return {
          outcome: "unavailable",
          contractVersion: 1,
          projectionEpoch: 0,
          supportEpoch: 0,
          correlationId: "11111111-1111-4111-8111-111111111111",
          retryAfterSeconds: 5,
        };
      },
    };

    const result = await callGetSearchPage(ingest, {});
    expect(calls).toBe(2);
    expect(result.outcome).toBe("unavailable");
  });
});
