import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement as e } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  EmptyState,
  ErrorState,
  LoadingRows,
  SearchControl,
  Shell,
} from "../../app/design-system";

const tokensCss = readFileSync(
  resolve("app/design-system/tokens.css"),
  "utf8",
);
const componentsCss = readFileSync(
  resolve("app/design-system/components.css"),
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
<style>${tokensCss}\n${componentsCss}</style>
</head>
<body>${markup}</body>
</html>`;
}

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
            title: "Nenhum filamento publicado ainda.",
            description:
              "Quando houver ofertas publicadas, os resultados aparecerão aqui.",
          }),
        ),
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
