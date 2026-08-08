/**
 * Real browser accessibility + responsive checks (T7 / AC7).
 * Renders the actual design-system components to static HTML, loads them in
 * Chromium via Playwright, and scans with axe-core — replacing source-text
 * regex assertions with genuine DOM/axe/keyboard verification.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";

import { FIXTURES } from "./fixtures";

const axeSource = readFileSync(
  resolve("node_modules/axe-core/axe.min.js"),
  "utf8",
);

const VIEWPORTS = [
  { label: "mobile-360", width: 360, height: 800 },
  { label: "tablet-768", width: 768, height: 1024 },
  { label: "desktop-1280", width: 1280, height: 800 },
] as const;

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 30_000);

afterAll(async () => {
  await browser.close();
});

for (const fixture of FIXTURES) {
  describe(`a11y + responsive: ${fixture.name}`, () => {
    for (const viewport of VIEWPORTS) {
      it(
        `has zero axe-core violations and no horizontal overflow at ${viewport.label}`,
        async () => {
          const page = await browser.newPage();
          try {
            await page.setViewportSize({
              width: viewport.width,
              height: viewport.height,
            });
            await page.setContent(fixture.html, { waitUntil: "load" });
            await page.addScriptTag({ content: axeSource });

            const results = await page.evaluate(async () => {
              const axe = (
                window as unknown as {
                  axe: { run: () => Promise<{ violations: unknown[] }> };
                }
              ).axe;
              return axe.run();
            });

            expect(results.violations).toEqual([]);

            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth - window.innerWidth,
            );
            expect(overflow).toBeLessThanOrEqual(0);
          } finally {
            await page.close();
          }
        },
        20_000,
      );
    }

    if (fixture.hasSearchInput) {
      it(
        "reaches the search input via keyboard with a visible focus ring",
        async () => {
          const page = await browser.newPage();
          try {
            await page.setViewportSize({ width: 1280, height: 800 });
            await page.setContent(fixture.html, { waitUntil: "load" });

            // Tab order varies by fixture (autoFocus on Home puts focus on
            // the input immediately). Walk forward until the search input
            // is reached, rather than assuming a fixed number of stops.
            let focusedTag = await page.evaluate(
              () => document.activeElement?.tagName,
            );
            for (let i = 0; i < 6 && focusedTag !== "INPUT"; i++) {
              await page.keyboard.press("Tab");
              focusedTag = await page.evaluate(
                () => document.activeElement?.tagName,
              );
            }
            expect(focusedTag).toBe("INPUT");

            const outlineWidth = await page.evaluate(() => {
              const el = document.activeElement as HTMLElement;
              return getComputedStyle(el).outlineWidth;
            });
            expect(outlineWidth).toBe("2px");
          } finally {
            await page.close();
          }
        },
        20_000,
      );
    }
  });
}
