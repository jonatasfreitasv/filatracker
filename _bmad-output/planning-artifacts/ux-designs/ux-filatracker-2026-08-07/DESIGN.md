---
name: FilaTracker
description: Dense, anonymous pt-BR filament price comparison — Modern-Industrial Minimalism. Zero imagery; data tables over merchandising.
status: final
updated: 2026-08-07
colors:
  background: '#F8FAFC'
  surface: '#F8FAFC'
  surface-raised: '#FFFFFF'
  surface-sunken: '#F1F5F9'
  surface-muted: '#E2E8F0'
  ink-primary: '#0F172A'
  ink-secondary: '#334155'
  ink-muted: '#64748B'
  border: '#E2E8F0'
  border-strong: '#CBD5E1'
  accent: '#0EA5E9'
  accent-on: '#FFFFFF'
  accent-subtle: '#E0F2FE'
  stock: '#059669'
  stock-subtle: '#D1FAE5'
  oos: '#DC2626'
  oos-subtle: '#FEE2E2'
  promo: '#D97706'
  promo-subtle: '#FEF3C7'
  stale: '#D97706'
  focus-ring: '#0EA5E9'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  data-table:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
rounded:
  sm: 2px
  md: 4px
  lg: 8px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
  gutter: 16px
  margin-mobile: 12px
  container-max: 1280px
  row-height-dense: 40px
components:
  button-outbound:
    background: '{colors.accent}'
    foreground: '{colors.accent-on}'
    radius: '{rounded.md}'
  badge-stock:
    background: '{colors.stock-subtle}'
    foreground: '{colors.stock}'
    radius: '{rounded.sm}'
  badge-oos:
    background: '{colors.oos-subtle}'
    foreground: '{colors.oos}'
    radius: '{rounded.sm}'
  badge-promo:
    background: '{colors.promo-subtle}'
    foreground: '{colors.promo}'
    radius: '{rounded.sm}'
  badge-stale:
    background: '{colors.promo-subtle}'
    foreground: '{colors.stale}'
    radius: '{rounded.sm}'
  filter-chip-active:
    background: '{colors.accent-subtle}'
    foreground: '{colors.ink-primary}'
    radius: '{rounded.full}'
  data-row:
    background: '{colors.surface-raised}'
    border: '{colors.border}'
    height: '{spacing.row-height-dense}'
---

## Brand & Style

FilaTracker is a **comparison tool**, not a storefront. Visual system: **Modern-Industrial Minimalism** — high utility, zero product photography, typography-led density.

Brand posture: precision and honesty. Lead with Listing Price and R$/kg; never imply frete is included; the merchant site is the source of truth after **Ver na loja**.

**Principles**
- Zero-image — type, numbers, status badges only.
- Data over decoration — every pixel earns its place in a scan path.
- Technical utility — legible under workshop lighting; monospaced figures for vertical price comparison.

On conflict, these spines supersede mocks under `mockups/` or `stitch_filatracker_brazil_filament_comparison/`.

→ Composition: `mockups/home.html`, `mockups/search-results.html`, `mockups/offer-detail.html`, `mockups/search-empty.html`, `mockups/browse-materials.html`.

## Colors

Slate industrial + single **Technical Blue** accent.

| Token | Role |
|---|---|
| `{colors.ink-primary}` | Headers, primary text, structural anchors |
| `{colors.ink-secondary}` / `{colors.ink-muted}` | Labels, metadata, legal |
| `{colors.background}` | Canvas |
| `{colors.surface-raised}` | Table bodies |
| `{colors.surface-sunken}` | Headers, sidebar |
| `{colors.accent}` | Interactive focus, primary outbound CTA, active filter emphasis — not decoration |
| Stock / OOS / Promo / Stale | Functional status only — never brand chrome |

Avoid: marketplace pastels, gradient washes, black-as-primary CTA chrome competing with accent, decorative glass tints.

## Typography

**Hanken Grotesk** — UI chrome and prose. **JetBrains Mono** — prices, weights, diameters, freshness timestamps, table headers (`{typography.label-caps}`).

- BRL prices: always mono, right-aligned in tables.
- `{typography.headline-lg}`: page titles only.
- Dense tables: `{typography.data-table}` — do not inflate row type for marketing emphasis.

## Layout & Spacing

Base unit `{spacing.1}` (4px). Maximize rows above the fold. Offer / result row target: `{spacing.row-height-dense}`.

| Token | Use |
|---|---|
| `{spacing.container-max}` | Desktop max width; 12-col (filters ~3 / table ~9) |
| `{spacing.gutter}` | Column gutter |
| `{spacing.margin-mobile}` | Mobile page margins |
| `{spacing.row-height-dense}` | Offer / result table rows |

Breakpoint behavior (sidebar collapse, filter sheet, table scroll/stack) is defined in `EXPERIENCE.md` Responsive. Tables never become image cards.

## Elevation & Depth

No shadow hierarchy. Separation via **tonal layers** and **1px outlines** (`{colors.border}`).

- Hover rows → `{colors.surface-sunken}` fill, never lift shadow.
- Focus / active inputs → 2px `{colors.focus-ring}` border.
- Reject backdrop-blur glass and soft mega-hero elevation in production UI (Stitch artifacts in mocks — on conflict, spines supersede).

## Shapes

Sharp-soft engineered corners.

| Element | Token |
|---|---|
| Controls & buttons | `{rounded.md}` (4px) |
| Status badges | `{rounded.sm}` (2px) — industrial label |
| Filter chips only | `{rounded.full}` — distinguish from badges |

## Components

Visual specs. Behavior, filter taxonomy, and placement rules are in `EXPERIENCE.md` Component Patterns.

### Data table
Core surface. Horizontal rules only. Price column: right-aligned, `{typography.data-table}`, bold. Store name: plain text — no logos. Row shell: `{components.data-row}`.

### Status badges
| Label | Token |
|---|---|
| `DISPONÍVEL` | `{components.badge-stock}` |
| `INDISPONÍVEL` | `{components.badge-oos}` |
| Promo | `{components.badge-promo}` |
| Stale (>48h) | `{components.badge-stale}` |

Promo and stale eligibility and copy are in `EXPERIENCE.md`.

### Button — Ver na loja
`{components.button-outbound}`; compact for table rows; trailing external-link affordance.

### Filter sidebar / sheet
Group headers: `{typography.label-caps}`. Active chips: `{components.filter-chip-active}`. Filter groups, diameter default, and sort are in `EXPERIENCE.md`.

### Search input
Flat field; selected filters render as removable chips under the field (`{components.filter-chip-active}`).

### Price history chart
Basic chart chrome when data exists; empty or insufficient-history visual otherwise. Chart scope rules are in `EXPERIENCE.md`.

### Disclaimer
Visual placement: adjacent to ranking or “menor preço” / cheapest language, plus footer trust strip. Copy is in `EXPERIENCE.md` Voice.

## Do's and Don'ts

**Do**
- Lead with search and dense comparison tables.
- Store as text; mono figures for BRL and R$/kg.
- Outbound labeled **Ver na loja** with `{components.button-outbound}`.

**Don't**
- Product photos, image placeholders, or store logo chrome.
- Home deal rails, coverage tickers, giant cards, glassmorphism, shadow stacks, oversized heroes.
- Auth avatar / account chrome in v1.
