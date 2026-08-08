import { describe, expect, it } from "vitest";

import { createClosinStoreAdapter } from "../../src/adapters/stores/closin/adapter";
import { CLOSIN_BUDGETS } from "../../src/adapters/stores/closin/budgets";
import { emitStoreTelemetry } from "../../src/application/telemetry-redaction";

const robotsUrl = "https://www.closin.com.br/robots.txt";
const allowRobots = "User-agent: *\nAllow: /\n";

function pdp(url: string, name: string, sku: string): string {
  return `<!DOCTYPE html><html><head>
<script type="application/ld+json">${JSON.stringify({
    "@type": "Product",
    name,
    sku,
    brand: { name: "Closin" },
    Offers: {
      "@type": "Offer",
      url,
      priceCurrency: "BRL",
      price: "10.0",
      Availability: "https://schema.org/InStock",
    },
  })}</script>
</head><body></body></html>`;
}

describe("adapter budgets all-or-nothing", () => {
  it("returns oversized when candidate count exceeds budget", async () => {
    const adapter = createClosinStoreAdapter();
    const sitemapUrls = Array.from(
      { length: CLOSIN_BUDGETS.maxCandidatesPerRun + 1 },
      (_, i) =>
        `https://www.closin.com.br/product-page/pla-budget-${i}-1kg`,
    );
    const sitemap = `<?xml version="1.0"?><urlset>${sitemapUrls
      .map((u) => `<url><loc>${u}</loc></url>`)
      .join("")}</urlset>`;

    const result = await adapter.observe({
      runId: "budget-oversize",
      probeId: null,
      fixtureBodies: new Map([
        [robotsUrl, allowRobots],
        ["https://www.closin.com.br/store-products-sitemap.xml", sitemap],
      ]),
    });

    expect(result.outcome).toBe("oversized");
    expect(result.observations).toEqual([]);
    expect(result.failureCodes).toContain("budget_overflow");
  });

  it("completes within measured bound + margin for a small fixture set", async () => {
    const adapter = createClosinStoreAdapter();
    const url = "https://www.closin.com.br/product-page/pla-branco-1kg";
    const result = await adapter.observe({
      runId: "budget-ok",
      probeId: "fixtures",
      fixtureBodies: new Map([
        [robotsUrl, allowRobots],
        [url, pdp(url, "PLA - Branco - 1kg", "CLO-PLA-01BRA")],
      ]),
    });
    expect(result.outcome).toBe("complete");
    expect(result.observations).toHaveLength(1);
    expect(result.budgetUsage.observationCount).toBe(1);
  });

  it("redacts telemetry to allowlisted keys only", () => {
    const redacted = emitStoreTelemetry({
      event: "test",
      storeId: "closin",
      sourceUrl: "https://www.closin.com.br/secret",
      userAgent: "should-not-appear",
      observationCount: 1,
    });
    expect(redacted).not.toHaveProperty("sourceUrl");
    expect(redacted).not.toHaveProperty("userAgent");
    expect(redacted.observationCount).toBe(1);
  });
});
