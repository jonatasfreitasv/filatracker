# UX source extract — raw_plan.md (stated only)

Source: `docs/raw_plan.md` v0.1. Extraction for Stitch/UX handoff. **Do not invent.** Product decisions: **PRD wins** on conflict. Flags: `[RAW ONLY — needs confirm]` = in raw_plan but absent/rejected in PRD extract.

---

## UX/UI notes from raw_plan (stated only)

**Product framing**
- Public filament price comparison/search; pt-BR; BRL; auth NONE; admin UI NONE.
- Central concept: *"Search the filament you want and immediately see where it is cheapest."*
- Vision line: *"fast, visually attractive public website"* + normalize/match equivalents + best prices.
- UI primarily presents **PRODUCT VARIANTS**; Offers are children of a variant. (PRD: Offer-centric / Merge — conflict below.)

**MVP user-facing capabilities (stated list)**
Search; browse by material & brand; filter; sort by effective price; cheapest store per product; open original store page; compare offers; R$/kg; last-checked; OOS; promotions from stores when captured.

**Search**
- Queries canonical product data, not raw listings.
- Example queries: `petg`, `petg cf`, `bambu petg`, `bambu petg hf`, `asa preto`, `elegoo rapid petg`, `petg 1kg`, `petg preto`.
- Accent/case-insensitive; aliases.

**Comparison / trust**
- Use **price/kg extensively** (spool sizes differ).
- MVP effective price = product price; shipping NOT included unless store provides universally applicable shipping.
- Never display "cheapest" based on unknown shipping assumptions.
- Preferred UI language for ranking: **"Menor preço do produto"** (not frete-based).
- Discount % only if `original_price > current`; never invent from history.
- Unmatched preferred over false match; ambiguous bundles stay unmatched.
- Outbound via resolver (e.g. `/out/:offerId`); CTA opens original URL; `rel="nofollow sponsored noopener"` when appropriate.
- No CEP / shipping calc in MVP.

**Freshness display**
- Human-friendly: `"Atualizado há 18 min"`, `"Atualizado há 2 h"`.
- Stale threshold recommendation: **24h** → `"Preço ainda não verificado recentemente"`; do not present as guaranteed current. (PRD: **48h** — conflict.)
- Price wording: `"Último preço encontrado"` or `"Preço verificado há X"`; store = source of truth.

**Sorting (offers)**
1. IN_STOCK → 2. lowest price → 3. freshest; unknown availability below confirmed in-stock; OOS at bottom.

**Filters (MVP)**
Brand, Material, Color/base color, Weight, Diameter, Price range, Availability; optional Store.
Sort options: Lowest price, Lowest price/kg, Highest discount, Recently updated, A–Z.

**Pagination**
Server-side; default **24 products**; max public API 100; never client-filter full catalog.

**UX acceptance (visitor path)**
Homepage → search `"PETG"` → see products → filter brand → see lowest price → open product → compare stores → click merchant — **no account**.

**Non-goals (UX-relevant)**
Accounts, cart/checkout/marketplace, reviews/ratings/wishlists, email/push alerts, native apps, CEP shipping, affiliate dashboard, historical charts / historical lowest (listed as deferred in §119), Amazon affiliate, etc.

---

## Screens / layouts described

**Required public routes**
`/`, `/buscar`, `/filamentos`, `/filamento/:slug`, `/marcas`, `/marca/:slug`, `/materiais`, `/material/:slug`, `/lojas`, `/loja/:slug`

Slug examples: `/marca/bambu-lab`, `/material/petg`, `/filamento/bambu-lab-petg-hf`, `/filamento/bambu-lab-petg-hf-black-1kg`

Optional SEO later: `/ofertas`, `/mais-baratos`, `/queda-de-preco`

**Home (§42)**
- Primary goal: SEARCH.
- Top: headline + large search + placeholder + secondary quick filters (PLA, PETG, ASA, ABS, TPU, PETG-CF).
- Below: Best current deals; Popular materials; Popular brands; Recently reduced prices.
- No oversized marketing hero; search visible without scrolling on desktop.

**Search result card (§44)**
Shows: Product image, Brand, Product family, Material, Color when relevant, Weight, Lowest current price, Price/kg, Number of stores, Lowest-price store, Last price refresh, Discount indicator if applicable.
Example anatomy:
```
Bambu Lab
PETG HF — Black — 1 kg
R$ 109,90
R$ 109,90/kg
a partir de 3 lojas
[Ver preços]
```

**Product detail (§45)**
- Header: Product image, Brand, Product family, Variant, Material, Weight, Diameter.
- Price summary: Current lowest, Price/kg, Number of available offers.
- Offer table: Store, Price, Price/kg, Availability, Last checked, CTA **"Ver na loja"**.

**Desktop results (§69)**
Left filter sidebar; right results; product grid **3–4 cards**/viewport; list mode later optional; **price visually dominates** cards.

**Mobile (§70)**
Filters = bottom sheet/drawer; search prominent; cards compact; price + CTA no horizontal scroll; offer table → **vertically stacked offer rows**.

**Named components (§68)**
SearchBar, ProductCard, PriceDisplay, PriceBadge, DiscountBadge, MaterialBadge, BrandLogo, OfferTable, FilterSidebar, FilterDrawer, SortSelect, Pagination, EmptyState, Breadcrumb; PriceHistoryChart marked **future**.

**Images / logos (§76–77)**
MVP: remote manufacturer → representative offer → placeholder; may proxy later. Store logos as static assets when legally OK, else text identity.

**Empty search (§94)**
Copy + suggest remove color / material-only / brand; do not fabricate substitutes.

**Footer disclaimer (§106)**
Frete/conditions disclaimer string (see Copy).

---

## Copy / microcopy samples if any

| Use | Stated string |
|-----|----------------|
| Home headline | `Encontre o melhor preço para seu próximo filamento` |
| Search placeholder | `Busque por PETG, Bambu Lab, ASA, Rapid PETG...` |
| Result CTA | `Ver preços` |
| Detail outbound CTA | `Ver na loja` |
| Store count line | `a partir de 3 lojas` |
| Ranking language | `Menor preço do produto` |
| Freshness | `Atualizado há 18 min` / `Atualizado há 2 h` |
| Stale | `Preço ainda não verificado recentemente` |
| Price honesty | `Último preço encontrado` / `Preço verificado há X` |
| Empty | `Não encontramos esse filamento.` |
| Footer | `Os preços podem mudar a qualquer momento. Frete e condições da loja podem alterar o valor final.` |
| Price format | `R$ 109,90` via `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` |

Quick-filter chips (home): PLA, PETG, ASA, ABS, TPU, PETG-CF.

---

## Aesthetic / density / anti-patterns

**Preferred (§6 UI / §68)**
- Tailwind + shadcn/ui + Lucide (stack note).
- clean; dense enough for price comparison; premium visual; fast; responsive; **minimal animation**; excellent mobile.
- Style: modern, premium, technical, e-commerce comparison, clean, **high information density**.
- Base: **neutral light background**, dark typography.
- Optional subtle accent: **orange/amber or green** for price highlights; avoid excessive colors.
- Information density desirable; price should visually dominate product cards.

**Avoid**
- massive landing-page hero
- excessive gradients
- glassmorphism everywhere
- giant cards
- dashboard-like appearance
- oversized marketing hero (home)

**Framing:** This is a SEARCH / PRICE COMPARISON PRODUCT (not dashboard, not marketing splash).

---

## Conflicts with PRD (if raw_plan contradicts PRD — list; PRD wins)

| Topic | raw_plan | PRD (wins) |
|-------|----------|------------|
| Primary UI entity | Product variants; search canonical products | Offer-centric; Merge when safe; unmatched OK |
| Merge / match keys | Color (and diameter) as matching features; medium ID includes color | Merge = brand + Specific Type + weight only; color/diameter display, not merge keys |
| Product images | Required on cards/detail; remote URLs + placeholder | **No** product images on search/comparison |
| Store logos | BrandLogo component; store logos as assets OK | Store = **text name only**; no logo chrome |
| Home rails | Best deals / popular / recently reduced | **No** deal rails (anti-vitrine) |
| Result presentation | ProductCard grid 3–4; image-forward | Density hard constraint: tables/lists over merchandising; anti marketplace image grids |
| Stale threshold | 24h recommendation | **48h** default |
| Price history chart | Maintain history in DB; **charts** deferred (§119 / PriceHistoryChart future) | Basic **per-Offer-URL chart** in MVP (FR-13) |
| IA `/lojas` | Required `/lojas`, `/loja/:slug` | `/stores` optional `[ASSUMPTION]` |
| Diameter default filter | Do not assume missing = 1.75; no default-filter UX stated | Default filter 1.75 mm + unknown included |
| "Cheapest" language | Central slogan uses "cheapest"; also warns against shipping-based "cheapest" | Frete disclaimer wherever ranking/"cheapest" appears; no price guarantee |
| Amazon in examples | Example offer list includes Amazon; marketplace "if practical" in store strategy | MVP: specialty BR stores; ML/marketplace aggregation out |
| Stack aesthetic | "visually attractive" / premium / optional amber-green accents | Dense, direct, objective; no color/token mandate; anti glassmorphism/giant cards (aligned on anti-hero) |

Aligned (no conflict worth listing as fight): anonymous; no admin; no cart/checkout; R$/kg; Ver na loja; frete disclaimer; empty-state no fabricated matches; promo only from store original price; outbound redirect pattern; pt-BR/BRL; mobile density; no accounts/alerts.

---

## Additive ideas in raw_plan not in PRD extract

Flagged `[RAW ONLY — needs confirm]` unless already covered as conflict (PRD already decided).

1. **[RAW ONLY — needs confirm]** Full route map: `/buscar`, `/filamentos`, `/filamento/:slug`, `/marcas`, `/marca/:slug`, `/materiais`, `/material/:slug`, `/lojas`, `/loja/:slug` (PRD IA is thinner; `/stores` optional).
2. **[RAW ONLY — needs confirm]** Exact home headline, placeholder, and material chip set (PLA/PETG/ASA/ABS/TPU/PETG-CF).
3. **[RAW ONLY — needs confirm]** Result CTA **"Ver preços"** (vs detail **"Ver na loja"**); `"a partir de N lojas"` store-count line.
4. **[RAW ONLY — needs confirm]** Ranking microcopy **"Menor preço do produto"**.
5. **[RAW ONLY — needs confirm]** Freshness strings + stale string (above); 24h vs PRD 48h already conflicted.
6. **[RAW ONLY — needs confirm]** Footer disclaimer exact sentence.
7. **[RAW ONLY — needs confirm]** Empty-state title + suggestion patterns (remove color / material-only / brand).
8. **[RAW ONLY — needs confirm]** Desktop sidebar + 3–4 card grid; mobile bottom-sheet filters; stacked offer rows — layout detail beyond PRD "dense tables/lists."
9. **[RAW ONLY — needs confirm]** Neutral light + dark type + optional orange/amber/green price accent (PRD deferred visual system; accents not approved).
10. **[RAW ONLY — needs confirm]** Component inventory (PriceBadge, DiscountBadge, MaterialBadge, BrandLogo, Breadcrumb, etc.).
11. **[RAW ONLY — needs confirm]** Pagination default 24.
12. **[RAW ONLY — needs confirm]** Sort options: Highest discount, Recently updated, A–Z; filters: price range, color/base color as first-class.
13. **[RAW ONLY — needs confirm]** Optional later SEO pages `/ofertas`, `/mais-baratos`, `/queda-de-preco` (explicitly later in raw_plan; PRD forbids deal rails on home).
14. **[RAW ONLY — needs confirm]** Future differentiator: product page as filament knowledge base (temps, density, drying, printer compat) — explicitly NOT MVP.
15. **Rejected by PRD (do not design in):** product images, store/brand logos as chrome, home deal/recently-reduced rails, variant-as-primary card with color in merge identity, Amazon-centric examples as product scope.

---

*End extract. Stitch handoff should treat PRD aesthetic/IA as binding; use raw_plan only for stated copy samples and layout sketches where they do not contradict PRD.*
