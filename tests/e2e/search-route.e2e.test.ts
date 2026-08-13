import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";

import { startLiveAppHarness, type LiveAppHarness } from "./live-app-harness";

const axeSource = readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8");
const viewports = [
  { width: 360, height: 800 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

let browser: Browser;
let harness: LiveAppHarness;

beforeAll(async () => {
  harness = await startLiveAppHarness();
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  try {
    await browser?.close();
  } finally {
    await harness?.close();
  }
});

describe("real /search SSR → Service Binding → ingest Worker → D1", () => {
  it("reaches every page with a stable announced count and no duplicate identities", async () => {
    const ssrResponse = await fetch(`${harness.baseUrl}/search?q=filamento`);
    const ssrHtml = await ssrResponse.text();
    expect(ssrResponse.headers.get("cache-control")).toBe("no-store");
    expect(ssrHtml).toContain("&lt;img src=x onerror=alert(1)&gt; Filamento PLA Branco");
    const ssrFreshness = ssrHtml.match(
      /class="ft-mobile-label">Atualização<\/span>([^<]+)<\/td>/,
    )?.[1];
    expect(ssrFreshness).toBeTruthy();

    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto(`${harness.baseUrl}/search?q=filamento`, { waitUntil: "networkidle" });

    expect(await page.locator("table.ft-results-table tbody tr").count()).toBe(50);
    expect(await page.getByRole("status").filter({ hasText: "140 resultado(s)" }).count()).toBe(1);
    expect(await page.getByText("suporte degradado", { exact: false }).count()).toBe(1);
    expect(await page.getByRole("link", { name: "Próxima página" }).count()).toBe(1);
    expect(await page.locator("img").count()).toBe(0);
    expect(await page.getByText("Ver preços").count()).toBe(0);
    expect(await page.getByText("Ver na loja").count()).toBe(0);
    expect(await page.locator("img[src='x']").count()).toBe(0);
    expect(await page.getByText("<img src=x onerror=alert(1)> Filamento PLA Branco").count()).toBe(1);
    const hydratedFreshness = await page.locator("tbody tr").first().locator("td").last().textContent();
    expect(hydratedFreshness?.replace("Atualização", "")).toBe(ssrFreshness);

    const firstPage = await page.locator("tbody tr").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-result-id")));
    await page.getByRole("link", { name: "Próxima página" }).click();
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).searchParams.get("q")).toBe("filamento");
    expect(new URL(page.url()).searchParams.get("cursor")).toBeTruthy();
    expect(await page.locator("table.ft-results-table tbody tr").count()).toBe(50);
    expect(await page.getByRole("status").filter({ hasText: "140 resultado(s)" }).count()).toBe(1);
    const secondPage = await page.locator("tbody tr").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-result-id")));
    await page.getByRole("link", { name: "Próxima página" }).click();
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).searchParams.get("q")).toBe("filamento");
    expect(await page.locator("table.ft-results-table tbody tr").count()).toBe(40);
    expect(await page.getByRole("link", { name: "Próxima página" }).count()).toBe(0);
    const thirdPage = await page.locator("tbody tr").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-result-id")));
    expect(new Set([...firstPage, ...secondPage, ...thirdPage]).size).toBe(140);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await page.close();
  }, 40_000);

  it("renders the deterministic relational fallback as visibly degraded", async () => {
    const page = await browser.newPage();
    await page.goto(`${harness.baseUrl}/search?q=fallback`, { waitUntil: "networkidle" });
    const identities: (string | null)[] = [];
    identities.push(...await page.locator("tbody tr").evaluateAll(
      (rows) => rows.map((row) => row.getAttribute("data-result-id")),
    ));
    expect(await page.getByText("Busca em modo degradado", { exact: false }).count()).toBe(1);
    expect(await page.getByText("suporte degradado", { exact: false }).count()).toBe(1);
    while (await page.getByRole("link", { name: "Próxima página" }).count()) {
      await page.getByRole("link", { name: "Próxima página" }).click();
      await page.waitForLoadState("networkidle");
      expect(new URL(page.url()).searchParams.get("q")).toBe("fallback");
      identities.push(...await page.locator("tbody tr").evaluateAll(
        (rows) => rows.map((row) => row.getAttribute("data-result-id")),
      ));
    }
    expect(identities).toHaveLength(134);
    expect(identities.every((identity) => identity !== null)).toBe(true);
    expect(new Set(identities).size).toBe(134);
    await page.close();
  });

  it("returns Closin and Voolt3D as separate offer rows for an overlapping dual-store query", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${harness.baseUrl}/search?q=dualstore`, { waitUntil: "networkidle" });
    expect(await page.getByRole("status").filter({ hasText: "7 resultado(s)" }).count()).toBe(1);
    const storeNames = await page.locator("tbody tr").evaluateAll((rows) =>
      rows.map((row) => {
        const cells = row.querySelectorAll("td");
        return cells[0]?.textContent?.replace("Loja", "").trim() ?? "";
      }),
    );
    expect(new Set(storeNames)).toEqual(new Set(["Closin", "Voolt3D"]));
    expect(storeNames.filter((name) => name === "Closin")).toHaveLength(1);
    expect(storeNames.filter((name) => name === "Voolt3D")).toHaveLength(6);
    const ids = await page.locator("tbody tr").evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-result-id")),
    );
    expect(ids.every((id) => id !== null)).toBe(true);
    expect(new Set(ids).size).toBe(7);
    expect(await page.getByText("Ver preços").count()).toBe(0);
    expect(await page.getByText("Ver na loja").count()).toBe(0);
    expect(await page.locator("img").count()).toBe(0);
    await page.close();
  }, 40_000);

  for (const viewport of viewports) {
    it(`passes axe and avoids overflow at ${viewport.width}px`, async () => {
      const page = await browser.newPage({ viewport });
      await page.goto(`${harness.baseUrl}/search?q=filamento`, { waitUntil: "networkidle" });
      await page.addScriptTag({ content: axeSource });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run(): Promise<{ violations: unknown[] }> } }).axe;
        return (await axe.run()).violations;
      });
      expect(violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      if (viewport.width === 360) {
        const labels = await page.locator("tbody tr").first().locator(".ft-mobile-label").allTextContents();
        expect(labels).toEqual(["Oferta", "Loja", "Preço", "R$/kg", "Disponibilidade", "Atualização"]);
        expect(await page.locator("tbody tr").first().locator(".ft-meta-label").allTextContents()).toEqual([
          "Marca",
          "Material",
          "Tipo específico",
          "Cor",
          "Diâmetro",
          "Peso",
        ]);
      }
      await page.close();
    }, 30_000);
  }

  it("renders honest no-match for unmatched and punctuation-only queries", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${harness.baseUrl}/search?q=xyzzy-no-such-filament`, {
      waitUntil: "networkidle",
    });
    expect(await page.getByText("Não encontramos esse filamento.").count()).toBe(1);
    expect(await page.getByText("suporte degradado", { exact: false }).count()).toBe(1);
    expect(await page.locator("table.ft-results-table tbody tr").count()).toBe(0);
    await page.goto(`${harness.baseUrl}/search?q=${encodeURIComponent("!!!")}`, {
      waitUntil: "networkidle",
    });
    expect(await page.getByText("Não encontramos esse filamento.").count()).toBe(1);
    expect(await page.getByText("suporte degradado", { exact: false }).count()).toBe(1);
    expect(await page.locator("table.ft-results-table tbody tr").count()).toBe(0);
    expect(await page.locator('input[type="search"]').inputValue()).toBe("!!!");
    await page.close();
  }, 40_000);

  it("walks Home chip to family browse, brand nav, and family-intent search", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${harness.baseUrl}/`, { waitUntil: "networkidle" });
    expect(await page.getByRole("navigation", { name: "Navegação principal" }).count()).toBe(1);
    const petgChip = page.getByRole("link", { name: "PETG" }).first();
    await petgChip.click();
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe("/materials/petg");
    expect(await page.locator("table.ft-results-table tbody tr").count()).toBeGreaterThan(0);
    expect(await page.getByText("Tipo específico").count()).toBeGreaterThan(0);
    expect(await page.getByText("PETG HF").count()).toBeGreaterThan(0);
    expect(await page.getByText("Ver preços").count()).toBe(0);
    expect(await page.locator("img").count()).toBe(0);

    await page.getByRole("navigation", { name: "Navegação principal" })
      .locator("summary")
      .filter({ hasText: "Marcas" })
      .click();
    await page.getByRole("link", { name: "Voolt3D" }).click();
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe("/brands/voolt3d");

    await page.goto(`${harness.baseUrl}/search?q=PETG`, { waitUntil: "networkidle" });
    expect(await page.getByRole("status").filter({ hasText: /resultado/ }).count()).toBeGreaterThan(0);
    const typeChip = page.getByRole("link", { name: /PETG HF/ });
    expect(await typeChip.count()).toBeGreaterThan(0);
    await typeChip.first().click();
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).searchParams.get("type")).toBe("petg-hf");
    await page.getByRole("link", { name: /Remover Busca PETG/ }).click();
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe("/search");
    expect(new URL(page.url()).searchParams.get("q")).toBeNull();
    expect(new URL(page.url()).searchParams.get("type")).toBe("petg-hf");
    await page.getByRole("link", { name: /Remover Tipo específico/ }).click();
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).searchParams.get("type")).toBeNull();
    await page.close();
  }, 40_000);

  it("permanently redirects reviewed aliases and returns 410/404 for gone/unknown slugs", async () => {
    const alias = await fetch(`${harness.baseUrl}/brands/voolt`, { redirect: "manual" });
    expect(alias.status).toBe(301);
    expect(alias.headers.get("location")).toBe("/brands/voolt3d");
    expect(alias.headers.get("cache-control")).toBe("no-store");

    const gone = await fetch(`${harness.baseUrl}/materials/split-petg`, { redirect: "manual" });
    expect(gone.status).toBe(410);
    expect(gone.headers.get("cache-control")).toBe("no-store");

    const unknown = await fetch(`${harness.baseUrl}/materials/no-such-family`, { redirect: "manual" });
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("cache-control")).toBe("no-store");
  }, 20_000);

  it("supports keyboard focus with a visible ring", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${harness.baseUrl}/search?q=filamento`, { waitUntil: "networkidle" });
    const reached = { search: false, results: false, next: false };
    for (let index = 0; index < 16; index += 1) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => ({
        search: document.activeElement?.matches("input[type=search]") ?? false,
        results: document.activeElement?.matches(".ft-results") ?? false,
        next: document.activeElement?.matches("a[rel=next]") ?? false,
        outlineWidth: document.activeElement instanceof HTMLElement
          ? getComputedStyle(document.activeElement).outlineWidth
          : "0px",
      }));
      if (focused.search) reached.search = focused.outlineWidth === "2px";
      if (focused.results) reached.results = focused.outlineWidth === "2px";
      if (focused.next) reached.next = focused.outlineWidth === "2px";
      if (reached.search && reached.results && reached.next) break;
    }
    expect(reached).toEqual({ search: true, results: true, next: true });
    await page.close();
  });
});
