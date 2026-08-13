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

  it("carries the caller correlation ID through the Worker and application", async () => {
    const correlationId = "44444444-4444-4444-8444-444444444444";
    const service = Object.create(IngestService.prototype) as IngestService;
    Object.defineProperty(service, "env", { value: { DB: env.DB }, configurable: true });
    const result = await service.getSearchPage({ q: "closin" }, correlationId);
    expect(result.correlationId).toBe(correlationId);
  });

  it("migration creates projection_meta and Story 1.3 publication tables", async () => {
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
    expect(names).toContain("projection_meta");
    expect(names).toContain("offers");
    expect(names).toContain("ingestion_runs");
    expect(names).toContain("ingestion_inbox");
    expect(names).toContain("price_points");
    expect(names).toContain("store_state");
    expect(names).toContain("retained_payloads");
    expect(names).toContain("publication_claims");

    const closin = await env.DB.prepare(
      "SELECT activation_gate, support_state FROM store_state WHERE store_id = 'closin'",
    ).first<{ activation_gate: string; support_state: string }>();
    expect(closin?.activation_gate).toBe("blocked");
    expect(closin?.support_state).toBe("unsupported");
  });
});
