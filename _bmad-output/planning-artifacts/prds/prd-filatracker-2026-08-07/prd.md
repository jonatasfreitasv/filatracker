---
title: "FilaTracker PRD"
status: final
created: 2026-08-07
updated: 2026-08-07
---

# PRD: FilaTracker

## 0. Document Purpose

This PRD defines the product requirements for **FilaTracker**, a public Brazil-focused filament price search site. It is the decision source for UX, architecture, and epics. Upstream inputs: the forged MVP (`_bmad-output/forge/filament-price-spec/forged-idea.md`) as MVP source of truth; `docs/raw_plan.md` as a technical draft to cut/align (not canonical). Mechanism and transport details (scrape engine, store maps, homologation) live in `addendum.md`. Assumptions from Fast-path inference are tagged `[ASSUMPTION]` and indexed in §9.

## 1. Vision

FilaTracker is a public, Portuguese (pt-BR) web product that helps people with 3D printers find filament across Brazilian specialty stores—outside Mercado Livre—and compare offers by material type and R$/kg without hunting store by store.

Day-1 value is **searchable Offers** across a fixed set of homologated specialty Stores. A mature canonical Product catalog is a direction, not a launch gate: the product groups Offers when a Merge is safe, and prefers leaving Offers unmatched over a false merge.

FilaTracker does not calculate frete, does not run checkout, and is **not a vitrine**—a comparison tool, not a showcase. Ranking uses Listing Price only, with clear disclaimers. Trust comes from coverage of real specialty Stores, honest taxonomy, and Outbound Clicks that land on the merchant as source of truth.

## 2. Target User

### 2.1 Jobs To Be Done

- **Functional:** Find where a desired filament type is sold across specialty BR stores and see the cheapest Listing Price (and R$/kg) quickly.
- **Functional:** Compare like-with-like using material family / specific type, brand, and weight—without treating PETG HF as the same as PETG.
- **Emotional:** Feel confident the comparison is not hiding frete as “included,” and that clicking through is the honest next step.
- **Contextual:** Already owns a printer; shopping moment is “I need filament,” not “I need inventory management.”

### 2.2 Non-Users (v1)

- Print farms needing spool inventory, remaining-weight tracking, or printer integrations (Spoolman-class tools).
- Shoppers who only buy on Mercado Livre / marketplaces (ML is out of MVP).
- Users expecting landed cost (frete + taxes) or price guarantees.
- Merchants needing a seller portal or feed onboarding UI.

### 2.3 Key User Journeys

- **UJ-1. Rafael finds the cheapest PETG across specialty stores.**
  - **Persona + context:** Rafael, hobbyist with a Bambu-class printer in Brazil, needs more PETG this week and usually checks a few specialty shops plus ML.
  - **Entry state:** Anonymous on mobile or desktop; lands on FilaTracker home (search-first).
  - **Path:** Types “PETG” → sees results spanning the parent Material Family (including subtypes) → filters to a Specific Type and/or Brand → opens a result → compares Offers by Listing Price / R$/kg → taps **Ver na loja**.
  - **Climax:** He sees which Store has the lowest Listing Price for a comparable Offer, with frete disclaimer visible.
  - **Resolution:** Leaves to the merchant PDP; FilaTracker records an Outbound Click.
  - **Edge case:** An Offer is stale or OOS—availability and last-checked are visible; he picks another Offer or abandons.

- **UJ-2. Camila compares a brand+type spool she already knows.**
  - **Persona + context:** Camila reprints often with a preferred brand line (e.g. a specific PLA Premium / Silk line) and wants R$/kg across Stores.
  - **Entry state:** Anonymous; arrives via search or brand browse.
  - **Path:** Searches brand + type → opens grouped or unmatched Offers → sorts by price or R$/kg → verifies weight and Specific Type label → outbound.
  - **Climax:** She trusts the Merge only when brand + Specific Type + weight align; color differences do not force a merge.
  - **Resolution:** Outbound Click to purchase on the Store site.

## 3. Glossary

- **FilaTracker** — The public product (this PRD). Repo name may remain `filatracker`.
- **Store** — A Brazilian specialty filament merchant included in the catalog of scrape targets. MVP Stores are named in §6.1.
- **Offer** — A single store listing: price (BRL), availability, weight, Specific Type, brand (as resolved), link, last-checked time.
- **Material Family** — Parent material rollup used for search/browse (e.g. PETG). Searching a Material Family includes all child Specific Types.
- **Specific Type** — Distinct filament line/subtype used for Merge (e.g. PETG, PETG HF, Rapid PETG). Specific Types do not collapse into each other.
- **Merge** — Grouping of Offers that share brand + Specific Type + weight. Color is never part of the Merge key. Diameter is not part of the Merge key.
- **Default Diameter Filter** — Public browse/search defaults to **1.75 mm** Offers. Offers with **unknown/unextracted diameter** are included alongside 1.75 mm (not excluded). Known non-1.75 diameters are excluded from the default view unless the user changes the filter.
- **Listing Price** — The price shown on the Store listing, used for ranking and comparison. Excludes frete.
- **R$/kg** — Listing Price normalized by parsed net weight when weight is known.
- **Outbound Click** — User navigation from FilaTracker to a Store product URL (via affiliate-ready outbound resolution).
- **Homologated Store** — A Store whose scrape map passed fixtures and is allowed to be active. Broken maps move the Store to Unsupported—not silently degraded.
- **Unsupported Store** — A Store that cannot be scraped within policy (anti-bot block, broken map) until fixed or replaced by official feed/API/affiliate.

## 4. Features

### 4.1 Multi-Store Offer Search & Discovery

**Description:** Anonymous users search and browse filament Offers across Homologated Stores. Home is search-first. Material Family search includes subtypes; Specific Type remains visible and filterable. Realizes UJ-1, UJ-2. `[ASSUMPTION: Default language/locale is pt-BR and currency display is BRL only for v1.]`

**Functional Requirements:**

#### FR-1: Search Offers by free text

Anonymous user can submit a search query and receive Offer-centric results from active Homologated Stores. Realizes UJ-1.

**Consequences (testable):**
- Results include Offers from multiple Stores when matches exist.
- Empty query or no matches yields an explicit empty state (not an error page).

#### FR-2: Material Family rollup search

Anonymous user can search/browse by Material Family and see Offers for all child Specific Types, with Specific Type labeled and filterable. Realizes UJ-1.

**Consequences (testable):**
- A “PETG” family query includes PETG HF / Rapid PETG Offers when present.
- User can narrow to a single Specific Type.

#### FR-3: Browse by brand and Material Family

Anonymous user can browse entry points for brands and Material Families without an account.

**Consequences (testable):**
- Brand and Material Family browse surfaces are reachable from the public IA without login.

#### FR-4: Filters and sort

Anonymous user can filter and sort results by attributes needed for filament shopping (at minimum: brand, Specific Type / Material Family, weight, Listing Price, availability; color as display label and optional filter when known—never part of Merge; sort by Listing Price and R$/kg). Realizes UJ-2.

**Consequences (testable):**
- Sorting by Listing Price orders Offers by ascending Listing Price, preferring in-stock over OOS when both exist. In-stock ranks above OOS; tie-break = Listing Price then freshness.
- Default Diameter Filter applies (Glossary): 1.75 mm + unknown included; known non-1.75 excluded unless user changes filter.
- Diameter never drives Merge.
- User can change or clear the diameter filter to see other known diameters.

**Out of Scope:**
- Color-based Merge; frete-inclusive sort; live scrape on search.

### 4.2 Offer Comparison & Trust Surfaces

**Description:** Dense, objective comparison UI: no product images, Store shown as text name only. Ranking uses Listing Price; frete/conditions disclaimer is always present. R$/kg shown when weight is parseable. Realizes UJ-1, UJ-2.

**Functional Requirements:**

#### FR-5: Multi-Offer comparison on a result

Anonymous user can view multiple Offers for the same Merged group (or a single unmatched Offer) with Listing Price, R$/kg, Store name, availability, last-checked, and—when known—**color and diameter as visible attributes** (even though they are not Merge keys). Realizes UJ-1.

**Consequences (testable):**
- No product images are rendered on search cards or comparison.
- Store identity is text name only (no logos).
- When color or diameter is known on an Offer in a Merged group, it is displayed so users can see cross-color / cross-diameter grouping.

#### FR-6: Listing-Price ranking with frete disclaimer

System ranks/compares using Listing Price only and displays a frete/conditions disclaimer wherever ranking or “cheapest” language appears.

**Consequences (testable):**
- No frete estimate or CEP field exists in MVP UI.
- Copy does not claim checkout total or price guarantee.

#### FR-7: R$/kg display

System displays R$/kg when Offer weight is known and parseable; otherwise omits or marks unavailable without inventing weight.

**Consequences (testable):**
- Offers with unknown weight do not show a fabricated R$/kg.

#### FR-8: Availability and freshness signaling

Anonymous user can see whether an Offer is in stock / OOS and when it was last checked.

**Consequences (testable):**
- Stale or deactivated Offers are not presented as current in-stock without qualification.
- Default freshness rule for MVP: if an Offer was not successfully refreshed within **48 hours**, it is labeled stale (still visible with qualification) rather than shown as unqualified in-stock. Architecture may tighten; must not loosen without a PRD change.
- Freshness copy intent (pt-BR): convey “last verified / last found price,” never “guaranteed current checkout price.”

#### FR-17: Store-provided promo display

System may show a discount/strikethrough only when the Store listing supplies an original price higher than the current Listing Price. Never invent discount % from price history.

**Consequences (testable):**
- History-derived “was cheaper before” is not presented as a Store promotion percentage.
- Missing original price → no fabricated promo badge.

### 4.3 Merge & Taxonomy Honesty

**Description:** Merge key is brand + Specific Type + weight (color and diameter out). Deterministic rules only—no AI/LLM in Offer matching for MVP. False merge is worse than duplicate; uncertain Offers stay unmatched. Mature canonical catalog is not a launch gate.

**Functional Requirements:**

#### FR-9: Safe Merge

System merges Offers only when brand + Specific Type + weight match under deterministic rules; otherwise Offers remain separate. Realizes UJ-2.

**Consequences (testable):**
- PETG and PETG HF never share a Merge solely because both are PETG-family.
- Two Offers differing only by color may still Merge if brand + Specific Type + weight match.
- Diameter differences do not block or create Merges.

#### FR-10: Unmatched preferred over unsafe Merge

MVP Merge is **exact deterministic match only** on brand + Specific Type + weight (normalization owned by architecture). No probabilistic confidence score, no ML/LLM matching, no partial Merge. Missing or ambiguous Merge-key fields → Offer stays unmatched. Ambiguous multi-spool kits/bundles must not be treated as a single-spool weight for R$/kg or “cheapest” ranking.

**Consequences (testable):**
- Unmatched Offers are still searchable and outbound-capable.
- Two Offers Merge if and only if normalized brand, Specific Type, and weight are equal; otherwise they do not.
- Kit/bundle Offers with ambiguous unit weight are unmatched or excluded from R$/kg and default cheapest ranking until unit weight is known with confidence.

### 4.4 Outbound to Merchant (Affiliate-Ready)

**Description:** Purchase happens on the Store. FilaTracker provides Outbound Clicks through a stable outbound resolution path designed to accept affiliate parameters later without redesigning the UX. Day-1 may use direct or passthrough links without live affiliate tags.

**Functional Requirements:**

#### FR-11: Ver na loja Outbound Click

Anonymous user can leave FilaTracker to the Store listing URL from an Offer. Realizes UJ-1, UJ-2.

**Consequences (testable):**
- Each Outbound Click is measurable for SM-1 via a **mandatory** internal outbound redirect/endpoint (not raw Store href alone).
- Outbound resolution is structured so affiliate query params can be added later without changing the user-facing CTA.

#### FR-12: Affiliate disclosure readiness

When affiliate monetization is enabled, system can present required disclosure. Until then, product remains honest that merchants are the sellers.

**Consequences (testable):**
- No fake “FilaTracker price” or seller claim.

### 4.5 Price History Chart (Launch)

**Description:** Users can view a basic price history chart for an Offer or Merged group where history exists. No price alerts. No accounts.

**Functional Requirements:**

#### FR-13: Price history chart

Anonymous user can open a price history chart **per Offer URL** on the detail surface when history exists. Per-Merge aggregated charts are out of MVP.

**Consequences (testable):**
- Chart renders from stored historical Listing Price points for that Offer when ≥1 prior point exists; otherwise shows empty/insufficient-history state.
- No alert signup, email capture, or notification preference UI exists.

**Out of Scope:**
- Price drop alerts, watchlists, push/email.

### 4.6 Store Coverage Operations (Product-Visible)

**Description:** Launch requires five named Homologated Stores active. Product policy: no CAPTCHA/anti-bot bypass; blocked or broken Stores become Unsupported. Soft-kill rules in §15.

**Functional Requirements:**

#### FR-14: Active Homologated Store set

System exposes Offers only from Homologated Stores in the active set. MVP target Stores are listed in §6.1.

**Consequences (testable):**
- Mercado Livre is not a Store in MVP.
- A Store that fails homologation or breaks policy is not shown as active coverage.

#### FR-15: Unsupported Store handling

When a Store becomes Unsupported, its Offers are not presented as live coverage until remediated (map fix or official feed/API/affiliate).

**Consequences (testable):**
- No silent use of anti-bot bypass to keep a Store “green.”

### 4.7 Anonymous Analytics (Minimal)

**Description:** Measure what matters for launch success—Outbound Clicks—without user accounts or profiles.

**Functional Requirements:**

#### FR-16: Outbound Click analytics

System records Outbound Clicks as the primary success event.

**Consequences (testable):**
- Outbound Clicks are countable over time for SM-1.
- `[ASSUMPTION: Search and product-view events may be logged as secondary diagnostics but are not success metrics.]`

## 5. Non-Goals (Explicit)

- Not a marketplace, cart, checkout, or payment product.
- Not a frete calculator or CEP-based landed-price engine.
- Not Mercado Livre / marketplace aggregation in MVP.
- Not product imagery, Store logos, visual catalog browsing, or a vitrine/showcase experience.
- Not user accounts, alerts, wishlists, reviews, or seller portals.
- Not spool inventory / print-farm filament management.
- Not LLM-in-the-loop at scrape runtime; not production auto-repair of broken maps without homologation.
- Not AI/LLM for Offer matching or Merge in MVP (deterministic rules only).
- Not CAPTCHA or anti-bot bypass (raw_plan §81 intent retained).
- Not claiming price guarantees or “final checkout total.”
- Not ingesting printers, resin, accessories, or non-filament SKUs from multi-category Stores (filament-only).
- Not a public documented partner API or write API in MVP.
- Not ignoring robots.txt / using credentialed scrape / residential-proxy fleets to keep Stores green.
- Parser failure must not mass-mark Offers OOS (fail closed on scrape errors for availability flips).

## 6. MVP Scope

### 6.1 In Scope

- Public responsive web (pt-BR, BRL): anonymous search → filter/compare → Ver na loja.
- Offer ingest for **five** Homologated specialty Stores (URLs also in addendum §C):
  - [Closin](https://www.closin.com.br/)
  - [Voolt3D](https://voolt3d.com.br/)
  - [3D Colors](https://www.3dcolors.com.br/)
  - [Filamentos 3D Brasil (F3D)](https://www.filamentos3dbrasil.com.br/)
  - [Topink3D](https://www.topink3d.com.br/)
- Features in §4: Material Family rollup; Merge (brand + Specific Type + weight); Listing Price ranking + frete disclaimer; R$/kg; no images / Store name text only; price history chart; affiliate-ready Outbound Click measurement.
- Scrape/homologation/Unsupported policy — see addendum.

### 6.2 Out of Scope for MVP

All §5 Non-Goals apply. MVP timing notes (rationale):

- Mercado Livre / marketplaces — matching complexity + ToS risk.
- Frete / CEP / landed price — trust and scope cut.
- Price alerts / accounts / wishlists — launch cut (history chart remains).
- Product images / Store logos — dense UI; asset & ToS burden.
- Mature canonical catalog as launch gate — offers-first.
- Native apps — web only (§10).
- Day-1 live affiliate commission — affiliate-ready only (§11).
- Inventory / printer integrations — different product category.

## 7. Success Metrics

**Primary**

- **SM-1: Outbound Clicks** — Count of Ver na loja (or equivalent) navigations to Stores. Launch success is defined solely by this metric. Validates FR-11, FR-16. `[ASSUMPTION: Exact launch target (e.g. N clicks/week) is set after first traffic baseline; PRD locks the metric identity, not the numeric quota.]`

**Secondary** *(diagnostic only — not launch success)*

- **SM-2: Homologated Store uptime** — Count of MVP Stores remaining Homologated/active (target: 5/5). Supports soft-kill watch. Validates FR-14, FR-15.
- **SM-3: Search → outbound conversion** — Optional diagnostic ratio; not a success gate.

**Counter-metrics (do not optimize)**

- **SM-C1: Merge rate / forced grouping** — Do not maximize Merges; false merges destroy trust. Counterbalances any urge to “look more complete.” Validates FR-9, FR-10.
- **SM-C2: Store count via policy violation** — Do not keep Stores active by bypassing anti-bot/CAPTCHA. Counterbalances SM-2.
- **SM-C3: Clickbait “cheapest including frete” claims** — Do not inflate clicks with misleading landed-cost language. Counterbalances SM-1.

## 8. Open Questions

1. Exact launch numeric target for SM-1 (clicks/week) after first traffic baseline. `[NOTE FOR PM]` — revisit after first week of public traffic.
2. When to enable live affiliate tags and disclosure copy (post-MVP trigger). `[NOTE FOR PM]`
3. SEO page set beyond search/detail (brands, materials) — depth for v1; ceiling: no programmatic SEO farm / store microsites in MVP.
4. Exact per-Store scrape map format — owned by architecture (forge left open; not a product FR).

*(Closed: freshness 48h stale label; history per-Offer; mandatory outbound; filament-only Non-Goal; diameter not in Merge + default 1.75 filter including unknown; soft-kill interim 14-day replace or pause coverage claims; SM-1 identity-only until baseline.)*

## 9. Assumptions Index

- §4.1 — pt-BR / BRL only for v1.
- §4.7 FR-16 — Search/view events optional diagnostics only.
- §7 SM-1 / §8 Q1 — Numeric click target deferred until baseline traffic.
- §11 — No display ads in MVP UI.
- §13 — `/stores` index optional for v1.
- §14 — Soft perf targets from raw_plan (search p95 < 500 ms; detail LCP < 2.5 s) unless architecture revises.
- §14 — Target WCAG 2.1 AA for core flows.

*(Locked, no longer assumptions: sort tie-break; color display/filter; freshness 48h; outbound mandatory; filament-only; diameter default 1.75 + include unknown.)*

## 10. Platform

- **v1:** Public responsive web; strong mobile usability required; no native apps.
- **Access:** Fully anonymous; no auth.
- **APIs:** Read-oriented public/search surfaces as needed for the web app; no public mutation API for MVP.

## 11. Monetization

- MVP does **not** depend on affiliate revenue.
- Outbound path is **affiliate-ready** (params/redirect/disclosure can activate later).
- No-ads policy for MVP; `[ASSUMPTION: no display ads in MVP UI.]`
- When affiliates activate: disclose clearly; never misrepresent Listing Price.

## 12. Aesthetic and Tone

- **Não frete, não vitrine:** dense, direct, objective UI—comparison tool, not a showcase (see §5).
- Density is a hard constraint: information-first tables/lists beat visual merchandising.
- No product photography; no Store logo chrome (FR-5).
- Voice: clear pt-BR; honest about frete and merchant-as-source-of-truth.
- **Trust copy intent:** frete/conditions disclaimer wherever “cheapest” or ranked price appears; empty search shows an explicit empty state with suggestions that do not invent substitute Offers; never claim guaranteed or final checkout total.
- Home is search-first (optional Material Family quick entry). **No** “best deals / recently reduced” deal rails in MVP (anti-vitrine).
- Anti-references: marketplace-style image grids; browse-as-vitrine layouts; “guaranteed lowest price” claims; massive hero / glassmorphism / giant cards.

## 13. Information Architecture (v1)

- Home (search-first; optional Material Family chips; **no deal rails**)
- Search results
- Offer / Merge detail (comparison + history chart)
- Browse: Material Family, Brand `[ASSUMPTION: /stores index optional for v1]`
- Legal/trust: frete disclaimer, optional affiliate disclosure placeholder

## 14. Cross-Cutting NFRs

- **Performance:** Search and detail feel interactive on typical BR mobile connections. `[ASSUMPTION: Adopt raw_plan acceptance as soft targets—search API p95 < 500 ms; detail LCP < 2.5 s—unless architecture revises.]`
- **Reliability:** Scrape failures must not take down public browse/search.
- **Trust/Safety:** No anti-bot bypass; no fabricated prices/weights/discounts.
- **Accessibility:** Keyboard-usable search and outbound controls; text contrast suitable for dense tables. `[ASSUMPTION: Target WCAG 2.1 AA for core flows.]`
- **Privacy:** No accounts; minimize PII; analytics limited to product events (clicks, optional searches).
- **Observability:** Store scrape health and Homologated vs Unsupported state must be visible to operators (addendum).

## 15. Constraints and Guardrails

- **Legal/ToS:** Prefer public pages/feeds; Homologated maps only; blocked Store → Unsupported until official channel.
- **Reputation:** False merge is worse than duplicate; frete disclaimer mandatory on ranked “cheap” claims.
- **Ops soft kill:** Cannot sustain five useful Homologated specialty Stores → revisit MVP viability. If fewer than five are active, UI/marketing must not claim full MVP coverage. **Confirmed interim:** attempt Store replacement within 14 days or pause “5 lojas” coverage claims until five Homologated Stores are restored.
- **Cost:** Scrape frequency and browser fallback constrained so public UX stays available (addendum).

## 16. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Store blocks automation | Unsupported status; no bypass; seek feed/API/affiliate; replace Store per §15 soft-kill interim |
| False merges erode trust | FR-9/FR-10; SM-C1 |
| Users expect frete-inclusive price | Persistent disclaimer; Non-Goals |
| Multi-category Stores pollute catalog | Filament-only ingest; validate on Topink3D et al. |
| Affiliate later conflicts with trust | Disclosure FR-12; affiliate-ready without day-1 dependency |
| Coverage too thin vs ML habit | Specialty-store value prop; measure SM-1 not vanity Store count |

## 17. Competitive Context (Brief)

Global filament price sites (Filament Price Tracker, SpoolHound, CheapSpool, SpoolWatch) are typically free + affiliate and often Amazon-centric; inventory tools (Spoolman, Spoolio) are a different category. FilaTracker’s wedge: **Brazil specialty-store coverage + taxonomy (Specific Type, R$/kg)**—not frete optimization, not inventory. Research digest: addendum §E.
