/**
 * Static source/token assertions only — pt-BR copy, forbidden vitrine
 * affordances, and design-token values. These are string-level checks and
 * do NOT verify real accessibility (no DOM is rendered, no axe-core runs).
 * Real a11y/keyboard/viewport-overflow coverage lives in
 * tests/e2e/a11y-responsive.e2e.test.ts (Playwright + axe-core against
 * rendered components).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REQUIRED_COPY = [
  "Não encontramos esse filamento.",
  "Revise sua busca e tente novamente.",
  "Não foi possível carregar a busca agora. Tente novamente em instantes.",
  "FilaTracker",
] as const;

describe("a11y & responsive contracts", () => {
  const components = readFileSync(
    resolve("app/design-system/components.tsx"),
    "utf8",
  );
  const css = readFileSync(resolve("app/design-system/components.css"), "utf8");
  const tokensCss = readFileSync(
    resolve("app/design-system/tokens.css"),
    "utf8",
  );
  const home = readFileSync(resolve("app/routes/home.tsx"), "utf8");
  const search = readFileSync(resolve("app/routes/search.tsx"), "utf8");
  const root = readFileSync(resolve("app/root.tsx"), "utf8");

  it("uses pt-BR document language", () => {
    expect(root).toMatch(/lang="pt-BR"/);
  });

  it("exposes labeled search, live regions, and busy loading", () => {
    expect(components).toMatch(/htmlFor=\{id\}/);
    expect(components).toMatch(/role="search"/);
    expect(components).toMatch(/aria-live="polite"/);
    expect(components).toMatch(/aria-live="assertive"/);
    expect(components).toMatch(/aria-busy="true"/);
    expect(components).toMatch(/role="alert"/);
    expect(components).toMatch(/role="status"/);
  });

  it("uses 2px focus treatment", () => {
    expect(tokensCss).toMatch(/outline:\s*2px solid var\(--color-focus-ring\)/);
    expect(css).toMatch(/outline:\s*2px solid var\(--color-focus-ring\)/);
  });

  it("respects reduced motion for loading skeletons", () => {
    expect(tokensCss).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/prefers-reduced-motion:\s*no-preference/);
  });

  it("includes required pt-BR state copy", () => {
    const blob = `${home}\n${search}\n${components}`;
    for (const copy of REQUIRED_COPY) {
      expect(blob).toContain(copy);
    }
  });

  it("does not include forbidden vitrine affordances", () => {
    const blob = `${home}\n${search}\n${components}\n${css}`;
    expect(blob).not.toMatch(/Ver preços/);
    expect(blob).not.toMatch(/Ver na loja/);
    expect(blob).not.toMatch(/avatar/i);
    expect(blob).not.toMatch(/deal.?rail/i);
    expect(blob).not.toMatch(/box-shadow/);
    expect(blob).not.toMatch(/backdrop-filter/);
    expect(blob).not.toMatch(/linear-gradient/);
  });

  it("encodes mobile margin and container max from design tokens", () => {
    expect(tokensCss).toMatch(/--space-margin-mobile:\s*12px/);
    expect(tokensCss).toMatch(/--container-max:\s*1280px/);
    expect(css).toMatch(/padding:.*var\(--space-margin-mobile\)/);
  });

  it("Home uses a single primary search (hideShellSearch)", () => {
    expect(home).toMatch(/hideShellSearch/);
    expect(home).toMatch(/SearchControl/);
  });

  it("exposes labeled Materiais/Marcas nav from published entities", () => {
    expect(components).toMatch(/aria-label="Navegação principal"/);
    expect(components).toMatch(/Materiais/);
    expect(components).toMatch(/Marcas/);
    expect(components).toMatch(/\/materials\/\$\{item\.slug\}/);
    expect(components).toMatch(/\/brands\/\$\{item\.slug\}/);
    expect(components).not.toMatch(/href="#"/);
  });
});
