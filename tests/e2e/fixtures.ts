import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement as e } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  EmptyState,
  ErrorState,
  LoadingRows,
  QualificationBanner,
  ResultsTable,
  SearchControl,
  Shell,
  SuggestionChips,
} from "../../app/design-system";
import type { SearchHit } from "../../src/contracts";

const tokensCss = readFileSync(
  resolve("app/design-system/tokens.css"),
  "utf8",
);
const componentsCss = readFileSync(
  resolve("app/design-system/components.css"),
  "utf8",
);
const resultsCss = readFileSync(
  resolve("app/design-system/results.css"),
  "utf8",
);

function toDocument(title: string, body: ReturnType<typeof e>): string {
  const markup = renderToStaticMarkup(body);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>${tokensCss}\n${componentsCss}\n${resultsCss}</style>
</head>
<body>${markup}</body>
</html>`;
}

const sampleHits: SearchHit[] = [
  {
    kind: "offer",
    id: "off_1",
    title: '<img src=x onerror=alert(1)> PLA Branco',
    brandName: "Closin",
    materialFamily: "PLA",
    specificTypeLabel: null,
    color: "Branco",
    diameterMm: 1.75,
    massGrams: 1000,
    listingPriceCentavos: 8990,
    pricePerKgCentavos: 8990,
    availability: "available",
    stale: false,
    storeId: "closin",
    storeName: "Closin",
    observedAt: "2026-08-09T00:00:00.000Z",
  },
  {
    kind: "offer",
    id: "off_2",
    title: "PETG Preto 1kg",
    brandName: "Closin",
    materialFamily: "PETG",
    specificTypeLabel: null,
    color: "Preto",
    diameterMm: 1.75,
    massGrams: 1000,
    listingPriceCentavos: 10990,
    pricePerKgCentavos: 10990,
    availability: "unknown",
    stale: true,
    storeId: "closin",
    storeName: "Closin",
    observedAt: "2026-08-01T00:00:00.000Z",
  },
];

export type Fixture = {
  name: string;
  hasSearchInput: boolean;
  html: string;
};

export const FIXTURES: Fixture[] = [
  {
    name: "home-empty",
    hasSearchInput: true,
    html: toDocument(
      "FilaTracker — comparação de filamentos",
      e(
        Shell,
        { hideShellSearch: true },
        e(
          "section",
          { className: "ft-home-hero", "aria-labelledby": "home-title" },
          e("h1", { id: "home-title", className: "ft-home-title" }, "FilaTracker"),
          e(
            "p",
            { className: "ft-home-lead" },
            "Busque filamentos e compare preços de listagem entre lojas. Frete e condições finais ficam na loja de destino.",
          ),
          e(SearchControl, {
            defaultValue: "",
            id: "busca-home",
            autoFocus: true,
          }),
          e(EmptyState, {
            title: "Busque um filamento para começar.",
            description:
              "Use o campo acima para encontrar ofertas publicadas entre lojas.",
          }),
        ),
      ),
    ),
  },
  {
    name: "search-populated",
    hasSearchInput: true,
    html: toDocument(
      "Busca: PLA — FilaTracker",
      e(
        Shell,
        { searchDefaultValue: "PLA" },
        e("h1", { className: "ft-visually-hidden" }, "Busca de filamentos"),
        e(ResultsTable, {
          hits: sampleHits,
          caption: "Resultados para PLA",
        }),
      ),
    ),
  },
  {
    name: "search-degraded-populated",
    hasSearchInput: true,
    html: toDocument(
      "Busca: PLA — FilaTracker",
      e(
        Shell,
        { searchDefaultValue: "PLA" },
        e("h1", { className: "ft-visually-hidden" }, "Busca de filamentos"),
        e(
          QualificationBanner,
          null,
          "Busca em modo degradado — resultados via caminho relacional.",
        ),
        e(ResultsTable, {
          hits: sampleHits,
          caption: "Resultados para PLA",
        }),
      ),
    ),
  },
  {
    name: "search-no-match",
    hasSearchInput: true,
    html: toDocument(
      "Busca: pla exotico — FilaTracker",
      e(
        Shell,
        { searchDefaultValue: "pla exotico" },
        e("h1", { className: "ft-visually-hidden" }, "Busca de filamentos"),
        e(EmptyState, { title: "Não encontramos esse filamento." }),
        e(SuggestionChips, {
          suggestions: [
            { id: "PLA", slug: "PLA", label: "PLA" },
            { id: "PETG", slug: "PETG", label: "PETG" },
          ],
        }),
      ),
    ),
  },
  {
    name: "search-invalid",
    hasSearchInput: true,
    html: toDocument(
      "Busca — FilaTracker",
      e(
        Shell,
        { searchDefaultValue: "" },
        e("h1", { className: "ft-visually-hidden" }, "Busca de filamentos"),
        e(ErrorState, { message: "Revise sua busca e tente novamente." }),
      ),
    ),
  },
  {
    name: "search-unavailable-503",
    hasSearchInput: true,
    html: toDocument(
      "Busca: pla — FilaTracker",
      e(
        Shell,
        { searchDefaultValue: "pla" },
        e("h1", { className: "ft-visually-hidden" }, "Busca de filamentos"),
        e(ErrorState, {
          message:
            "Não foi possível carregar a busca agora. Tente novamente em instantes.",
          retryHref: "/search?q=pla",
        }),
      ),
    ),
  },
  {
    name: "loading-rows",
    hasSearchInput: false,
    html: toDocument(
      "Busca — FilaTracker",
      e(
        Shell,
        { searchDefaultValue: "" },
        e("h1", { className: "ft-visually-hidden" }, "Busca de filamentos"),
        e(LoadingRows, {}),
      ),
    ),
  },
];
