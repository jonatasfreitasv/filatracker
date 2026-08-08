---
name: FilaTracker
status: final
sources:
  - "{planning_artifacts}/prds/prd-filatracker-2026-08-07/prd.md"
  - "{planning_artifacts}/prds/prd-filatracker-2026-08-07/addendum.md"
  - "{project-root}/docs/raw_plan.md"
  - "{planning_artifacts}/ux-designs/ux-filatracker-2026-08-07/stitch_filatracker_brazil_filament_comparison/"
updated: 2026-08-07
---

# FilaTracker — Experience Spine

Consumer public web (pt-BR, BRL). Anonymous filament price comparison across specialty Brazilian stores. Paired with `DESIGN.md` (visual). On conflict, this spine supersedes `mockups/` or Stitch export.

## Foundation

Single-surface **responsive web**; mobile-strong; **no native apps**; no authentication. Locale: pt-BR. Currency: BRL only (v1). Target WCAG 2.1 AA on search → compare → outbound.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Home | `/` | Search-first; optional Material Family chips |
| Search results | Home submit / chips / browse | Offer-centric multi-store; filter + sort |
| Search empty | Zero matches | Explicit empty; suggestions without inventing Offers |
| Offer / Merge detail | Results row / Ver preços | Dense Offer comparison + per-Offer history when present |
| Browse: Material Family | Nav / Home chips | Family → Offer results (not educational vitrine) |
| Browse: Brand | Nav **Marcas** | Brand → Offer results |
| Trust / footer | Global | Frete/conditions honesty; affiliate disclosure when tags live |

`/stores` is out of scope for v1 until product commits; treat as spine-only (no mock) for now.

**Shell:** wordmark + global search + Materiais + Marcas. No account avatar.

→ Composition: `mockups/home.html`, `mockups/search-results.html`, `mockups/offer-detail.html`, `mockups/search-empty.html`, `mockups/browse-materials.html`. Brand browse and diameter-default UI are spine-only until mocked.

## Voice and Tone

Microcopy. Visual posture: `DESIGN.md`.

| Do | Don't |
|---|---|
| "Encontre o melhor preço para seu próximo filamento" | "Comparação em tempo real" / live-scrape claims |
| "Menor preço do produto" + frete disclaimer adjacent | "Menor preço" implying frete or checkout total |
| "Ver na loja" | "VER", "Ver Loja", "Buy now" |
| "Não encontramos esse filamento." | Fabricated substitute Offers |
| "Os preços podem mudar a qualquer momento. Frete e condições da loja podem alterar o valor final." | Price guarantees |
| "Último preço encontrado" / "Atualizado há …" / stale after 48h | Guaranteed current checkout price |
| Coverage claims only when accurate | Hardcoded "5 lojas" / "14 ACTIVE" when false |

## Component Patterns

Behavioral. Visual tokens: `DESIGN.md` Components / `{components.*}`.

| Component | Behavioral rules |
|---|---|
| Global search | Submit → Results. Empty query → empty state, not error. |
| Material Family chips | Family-scoped results; entry only — not deal rails. |
| Filter sidebar / sheet | Groups: Brand, Specific Type, Material Family, weight, Listing Price, availability; color optional when known. Default diameter: **1.75 mm + unknown**; known non-1.75 excluded until cleared. |
| Sort | Ascending Listing Price; in-stock above OOS; tie-break Listing Price then freshness. Alternate: R$/kg when weights known. |
| Result / Offer row | Brand, Specific Type, color (display), weight, Store (text), Listing Price, R$/kg or omit, availability, freshness. CTA **Ver preços** → detail, or direct **Ver na loja**. |
| Comparison table | One row per Offer URL. Columns: Store, Listing Price, R$/kg, availability, last-checked, **Ver na loja**. |
| Status badges | DISPONÍVEL / INDISPONÍVEL / promo (only when store-supplied original price exceeds Listing Price) / stale (>48h). No "POUCO ESTOQUE". |
| Outbound button | Always **Ver na loja**; internal redirect; available for OOS Offers (merchant is source of truth). External-link affordance. |
| Price history | Per Offer URL when history exists; empty or insufficient otherwise. Do not use Merge-level aggregates as the MVP primary. |
| Frete disclaimer | Required wherever ranking or "menor preço" appears. No CEP field. |
| Empty state | Honest no-match + Material Family suggestions only — never invent Offers. |

**Merge honesty:** group only on brand + Specific Type + weight. Color and diameter are never Merge keys. Unmatched Offers remain searchable and outbound-capable; prefer unmatched over false Merge. PETG ≠ PETG HF.

## State Patterns

| State | Treatment |
|---|---|
| Cold open (Home) | Search-first; chips optional; no deal rails / tickers. |
| Loading results | Skeleton rows matching dense table; no fake Offers. |
| Results populated | Dense table; frete footnote near ranking. |
| Zero matches | "Não encontramos esse filamento." + non-inventing suggestions. |
| OOS Offer | Badge INDISPONÍVEL; still outbound-capable. Sort below in-stock. |
| Stale Offer (>48h) | Stale badge / "não verificado recentemente"; still visible. |
| Weight unknown | Omit R$/kg; never invent. |
| History missing | Empty chart state; no fabricated series. |
| Unmatched Offer | Shown without false Merge grouping. |
| Coverage incomplete | Do not claim full store-set coverage when the active store count is below the promised set. |
| Affiliates off | Omit disclosure, or use a soft placeholder, until affiliate tags are live. |

## Interaction Primitives

- Primary path: type / chip → filter → open detail → **Ver na loja**.
- Keyboard: search focusable; filters and outbound reachable on core flows.
- Mobile filters: sheet / bottom sheet; table horizontal-scroll or stack to compact rows.
- Hover (md+): row fill `{colors.surface-sunken}` — not shadow lift.
- **Banned:** auth gates, CEP/frete calculator, image galleries, deal carousels, account menus, inventing substitute catalog rows, disabling outbound solely because OOS.

## Accessibility Floor

Behavioral. Contrast tokens: `DESIGN.md`.

- WCAG 2.1 AA on Home → Results → Detail → outbound.
- Dense tables remain readable; mono prices aid scan — status never color-only (badges include text).
- Focus visible: `{colors.focus-ring}`.
- Outbound announces leaving site (label + external affordance).

## Inspiration & Anti-patterns

- **Kept from Stitch:** search-first entry, sidebar + dense table, comparison detail, honest empty, Hanken + JetBrains Mono industrial density.
- **Rejected from Stitch:** person avatar, store-count marquee, ML/Amazon demo rows, glass mega-hero, educational Materiais bento as primary browse, Merge-level Média/Variação as primary history, disabled OOS outbound, "tempo real" claims.
- **Rejected category patterns:** marketplace image grids, Spoolman inventory UX, frete-inclusive "cheapest" sorting.

## Responsive & Platform

| Breakpoint | Behavior |
|---|---|
| Desktop (≥1280) | Sidebar filters + wide table; `{spacing.container-max}` |
| Tablet | Filters → top bar or drawer |
| Mobile | Single column; filter sheet; compact rows / horizontal table scroll; `{spacing.margin-mobile}` |

No native apps in v1.

## Key Flows

### Flow 1 — Rafael finds cheapest PETG (UJ-1)

1. Opens FilaTracker on phone (anonymous).
2. Home search-first; types "PETG".
3. Results span the Material Family (including Specific Types); filters Specific Type and/or Brand.
4. Default diameter keeps 1.75 + unknown.
5. Opens row → Detail by Listing Price / R$/kg; frete disclaimer visible.
6. **Climax:** lowest comparable Listing Price is clear → **Ver na loja** → merchant PDP.

Failure: stale/OOS → badges + last-checked; pick another Offer or abandon — no fabricated cheaper row.

### Flow 2 — Camila locks brand + type (UJ-2)

1. Enters via search or **Marcas** browse.
2. Finds brand + Specific Type; Offers may appear in a Merge or unmatched.
3. Sorts by Listing Price or R$/kg; verifies weight + Specific Type label.
4. **Climax:** trusts row because Merge keys match (brand + Specific Type + weight) — color alone did not force Merge — outbound **Ver na loja**.

### Flow 3 — Empty search honesty

1. Searches string with no Offers.
2. Empty: "Não encontramos esse filamento."
3. **Climax:** Material Family chips offer a real next step without inventing catalog rows.
