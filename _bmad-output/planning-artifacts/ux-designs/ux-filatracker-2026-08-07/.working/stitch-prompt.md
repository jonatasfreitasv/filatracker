# Google Stitch prompt — FilaTracker (v1)

Paste into [Google Stitch](https://stitch.withgoogle.com). After generation, save `DESIGN.md` + per-screen HTML into:
`_bmad-output/planning-artifacts/ux-designs/ux-filatracker-2026-08-07/`
(or drop HTML into `.working/` / `imports/` — we will promote later).

---

## Product

**FilaTracker** — public Brazil filament **price comparison** site (pt-BR, BRL). Anonymous. No accounts. No checkout. Purchase happens on the merchant site via **Ver na loja**.

One-liner: search the filament you need and see where Listing Price / R$/kg is lowest across specialty Brazilian stores — **comparison tool, not a storefront (não vitrine)**.

Stakes: consumer public web for hobbyist 3D-printer owners (Rafael, Camila).

---

## Hard visual / UX constraints (do not violate)

- **Information-first density:** tables and compact lists dominate. Price, R$/kg, store name, availability, last-checked must be scannable.
- **No product photography. No image placeholders. No store logo chrome.** Store = text name only.
- **No marketplace vitrine:** no image grids, no giant product cards, no oversized hero, no glassmorphism, no “best deals / recently reduced / popular” home rails.
- **No CEP / frete calculator.** Frete/conditions disclaimer wherever ranking or “cheapest” language appears.
- **Never invent** weights, discounts, R$/kg, or substitute offers in empty states.
- Responsive **web** (mobile-strong). Desktop + mobile layouts for every key screen.
- Locale: **pt-BR** copy throughout. Currency format: `R$ 109,90`.
- Aesthetic direction (open for Stitch to propose tokens): dense, direct, objective, technical comparison tool — clean premium utility, not dashboard chrome and not marketplace merchandising. Emit a full `DESIGN.md` (colors, type, spacing, components) that fits these constraints.

---

## Information architecture (screens to design)

1. **Home** — search-first above the fold; optional Material Family chips (PLA, PETG, ASA, ABS, TPU, PETG-CF…); no deal rails.
2. **Search results** — Offer-centric multi-store results; filters + sort; empty state when no matches.
3. **Offer / Merge detail** — dense comparison table of Offers; frete disclaimer; basic **price history chart per Offer URL** when history exists (empty chart state otherwise).
4. **Browse: Material Family** — index / family landing → results.
5. **Browse: Brand** — index / brand landing → results.
6. **Trust/legal strip or footer** — frete/conditions honesty; optional affiliate disclosure placeholder (tags may be off).

Optional later (do **not** prioritize): `/stores` index.

Primary CTA outbound: **Ver na loja**. Intermediate results CTA candidate: **Ver preços**.

---

## Key behaviors to show in UI

**Search & filters**
- Material Family search includes child Specific Types; Specific Type labeled + filterable (PETG HF ≠ PETG).
- Filters at minimum: brand, Specific Type / Material Family, weight, Listing Price, availability; color display + optional filter when known.
- Default diameter filter: **1.75 mm + unknown** included; known non-1.75 excluded until user changes filter.
- Sort: ascending Listing Price; **in-stock above OOS**; tie-break Listing Price then freshness.

**Comparison honesty**
- Show: Listing Price, R$/kg (omit if weight unknown), Store (text), availability, last-checked; color + diameter when known.
- Stale if not refreshed in **48h** — still visible, clearly labeled (never imply guaranteed checkout price).
- Strikethrough/promo only if store supplies original price > current Listing Price.
- Merge grouping = brand + Specific Type + weight only (color never a merge key). Unmatched Offers still searchable and outbound-capable — prefer unmatched over false merge.

**Empty / edge**
- Empty results: explicit empty state + suggestions that do **not** invent Offers.
- OOS / stale still listable with qualification.

---

## Journeys to support (named protagonists)

**Rafael (UJ-1)** — mobile or desktop, anonymous: Home → types “PETG” → filters Specific Type/Brand → opens result → compares by Listing Price / R$/kg → **Ver na loja**. Climax: lowest comparable Listing Price visible + frete disclaimer.

**Camila (UJ-2)** — search or brand browse for known brand+type → sort by price or R$/kg → verify weight + Specific Type label → outbound. Trust merge only when brand + type + weight align.

---

## Preferred pt-BR copy candidates (use unless you improve clarity)

| Use | Copy |
|-----|------|
| Home headline | Encontre o melhor preço para seu próximo filamento |
| Search placeholder | Busque por PETG, Bambu Lab, ASA, Rapid PETG... |
| Ranking language | Menor preço do produto *(never imply frete included)* |
| Results CTA | Ver preços |
| Outbound CTA | Ver na loja |
| Empty | Não encontramos esse filamento. |
| Footer / ranking disclaimer | Os preços podem mudar a qualquer momento. Frete e condições da loja podem alterar o valor final. |
| Freshness intent | “Atualizado há …” / “Último preço encontrado” / stale = not verified recently (48h rule) |

---

## Deliverables requested from Stitch

1. **`DESIGN.md`** — Google Labs design.md format: frontmatter tokens (colors, typography, rounded, spacing, components) + Brand & Style, Colors, Typography, Layout & Spacing, Elevation, Shapes, Components, Do’s and Don’ts. Reflect density + anti-vitrine constraints.
2. **HTML mockups** for at least:
   - Home (desktop + mobile)
   - Search results with filters (desktop + mobile; show dense list/table, not image cards)
   - Offer/Merge detail with comparison table + history chart area + Ver na loja
   - Empty search state
   - One browse surface (Material or Brand)
3. Brief note of component patterns: search field, filter controls, result row, comparison table, stale/availability badges, disclaimer, outbound button.

---

## Explicitly out of scope for these mocks

Accounts, alerts, wishlists, reviews, seller portal, cart/checkout, frete by CEP, Mercado Livre aggregation, product images/logos, deal rails, price guarantees, native apps, display ads.
