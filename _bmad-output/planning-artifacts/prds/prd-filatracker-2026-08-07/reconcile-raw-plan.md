# Reconcile: raw_plan.md → PRD

**Input:** `docs/raw_plan.md`  
**PRD:** `prd.md` + `addendum.md`  
**Authority:** `forged-idea.md` supersedes `raw_plan.md` on conflict.  
**Scope of gaps:** Product-level only (audience, value, scope, taxonomy UX, ranking, trust, tone). Tech/stack → architecture / addendum (already deferred in addendum §D).

---

## 1. Method

1. Extract product-facing intent from raw_plan (vision, MVP objectives, domain UX, public pages, filters, trust copy, tone).
2. Compare to PRD + addendum.
3. Drop anything forge already killed or redirected.
4. Flag only remaining **product** gaps that still belong in the PRD (or as explicit Open Questions).

---

## 2. Covered (aligned)

| Raw_plan theme | PRD home |
|----------------|----------|
| pt-BR / BRL, anonymous, no admin/auth | §2, §6, §10 |
| Multi-store search, browse brand/material, filter/sort | FR-1–FR-4, UJ-1/2 |
| R$/kg, last-checked, OOS | FR-7, FR-8 |
| Frete out of ranking + disclaimer | FR-6, Non-Goals, forge lock |
| Outbound “Ver na loja”, affiliate-ready | FR-11, FR-12 |
| False merge worse than duplicate / UNMATCHED | FR-9, FR-10 |
| Dense, objective, info-first UI; not marketplace vitrine | §12, forge |
| No product images; store = text name | FR-5, forge |
| Price history (chart at launch per later lock) | FR-13 |
| Five specialty stores; ML out | §6.1, addendum §C |
| Homologation / Unsupported / no CAPTCHA bypass | FR-14–15, addendum §A |
| Soft kill if coverage dies | §15 |
| Success = outbound clicks | SM-1 |
| Material Family rollup vs Specific Type merge | FR-2, FR-9 |
| Color / diameter out of Merge key | FR-9, memlog |

---

## 3. Conflicts resolved by forge (not PRD gaps)

Do **not** pull these back into the PRD as requirements.

| Raw_plan | Forge / later lock | Outcome |
|----------|--------------------|---------|
| “Visually attractive” / “premium” / BrandLogo | UI direta, objetiva, densa; no logos | Tone = dense comparison tool (PRD §12) |
| Product images on cards/detail | No product images | Rejected |
| Canonical catalog / variant-first as day-1 foundation | Offers-first; catalog = direction | Rejected as launch gate |
| Color in merge / variant identity key | Color out of merge | Rejected |
| Diameter in merge (raw identity key) | Diameter out of merge (user) | Rejected for merge |
| Effective price may include “universal” shipping | Frete 100% out | Rejected |
| ≥3 stores; pick by scrape tech pattern | 5 named utility/recognition stores | Superseded |
| “Sort by effective price” implying landed cost | Listing Price only | Superseded |
| Search queries “canonical products not raw listings” | Offer-centric search | Superseded |
| PriceHistoryChart “future” | Launch includes history chart | Later PRD lock wins |
| Email alerts / accounts | Out of MVP | Already Non-Goals |
| Cloudflare / queues / D1 / adapters / JSON-LD / rate limits | Architecture | Addendum §D |

---

## 4. Product gaps (should still land in PRD or Open Questions)

### GAP-1 — Store promotions / discount display

**Raw:** MVP objective #12 (“Find promotions automatically captured”); §48 Discounts — show % only when `original_price` exists and is higher than current; never invent from history; historical low is separate/later.

**PRD:** Trust/Safety says no fabricated discounts; no FR for honest promo/strikethrough when the store supplies `original_price`.

**Why product:** Shoppers use “em promoção” as a shopping signal; rules prevent lying. Not architecture.

**Suggest:** FR or explicit Non-Goal: surface store-provided list vs promo price when present; forbid history-derived “discount %”.

---

### GAP-2 — Color as display / filter / search (not merge)

**Raw:** Color on cards, filters (Color/base color), search examples (`asa preto`), color normalization for display.

**Forge:** Only killed **color in Merge key**. Display/filter left open.

**PRD:** Merge honesty covers color-out-of-key; FR-4 filters omit color; no FR for showing color on Offer rows.

**Why product:** Filament shopping is often color-led even when merge ignores color.

**Suggest:** Decide in PRD: color as optional display + filter/search facet in MVP, or defer (Open Question).

---

### GAP-3 — Bundle / kit Offer policy

**Raw:** §105 — kits (`Kit 2 Filamentos…`) must not be treated as single-spool weight; if ambiguous, keep unmatched rather than corrupt R$/kg / comparison.

**PRD:** Filament-only ingest (Q6) covers printers/resin; silent on multi-spool bundles within filament.

**Why product:** Same trust class as false merge — bad R$/kg destroys confidence.

**Suggest:** Product rule parallel to FR-10: ambiguous bundles stay unmatched / excluded from “cheapest” comparison until unit weight is confident.

---

### GAP-4 — Locked trust / empty-state voice (pt-BR)

**Raw:** Concrete copy kit — frete disclaimer (§106), “Último preço encontrado” / “Preço verificado há X” (§107), freshness (“Atualizado há…”, stale line §49), empty state + suggestions without fabricated substitutes (§94).

**PRD:** §12 tone is right (“honest”, frete, merchant SoT) but no locked strings or empty-state behavior beyond “explicit empty state”.

**Why product:** Qualitative voice/feel; user asked these to matter. UX can refine wording; PRD should lock **intent**.

**Suggest:** Short “Trust copy” subsection or FR consequences: mandatory frete/conditions line; never “guaranteed/current checkout”; freshness phrasing; empty search does not invent substitutes.

---

### GAP-5 — Home secondary modules vs search-only

**Raw:** Home = search + material quick chips + “Best current deals” / popular / “Recently reduced” (§42).

**Forge:** Not a vitrine; dense comparison.

**PRD:** Search-first home; browse brand/Material Family; no stance on deal/promo rails.

**Why product:** Deal rails change the first-viewport job and can imply “marketplace.”

**Suggest:** PRD lock: home = search + Material Family quick entry (aligns FR-3); **reject** “best deals / recently reduced” rails for MVP (forge “não vitrine”) — or mark as Open Question if undecided.

---

### Minor / borderline (optional Open Questions, not blocking)

| Item | Note |
|------|------|
| Filter by Store; price-range filter | Raw §47; useful, thin vs FR-4 |
| Sort: highest discount, recently updated | Depends on GAP-1 |
| “A partir de N lojas” on merged results | Discovery affordance; UX can own |
| SEO page depth (brands/materials/stores) | Already PRD Q7 |
| Initial Material Family / Specific Type seed list | Taxonomy product scope vs architecture seed data |
| `rel="nofollow sponsored"` on outbound | Legal/trust; affiliate-ready companion to FR-12 |
| Pagination defaults | Architecture/UX |

---

## 5. Qualitative extract (tone / feel)

| Signal | Source | PRD status |
|--------|--------|------------|
| Dense, comparison-first, information density desirable | raw §6 UI + forge | Covered §12 |
| Avoid massive hero, glassmorphism, giant cards, dashboard look | raw §6 | Covered anti-refs §12; keep |
| “Premium / attractive / e-commerce comparison” | raw §68 | **Superseded** by forge dense/objective — do not reintroduce “premium storefront” language |
| Optional accent for price (amber/green), neutral light | raw §68 | UX/design-system, not PRD requirement |
| Honest merchant SoT; no price guarantee | raw §106–107 | Partially covered; strengthen via GAP-4 |
| Search visible without scroll; price visually dominates | raw §42, §69 | UX; consistent with search-first |

---

## 6. Deferred to architecture (confirm stay out of PRD)

Per addendum §D and this reconcile: Cloudflare stack, queues, D1 schema, adapter contracts, scrape priority/frequency, normalization algorithms, confidence scoring, design-system tokens/wireframes, cache/SSRF/robots implementation, FTS choice, seed file layout, matching overrides mechanism (product *need* for ops overrides is already implied by no-admin + UNMATCHED policy; mechanism is architecture).

---

## 7. Recommended PRD actions (compact)

1. **Add** promo/discount FR or Non-Goal (GAP-1).  
2. **Decide** color display/filter (GAP-2).  
3. **Add** bundle/kit honesty rule (GAP-3).  
4. **Lock** trust + empty-state copy intent (GAP-4).  
5. **Lock** home = search + material chips; no deal rails (GAP-5) — or Open Question.

---

## 8. Verdict

`raw_plan.md` is largely absorbed or correctly superseded. Remaining product debt is small: **promotions honesty, color-as-facet, bundles, trust copy kit, home secondary rails**. No need to re-ingest catalog-first, images, frete, or stack chapters into the PRD.
