---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
status: final
overallReadiness: NOT_READY
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

**Date:** 2026-08-07
**Project:** filatracker

## Document Inventory

### PRD Files

**Whole documents:**
- `prds/prd-filatracker-2026-08-07/prd.md` (24,407 bytes; modified 2026-08-07 04:48:56 -0300)
- `prds/prd-filatracker-2026-08-07/addendum.md` (3,217 bytes; modified 2026-08-07 04:48:32 -0300)

**Sharded documents:** None.

### Architecture Files

**Whole documents:**
- `architecture/architecture-filatracker-2026-08-07/ARCHITECTURE-SPINE.md` (34,539 bytes; modified 2026-08-07 05:59:10 -0300)

**Sharded documents:** None.

### Epics and Stories Files

**Whole documents:**
- `epics.md` (24,450 bytes; modified 2026-08-07 23:45:56 -0300)

**Sharded documents:** None.

### UX Design Files

**Whole documents:**
- `ux-designs/ux-filatracker-2026-08-07/EXPERIENCE.md` (8,227 bytes; modified 2026-08-07 05:13:20 -0300)
- `ux-designs/ux-filatracker-2026-08-07/DESIGN.md` (7,295 bytes; modified 2026-08-07 05:13:05 -0300)

**Sharded documents:** None.

The nested Stitch-generated `DESIGN.md` was excluded as an intermediate artifact. No whole-versus-sharded duplicate formats were found.

## PRD Analysis

### Functional Requirements

**FR-1: Search Offers by free text.** An anonymous user can submit a search query and receive Offer-centric results from active Homologated Stores. Results include multiple Stores when matches exist; an empty query or no matches produces an explicit empty state rather than an error page.

**FR-2: Material Family rollup search.** An anonymous user can search or browse by Material Family and see Offers for all child Specific Types, with the Specific Type labeled and filterable. A PETG-family query includes PETG HF and Rapid PETG when present, and the user can narrow to one Specific Type.

**FR-3: Browse by brand and Material Family.** Anonymous users can reach public brand and Material Family browse entry points without logging in.

**FR-4: Filters and sort.** Anonymous users can filter and sort by at least brand, Specific Type or Material Family, weight, Listing Price, and availability. Color is a visible label and optional filter when known, but never a Merge key. Sorting supports Listing Price and R$/kg. Ascending Listing Price prefers in-stock over OOS; ties resolve by Listing Price then freshness. The default diameter view includes 1.75 mm and unknown diameters, excludes known non-1.75 mm Offers, and lets users change or clear that filter. Diameter never drives Merge. Color-based Merge, frete-inclusive sort, and live scrape on search are excluded.

**FR-5: Multi-Offer comparison on a result.** Anonymous users can view multiple Offers in a Merged group, or a single unmatched Offer, with Listing Price, R$/kg, Store name, availability, last-checked time, and known color and diameter. Search and comparison render no product images; Store identity is text only. Known color and diameter remain visible within Merged groups.

**FR-6: Listing-Price ranking with frete disclaimer.** Ranking and comparison use Listing Price only. A frete and conditions disclaimer appears wherever ranking or “cheapest” language appears. MVP has no frete estimate or CEP field and makes no checkout-total or price-guarantee claim.

**FR-7: R$/kg display.** The system displays R$/kg only when Offer weight is known and parseable; unknown weight is omitted or marked unavailable and is never fabricated.

**FR-8: Availability and freshness signaling.** Anonymous users can see whether an Offer is in stock or OOS and when it was last checked. Stale or deactivated Offers are not shown as current in-stock without qualification. An Offer not refreshed successfully within 48 hours is labeled stale but remains visible with qualification. pt-BR copy communicates “last verified” or “last found price,” never a guaranteed checkout price.

**FR-9: Safe Merge.** The system merges Offers only when normalized brand, Specific Type, and weight match under deterministic rules. PETG and PETG HF cannot Merge merely because both belong to PETG; Offers differing only by color may Merge; diameter differences neither create nor block a Merge.

**FR-10: Unmatched preferred over unsafe Merge.** MVP uses exact deterministic matching only on normalized brand, Specific Type, and weight, with no confidence score, ML/LLM, or partial Merge. Missing or ambiguous key fields leave an Offer unmatched. Unmatched Offers remain searchable and outbound-capable. Ambiguous kits or bundles cannot be treated as a single spool for R$/kg or default cheapest ranking until unit weight is known confidently.

**FR-11: Ver na loja Outbound Click.** Anonymous users can leave FilaTracker for the Store listing URL from an Offer. Every click must pass through a measurable internal outbound redirect or endpoint, not a raw Store link alone. Resolution must allow affiliate parameters later without changing the CTA.

**FR-12: Affiliate disclosure readiness.** When affiliate monetization is enabled, the system can show the required disclosure. Until then, it remains clear that merchants are the sellers; no “FilaTracker price” or seller claim is fabricated.

**FR-13: Price history chart.** Anonymous users can open a price-history chart per Offer URL on the detail surface when history exists. The chart uses stored Listing Price points when at least one prior point exists; otherwise it shows an empty or insufficient-history state. Per-Merge aggregated charts, alerts, email capture, and notification preferences are excluded from MVP.

**FR-14: Active Homologated Store set.** The system exposes Offers only from Homologated Stores in the active set. The MVP targets Closin, Voolt3D, 3D Colors, Filamentos 3D Brasil, and Topink3D. Mercado Livre is excluded, and failed or policy-breaking Stores are not represented as active coverage.

**FR-15: Unsupported Store handling.** When a Store becomes Unsupported, its Offers are not presented as live coverage until remediation through a fixed and re-homologated map or an official feed, API, or affiliate channel. Anti-bot bypass cannot be used to keep it active.

**FR-16: Outbound Click analytics.** The system records Outbound Clicks as the primary success event and makes them countable over time. Search and product-view events may be logged only as secondary diagnostics.

**FR-17: Store-provided promo display.** A discount or strikethrough may appear only when the Store listing supplies an original price greater than the current Listing Price. Price history cannot be presented as a Store promotion percentage, and a missing original price cannot produce a fabricated promo badge.

**Total FRs: 17**

### Non-Functional Requirements

**NFR-1: Performance.** Search and detail must feel interactive on typical Brazilian mobile connections. Soft targets are search API p95 below 500 ms and detail LCP below 2.5 seconds unless architecture revises them.

**NFR-2: Reliability.** Scrape failures must not take down public browse or search. Parser failure must fail closed and must not mass-mark Offers OOS.

**NFR-3: Trust and safety.** The system must not bypass anti-bot controls or fabricate prices, weights, or discounts. False Merge is considered worse than duplication, and frete disclaimers are mandatory with ranked “cheap” claims.

**NFR-4: Accessibility.** Search and outbound controls must be keyboard-usable, dense tables must have suitable text contrast, and core flows target WCAG 2.1 AA.

**NFR-5: Privacy.** The product has no accounts, minimizes PII, and limits analytics to product events such as clicks and optional searches.

**NFR-6: Observability.** Operators must be able to observe scrape health and each Store's Homologated or Unsupported state.

**Total NFRs: 6**

### Additional Requirements

- The product is a responsive, anonymous pt-BR web experience using BRL; native applications and authentication are excluded.
- The five named specialty Stores are the launch target. Multi-category merchants require filament-only ingest filtering.
- Ingestion uses a deterministic engine and versioned per-Store maps or playbooks committed to the repository. AI may assist map generation offline only; no LLM runs in scrape jobs or Offer matching.
- Every Store must pass fixture-based homologation before activation. Broken maps require Unsupported status and re-homologation after repair.
- Public pages, feeds, APIs, and affiliate channels are preferred. CAPTCHA bypass, credentialed scraping, residential-proxy fleets, and ignoring robots.txt are prohibited.
- Price comparison excludes frete, taxes, checkout, payments, guarantees, and landed-cost claims.
- The UI is information-dense and search-first. Product images, Store logos, marketplace-style grids, deal rails, and showcase or “vitrine” behavior are prohibited.
- The mature canonical Product catalog is not a launch gate. Offer-first discovery and conservative deterministic Merge are required.
- No accounts, alerts, wishlists, reviews, seller portals, inventory management, printer integrations, display ads, public mutation API, or non-filament catalog are included in MVP.
- Price history is per Offer URL; aggregate per-Merge history is excluded.
- If fewer than five useful Stores remain active, UI and marketing must stop claiming full five-Store coverage. The interim response is to seek a replacement within 14 days or pause “5 lojas” claims.
- Scrape frequency and browser fallback must be cost-constrained so ingestion cannot impair public UX.
- Outbound Click count is the sole launch-success metric identity; its numeric target is deferred until a traffic baseline exists. Store uptime and search-to-outbound conversion are diagnostics, not launch gates.
- Open product decisions remain for the post-baseline click target, affiliate activation timing and disclosure copy, and the depth of SEO pages beyond search and detail.

### PRD Completeness Assessment

The PRD is substantially complete and unusually explicit about trust boundaries, exclusions, deterministic Merge behavior, stale data, outbound measurement, and Store operations. All 17 FRs have testable consequences, and the addendum separates implementation mechanism from product requirements.

Readiness risks remain where requirements are explicitly soft or deferred: performance and accessibility targets are assumptions subject to architecture; no numeric launch threshold exists for the primary metric; SEO scope is open; and the exact per-Store map contract is delegated to architecture. These do not prevent traceability analysis, but downstream artifacts must resolve the implementation-owned contracts and must not silently loosen the locked product guardrails.

## Epic Coverage Validation

### Coverage Matrix

- **FR-1 — Search Offers by free text:** Epic 1, “Search and Browse Real Filament Offers.” **Covered.**
- **FR-2 — Material Family rollup search:** Epic 1. **Covered.**
- **FR-3 — Browse by brand and Material Family:** Epic 1. **Covered.**
- **FR-4 — Filters and sort:** Epic 3, “Compare Offers with Price and Taxonomy Confidence.” **Covered.**
- **FR-5 — Multi-Offer comparison:** Epic 3. **Covered.**
- **FR-6 — Listing-Price ranking and frete disclaimer:** Epic 3. **Covered.**
- **FR-7 — R$/kg display:** Epic 3. **Covered.**
- **FR-8 — Availability and freshness:** Epic 3. **Covered.**
- **FR-9 — Safe deterministic Merge:** Epic 3. **Covered.**
- **FR-10 — Unmatched preferred over unsafe Merge:** Epic 3. **Covered.**
- **FR-11 — Ver na loja Outbound Click:** Epic 4, “Continue to the Merchant with Measurable Trust.” **Covered.**
- **FR-12 — Affiliate disclosure readiness:** Epic 4. **Covered.**
- **FR-13 — Per-Offer price history:** Epic 3. **Covered.**
- **FR-14 — Active Homologated Store set:** Epic 2, “Trustworthy Five-Store Coverage.” **Covered.**
- **FR-15 — Unsupported Store handling:** Epic 2. **Covered.**
- **FR-16 — Outbound Click analytics:** Epic 4. **Covered.**
- **FR-17 — Store-provided promo display:** Epic 3. **Covered.**

### Epic FR Coverage Extracted

- Epic 1 claims FR-1, FR-2, and FR-3.
- Epic 2 claims FR-14 and FR-15.
- Epic 3 claims FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-13, and FR-17.
- Epic 4 claims FR-11, FR-12, and FR-16.
- No epic-only FR identifiers absent from the PRD were found.

### Missing Requirements

No PRD Functional Requirement is absent from the epic-level coverage map.

This result establishes claimed epic coverage only. The document contains epic definitions but no completed stories—the remaining section is an unfilled story template—so whether each claim has an implementable story and acceptance criteria is intentionally deferred to the later story-quality assessment.

### Coverage Statistics

- Total PRD FRs: 17
- FRs covered in epics: 17
- Missing FRs: 0
- Epic-level coverage: 100%

## UX Alignment Assessment

### UX Document Status

**Found and final.** The assessment used `EXPERIENCE.md` as the behavioral experience spine and `DESIGN.md` as the visual-system spine. Both identify the PRD as an authoritative source, and the architecture explicitly imports both documents and seeds a canonical `app/design-system/` from them.

### UX ↔ PRD Alignment

The primary journeys align: anonymous search, Material Family rollup, brand browse, filtering, exact-Merge comparison, stale/OOS handling, price history, and outbound navigation match UJ-1 and UJ-2. UX consistently preserves the PRD's defining constraints:

- pt-BR, BRL, responsive web, no authentication, and no native applications.
- Search-first information architecture with no deal rails, imagery, Store logos, or showcase behavior.
- Listing-Price-only ranking, adjacent frete disclaimer, and no CEP or checkout-total claim.
- Exact brand + Specific Type + weight Merge, with color and diameter excluded from the key.
- Default diameter of 1.75 mm plus unknown, with known non-1.75 mm excluded until changed.
- R$/kg only for valid weight; stale after 48 hours; honest no-result and history-empty states.
- Per-Offer history, safe `Ver na loja`, Store-provided promotion only, and truthful coverage and affiliate states.

No substantive UX requirement contradicts the PRD. The UX adds implementable visual constraints—tokens, typography, density, responsive layouts, focus treatment, and component behavior—without expanding product scope.

### UX ↔ Architecture Alignment

Architecture materially supports the UX through React Router SSR routes, typed page-aggregate RPC contracts, durable Offer and Merge identities, FTS-backed discovery, exact Merge projection, current-state and price-history reads, outbound destination policy, and a canonical shared design-system directory. It also carries the UX performance, privacy, responsive, and WCAG 2.1 AA obligations into CI and production verification.

The public route set aligns with UX: `/`, `/search`, Offer and Merge details, Material Family browse, Brand browse, and outbound; `/stores` is omitted in v1. Page-atomic snapshots and explicit degraded/error outcomes prevent backend failure from being rendered as a false empty-search state.

### Alignment Issues

1. **UX has no defined backend-failure state family.** Architecture requires distinct `degraded`, `invalid`, `notFound`, `gone`, `overloaded`, and `unavailable` outcomes, including non-cacheable 503 behavior. UX defines loading, empty, OOS, stale, missing history, unmatched, incomplete coverage, and affiliate states, but does not specify copy or interaction behavior for service degradation, unavailable pages, retained Offer/Merge routes, or retryable overload. This is a real handoff gap: implementation could conflate “no results” with system failure despite architecture explicitly prohibiting that.
2. **Some important controls remain spine-only.** `EXPERIENCE.md` states that Brand browse and diameter-default UI are not mocked. The behavioral contract is sufficient to implement them, but visual acceptance requires disciplined use of the canonical design system rather than relying on incomplete mock coverage.
3. **Result-row field lists are locally inconsistent.** The UX result-row pattern explicitly lists color but not diameter, while the PRD and UX-DR10 require known color and diameter to remain visible. The document states the diameter rule elsewhere, so this is an editorial ambiguity rather than a scope conflict; story acceptance criteria should name diameter display explicitly.

### Warnings

- Architecture defers exact query limits, Store budgets, font-loading details, and several operational values. These are compatible with UX but need measurable story-level acceptance criteria before production.
- WCAG and performance targets are present in all three artifacts, but they remain obligations until assigned to executable stories and release gates.
- The nested Stitch output must remain non-authoritative; both UX spines correctly state that they supersede conflicting mock or Stitch artifacts.

## Epic Quality Review

### Epic Structure

All four epic titles and goals are framed around user or operator outcomes rather than pure technical milestones:

- Epic 1 enables anonymous search and browse over real Offers.
- Epic 2 delivers trustworthy coverage of the five target Stores.
- Epic 3 enables trustworthy filtering, comparison, Merge behavior, and history.
- Epic 4 enables safe measurable continuation to the merchant.

At the epic level, the sequence has no explicit forward dependency: Epic 2 can build on Epic 1, Epic 3 can build on the earlier discovery and coverage substrate, and Epic 4 can build on prior Offer identity and detail behavior. However, independence cannot be verified below this high-level claim because no stories exist.

### 🔴 Critical Violations

1. **The epics artifact contains zero completed stories.** Lines after the epic list are an untouched `Epic {{N}}` / `Story {{N}}.{{M}}` template. There are no user-story statements, acceptance criteria, error cases, estimates or sizing boundaries, implementation units, or story-level requirement references. Phase 4 has nothing executable to consume.
   - **Impact:** No story can be assigned, implemented, tested, accepted, or sequenced. The 100% FR result is only epic-level bookkeeping, not implementation coverage.
   - **Remediation:** Run the epic-and-story creation workflow to decompose every epic into independently completable stories with explicit FR/NFR/AR/UX-DR traceability and Given/When/Then acceptance criteria.

2. **The required starter story is absent.** Architecture AD-3 and Additional Requirement AR1 require Epic 1 Story 1 to bootstrap from the official Cloudflare React Router v8 SSR starter, preserving `workers/app.ts`, dependency ranges, and lockfile authority. No Story 1.1 exists.
   - **Impact:** The mandated greenfield starting point, environment baseline, and initial reproducibility contract are not implementable or testable.
   - **Remediation:** Make Story 1.1 the starter/bootstrap vertical foundation, with exact acceptance criteria for the official starter, Node/pnpm baseline, local isolation, Worker entry preservation, lockfile, test harness, and first deployable shell.

3. **Fifty-four non-FR obligations have no story ownership.** The inventory contains 6 NFRs, 27 architecture requirements, and 21 UX design requirements. The production standard says each must be assigned to at least one story, but none is assigned because stories are absent.
   - **Impact:** Security, privacy, recovery, data integrity, accessibility, performance, deployment compatibility, Store policy, and UX constraints can silently fall through despite complete FR labels.
   - **Remediation:** Add a story-level traceability map and require every NFR, AR, and UX-DR to have an implementing story and a verifying story or acceptance criterion where appropriate.

### 🟠 Major Issues

1. **Epic 1 is too broad to execute without disciplined decomposition.** Its goal includes starter setup, architecture boundaries, contracts, persistence, ingestion, RPC, SSR, design system, migrations, deployment, first Store integration, and three user-facing FRs.
   - **Risk:** Stories may become technical layers or epic-sized setup work that produce no usable vertical slice.
   - **Recommendation:** Slice in dependency order around demonstrable outcomes: starter and production-safe shell; bounded contracts and minimal schema when first needed; one fixture-backed Store ingestion; published Offer query; search UI; Material and Brand browse. Each story should leave production code integrated and testable.

2. **Story independence and forward dependencies are unverifiable.** There is no story order or dependency map within any epic.
   - **Recommendation:** Ensure Story N.M depends only on completed earlier stories, state prerequisite artifacts explicitly, and reject references to future stories.

3. **Database creation timing is unverifiable.** Architecture specifies extensive D1 invariants and projections, but the plan does not state which story introduces each table or migration.
   - **Recommendation:** Create schema and migrations only when the first vertical story needs them; do not create the entire target schema in the bootstrap story.

4. **Acceptance criteria are entirely absent.** The document contains only generic Given/When/Then placeholders.
   - **Recommendation:** Add independently testable happy-path, boundary, failure, security, accessibility, and operational criteria. Include explicit outcomes for typed RPC failures, failed Store runs, stale and unknown data, unsafe outbound destinations, replay, and unsupported Stores.

5. **Epic 4 risks becoming a catch-all hardening phase.** It bundles outbound value with analytics retention/purge, abuse controls, telemetry, recovery verification, release gates, and “final end-to-end production readiness.”
   - **Risk:** Quality and production obligations needed by Epics 1–3 could be deferred until the end, violating each epic's stated deployable completion standard.
   - **Recommendation:** Keep Epic 4's stories focused on outbound and measurement. Assign security, privacy, observability, recovery, accessibility, and release criteria to the earliest story and epic that introduces the relevant capability; use Epic 4 only to close true cross-product verification.

### 🟡 Minor Concerns

- The leftover generator comments and placeholders make the artifact appear unfinished and should be removed once stories are generated.
- FR identifiers are written as `FR1` in `epics.md` while the PRD uses `FR-1`. The mapping is understandable but should be normalized to avoid tooling and traceability mismatches.
- The Production Completion Standard is strong but not enforceable until its clauses are translated into story acceptance criteria and CI/release checks.

### Best-Practices Compliance

- Epic user value: **Pass**
- High-level epic ordering without forward references: **Pass, but unproven at story level**
- Stories appropriately sized: **Fail — no stories**
- No forward story dependencies: **Not assessable — no stories**
- Database objects introduced when first needed: **Not assessable — no stories**
- Clear testable acceptance criteria: **Fail — placeholders only**
- FR traceability: **Pass at epic level; fail at story level**
- NFR/architecture/UX traceability: **Fail at story level**

## Summary and Recommendations

### Overall Readiness Status

**NOT READY**

The planning foundation is strong: the PRD defines 17 testable FRs and 6 cross-cutting NFRs; all FRs are assigned to user-value epics; UX and architecture are substantially aligned; and the architecture preserves the product's trust, safety, privacy, data-integrity, and operational constraints.

That foundation has not yet been converted into an implementation plan. `epics.md` contains four epic summaries followed by an untouched story template and no actual stories. Therefore the project has no independently executable units, no story-level sequencing, no Given/When/Then acceptance criteria, and no ownership for 54 non-FR obligations.

### Critical Issues Requiring Immediate Action

1. Create actual stories for all four epics before Phase 4 begins.
2. Add the architecture-mandated Epic 1 Story 1 bootstrap from the official Cloudflare React Router v8 SSR starter.
3. Assign every FR, NFR, AR, and UX-DR to implementing and verifying stories; epic-level FR labels are insufficient.
4. Add specific, testable acceptance criteria covering normal, boundary, failure, security, privacy, accessibility, performance, recovery, and operational behavior.

### Recommended Next Steps

1. Run the epic-and-story creation workflow against the confirmed PRD, architecture, and UX inputs.
2. Decompose Epic 1 into small vertical slices beginning with the official starter and deployable shell, then one real fixture-backed Store path through ingestion, publication, query, and SSR before expanding browse capabilities.
3. Introduce D1 tables and migrations only in the first story that needs each structure; do not build the full target schema in setup.
4. Keep each story dependent only on earlier work and add an explicit story-level dependency and traceability map.
5. Resolve the UX handoff gaps for typed backend failure states, retained/gone routes, overload/retry behavior, and explicit diameter display.
6. Distribute security, privacy, observability, recovery, accessibility, performance, and release obligations into the earliest relevant stories rather than deferring them to Epic 4.
7. Normalize requirement IDs to the PRD's `FR-#` convention and remove all generator placeholders.
8. Re-run Implementation Readiness after the complete story set is generated.

### Final Note

This assessment identified **11 actionable issues across three categories**: 3 critical implementation-planning violations, 5 major epic/story-quality issues, and 3 UX handoff gaps. Additional warnings and minor consistency concerns are documented above.

Do not proceed to implementation as-is. The missing story layer is a hard planning blocker, not a documentation nicety. Once stories and acceptance criteria exist, the underlying PRD, UX, and architecture provide a strong basis for implementation.

**Assessment finalized:** 2026-08-08  
**Assessor:** GPT-5.6 Sol
