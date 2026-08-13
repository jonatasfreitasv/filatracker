import { afterEach, describe, expect, it, vi } from "vitest";

import { callGetSearchPage } from "../../src/adapters/service-binding/client";
import { SEARCH_PAGE_CONTRACT_VERSION } from "../../src/contracts";

describe("service-binding client retry", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it("retries once for unavailable then returns v2 success", async () => {
    let calls = 0;
    const ingest = {
      async getSearchPage(_query: unknown, correlationId: string): Promise<unknown> {
        calls += 1;
        if (calls === 1) {
          return {
            outcome: "unavailable",
            contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
            projectionEpoch: 0,
            supportEpoch: 0,
            correlationId,
            retryAfterSeconds: 5,
          };
        }
        return {
          outcome: "ok",
          contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
          projectionEpoch: 1,
          supportEpoch: 1,
          correlationId,
          data: {
            query: null,
            hits: [],
            totalCount: 0,
            materialFamilySuggestions: [],
            storeSupport: [],
            nextCursor: null,
            hasNextPage: false,
            limits: {
              maxHits: 50,
              maxQueryScalars: 120,
              maxQueryUtf8Bytes: 512,
              maxCursorUtf8Bytes: 1024,
            },
          },
        };
      },
    };

    const result = await callGetSearchPage(ingest, {});
    expect(calls).toBe(2);
    expect(result.outcome).toBe("ok");
    expect(result.contractVersion).toBe(SEARCH_PAGE_CONTRACT_VERSION);
  });

  it("does not retry more than once", async () => {
    let calls = 0;
    const ingest = {
      async getSearchPage(_query: unknown, correlationId: string): Promise<unknown> {
        calls += 1;
        return {
          outcome: "unavailable",
          contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
          projectionEpoch: 0,
          supportEpoch: 0,
          correlationId,
          retryAfterSeconds: 5,
        };
      },
    };

    const result = await callGetSearchPage(ingest, {});
    expect(calls).toBe(2);
    expect(result.outcome).toBe("unavailable");
  });

  it("maps unknown version to unavailable without logging raw query", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ingest = {
      async getSearchPage(): Promise<unknown> {
        return { outcome: "ok", contractVersion: 99 };
      },
    };
    const result = await callGetSearchPage(ingest, { q: "SECRET_PLA" });
    expect(result.outcome).toBe("unavailable");
    expect(log).toHaveBeenCalledWith(
      "Service Binding getSearchPage decode failed",
      { code: "unknown_version", correlationId: result.correlationId },
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET_PLA");
    log.mockRestore();
  });

  it("applies only the remaining deadline to the retry attempt", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const correlationIds: string[] = [];
    const ingest = {
      async getSearchPage(_query: unknown, correlationId: string): Promise<unknown> {
        calls += 1;
        correlationIds.push(correlationId);
        if (calls === 1) {
          return {
            outcome: "unavailable",
            contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
            projectionEpoch: 0,
            supportEpoch: 0,
            correlationId,
            retryAfterSeconds: 5,
          };
        }
        return new Promise(() => undefined);
      },
    };
    const pending = callGetSearchPage(ingest, {}, { deadlineMs: 300 });
    await vi.advanceTimersByTimeAsync(250);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(50);
    const result = await pending;
    expect(result.outcome).toBe("unavailable");
    expect(calls).toBe(2);
    expect(new Set(correlationIds).size).toBe(1);
    expect(result.correlationId).toBe(correlationIds[0]);
  });

  it("passes remaining deadline budget into ingest getSearchPage", async () => {
    const budgets: number[] = [];
    const ingest = {
      async getSearchPage(
        _query: unknown,
        correlationId: string,
        deadlineMs?: number,
      ): Promise<unknown> {
        budgets.push(deadlineMs ?? -1);
        return {
          outcome: "ok",
          contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
          projectionEpoch: 1,
          supportEpoch: 1,
          correlationId,
          data: {
            query: null,
            hits: [],
            totalCount: 0,
            materialFamilySuggestions: [],
            storeSupport: [],
            nextCursor: null,
            hasNextPage: false,
            limits: {
              maxHits: 50,
              maxQueryScalars: 120,
              maxQueryUtf8Bytes: 512,
              maxCursorUtf8Bytes: 1024,
            },
          },
        };
      },
    };
    const result = await callGetSearchPage(ingest, {}, { deadlineMs: 500 });
    expect(result.outcome).toBe("ok");
    expect(budgets[0]).toBeGreaterThan(0);
    expect(budgets[0]).toBeLessThanOrEqual(500);
  });
});
