import { describe, expect, it } from "vitest";

import { createVoolt3dStoreAdapter } from "../../src/adapters/stores/voolt3d/adapter";
import { VOOLT3D_BUDGETS } from "../../src/adapters/stores/voolt3d/budgets";
import { emitStoreTelemetry } from "../../src/application/telemetry-redaction";

const robotsUrl = "https://voolt3d.com.br/robots.txt";
const allowRobots = "User-agent: *\nAllow: /\n";

function pdp(url: string, name: string, sku: string): string {
  return `<!DOCTYPE html><html><head>
<script type="application/ld+json">${JSON.stringify({
    "@type": "Product",
    "@id": url,
    name,
    sku,
    brand: { name: "Voolt3D" },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "BRL",
      price: "10.0",
      availability: "https://schema.org/InStock",
    },
  })}</script>
</head><body></body></html>`;
}

describe("Voolt3D adapter budgets all-or-nothing", () => {
  it("returns oversized when candidate count exceeds budget", async () => {
    const adapter = createVoolt3dStoreAdapter();
    const sitemapUrls = Array.from(
      { length: VOOLT3D_BUDGETS.maxCandidatesPerRun + 1 },
      (_, i) =>
        `https://voolt3d.com.br/produtos/filamento-pla-budget-${i}-1kg/`,
    );
    const sitemap = `<?xml version="1.0"?><urlset>${sitemapUrls
      .map((u) => `<url><loc>${u}</loc></url>`)
      .join("")}</urlset>`;

    const result = await adapter.observe({
      runId: "budget-oversize",
      probeId: null,
      fixtureBodies: new Map([
        [robotsUrl, allowRobots],
        ["https://voolt3d.com.br/sitemap.xml", sitemap],
      ]),
    });

    expect(result.outcome).toBe("oversized");
    expect(result.observations).toEqual([]);
    expect(result.failureCodes).toContain("budget_overflow");
  });

  it("completes within measured bound + margin for a small fixture set", async () => {
    const adapter = createVoolt3dStoreAdapter();
    const url =
      "https://voolt3d.com.br/produtos/filamento-pla-branco-dental-premium/";
    const result = await adapter.observe({
      runId: "budget-ok",
      probeId: "fixtures",
      fixtureBodies: new Map([
        [robotsUrl, allowRobots],
        [url, pdp(url, "Filamento PLA Branco Dental - 1Kg", "PL-BR-DT-1")],
      ]),
    });
    expect(result.outcome).toBe("complete");
    expect(result.observations).toHaveLength(1);
    expect(result.budgetUsage.observationCount).toBe(1);
  });

  it("fails closed when sitemap discovery yields an empty catalog", async () => {
    const adapter = createVoolt3dStoreAdapter();
    const result = await adapter.observe({
      runId: "empty-catalog",
      probeId: null,
      fixtureBodies: new Map([
        [robotsUrl, allowRobots],
        [
          "https://voolt3d.com.br/sitemap.xml",
          '<?xml version="1.0"?><urlset></urlset>',
        ],
      ]),
    });
    expect(result.outcome).toBe("failed");
    expect(result.observations).toEqual([]);
    expect(result.failureCodes).toContain("empty_catalog");
  });

  it("records measured catalog bound with ≥20% margin", () => {
    expect(VOOLT3D_BUDGETS.measuredCatalogBound).toBe(213);
    expect(VOOLT3D_BUDGETS.catalogBoundWithMargin).toBe(256);
    expect(VOOLT3D_BUDGETS.catalogBoundWithMargin).toBeGreaterThanOrEqual(
      Math.ceil(VOOLT3D_BUDGETS.measuredCatalogBound * 1.2),
    );
  });

  it("redacts telemetry to allowlisted keys only", () => {
    const redacted = emitStoreTelemetry({
      event: "test",
      storeId: "voolt3d",
      sourceUrl: "https://voolt3d.com.br/secret",
      userAgent: "should-not-appear",
      observationCount: 1,
    });
    expect(redacted).not.toHaveProperty("sourceUrl");
    expect(redacted).not.toHaveProperty("userAgent");
    expect(redacted.observationCount).toBe(1);
  });
});
