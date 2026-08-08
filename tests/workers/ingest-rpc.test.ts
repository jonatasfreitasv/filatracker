import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { getSearchPage } from "../../src/application/get-search-page";
import { createD1SearchCatalog } from "../../src/adapters/persistence/d1-search-catalog";
import { IngestService } from "../../workers/ingest";

describe("ingest getSearchPage RPC (workers)", () => {
  it("returns ok empty page after migrations", async () => {
    const catalog = createD1SearchCatalog(env.DB);
    const result = await getSearchPage(catalog, { q: "closin" });

    expect(result.outcome).toBe("ok");
    if (result.outcome === "ok") {
      expect(result.data.hits).toEqual([]);
      expect(result.data.totalCount).toBe(0);
      expect(result.projectionEpoch).toBe(1);
      expect(result.supportEpoch).toBe(1);
    }
  });

  it("exposes IngestService entrypoint for Service Binding RPC", () => {
    expect(typeof IngestService).toBe("function");
  });

  it("migration creates singleton projection_meta only", async () => {
    const row = await env.DB.prepare(
      "SELECT projection_epoch, support_epoch FROM projection_meta WHERE id = 1",
    ).first<{ projection_epoch: number; support_epoch: number }>();

    expect(row?.projection_epoch).toBe(1);
    expect(row?.support_epoch).toBe(1);

    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'",
    ).all<{ name: string }>();

    const names = (tables.results ?? [])
      .map((t: { name: string }) => t.name)
      .sort();
    expect(names).toEqual(["projection_meta"]);
  });
});
