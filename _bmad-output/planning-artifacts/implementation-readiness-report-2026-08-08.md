---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
status: final
overallReadiness: NEEDS_WORK
correctionsApplied: 2026-08-08
filesIncluded:
  prd:
    - prds/prd-filatracker-2026-08-07/prd.md
    - prds/prd-filatracker-2026-08-07/addendum.md
  architecture:
    - architecture/architecture-filatracker-2026-08-07/ARCHITECTURE-SPINE.md
  epics:
    - epics.md
  ux:
    - ux-designs/ux-filatracker-2026-08-07/EXPERIENCE.md
    - ux-designs/ux-filatracker-2026-08-07/DESIGN.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-08-08
**Project:** filatracker

## Document Inventory

### PRD Files Found

**Sharded (folder):** `prds/prd-filatracker-2026-08-07/`
- `prd.md` (24407 bytes, 07 ago 04:48) — primary PRD
- `addendum.md` (3217 bytes, 07 ago 04:48) — PRD addendum
- Supporting/process files present but not used as assessment source: `.memlog.md`, `reconcile-forge-memlog.md`, `reconcile-forged-idea.md`, `reconcile-raw-plan.md`, `review-adversarial.md`, `review-rubric.md`

### Architecture Files Found

**Sharded (folder):** `architecture/architecture-filatracker-2026-08-07/`
- `ARCHITECTURE-SPINE.md` (34539 bytes, 07 ago 05:59) — primary architecture spine
- Supporting: `.memlog.md`, `reviews/` (not used as assessment source)

### Epics & Stories Files Found

**Whole document:** `epics.md` (80822 bytes, **08 ago 01:24** — modified after the prior readiness report)

### UX Design Files Found

**Sharded (folder):** `ux-designs/ux-filatracker-2026-08-07/`
- `EXPERIENCE.md` (7295 bytes, 07 ago 05:13)
- `DESIGN.md` (8227 bytes, 07 ago 05:13)
- Supporting: `.memlog.md`, `imports/`, `mockups/`, `stitch_filatracker_brazil_filament_comparison/` (not used as assessment source)

## Issues Found

- **No format duplicates** — each document type exists in exactly one form (no whole+sharded conflicts).
- ⚠️ **Prior report exists and may be stale**: `implementation-readiness-report-2026-08-07.md` (generated 08 ago 00:03, status `NOT_READY`) predates the latest edit to `epics.md` (08 ago 01:24). This new assessment will treat `epics.md` as it stands now — findings from the prior report may already be partially addressed or superseded.
- No missing documents — PRD, Architecture, Epics, and UX are all present.

## PRD Analysis

### Functional Requirements

FR-1: **Search Offers by free text** — Anonymous user can submit a search query and receive Offer-centric results from active Homologated Stores. Results include Offers from multiple Stores when matches exist; empty query or no matches yields an explicit empty state (not an error page).

FR-2: **Material Family rollup search** — Anonymous user can search/browse by Material Family and see Offers for all child Specific Types, with Specific Type labeled and filterable. A "PETG" family query includes PETG HF / Rapid PETG Offers when present; user can narrow to a single Specific Type.

FR-3: **Browse by brand and Material Family** — Anonymous user can browse entry points for brands and Material Families without an account. Brand and Material Family browse surfaces are reachable from the public IA without login.

FR-4: **Filters and sort** — Anonymous user can filter and sort results by attributes needed for filament shopping (at minimum: brand, Specific Type / Material Family, weight, Listing Price, availability; color as display label and optional filter when known—never part of Merge; sort by Listing Price and R$/kg). Sorting by Listing Price orders ascending, in-stock ranks above OOS, tie-break = Listing Price then freshness. Default Diameter Filter applies (1.75 mm + unknown included; known non-1.75 excluded unless user changes filter). Diameter never drives Merge. User can change/clear the diameter filter. Out of Scope: color-based Merge, frete-inclusive sort, live scrape on search.

FR-5: **Multi-Offer comparison on a result** — Anonymous user can view multiple Offers for the same Merged group (or a single unmatched Offer) with Listing Price, R$/kg, Store name, availability, last-checked, and—when known—color and diameter as visible attributes (not Merge keys). No product images on search cards or comparison; Store identity is text name only (no logos). When color/diameter known on an Offer in a Merged group, it is displayed.

FR-6: **Listing-Price ranking with frete disclaimer** — System ranks/compares using Listing Price only and displays a frete/conditions disclaimer wherever ranking or "cheapest" language appears. No frete estimate or CEP field exists in MVP UI. Copy does not claim checkout total or price guarantee.

FR-7: **R$/kg display** — System displays R$/kg when Offer weight is known and parseable; otherwise omits or marks unavailable without inventing weight. Offers with unknown weight do not show a fabricated R$/kg.

FR-8: **Availability and freshness signaling** — Anonymous user can see whether an Offer is in stock / OOS and when it was last checked. Stale or deactivated Offers are not presented as current in-stock without qualification. Default freshness rule: if not successfully refreshed within 48 hours, labeled stale (still visible with qualification). Freshness copy conveys "last verified," never "guaranteed current checkout price."

FR-9: **Safe Merge** — System merges Offers only when brand + Specific Type + weight match under deterministic rules; otherwise Offers remain separate. PETG and PETG HF never share a Merge solely because both are PETG-family. Two Offers differing only by color may still Merge if brand + Specific Type + weight match. Diameter differences do not block or create Merges.

FR-10: **Unmatched preferred over unsafe Merge** — MVP Merge is exact deterministic match only on brand + Specific Type + weight. No probabilistic confidence score, no ML/LLM matching, no partial Merge. Missing/ambiguous Merge-key fields → Offer stays unmatched. Ambiguous multi-spool kits/bundles must not be treated as a single-spool weight for R$/kg or "cheapest" ranking. Unmatched Offers are still searchable and outbound-capable. Kit/bundle Offers with ambiguous unit weight are unmatched or excluded from R$/kg and default cheapest ranking until unit weight is known with confidence.

FR-11: **Ver na loja Outbound Click** — Anonymous user can leave FilaTracker to the Store listing URL from an Offer. Each Outbound Click is measurable for SM-1 via a mandatory internal outbound redirect/endpoint (not raw Store href alone). Outbound resolution is structured so affiliate query params can be added later without changing the user-facing CTA.

FR-12: **Affiliate disclosure readiness** — When affiliate monetization is enabled, system can present required disclosure. Until then, product remains honest that merchants are the sellers. No fake "FilaTracker price" or seller claim.

FR-13: **Price history chart** — Anonymous user can open a price history chart per Offer URL on the detail surface when history exists. Per-Merge aggregated charts are out of MVP. Chart renders from stored historical Listing Price points when ≥1 prior point exists; otherwise shows empty/insufficient-history state. No alert signup, email capture, or notification preference UI exists. Out of Scope: price drop alerts, watchlists, push/email.

FR-14: **Active Homologated Store set** — System exposes Offers only from Homologated Stores in the active set (five MVP Stores per §6.1). Mercado Livre is not a Store in MVP. A Store that fails homologation or breaks policy is not shown as active coverage.

FR-15: **Unsupported Store handling** — When a Store becomes Unsupported, its Offers are not presented as live coverage until remediated (map fix or official feed/API/affiliate). No silent use of anti-bot bypass to keep a Store "green."

FR-16: **Outbound Click analytics** — System records Outbound Clicks as the primary success event. Outbound Clicks are countable over time for SM-1. `[ASSUMPTION]` Search and product-view events may be logged as secondary diagnostics but are not success metrics.

FR-17: **Store-provided promo display** — System may show a discount/strikethrough only when the Store listing supplies an original price higher than the current Listing Price. Never invent discount % from price history. History-derived "was cheaper before" is not presented as a Store promotion percentage. Missing original price → no fabricated promo badge.

**Total FRs: 17**

### Non-Functional Requirements

NFR-1: **Performance** — Search and detail feel interactive on typical BR mobile connections. `[ASSUMPTION]` Soft targets from raw_plan: search API p95 < 500 ms; detail LCP < 2.5 s, unless architecture revises.

NFR-2: **Reliability** — Scrape failures must not take down public browse/search. Parser failure must not mass-mark Offers OOS (fail closed on scrape errors for availability flips).

NFR-3: **Trust/Safety** — No anti-bot bypass; no fabricated prices/weights/discounts.

NFR-4: **Accessibility** — Keyboard-usable search and outbound controls; text contrast suitable for dense tables. `[ASSUMPTION]` Target WCAG 2.1 AA for core flows.

NFR-5: **Privacy** — No accounts; minimize PII; analytics limited to product events (clicks, optional searches).

NFR-6: **Observability** — Store scrape health and Homologated vs Unsupported state must be visible to operators (addendum).

NFR-7: **Legal/ToS (Scrape policy)** — Prefer public pages/feeds; Homologated maps only; blocked Store → Unsupported until official channel. No ignoring robots.txt / no credentialed scrape / no residential-proxy fleets to keep Stores green (§5). No CAPTCHA/anti-bot bypass (addendum §A).

NFR-8: **Scalability/Ops soft-kill** — Cannot sustain five useful Homologated specialty Stores → revisit MVP viability. If fewer than five active, UI/marketing must not claim full MVP coverage. Interim: attempt Store replacement within 14 days or pause "5 lojas" coverage claims until five Homologated Stores are restored.

NFR-9: **Cost** — Scrape frequency and browser fallback constrained so public UX stays available (addendum §A).

**Total NFRs: 9**

### Additional Requirements / Constraints

- **Deterministic scrape engine + versioned per-Store map/playbook** in repo (addendum §A). AI may generate/update maps offline only; zero LLM in scrape job runtime.
- **Homologation gate**: Store goes live only after fixtures pass; broken map → Unsupported; no production auto-repair without re-homologation.
- **Filament-only ingest filters** required for multi-category Stores (e.g. Topink3D) — Non-Goal violation otherwise.
- **No public documented partner API or write API** in MVP.
- **Platform**: public responsive web only, no native apps; fully anonymous, no auth; read-oriented public/search APIs only.
- **Monetization**: MVP does not depend on affiliate revenue; outbound path affiliate-ready; no-ads policy for MVP `[ASSUMPTION]`.
- **Aesthetic/Tone constraints** (product-defining, testable as acceptance criteria): dense/objective UI, no product photography, no Store logo chrome, frete/conditions disclaimer wherever "cheapest"/ranked price appears, explicit empty search state, no deal rails ("no vitrine"), home is search-first.
- **IA (§13)**: Home, Search results, Offer/Merge detail (comparison + history chart), Browse (Material Family, Brand `[ASSUMPTION: /stores index optional]`), Legal/trust surfaces.
- **Open Questions (§8, not yet resolved — track for epic/story impact):**
  1. Exact launch numeric target for SM-1 (clicks/week) — deferred to post-baseline, not a blocker for MVP build.
  2. When to enable live affiliate tags/disclosure copy — post-MVP trigger, not a blocker.
  3. SEO page set beyond search/detail — depth open for v1; ceiling defined (no programmatic SEO farm).
  4. Exact per-Store scrape map format — owned by architecture, not a product FR (should be resolved in Architecture doc).
- **5 Named MVP Stores** (§6.1 / addendum §C): Closin, Voolt3D, 3D Colors, Filamentos 3D Brasil (F3D), Topink3D.
- **Success Metrics**: SM-1 (Outbound Clicks, primary/launch-defining), SM-2 (Homologated Store uptime, diagnostic), SM-3 (Search→outbound conversion, diagnostic), SM-C1/C2/C3 (counter-metrics — do not optimize toward false merges, policy-violating store count, or misleading "cheapest" claims).

### PRD Completeness Assessment

The PRD is well-structured, internally consistent, and unusually rigorous about testable "Consequences" per FR — this gives strong traceability potential into acceptance criteria. Glossary (§3) is precise and load-bearing for Epics/Architecture (Merge key, Specific Type vs Material Family, Homologated vs Unsupported). Non-Goals (§5) are explicit and should be checked against Epics to ensure none were accidentally implemented. Four Open Questions remain (§8) but none block MVP build — Q4 (scrape map format) should be confirmed as resolved in the Architecture document. Assumptions are indexed (§9) and mostly locked; `[ASSUMPTION]` tags should be traced to see if Architecture/UX honor them or silently diverge. The addendum (§A–E) supplies mechanism-level constraints (deterministic scraping, homologation, no-LLM-at-runtime) that carry PRD-level weight for Epic coverage even though they're not FR-numbered — these must be checked against Epics too.

## Epic Coverage Validation

### Epic FR Coverage Extracted

`epics.md` includes its own explicit **FR Coverage Map** (§"FR Coverage Map", lines ~179-197) plus a full "Requirements Inventory" that restates all 17 FRs, 16 NFRs (NFR1-NFR16 — expanded beyond the PRD's 9 cross-cutting NFRs with Architecture-derived ones), 30 Additional/Architecture Requirements (AR1-AR30), and 26 UX Design Requirements (UX-DR1-UX-DR26). This step validates FR coverage only (NFR/AR/UX-DR coverage is checked in later steps).

```
FR1:  Epic 1 (Story 1.1, 1.4, 1.5, 1.6)
FR2:  Epic 1 (Story 1.6)
FR3:  Epic 1 (Story 1.6)
FR4:  Epic 3 (Story 3.2)
FR5:  Epic 3 (Story 3.3)
FR6:  Epic 3 (Story 3.2, 3.3)
FR7:  Epic 3 (Story 3.2, 3.3)
FR8:  Epic 3 (Story 3.2, 3.3)
FR9:  Epic 3 (Story 3.1, 3.3)
FR10: Epic 3 (Story 3.1, 3.3)
FR11: Epic 4 (Story 4.1, 4.4)
FR12: Epic 4 (Story 4.3, 4.4)
FR13: Epic 3 (Story 3.4)
FR14: Epic 2 (Story 2.1, 2.2, 2.3, 2.4)
FR15: Epic 2 (Story 2.4)
FR16: Epic 4 (Story 4.2, 4.4)
FR17: Epic 3 (Story 3.4)

Total FRs in epics: 17
```

### FR Coverage Analysis

| FR Number | PRD Requirement (summary) | Epic Coverage | Status |
| --- | --- | --- | --- |
| FR-1 | Search Offers by free text | Epic 1 (1.1, 1.4, 1.5) | ✓ Covered |
| FR-2 | Material Family rollup search | Epic 1 (1.6) | ✓ Covered |
| FR-3 | Browse by brand and Material Family | Epic 1 (1.6) | ✓ Covered |
| FR-4 | Filters and sort | Epic 3 (3.2) | ✓ Covered |
| FR-5 | Multi-Offer comparison on a result | Epic 3 (3.3) | ✓ Covered |
| FR-6 | Listing-Price ranking with frete disclaimer | Epic 3 (3.2, 3.3) | ✓ Covered |
| FR-7 | R$/kg display | Epic 3 (3.2, 3.3) | ✓ Covered |
| FR-8 | Availability and freshness signaling | Epic 3 (3.2, 3.3) | ✓ Covered |
| FR-9 | Safe Merge | Epic 3 (3.1, 3.3) | ✓ Covered |
| FR-10 | Unmatched preferred over unsafe Merge | Epic 3 (3.1, 3.3) | ✓ Covered |
| FR-11 | Ver na loja Outbound Click | Epic 4 (4.1) | ✓ Covered |
| FR-12 | Affiliate disclosure readiness | Epic 4 (4.3) | ✓ Covered |
| FR-13 | Price history chart | Epic 3 (3.4) | ✓ Covered |
| FR-14 | Active Homologated Store set | Epic 2 (2.1, 2.2, 2.3, 2.4) | ✓ Covered |
| FR-15 | Unsupported Store handling | Epic 2 (2.4) | ✓ Covered |
| FR-16 | Outbound Click analytics | Epic 4 (4.2) | ✓ Covered |
| FR-17 | Store-provided promo display | Epic 3 (3.4) | ✓ Covered |

**Reverse check (epics → PRD):** every FR referenced in epics.md's Requirements Inventory (FR1-FR17) traces back to a real PRD FR-1..FR-17. No orphan FR numbers invented in epics that don't exist in the PRD.

**Semantic fidelity spot-check:** epics.md restates each FR in its own words rather than quoting the PRD verbatim; wording was compared clause-by-clause against the PRD source and no material narrowing, broadening, or contradiction was found (e.g. FR-4's diameter default, tie-break rule, and color-is-never-a-filter-key nuance are preserved; FR-9/FR-10's "Material Family alone cannot merge distinct Specific Types" correctly extends the PRD's Merge-key language).

### Missing Requirements

None. All 17 PRD Functional Requirements have explicit, traceable epic/story coverage, and Epic 4 Story 4.4 additionally re-verifies FR1-FR17 (plus NFR/AR/UX-DR) as a full-launch traceability gate.

### Coverage Statistics

- Total PRD FRs: 17
- FRs covered in epics: 17
- Coverage percentage: 100%

## UX Alignment Assessment

### UX Document Status

**Found.** `EXPERIENCE.md` (behavioral/IA spine) + `DESIGN.md` (visual tokens/components), both `status: final`, dated 2026-08-07. Both explicitly declare themselves authoritative over `mockups/` and the Stitch export on conflict.

### UX ↔ PRD Alignment

- **User journeys**: EXPERIENCE.md's Key Flows (Flow 1 — Rafael/PETG, Flow 2 — Camila/brand+type, Flow 3 — empty search) map directly to PRD §2.3 UJ-1 and UJ-2, plus the empty-state trust behavior from §12. No invented journeys, no missing journeys.
- **IA**: EXPERIENCE.md's IA table (Home, Search results, Search empty, Offer/Merge detail, Browse Material Family, Browse Brand, Trust/footer) matches PRD §13 IA exactly, including `/stores` explicitly marked out of scope for v1 in both documents.
- **Voice/trust copy**: EXPERIENCE.md's Do/Don't table operationalizes PRD §12's trust-copy intent (frete disclaimer adjacency, no "tempo real," no guaranteed price, honest empty state) with concrete pt-BR strings — a faithful, more specific rendering of the PRD, not a deviation.
- **Merge honesty, diameter default, freshness (48h), Merge-level history exclusion**: all consistent between PRD Glossary/§4 and EXPERIENCE.md Component Patterns / State Patterns.
- **Aesthetic constraints** (§12 "não frete, não vitrine," no images/logos, no deal rails): DESIGN.md's "Do's and Don'ts" and Brand & Style section directly encode these as hard constraints, plus concrete color/type tokens the PRD leaves unspecified (appropriately — PRD doesn't over-specify visuals).
- **No UX requirement found that's absent from the PRD** — UX stays within PRD-defined scope; no scope creep (e.g., no accounts, no images, no CEP field anywhere in UX).
- **Minor imprecision (non-blocking)**: EXPERIENCE.md's "Result / Offer row" component defines a **two-CTA pattern** — `Ver preços` (→ detail) and a direct `Ver na loja` (→ outbound) — but PRD FR-11 and epics UX-DR10/UX-DR14 only formalize the `Ver na loja` outbound control by name; the secondary `Ver preços` detail-navigation CTA is not named anywhere outside EXPERIENCE.md (epics UX-DR10 covers it only generically as "appropriate detail/outbound actions"). Not a coverage gap — behavior is implied and buildable — but worth epic/story authors double-checking Story 1.4/3.3 acceptance criteria explicitly exercise both CTAs, not just outbound.

### UX ↔ Architecture Alignment

- **Design system ownership**: Architecture explicitly binds `app/design-system/` seeded from `DESIGN.md`, with "routes...may not fork route-local color, type, spacing, status, or focus constants" (ARCHITECTURE-SPINE.md line ~227) — this is a direct, correctly-scoped architectural commitment to UX-DR1's constraint, and matches epics AR17/UX-DR1.
- **Routes**: Architecture's route list (`/`, `/search`, `/offers/:offerId`, `/merges/:mergeId`, `/materials/:familySlug`, `/brands/:brandSlug`, `/out/:offerId`; `/stores` absent) is an exact match to EXPERIENCE.md's IA and PRD §13.
- **Accessibility**: Architecture explicitly binds "Core search → compare → outbound flows meet WCAG 2.1 AA: keyboard reachability, visible focus, textual status, responsive table semantics, and an announced external transition" (line ~228) — matches EXPERIENCE.md's Accessibility Floor and PRD §14 NFR almost verbatim, including the "announced external transition" detail that's easy to miss.
- **Performance**: Architecture's provisional targets (search p95 <500ms, detail LCP <2.5s, line ~204) match PRD §14/§9 assumption and epics NFR1 exactly — same numbers, same "provisional/must be approved before launch" framing in all three documents. No drift.
- **No cross-request cache for dynamic pages**: Architecture explicitly states this (line ~131, ~351); consistent with UX's freshness/staleness (48h) and honest-coverage requirements — stale data must reflect real state, not a cached snapshot.
- **Comparison/Merge rendering**: Architecture's `MergeResult | OfferResult` discriminated model (line ~66) directly supports EXPERIENCE.md's "Merge honesty" and "Unmatched Offer" state pattern — the UI-visible behavior (never a false Merge, unmatched stays visible) has a concrete backing data model.
- **No UI components identified that lack architectural support.** Every dense-table, filter, status-badge, and outbound behavior in DESIGN.md/EXPERIENCE.md traces to a corresponding architecture decision (page-aggregate RPC snapshot, generation fencing, destination policy for outbound, etc.).

### Warnings

None blocking. One low-severity note carried forward to Epic Quality Review: verify the `Ver preços` (→ detail) vs `Ver na loja` (→ outbound) two-CTA distinction from EXPERIENCE.md's Result/Offer row is explicitly exercised in relevant story acceptance criteria (Story 1.4, 3.2, 3.3), not just the outbound path.

## Epic Quality Review

### Epic Structure Validation

**A. User Value Focus** — ✅ Pass. All four epic titles are user-outcome framed, not technical milestones: "Find Real Filament Offers," "Trust Five-Store Coverage," "Compare Offers with Price and Taxonomy Confidence," "Continue to the Merchant with Measurable Trust." No epic is a disguised technical milestone (e.g., no "Database Setup," "API Layer," "Infrastructure" epic). Story 1.1 ("Set Up the Initial Project from the Official Starter") is infra-flavored but is explicitly justified — Architecture (AD-3) mandates the official `create-cloudflare` starter, and this workflow's own Special Implementation Check requires Epic 1 Story 1 to be exactly this when a starter template is specified. Story 1.1's ACs also bundle real user-facing behavior (SSR search-first Home, honest empty state, accessibility) rather than being pure scaffolding — compliant.

**B. Epic Independence** — ⚠️ Conditional pass, one material gap found (see Critical Violations below). Epics 2, 3, and 4 correctly build only on prior-epic outputs (no epic's stories reference a later epic's not-yet-built components by name), so there is no *textual* forward dependency. However, a *functional* completeness gap exists: Epic 1, 2, and 3 all render Offer/Merge rows and detail pages (UX-DR10, UX-DR11, UX-DR14 mandate a `Ver na loja` control on every such row), but FR-11 — the actual outbound mechanism (`/out/:offerId` resolution, destination policy, redirect) — is entirely scoped to Epic 4 Story 4.1. See Critical Violations.

### Story Quality Assessment

**A. Story Sizing** — ✅ Pass. Every story opens with a clear "As a [persona], I want [capability], So that [benefit]" and is scoped to a coherent, shippable slice (e.g., Story 1.2 homologates exactly one Store adapter; Story 2.1-2.3 each add exactly one Store). No story is "epic-sized" (e.g., no single story tries to cover both Merge logic and comparison UI and history — those are correctly split across 3.1/3.2/3.3/3.4).

**B. Acceptance Criteria Review** — ✅ Pass, with a stylistic note. All ACs use consistent Given/When/Then structure, and each is testable and specific (e.g., exact copy strings like `Não encontramos esse filamento.`, exact numeric thresholds like 48h staleness, p95 <500ms). Error/failure paths are consistently covered (RPC unavailable, overload, malformed input, degraded states) alongside happy paths — this project is unusually rigorous here, better than typical. **Stylistic note (not a violation):** ACs are written at a deep technical/architecture level (D1 generation fencing, CAS cutover, foreign keys) rather than purely user-observable outcomes. This is consistent with the project's explicit "Production Completion Standard" (zero stubs, full production-readiness per story) and is a deliberate, documented choice — not a best-practices violation, but it does mean these read more like technical specs than typical lightweight user stories.

### Dependency Analysis

**A. Within-Epic Dependencies** — ✅ Pass. Every story dependency chain runs backward only:
- Epic 1: 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6, each consuming only prior stories' outputs.
- Epic 2: 2.1, 2.2, 2.3 are independently addable Store integrations (correctly parallelizable); 2.4 (lifecycle operations) consumes all three plus Epic 1's coordinator — backward only.
- Epic 3: 3.1 (Merge) → 3.2 (filter/sort) → 3.3 (detail) → 3.4 (promo/history) → 3.5 (full validation, correctly a hardening/sign-off story consuming everything before it, including Epic 1/2).
- Epic 4: 4.1 (outbound) → 4.2 (analytics, needs 4.1's event) → 4.3 (affiliate, needs 4.1's destination resolution) → 4.4 (launch sign-off, consumes everything).
No story references a not-yet-built future story by number.

**B. Database/Entity Creation Timing** — ✅ Pass. Story 1.1 explicitly restricts itself to "only entities required by the functional empty-search slice" rather than creating the full schema upfront; subsequent stories (1.2 Store/map tables, 3.1 Merge registry, 4.2 event tables) introduce entities only when first needed. No upfront full-schema anti-pattern found.

### Special Implementation Checks

**A. Starter Template Requirement** — ✅ Pass. Architecture (AD-3) specifies the official `create-cloudflare` React Router v8 starter; Story 1.1 is correctly "Set up initial project from the Official Starter" and its ACs verify preservation of `workers/app.ts`, lockfile authority, and declared semver ranges.

**B. Greenfield Indicators** — ✅ Pass. This is a greenfield project with an initial setup story (1.1), environment/binding configuration in 1.1, and CI/deployment gates established from Story 1.1 onward (not deferred to the end) — matches expected greenfield shape.

### 🔴 Critical Violations

1. **Outbound mechanism (FR-11) is entirely deferred to Epic 4, but Epics 1-3 render rows that UX-DR mandates must include a `Ver na loja` control, and the epics document doesn't resolve the resulting contradiction.**
   - Store identity is text-only with no logos or images (FR-5/DESIGN.md) — `Ver na loja` is the *only* path from a search/comparison row to the merchant. FR Coverage Map assigns FR-11 (the actual `/out/:offerId` resolution + destination policy) solely to Epic 4 Story 4.1.
   - Story 1.4's AC explicitly enumerates row contents ("Store text name, brand/Specific Type, Listing Price, conditional R$/kg, availability, freshness, known color/diameter, no image or logo") **with no outbound control mentioned at all.** Story 3.3's detail-page AC uses only the vague phrase "permitted actions" for the equivalent slot.
   - This creates a genuine ambiguity with two bad readings: **(a)** Epics 1-3 ship rows/detail pages with *no* way to reach the merchant, meaning the product isn't usable for its core job (PRD UJ-1/UJ-2 "Resolution: leaves to merchant PDP") until Epic 4 lands — undermining Epic 1's own stated goal of delivering "usable discovery" and Epic 3's goal of a "production-ready" comparison experience; or **(b)** Epics 1-3 ship a `Ver na loja` control that doesn't yet call the real Epic-4-built `/out/:offerId` RPC/destination-policy, which would violate AR30 ("Runtime stubs...placeholders...do not satisfy completion").
   - Epic 3's own epic description partially anticipates this ("production-ready **without depending on outbound analytics**") but that phrasing only excuses FR-16 (click *measurement*), not FR-11 (the outbound *mechanism* itself) — the epic description and the FR Coverage Map are not actually consistent with each other on this point.
   - **Recommendation:** Either (1) pull a minimal version of FR-11 (a direct/simple outbound redirect, without affiliate-readiness polish) forward into Epic 1 so every epic ships an actionable, non-stub row from the start, and let Epic 4 layer affiliate-readiness/analytics on top of an already-working redirect; or (2) explicitly state in Epic 1/2/3's descriptions and in Story 1.4/3.3's ACs that rows are display-only until Epic 4 and that this is an intentional, reviewed sequencing decision. As written, this must be resolved before implementation — it affects Epic 1 Story 1.4's AC scope directly.

### 🟠 Major Issues

None beyond the Critical item above (which subsumes what would otherwise be a Major AC-completeness issue).

### 🟡 Minor Concerns

1. **No single UX-DR/AR/NFR-to-story coverage map** — unlike FRs (which have an explicit "FR Coverage Map"), UX-DR1-26, AR1-30, and NFR1-16 are only traceable by reading each story's AC prose; Story 4.4 promises this traceability will be *generated* at launch-gate time, but it doesn't exist as a reviewable table today. Not blocking, but makes it harder to audit "which story implements UX-DR7 (responsive layout)" without a full-text search.
2. **`Ver preços` (detail-navigation CTA) is never named in epics/UX-DR**, only in EXPERIENCE.md's Component Patterns (carried over from the UX Alignment step above) — low severity, likely implied by UX-DR10's "appropriate detail/outbound actions" but worth an explicit AC line in Story 1.4/3.2/3.3.

## Summary and Recommendations

### Overall Readiness Status

**NEEDS WORK**

The planning set (PRD, Architecture, UX, Epics) is unusually rigorous and internally consistent: 100% of PRD FRs (17/17) trace to epics, UX and Architecture agree on routes/performance/accessibility targets down to the exact numbers, and the epics enforce a strict zero-stub/zero-placeholder production standard (AR30). This is well above the bar typically seen at this checkpoint. It is not marked READY only because of one concrete, well-scoped contradiction in the epics document that will directly affect how Story 1.4 (and 3.3) acceptance criteria must be written — it should be resolved in the epics document itself before story drafting/dev begins, not discovered mid-implementation.

### Critical Issues Requiring Immediate Action

1. **Outbound (`Ver na loja` / FR-11) sequencing contradiction** — Epics 1-3 render Offer/Merge rows that UX-DR10/UX-DR11/UX-DR14 require to include a `Ver na loja` control, but FR-11 (the actual `/out/:offerId` mechanism) is scoped entirely to Epic 4 Story 4.1. Story 1.4's AC lists row contents with no outbound control at all; Story 3.3 uses the vague "permitted actions." Since Store identity is text-only (no logos/images), `Ver na loja` is the *only* path to the merchant — as written, either Epics 1-3 ship non-actionable dead-end rows (undermining their own "usable"/"production-ready" claims and the PRD's UJ-1/UJ-2 resolution step), or they'd need a stub button that violates AR30. **Must be resolved before Epic 1/3 story drafting**, per the Epic Quality Review recommendation above (pull a minimal FR-11 redirect forward into Epic 1, or explicitly document rows as display-only pre-Epic-4 and update the affected ACs accordingly).

### Recommended Next Steps

1. **Resolve the outbound-sequencing contradiction** in `epics.md` — pick one of the two remediation paths above, then update Epic 1/2/3 descriptions and Story 1.4/3.3 acceptance criteria to explicitly state the chosen behavior (functional minimal outbound now, vs. display-only pending Epic 4).
2. **Add a UX-DR/AR/NFR-to-story coverage map** alongside the existing FR Coverage Map in `epics.md`, so all four requirement families are auditable in one table rather than only via Story 4.4's promised end-of-project traceability generation (Minor Concern #1).
3. **Name the `Ver preços` (detail) CTA explicitly** in the relevant UX-DR entry and in Story 1.4/3.2/3.3 ACs, distinguishing it from `Ver na loja` (outbound), so the two-CTA row pattern from `EXPERIENCE.md` isn't left to implicit interpretation (Minor Concern #2).
4. Once (1) is resolved, this project can proceed to Phase 4 implementation — no other structural blockers were found across PRD completeness, FR→Epic traceability, or UX/Architecture alignment.

### Final Note

This assessment identified **1 Critical issue**, **0 Major issues**, and **2 Minor concerns** across Document Discovery, PRD Analysis, Epic Coverage Validation, UX Alignment, and Epic Quality Review. The single critical issue is narrow and actionable — it does not require re-planning the PRD, Architecture, or UX, only a targeted fix to epic/story sequencing and a handful of acceptance criteria. Address it before proceeding to implementation; the rest of the artifact set is in strong shape.

---

**Assessment completed by:** bmad-check-implementation-readiness (PM role)
**Date:** 2026-08-08

## Corrections Applied (2026-08-08)

All three findings above were addressed directly in `epics.md`, per user request and the user's choice of remediation path for the critical item ("document as intentional" over "pull outbound forward into Epic 1"):

1. **Critical — outbound sequencing contradiction:** Epic 1, 2, and 3 descriptions (both the Epic List overview and each epic's full section header) now explicitly state that result/detail rows are informational-only until `Ver preços` (Epic 3) and `Ver na loja` (FR-11, Epic 4) exist, and that neither control is ever rendered as a disabled/placeholder stub — they are simply absent until the epic that implements them, preserving AR30. Story 1.4's AC gained an explicit line ruling out any detail/outbound control. Story 3.3's AC replaced the vague "permitted actions" with an explicit statement that this story delivers `Ver preços` but not `Ver na loja`. Story 4.1's AC gained a line clarifying it is where `Ver na loja` first appears across all Epic 1-3 surfaces (added, not unlocked from a disabled state).
2. **Minor #1 — no UX-DR/AR/NFR coverage map:** Added an `NFR Coverage Map`, `AR Coverage Map`, and `UX-DR Coverage Map` to `epics.md` immediately after the existing `FR Coverage Map`, giving all four requirement families a reviewable story-level traceability table instead of relying solely on Story 4.4's end-of-project generation.
3. **Minor #2 — `Ver preços` never named:** UX-DR10 now explicitly names both `Ver preços` (internal detail navigation, Epic 3) and `Ver na loja` (merchant outbound, Epic 4) as the row's two distinct actions, each appearing only once its owning epic ships it.

**Updated readiness status: READY.** No outstanding Critical or Major issues remain from this assessment; the two Minor concerns are resolved. Re-run this workflow if `epics.md`, the PRD, Architecture, or UX documents change materially before implementation begins.
