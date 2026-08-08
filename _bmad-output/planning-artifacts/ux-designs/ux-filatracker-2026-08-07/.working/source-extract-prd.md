# UX source extract — FilaTracker PRD (2026-08-07)

Sources: `prd.md` (final), `addendum.md`. Extraction only; no invented design. Flags: `[ASSUMPTION]` = PRD-tagged assumption; `[INFERENCE]` = design-useful inference not explicit as product requirement.

---

## Product one-liner

Public Brazil-focused filament **price search / comparison** site (pt-BR): find filament across specialty BR stores (outside Mercado Livre), compare Offers by material type and R$/kg. **Not a vitrine**—comparison tool; purchase on the merchant. No frete calc, no checkout.

---

## Users / personas (named if present)

| Name | Role / context |
|------|----------------|
| **Rafael** (UJ-1) | Hobbyist, Bambu-class printer in Brazil; needs more PETG this week; usually checks specialty shops + ML. |
| **Camila** (UJ-2) | Reprints often; preferred brand line (e.g. PLA Premium / Silk); wants R$/kg across Stores. |

**Shared:** Anonymous; already owns a printer; job is “I need filament,” not inventory management.

**Non-users (v1):** Print farms / Spoolman-class inventory; ML-only shoppers; landed-cost / price-guarantee expecters; merchants needing seller portal.

---

## Form factor / platforms

- **v1:** Public **responsive web**; strong **mobile** usability required; **no native apps**.
- Fully **anonymous**; no auth.
- Locale/currency: **pt-BR**, **BRL only** for v1. `[ASSUMPTION]`

---

## Core jobs / user needs

- Find where a filament type is sold across specialty BR stores; see cheapest **Listing Price** and **R$/kg** quickly.
- Compare like-with-like: Material Family / Specific Type, brand, weight—**PETG HF ≠ PETG**.
- Feel confident frete is not hidden as “included”; click-through to merchant is the honest next step.
- Trust Merge only when brand + Specific Type + weight align; color differences do not force a merge.

Primary success metric (product): **Outbound Clicks** (“Ver na loja”) — SM-1.

---

## Screens / surfaces implied or stated

From PRD §13 IA (+ feature refs):

| Surface | Notes |
|---------|--------|
| **Home** | Search-first; optional Material Family chips; **no** deal rails |
| **Search results** | Offer-centric; empty state (not error page) |
| **Offer / Merge detail** | Comparison + price history chart (per Offer URL when history exists) |
| **Browse: Material Family** | Reachable without login |
| **Browse: Brand** | Reachable without login |
| **/stores index** | Optional for v1 `[ASSUMPTION]` |
| **Legal/trust** | Frete disclaimer; optional affiliate disclosure placeholder |

CTA label stated: **Ver na loja**.

MVP coverage context (ops, may affect trust/marketing UI): five Stores—Closin, Voolt3D, 3D Colors, Filamentos 3D Brasil (F3D), Topink3D. If &lt;5 active, must not claim full “5 lojas” coverage.

---

## Key flows (step lists if present)

### UJ-1 — Rafael finds cheapest PETG
1. Anonymous on mobile or desktop → home (search-first).
2. Types “PETG” → results spanning parent Material Family (incl. subtypes).
3. Filters to Specific Type and/or Brand.
4. Opens a result → compares Offers by Listing Price / R$/kg.
5. Taps **Ver na loja** → merchant PDP; Outbound Click recorded.
- **Climax:** Lowest Listing Price for comparable Offer + frete disclaimer visible.
- **Edge:** Stale/OOS → availability + last-checked visible; pick another or abandon.

### UJ-2 — Camila brand+type she knows
1. Anonymous via search or brand browse.
2. Searches brand + type → grouped or unmatched Offers.
3. Sorts by price or R$/kg → verifies weight + Specific Type label → outbound.
- Trust Merge only when brand + Specific Type + weight align; color alone does not block merge.

### Implied macro path (MVP scope)
Anonymous search → filter/compare → Ver na loja.

---

## Visual / brand cues (only if stated — do NOT invent colors/styles)

Stated aesthetic/tone (§12); **no colors, fonts, or token palette** in PRD:

- **Não frete, não vitrine:** dense, direct, objective—comparison tool, not showcase.
- **Density hard constraint:** information-first tables/lists over visual merchandising.
- **No product photography; no Store logo chrome** (Store = text name only).
- Voice: clear **pt-BR**; honest about frete; merchant = source of truth.
- Home: search-first (+ optional Material Family quick entry); **no** “best deals / recently reduced” rails.
- **Anti-references:** marketplace-style image grids; browse-as-vitrine; “guaranteed lowest price”; massive hero / glassmorphism / giant cards.
- Addendum: product image placeholders / image proxy also rejected (same kill as no images).
- Design-system tokens / exact wireframes deferred to UX specs (addendum §D)—**not** PRD requirements.

---

## Interaction / behavior constraints

**Search & discovery**
- Offer-centric multi-store results; Material Family search includes child Specific Types; Specific Type labeled + filterable.
- Filters/sort at minimum: brand, Specific Type / Material Family, weight, Listing Price, availability; color as display + optional filter when known.
- Sort: ascending Listing Price; **in-stock above OOS**; tie-break = Listing Price then freshness.
- **Default Diameter Filter:** 1.75 mm + **unknown** included; known non-1.75 excluded until user changes/clears filter.
- Empty query / no matches → **explicit empty state** with suggestions that **do not invent substitute Offers**.

**Comparison / trust**
- Dense comparison: Listing Price, R$/kg (when weight parseable), Store name (text), availability, last-checked; color + diameter visible when known (not Merge keys).
- Frete/conditions **disclaimer wherever ranking or “cheapest” language appears**.
- **No CEP field; no frete estimate** in MVP UI.
- R$/kg omitted/unavailable if weight unknown—never invent weight.
- Freshness: not refreshed in **48h** → labeled **stale** (still visible with qualification). Copy intent: “last verified / last found price,” never guaranteed checkout price.
- Promo/strikethrough **only** if Store supplies original price &gt; current Listing Price; never invent % from history.
- Ambiguous kits/bundles: unmatched or excluded from R$/kg / default cheapest ranking until unit weight confident.

**Merge honesty (UX implications)**
- Merge = brand + Specific Type + weight only; color/diameter never Merge keys.
- Unmatched Offers still searchable + outbound-capable; prefer unmatched over false merge.
- PETG vs PETG HF never merge solely as family.

**Outbound**
- Leave via **Ver na loja**; mandatory internal outbound redirect (not raw Store href alone)—affiliate params later without changing CTA UX.
- No fake “FilaTracker price” or seller claim.
- When affiliates on: disclosure; until then honest that merchants sell.

**History**
- Basic price history chart **per Offer URL** on detail when history exists; empty/insufficient-history state otherwise.
- No alert signup, email capture, notification prefs.
- Per-Merge aggregated charts **out of MVP**.

**Ads / monetization UI**
- No display ads in MVP UI. `[ASSUMPTION]`

---

## Accessibility / i18n / offline / dark mode / density if mentioned

| Topic | Status in PRD |
|-------|----------------|
| **i18n** | pt-BR default; BRL only v1 `[ASSUMPTION]` |
| **Density** | Hard constraint—tables/lists, information-first |
| **a11y** | Keyboard-usable search + outbound; text contrast for dense tables. Target **WCAG 2.1 AA** for core flows `[ASSUMPTION]` |
| **Perf (UX feel)** | Interactive on typical BR mobile. Soft targets `[ASSUMPTION]`: search API p95 &lt; 500 ms; detail LCP &lt; 2.5 s |
| **Privacy** | No accounts; minimize PII; analytics = product events (clicks; optional searches) |
| **Offline** | Not specified |
| **Dark mode** | Not specified |

---

## Explicit anti-patterns or out-of-scope UX

- Marketplace / cart / checkout / payment.
- Frete calculator / CEP landed-price UI.
- Mercado Livre / marketplace aggregation (MVP).
- Product imagery, Store logos, visual catalog / **vitrine** / showcase; image placeholders/proxy.
- “Best deals” / recently reduced home rails.
- User accounts, alerts, wishlists, reviews, seller portals.
- Spool inventory / printer integrations.
- Claiming price guarantees or final checkout total; frete-inclusive sort; clickbait “cheapest including frete.”
- Live scrape on search; fabricating prices/weights/discounts/R$/kg.
- Non-filament SKUs (printers, resin, accessories).
- Native apps; programmatic SEO farm / store microsites in MVP.
- Color-based Merge; AI/LLM matching UI implications for MVP.

---

## Open UX questions / gaps (things PRD does not specify that a designer needs)

1. **SEO page set** beyond search/detail (brands, materials)—depth for v1 still open (§8).
2. **Affiliate disclosure** timing + exact copy when tags go live (post-MVP trigger).
3. **Whether `/stores` exists** in v1 (optional assumption)—coverage/trust presentation if included.
4. **Empty-state suggestion content** (allowed patterns beyond “do not invent Offers”).
5. **Exact frete/disclaimer / stale / freshness copy** (intent stated; strings not locked).
6. **Visual system:** colors, type, spacing, component anatomy—explicitly deferred (addendum §D); only anti-refs + density.
7. **Layout of comparison:** table vs list density patterns, mobile vs desktop breakpoints—not specified beyond “dense tables/lists.”
8. **History chart** interaction/visual treatment (only: basic chart; empty state).
9. **How Unmatched vs Merged** is explained in UI (behavior locked; labeling/education not specified).
10. **Coverage messaging** when &lt;5 Stores (must not claim “5 lojas”—UI pattern unspecified).
11. **Offline / dark mode / reduced motion**—absent.
12. **Numeric SM-1 target**—not UX, but may affect later conversion-oriented UI pressure (counter-metrics warn against misleading “cheapest” copy).

---

## Stakes signal (hobby/internal/consumer/regulated) if inferable — mark as inference

**[INFERENCE]** Consumer **public web** product for **hobbyist / enthusiast** 3D-printer owners in Brazil (named personas; specialty-store shopping). Trust/reputation and ToS/scrape ethics are hard product guardrails; **not** framed as regulated fintech/health. Monetization path = affiliate-ready later, not day-1 revenue-critical. Competitive wedge vs global Amazon-centric trackers and inventory tools (Spoolman-class)—stated as category context, not UX mandate.
