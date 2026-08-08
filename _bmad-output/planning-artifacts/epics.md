---
stepsCompleted:
  - 1
  - 2
  - 3
  - 4
inputDocuments:
  - "_bmad-output/planning-artifacts/prds/prd-filatracker-2026-08-07/prd.md"
  - "_bmad-output/planning-artifacts/architecture/architecture-filatracker-2026-08-07/ARCHITECTURE-SPINE.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-filatracker-2026-08-07/DESIGN.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-filatracker-2026-08-07/EXPERIENCE.md"
---

# filatracker - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for filatracker, decomposing the requirements from the PRD, UX Design, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Anonymous users can submit a free-text search and receive Offer-centric results from active Homologated Stores; empty queries and no-match queries produce an explicit empty state rather than an error.

FR2: Anonymous users can search or browse a Material Family and receive Offers for every child Specific Type while retaining visible and filterable Specific Type distinctions.

FR3: Anonymous users can browse public entry points for brands and Material Families without authentication.

FR4: Anonymous users can filter results by brand, Specific Type or Material Family, weight, Listing Price, availability, optional known color, and diameter, and sort by Listing Price or R$/kg; the default diameter view includes 1.75 mm and unknown values while excluding known non-1.75 mm values until changed or cleared; in-stock precedes OOS and ties resolve by Listing Price then freshness.

FR5: Anonymous users can compare multiple Offers belonging to a safely Merged result, or inspect one unmatched Offer, with Listing Price, R$/kg when valid, Store text name, availability, last-checked time, and known color and diameter; no product images or Store logos are rendered.

FR6: The system ranks and compares with Listing Price only and displays an adjacent frete and conditions disclaimer wherever ranking, “cheapest,” or “menor preço” language appears; it never claims final checkout total, guaranteed price, or provides a CEP/frete estimator.

FR7: The system displays R$/kg only when a positive, parseable net weight exists and otherwise omits or explicitly marks the value unavailable without inventing weight.

FR8: Anonymous users can see Offer availability and last-checked freshness; Offers not successfully refreshed within 48 hours are visibly stale and never represented as unqualified current in-stock prices.

FR9: The system creates a Merge only through deterministic exact equality of normalized brand, Specific Type, and weight; color and diameter neither create nor block a Merge, and related Material Family membership alone cannot merge distinct Specific Types.

FR10: The system leaves incomplete or ambiguous canonical-key Offers unmatched and searchable rather than applying probabilistic, partial, ML, or LLM matching; ambiguous kits and bundles cannot be treated as single-spool weight for R$/kg or default cheapest ranking.

FR11: Anonymous users can leave through a mandatory internal `/out/:offerId` resolution path that measures the Outbound Click and resolves the current Store listing URL while remaining ready for future affiliate parameters.

FR12: The system can display legally required affiliate disclosure when affiliate monetization is enabled and, before activation, accurately represents the merchant as seller without inventing a “FilaTracker price.”

FR13: Anonymous users can view stored historical Listing Price points per Offer URL on detail surfaces; where no prior point exists, the system renders an honest insufficient-history state, with no Merge-level primary aggregate, account, alert, or notification UI.

FR14: The system publishes Offers only from active Homologated Stores, targets the five named MVP specialty Stores, excludes Mercado Livre, and never presents failed homologation or policy-broken Stores as active coverage.

FR15: When a Store becomes Unsupported, the system removes its Offers from live search, coverage, and outbound until a compliant map fix, official feed/API/affiliate channel, safe probe, and operator activation restore it; no anti-bot bypass is used.

FR16: The system records idempotent Outbound Click events as the primary launch-success event, countable over time, while optional search and product-view diagnostics remain secondary and privacy-bounded.

FR17: The system displays a Store-provided original-price promotion only when the listing supplies a valid original price above the current Listing Price; it never fabricates a discount or percentage from price history.

### NonFunctional Requirements

NFR1: Public search API latency has a provisional production target of p95 below 500 ms, and detail pages have a provisional LCP target below 2.5 seconds on typical Brazilian mobile connections; targets must be measured and approved before launch.

NFR2: Scrape invocation or Store-specific failures must not take down public browse/search or be converted into false empty results; typed overload/unavailability states return non-cacheable 503 responses with `Retry-After`.

NFR3: Core Home → Results → Detail → outbound flows must conform to WCAG 2.1 AA, including keyboard reachability, visible focus, textual non-color-only status, readable dense tables, responsive semantics, and an announced external transition.

NFR4: The product is fully anonymous, has no account/profile surface, minimizes PII, and limits analytics and telemetry to allowlisted product/operational events with bounded retention and verified purge.

NFR5: The system must never bypass CAPTCHA, robots policy, authentication, or anti-bot controls and must prefer public pages, official feeds, APIs, or affiliate channels.

NFR6: Merchant content is untrusted bounded plain data; the system must prevent executable HTML injection, SSRF, open redirects, unsafe URL traversal, decompression/parse exhaustion, and unbounded fields, observations, responses, or logs.

NFR7: Prices, weights, promotions, availability, freshness, and Merge membership must never be fabricated; parser failures fail closed and cannot mass-mark Offers OOS.

NFR8: Production operations must expose Store scrape health, run outcome, Homologated/degraded/Unsupported/deactivated status, alertable evidence, and audited lifecycle transitions.

NFR9: Public web is responsive, mobile-strong, pt-BR-only and BRL-only for v1, with no native application dependency.

NFR10: Dynamic search, detail, browse, and outbound behavior must remain correct across mixed N/N-1 deployments, queue retries, rollback, migration, restore, and projection rebuild.

NFR11: Local and CI environments must use isolated emulated resources and identities that cannot bind production D1, queues, Store secrets, schedules, migrations, or deploy authority.

NFR12: Production launch requires measured capacity budgets and bounded limits for D1 transactions, Store fetches, queues, RPC methods, SSR, history points, pagination, CPU, duration, bytes, concurrency, retries, DLQ, and retained recovery artifacts.

NFR13: The system must preserve durable identity, audit lineage, append-only corrected history, idempotency, and database-enforced referential/check/uniqueness invariants under concurrency and replay.

NFR14: Recovery must have approved and tested RPO/RTO, Time Travel tier, export requirements, an external non-regressing recovery epoch, invariant validation, and deterministic Merge/FTS rebuild before production.

NFR15: Production claims about Store coverage must reflect current active coverage; if fewer than five target Stores are active, the product must pause “5 lojas” claims while replacement is attempted within the confirmed 14-day interim.

NFR16: The MVP must ship without product imagery, Store logos, deal rails, advertising, marketplace/cart/checkout/payment behavior, frete calculation, accounts, alerts, wishlists, reviews, seller portals, inventory management, public write/admin APIs, or non-filament catalog items.

### Additional Requirements

- AR1 — Bootstrap Epic 1 Story 1 from the official `create-cloudflare` React Router v8 SSR starter, preserving `workers/app.ts`, declared semver ranges, and lockfile authority.
- AR2 — Implement a hexagonal modular monolith with runtime-neutral domain/application policy and one deterministic shared pipes-and-filters ingestion pipeline.
- AR3 — Deploy exactly two Workers: public `web` owns SSR and a typed Service Binding only; non-public `ingest` alone owns D1, queue, schedules, Store access, persistence, and typed RPC.
- AR4 — Keep D1 as the sole transactional authority; bounded observations, FTS, and membership views are rebuildable projections, while source identity, registry, published facts, run state, and audit lineage are durable.
- AR5 — Implement versioned `MergeResult | OfferResult`: promote at two eligible exact-key Offers, never collapse at one, hide at zero while retaining route/lineage, and canonically link grouped Offer routes.
- AR6 — Persist stable opaque Merge IDs, unique versioned key fingerprints, tombstones, reviewed rename/split lineage, shadow projection validation, and atomic projection-epoch CAS cutover.
- AR7 — Implement schema-validated versioned declarative Store maps plus typed hooks that emit bounded `RawOfferObservation`; shared stages own all cross-Store policy.
- AR8 — Check robots policy at homologation and every run; disallow, ambiguity, fetch failure, block, or policy conflict fails closed with no bypass.
- AR9 — Publish each Store generation in one bounded set-based D1 transaction fenced by Store generation, support generation, projection epoch, and recovery epoch; only authoritative-complete may infer absence, positive-only publishes positives, and other outcomes publish nothing.
- AR10 — Make the publication coordinator the sole FTS5 writer, one document per visible result unit, with validated shadow rebuild/CAS cutover and identity-equivalent fallback or explicit degradation.
- AR11 — Keep Drizzle behind persistence ports, use versioned Wrangler SQL migrations and reviewed explicit FTS/publication SQL, and release by expand → migrate → additive N/N-1 consumers → verify → producers/web N → contract.
- AR12 — Support only isolated local and production environments; local/CI identities cannot bind production resources or authority.
- AR13 — Implement canonical routes `/`, `/search`, `/offers/:offerId`, `/merges/:mergeId`, `/materials/:familySlug`, `/brands/:brandSlug`, and `/out/:offerId`; omit `/stores` in v1.
- AR14 — Retain durable brand/material slug aliases, reviewed one-survivor Merge redirects, gone semantics for ambiguous splits, and no cross-request cache for dynamic MVP responses.
- AR15 — Treat merchant content as bounded untrusted plain data; never execute/render merchant HTML and enforce fetch, redirect, decompression, parse, field, observation, concurrency, duration, byte, log, FTS, and SSR budgets.
- AR16 — Gate production with the complete architecture invariant suite: contracts, snapshots, typed failures/limits, identity/lineage, normalization cutover, Store completeness/transitions/capacity, robots/extraction, destination safety, replay/DLQ, fencing, database/FTS, authority denial, telemetry purge, corrected history, recovery, performance, and accessibility.
- AR17 — Centralize versioned Zod contracts in `src/contracts/` and source identity in `src/domain/identity/`; use explicit nulls, positive integer BRL centavos/grams, UTC instants, closed enums, random request correlation IDs, and complete provenance.
- AR18 — Implement immutable Offer identity from reviewed PDP URL plus merchant variant, continuity fingerprints, durable aliases/tombstones, quarantined incompatible tuple reuse, and reviewed lineage; never auto-merge histories.
- AR19 — Use one ingestion coordinator as sole run/Store/publication/projection writer, immutable terminal states, authoritative-complete/positive-only manifests, digest-verified retained payloads, durable inbox idempotency, audited replay, DLQ, and quarantine.
- AR20 — Implement Store states `active | degraded | unsupported | deactivated`, availability `available | unavailable | unknown`, monotonic 48-hour stale derivation, evidence-based audited transitions, generation-fenced visibility, and retained hidden detail/history.
- AR21 — Append at most one changed PricePoint per Offer/run; corrections append acyclic lineage and effective reads fold it deterministically without rewriting facts.
- AR22 — Enforce one HTTPS destination policy for ingestion/outbound with exact reviewed hosts/ports, no credentials/fragments, public DNS, Store-scoped path/query, every-hop validation, server-side resolution by `offerId`, and idempotent non-blocking event recording.
- AR23 — Expose only bounded versioned page-query and fail-open event/outbound RPC to web; expose no public administration, transitions, projection, migration, queue, generic execution, arbitrary SQL, or persistence escape hatch.
- AR24 — Enforce D1 foreign keys, checks, generation CAS, and uniqueness for source identity, Merge fingerprint, current membership, PricePoint replay, and inbox idempotency.
- AR25 — Separate web, ingest, migration/deploy, CI, and local identities; encrypt/redact secrets and audit bindings so web never binds D1 and only production web calls non-public RPC.
- AR26 — Implement audited health/recovery using an external non-regressing recovery epoch, paused work, epoch advance, restore, invariant validation, fenced membership/FTS rebuild, old-delivery rejection, and approved/tested RPO, RTO, Time Travel, and export policy.
- AR27 — Serve each dynamic page from one bounded aggregate RPC snapshot with version, projection/support epochs, random correlation ID, and exactly one outcome `ok | degraded | invalid | notFound | gone | overloaded | unavailable`; permit one in-budget idempotent-query retry and no implicit command retry.
- AR28 — Resolve and verify every implementation-owned deferred architecture choice before production: normalization fixtures/dictionaries, Store schemas/hooks, scrape cadence, queue topology, batch/retry/DLQ limits, extraction strategy, robots evidence, relational/FTS design, retention, and recovery targets.
- AR29 — Homologate all five named MVP Stores based on utility, enforce filament-only ingestion, and replace a lost Store within 14 days or pause five-Store claims.
- AR30 — Every story must end in integrated, tested, deployable production behavior. Runtime stubs, mocks, fake Store/data paths, placeholders, TODO-only paths, and “wire later” work do not satisfy completion; test doubles are allowed only in automated tests.

### UX Design Requirements

UX-DR1: Implement one canonical `app/design-system/` from `DESIGN.md`, including the complete semantic color palette, spacing/radius scales, container/mobile geometry, dense-row target, status styles, and focus token; routes cannot fork local constants.

UX-DR2: Apply Hanken Grotesk to UI/prose and JetBrains Mono to prices, R$/kg, weights, diameters, freshness, and table labels; BRL prices are right-aligned and large headlines are reserved for page titles.

UX-DR3: Build a public shell with wordmark, global search, Materiais, and Marcas, with no authentication/avatar, native chrome, Store index, ticker, or marketplace decoration.

UX-DR4: Make Home search-first with optional Material Family chips and no product imagery, deal rail, recently-reduced rail, Store-count ticker, oversized hero, carousel, glass effect, or merchandising grid.

UX-DR5: Implement global search submission and removable filter chips; empty input produces the honest empty-state pattern, not an error.

UX-DR6: Implement public Material Family and Brand browse as Offer-centric entry points that preserve Specific Type distinctions without becoming catalog-showcase pages.

UX-DR7: Implement desktop sidebar plus dense table, tablet filter bar/drawer, and mobile single-column filter sheet with compact rows or semantic horizontal table scroll; tables never become image cards.

UX-DR8: Implement Brand, Specific Type, Material Family, weight, Listing Price, availability, optional known color, and diameter filters, including the default 1.75 mm plus unknown behavior and keyboard-operable change/clear actions.

UX-DR9: Implement ascending Listing Price ordering with available above unavailable and ties by price then freshness, plus R$/kg sort only for valid weights and never as frete-inclusive ranking.

UX-DR10: Render reusable rows with brand, Specific Type, known color/diameter, weight, Store text name, Listing Price, conditional R$/kg, availability, freshness, and two distinct row-level actions: `Ver preços` (internal navigation to the Offer/Merge detail page, Epic 3) and `Ver na loja` (direct merchant outbound, FR-11/Epic 4) — each renders only once its owning epic implements it; neither is a placeholder for the other.

UX-DR11: Render Offer/Merge detail as a dense comparison table with one row per Offer URL and Store, Listing Price, conditional R$/kg, availability, last checked, promo/stale status, and `Ver na loja`, with no images or logos.

UX-DR12: Implement textual `DISPONÍVEL`, `INDISPONÍVEL`, valid promo, and stale badges; status never relies on color alone and `POUCO ESTOQUE` is prohibited.

UX-DR13: Keep OOS and stale Offers visibly qualified and outbound-capable when destination policy permits; never disable outbound solely for OOS.

UX-DR14: Implement the compact exact-label `Ver na loja` Technical Blue control with external-link affordance, keyboard/focus behavior, and assistive announcement.

UX-DR15: Place approved frete/conditions copy adjacent to every ranking or `menor preço` claim and in the footer trust strip; prohibit `tempo real`, guarantee, checkout-total, and FilaTracker-as-seller language.

UX-DR16: Implement distinct Offer and Merge detail states while preserving exact grouping, canonical links, and unmatched honesty.

UX-DR17: Implement per-Offer price-history chart chrome using only stored facts and a clear insufficient-history state; no fabricated or primary Merge-aggregate chart.

UX-DR18: Implement dense loading skeleton rows without fake Offers.

UX-DR19: Implement exact no-match copy `Não encontramos esse filamento.` plus only real Material Family suggestions, never invented substitute rows.

UX-DR20: Handle unknown weight with omitted/unavailable R$/kg, unmatched Offers without false grouping, and incomplete coverage without inaccurate fixed-count claims.

UX-DR21: Use approved pt-BR trust terms including `Ver na loja`, `Último preço encontrado`, and `Atualizado há …`.

UX-DR22: Use tonal layers and 1 px outlines, sunken-fill hover, and a 2 px focus ring; prohibit shadows, glassmorphism, gradients, imagery, and logo chrome.

UX-DR23: Apply 4 px control radii, 2 px badge radii, and pill radius only to filter chips.

UX-DR24: Use the 1280 px desktop maximum with approximately 3/9 filter/results columns, collapsed tablet filters, and 12 px single-column mobile margins.

UX-DR25: Verify WCAG 2.1 AA contrast, keyboard operation, semantic tables, textual statuses, and visible focus across Home, search, browse, filters, Results, Detail, history, and outbound at every breakpoint.

UX-DR26: Treat `DESIGN.md` and `EXPERIENCE.md` as authoritative over mockup/Stitch conflicts, including avatars, marketplace sample rows, disabled OOS outbound, Merge-level primary history, and `tempo real` claims.

### FR Coverage Map

FR1: Epic 1 - Anonymous free-text search over real published Offers.
FR2: Epic 1 - Material Family discovery with visible and filterable Specific Types.
FR3: Epic 1 - Public Brand and Material Family browse entry points.
FR4: Epic 3 - Complete Offer filtering, diameter defaults, and price/R$/kg sorting.
FR5: Epic 3 - Dense comparison of Merged and unmatched Offers.
FR6: Epic 3 - Listing-Price-only ranking with mandatory frete disclosure.
FR7: Epic 3 - Valid R$/kg and honest unknown-weight treatment.
FR8: Epic 3 - Availability, last-checked, and 48-hour stale signaling.
FR9: Epic 3 - Exact deterministic Merge by brand, Specific Type, and weight.
FR10: Epic 3 - Safe unmatched and ambiguous Offer behavior.
FR11: Epic 4 - Safe measurable `Ver na loja` outbound navigation.
FR12: Epic 4 - Affiliate disclosure readiness and merchant-as-seller trust.
FR13: Epic 3 - Per-Offer price history and insufficient-history state.
FR14: Epic 2 - Active Homologated coverage for the five named MVP Stores.
FR15: Epic 2 - Unsupported Store removal and safe re-homologation.
FR16: Epic 4 - Idempotent Outbound Click analytics as the primary metric.
FR17: Epic 3 - Store-supplied promotion display without fabricated discounts.

### NFR Coverage Map

Primary owning story shown; NFRs that are enforced continuously are additionally re-verified at each epic's closing story (1.6, 2.4, 3.5, 4.4).

NFR1 (Performance p95/LCP): Story 1.4 (initial budgets) - Story 3.2, 3.5 (measured under filters/facets) - Story 4.4 (final evidence).
NFR2 (Scrape failure isolation, typed 503): Story 1.1 (RPC failure normalization) - Story 1.3 (ingestion failure isolation) - Story 2.4 (Store-level failure isolation).
NFR3 (WCAG 2.1 AA core flows): Story 1.1, 1.6, 3.2, 3.3, 4.1 (per-surface) - Story 3.5, 4.4 (full-journey verification).
NFR4 (Anonymous/no PII/telemetry allowlist): Story 4.2 (event privacy) - Story 2.4 (telemetry redaction) - Story 3.5, 4.4 (verification).
NFR5 (No anti-bot bypass, robots policy): Story 1.2, 1.5 (per-Store homologation) - Story 2.1, 2.2, 2.3 (per-Store homologation) - Story 2.4 (lifecycle enforcement).
NFR6 (Untrusted merchant content, injection/SSRF prevention): Story 1.2, 1.3 (extraction budgets) - Story 4.1 (destination policy/SSRF) - Story 3.5 (security verification).
NFR7 (No fabrication, fail-closed parser): Story 1.3 (parser fail-closed) - Story 3.1 (Merge honesty) - Story 3.4 (promo honesty).
NFR8 (Store health observability): Story 1.3 (per-Store health) - Story 2.4 (lifecycle/health dashboards).
NFR9 (Responsive/mobile/pt-BR/BRL/no native): Story 1.1 (design-system foundation) - Story 3.2, 3.3 (responsive application).
NFR10 (N/N-1 deployment compatibility): Story 1.3, 1.4 (coordinator/contract versions) - Story 2.4 (mixed deployments) - Story 4.3, 4.4 (release).
NFR11 (Isolated local/CI environments): Story 1.1 (bindings/identities) - Story 4.4 (launch verification).
NFR12 (Capacity budgets): Story 1.2, 1.3 (Closin capacity) - Story 2.1, 2.2, 2.3 (per-Store capacity) - Story 3.2 (facet/pagination budgets) - Story 4.1, 4.2 (outbound budgets).
NFR13 (Durable identity/audit/idempotency/DB invariants): Story 1.3 (D1 constraints) - Story 3.1 (Merge fingerprint uniqueness) - Story 3.4 (PricePoint replay) - Story 4.2 (event idempotency).
NFR14 (Recovery RPO/RTO): Story 2.4 (recovery exercise) - Story 4.4 (recovery runbook, final sign-off).
NFR15 (Coverage-claim accuracy, "5 lojas"): Story 2.3 (Topink3D claim) - Story 2.4 (pause-claims policy) - Story 4.4 (launch gate).
NFR16 (MVP exclusions - no images/accounts/etc.): Story 1.1 (design-system Do's/Don'ts) - Story 3.3 (detail no-image rule) - Story 4.4 (final gate).

### AR Coverage Map

AR1: Story 1.1. AR2: Story 1.1 (foundation), 1.2/1.3 (pipeline stages). AR3: Story 1.1. AR4: Story 1.1, 1.3, 3.1. AR5: Story 3.1. AR6: Story 3.1. AR7: Story 1.2 (pattern), reused 1.5, 2.1-2.3. AR8: Story 1.2, 1.5, 2.1-2.3. AR9: Story 1.3, reused 1.5, 2.1-2.3. AR10: Story 1.4, 1.6. AR11: Story 1.1 (initial), 1.3 (ingest persistence), 4.4 (release ordering). AR12: Story 1.1. AR13: Story 1.1 (base routes), 1.6 (materials/brands), 3.1/3.3 (offer/merge), 4.1 (out). AR14: Story 1.6 (aliases), 3.1 (Merge redirects), 1.1 (no cross-request cache). AR15: Story 1.2, 1.3, 2.1-2.3 (per-Store budgets). AR16: Story 4.4 (launch gate), reinforced by each epic's closing story (1.6, 2.4, 3.5). AR17: Story 1.1 (contracts baseline), applied throughout. AR18: Story 1.2, 1.3 (Closin identity), 3.1 (lineage). AR19: Story 1.3. AR20: Story 1.3 (initial states), 2.4 (full lifecycle). AR21: Story 1.3 (initial), 3.4 (correction lineage). AR22: Story 4.1. AR23: Story 1.1 (initial RPC surface), 4.1, 4.2 (outbound/event RPC). AR24: Story 1.3, 3.1, 3.4, 4.2. AR25: Story 1.1, 4.4. AR26: Story 2.4, 4.4. AR27: Story 1.1 (Search/Home), 1.6 (Browse), 3.3 (Offer/Merge detail). AR28: Story 4.4. AR29: Story 2.1-2.3 (homologation), 2.4 (replace policy). AR30: cross-cutting — restated in every story's closing acceptance criterion.

### UX-DR Coverage Map

UX-DR1: Story 1.1. UX-DR2: Story 1.1, reinforced 1.4, 3.2, 3.3. UX-DR3: Story 1.1, 1.6. UX-DR4: Story 1.1. UX-DR5: Story 1.1, 1.4, 3.2. UX-DR6: Story 1.6. UX-DR7: Story 3.2. UX-DR8: Story 3.2. UX-DR9: Story 3.2. UX-DR10: Story 1.4 (informational rows only), 3.3 (`Ver preços` added), 4.1 (`Ver na loja` added). UX-DR11: Story 3.3. UX-DR12: Story 3.3, 3.4. UX-DR13: Story 4.1. UX-DR14: Story 4.1. UX-DR15: Story 3.2, 3.3. UX-DR16: Story 3.3. UX-DR17: Story 3.4. UX-DR18: Story 1.1, 1.4. UX-DR19: Story 1.1, 1.4, 1.6. UX-DR20: Story 3.2, 3.4, 2.4. UX-DR21: Story 1.1, 3.3, 4.1 (cross-cutting trust copy). UX-DR22: Story 1.1. UX-DR23: Story 1.1. UX-DR24: Story 1.1, 3.2. UX-DR25: Story 3.5, 4.4 (full verification), applied per-surface throughout. UX-DR26: Story 1.1 (baseline), 4.4 (final gate).

## Epic List

### Production Completion Standard

The four epics collectively deliver 100% of the defined product to production readiness. Every NFR, Additional Requirement, and UX Design Requirement must be assigned to and verified by at least one story. Runtime stubs, placeholder implementations, mock data, fake integrations, TODO-only paths, disabled production checks, or knowingly incomplete acceptance criteria are prohibited. Test doubles are allowed only inside automated tests. Each epic ends as a deployable, observable, secured, migrated, documented, and rollback-capable vertical slice; the final epic closes every remaining production gate.

### Epic 1: Find Real Filament Offers

Anonymous users can search and browse real published filament Offers from an end-to-end Homologated multi-Store flow by free text, Material Family, and Brand. This epic establishes the production vertical substrate only insofar as required to deliver usable discovery, including at least two real Store integrations and no runtime mock or placeholder data. **Outbound sequencing (intentional):** result rows are informational-only in this epic — brand, Specific Type, Store name, Listing Price, R$/kg, availability, and freshness are all visible inline in the row itself, so discovery value does not require a click-through. Neither a `Ver preços` detail link (built in Epic 3) nor a functional `Ver na loja` outbound action (FR-11, built in Epic 4) exists yet; this is a deliberate phased sequencing decision, not a stub or missing requirement, and Story 1.4's acceptance criteria reflect it explicitly.

**FRs covered:** FR1, FR2, FR3.

### Epic 2: Trust Five-Store Coverage

Users receive honest production coverage across all five named MVP Stores, while blocked, broken, contaminated, or non-homologated sources are excluded from active claims. Operators can homologate, observe, degrade, remove, recover, and safely replace Store integrations through audited production workflows. Result rows for these Stores carry the same Epic 1 outbound-sequencing note: informational-only until Epic 3 (detail) and Epic 4 (`Ver na loja`).

**FRs covered:** FR14, FR15.

### Epic 3: Compare Offers with Price and Taxonomy Confidence

Users can filter, sort, inspect, and compare exact Merges and unmatched Offers with trustworthy Listing Price, R$/kg, availability, freshness, Store promotions, responsive UX, and per-Offer history. This epic introduces the `Ver preços` action that opens the Offer/Merge detail comparison page (an internal navigation, not a merchant departure). The complete comparison experience is production-ready without depending on the `Ver na loja` outbound mechanism (FR-11) or outbound analytics (FR-16) — both remain Epic 4 scope. Per the phased-sequencing decision in Epic 1, comparison rows and detail pages built in this epic **omit** the `Ver na loja` control entirely (UX-DR11/UX-DR14 are satisfied by Epic 4, not this epic) rather than rendering a visible but non-functional button — no stub or placeholder action is shipped at any point.

**FRs covered:** FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR13, FR17.

### Epic 4: Continue to the Merchant with Measurable Trust

Users can leave through a safe, stable `Ver na loja` path with honest merchant and affiliate disclosure behavior, while FilaTracker measures privacy-bounded idempotent Outbound Clicks as its launch-success event. This epic closes all remaining release, recovery, privacy, performance, accessibility, observability, and deployment gates.

**FRs covered:** FR11, FR12, FR16.

## Epic 1: Find Real Filament Offers

Anonymous users can search and browse real published filament Offers from an end-to-end Homologated multi-Store flow by free text, Material Family, and Brand. This epic establishes the production vertical substrate only insofar as required to deliver usable discovery, including at least two real Store integrations and no runtime mock or placeholder data. **Outbound sequencing (intentional):** rows show brand, Specific Type, Store name, Listing Price, R$/kg, availability, and freshness inline, so discovery value stands on its own. Neither `Ver preços` (Epic 3) nor `Ver na loja` (FR-11, Epic 4) exists yet, and neither control is rendered as a non-functional placeholder — they are simply absent until the epic that implements them, per AR30.

### Story 1.1: Set Up the Initial Project from the Official Starter (FR1)

As an anonymous filament shopper,
I want a responsive search-first FilaTracker surface backed by the real production architecture,
So that I can access the product and receive honest empty results before Store Offers are published.

**Acceptance Criteria:**

**Given** a clean repository and the approved architecture
**When** the project is bootstrapped
**Then** it uses the official `create-cloudflare` React Router v8 SSR starter, preserves `workers/app.ts`, commits the lockfile, and uses the specified Node/pnpm/TypeScript/React/Vite/Wrangler baseline
**And** no unofficial adapter or parallel SPA/API application is introduced.

**Given** local and production configurations
**When** bindings are inspected and both Workers start
**Then** exactly `web` and `ingest` exist, `web` has only public-safe configuration and the typed ingest Service Binding, and only `ingest` binds D1
**And** local/CI identities cannot address production resources, secrets, migrations, or deploy authority.

**Given** the initial schema and service boundary
**When** migrations and contracts are built
**Then** only entities required by the functional empty-search slice are created, all schemas live in `src/contracts/`, D1 access remains behind ingest persistence ports, and the page query returns a bounded versioned `RpcOutcome<SearchPage>`
**And** money, mass, time, nullability, enums, correlation ID, limits, and typed outcomes follow AR17/AR27.

**Given** an empty authoritative production-equivalent catalog
**When** a user opens `/`, submits an empty query, or submits a non-matching query to `/search`
**Then** SSR renders the pt-BR search-first Home or the explicit no-match state `Não encontramos esse filamento.` from the real aggregate RPC result
**And** it never renders fake Offers, fixture data, a runtime mock, an error page, or a false “service unavailable means no results” state.

**Given** ingest RPC is unavailable, overloaded, expired, or throws
**When** Home/Search requests data
**Then** native failures are normalized to typed outcomes, one in-budget retry is allowed only for the idempotent query, and overload/unavailability returns non-cacheable 503 with `Retry-After`
**And** the UI never substitutes an empty result or cached dynamic response.

**Given** the canonical UX contract
**When** Home and Search render at desktop, tablet, and mobile breakpoints
**Then** `app/design-system/` owns the complete approved tokens, Hanken Grotesk/JetBrains Mono usage, shell, search control, focus treatment, responsive geometry, loading rows, and honest empty state
**And** there are no images, logos, avatar, deal rail, Store ticker, glass, gradient, shadow stack, giant hero, or route-local visual constants.

**Given** keyboard and assistive-technology users
**When** they navigate Home and Search
**Then** the implemented slice meets WCAG 2.1 AA for semantics, contrast, zoom/reflow, keyboard operation, announced loading/error/empty state, and visible 2 px focus
**And** automated accessibility checks cover the core interactions.

**Given** a candidate production release
**When** CI and deployment verification run
**Then** typecheck, lint, unit, contract N/N-1, Worker integration, binding-denial, migration, SSR, error mapping, limit, responsive, and accessibility tests pass against isolated real adapters/emulators
**And** documented production deploy, canary, verification, rollback, and secret-handling commands contain no disabled gate, TODO path, runtime stub, or mock substitution.

### Story 1.2: Homologate the First Real Store Adapter (FR1)

As a FilaTracker operator,
I want the Closin adapter proven against current real catalog evidence,
So that the Store can enter ingestion without policy, extraction, identity, or capacity surprises.

**Acceptance Criteria:**

**Given** the versioned Store adapter contract
**When** the Closin adapter is implemented
**Then** it consists of a schema-validated declarative map plus only necessary typed discovery/extraction hooks and emits bounded `RawOfferObservation` values
**And** Store-specific code cannot normalize canonical fields, assign Merge membership, publish directly, or bypass shared policies.

**Given** Closin public catalog pages and current robots policy
**When** homologation and every production run begin
**Then** robots evidence, exact allowed hosts/ports, redirects, DNS, path/query composition, response size, decompression, duration, concurrency, and parse budgets are checked fail-closed
**And** disallow, ambiguity, fetch failure, CAPTCHA, authentication, or anti-bot blocking produces no bypass attempt and no publication.

**Given** representative real Closin filament pages, variants, pagination, malformed fields, non-filament products, kits, OOS products, and Store promotions
**When** homologation fixtures and a bounded read-only production-safe probe run
**Then** extraction captures source identity, Listing Price/original price, availability, brand evidence, material text, weight, color, diameter, URL/variant evidence, timestamps, and map/parser versions as bounded plain data
**And** executable merchant HTML, unrelated catalog items, invented values, ambiguous bundle weight, and invalid promotions cannot reach publication.

**Given** Closin’s measured maximum catalog volume
**When** adapter capacity and failure tests run
**Then** fetch, redirect, decompression, parse, candidate, observation, staged-byte, concurrency, duration, and log budgets pass with an explicit safety margin
**And** activation remains blocked unless map schema, fixtures, robots evidence, safe probe, destination policy, filament eligibility, and rollback evidence all pass without a mock production source.

### Story 1.3: Publish Closin Through the Deterministic Pipeline (FR1)

As a FilaTracker operator,
I want homologated Closin observations processed and atomically published,
So that trustworthy real Offers become authoritative and searchable by later capabilities.

**Acceptance Criteria:**

**Given** a new Closin ingestion run
**When** discovery, staging, validation, and publication execute
**Then** one coordinator enforces the legal run state machine, immutable terminal states, digest-verified retained payloads, inbox idempotency, queue replay safety, and recovery/projection/support/generation fencing
**And** late, duplicate, expired, old-epoch, poisoned, or incompatible-version deliveries cannot mutate published state.

**Given** valid raw observations
**When** shared deterministic stages process them
**Then** versioned identity, canonical URL/variant continuity, brand, Specific Type, Material Family, positive centavos/grams, color, diameter, availability, promotion eligibility, and provenance are normalized and validated without AI/LLM runtime behavior
**And** incomplete canonical keys remain eligible only as standalone Offers, while incompatible source-tuple reuse is quarantined for reviewed lineage.

**Given** a run classified by the compiled Store manifest
**When** publication is attempted
**Then** one bounded set-based D1 batch compares expected Store generation, support generation, projection epoch, and recovery epoch before atomically committing published Offer facts, Store/run state, visibility, and inbox completion
**And** authoritative-complete may infer absence, positive-only publishes observed positives without absence, and failed, quarantined, superseded, or oversized runs publish nothing and retain the prior generation.

**Given** initial Closin publication and later changed observations
**When** prices or availability change
**Then** only explicit OOS or authoritative-complete absence marks unavailable, stale derives independently after 48 hours, and at most one PricePoint per Offer/run is appended only for a changed positive price tuple
**And** parser failure cannot mass-mark Offers OOS and correction facts never rewrite history.

**Given** concurrent publication, retries, or operator SQL mistakes
**When** D1 constraints are exercised
**Then** foreign keys, positive-value checks, source identity uniqueness, `(offerId, runId)` replay uniqueness, inbox idempotency, and generation compare-and-swap reject impossible or duplicate facts
**And** all Drizzle types remain inside the persistence adapter.

**Given** homologation and publication complete
**When** an operator inspects Store health
**Then** Closin has audited support state, run evidence, counts, bounded error codes, freshness, generation/epoch metadata, and redacted allowlisted telemetry
**And** raw query/referrer/destination URL, IP, full User-Agent, secrets, merchant payloads, and unrelated identifiers never enter logs, traces, or analytics.

**Given** Closin’s measured maximum catalog volume
**When** transactional capacity and failure tests run
**Then** the Store’s D1 batch, queue, CPU, subrequest, retention, retry, DLQ, and recovery envelope passes with an explicit safety margin
**And** publication activation is blocked unless migrations, atomicity, replay, rollback, purge verification, and the full Story 1.3 invariant suite succeed without runtime stubs or mock integrations.

### Story 1.4: Search Published Closin Offers End to End (FR1)

As an anonymous filament shopper,
I want to search the real Offers published from Closin,
So that I can discover available filament without visiting the Store catalog manually.

**Acceptance Criteria:**

**Given** active/degraded Closin Offers published by Story 1.2
**When** the publication coordinator updates search visibility
**Then** it writes one versioned FTS5 document per visible standalone `OfferResult` using reviewed explicit SQL and the same eligibility, identity, normalization, and freshness rules as relational reads
**And** unsupported/deactivated, non-filament, quarantined, invalid, or unpublished observations cannot enter FTS.

**Given** a valid bounded free-text query
**When** `getSearchPage` executes
**Then** one D1 snapshot returns a versioned page aggregate containing result discriminant, opaque identity, display fields, facets supported by the current slice, Store support, projection/support epochs, correlation ID, bounded cursor, and typed outcome
**And** no Drizzle type, raw merchant content, unbounded row set, generic SQL capability, or persistence authority crosses RPC.

**Given** search terms matching brand, Material Family, Specific Type, or Store listing title evidence
**When** the user submits `/search?q=...`
**Then** SSR renders only matching real Closin Offer rows with Store text name, brand/Specific Type where known, Listing Price, conditional R$/kg, availability, freshness, known color/diameter, and no image or logo
**And** unknown fields remain honest null/omitted states rather than inferred display values
**And** rows are informational-only in this story: no `Ver preços` detail link or `Ver na loja` outbound control is rendered (those ship in Epic 3 and Epic 4 respectively), and no placeholder or disabled control stands in for them.

**Given** a query with no eligible published match
**When** Search renders
**Then** it shows `Não encontramos esse filamento.` and only real Material Family suggestions derived from published taxonomy
**And** it does not invent Offers, silently broaden into unrelated products, or expose quarantined/hidden data.

**Given** FTS is unavailable, stale during rebuild, or fails invariant validation
**When** search executes
**Then** the validated relational fallback returns equivalent result identities and parser semantics under the same bounds, or the service emits an explicit observed degraded/unavailable outcome
**And** no Offer can appear both standalone and Merged or disappear silently because a partial index was accepted.

**Given** active, degraded, unsupported, or deactivated Store states and available, unavailable, unknown, or stale Offer states
**When** search visibility is evaluated
**Then** active/degraded Offers remain qualified and visible, unsupported/deactivated Offers are excluded, and stale composes independently with availability
**And** state transitions atomically update relational and FTS visibility under generation fencing.

**Given** desktop, tablet, and mobile users
**When** populated results render
**Then** the approved dense table/compact-row pattern, monospaced aligned figures, textual statuses, semantic headings/table structure, loading skeletons, keyboard operation, visible focus, and responsive overflow/reflow are applied
**And** no product card grid, image placeholder, Store logo, decorative promotion, or guarantee language appears.

**Given** malformed, oversized, abusive, or expensive queries and cursors
**When** they reach the web or RPC boundary
**Then** schema validation, length/token/row/response/CPU/deadline/materialization limits, safe error copy, and abuse shedding prevent unbounded work
**And** raw query text is neither logged nor retained as analytics by default.

**Given** repeated reads during publication, Store-state transitions, or deployment N/N-1
**When** Search is requested
**Then** every page is generation-consistent from one aggregate, dynamic responses are not cross-request cached, and mixed contract versions decode according to compatibility policy
**And** native exceptions, deadlines, overload, and unavailable states never become false empty results.

**Given** production release verification
**When** search quality, security, performance, and accessibility suites run against real emulated D1/Workers and homologated fixtures
**Then** result identity, eligibility, FTS/fallback equivalence, state visibility, limits, injection handling, SSR, responsive behavior, WCAG 2.1 AA, and provisional p95 <500 ms are measured and pass
**And** the deployed flow contains no runtime mock, fake Offer, placeholder query path, or deferred production wiring.

### Story 1.5: Search Across Two Real Stores (FR1)

As an anonymous filament shopper,
I want one search to return comparable Offers from Closin and Voolt3D,
So that I receive genuine multi-Store discovery value.

**Acceptance Criteria:**

**Given** the proven shared Store contract and ingestion pipeline
**When** Voolt3D is implemented and homologated
**Then** its versioned declarative map, required typed hooks, real-page fixtures, robots evidence, safe probe, destination allowlist, filament-only rules, completeness class, and measured capacity envelope pass the same gates as Closin
**And** no Voolt3D-specific code forks shared identity, normalization, pricing, availability, publication, FTS, or history policy.

**Given** valid Voolt3D observations
**When** scheduled and queued ingestion runs
**Then** the existing coordinator atomically publishes Voolt3D Offers under independent Store generations and shared projection/support/recovery fencing
**And** failure, positive-only completeness, replay, map breakage, or Voolt3D unavailability cannot regress or hide the last valid Closin generation.

**Given** a query matching eligible Offers in both Stores
**When** a user searches
**Then** one page aggregate returns result units from Closin and Voolt3D with Store shown as text, stable opaque Offer identities, deterministic ordering, truthful fields, and generation-consistent facets
**And** the UI never duplicates a source Offer, conflates cross-Store identities, or claims broader Store coverage than active data supports.

**Given** one Store is degraded, unsupported, or temporarily fails ingestion
**When** Search renders
**Then** active/degraded eligible Offers follow the state matrix, unsupported Offers are excluded, coverage copy reflects current support, and public search remains available through the other Store
**And** backend unavailability remains distinct from an honest no-match response.

**Given** both Store catalogs and overlapping names
**When** result identity and ordering tests run
**Then** source tuples remain unique per Store, identical text cannot cause unsafe grouping, all current units remain standalone until exact Merge promotion is implemented, and FTS/relational fallback return the same identities
**And** cross-Store search p95, response bounds, accessibility, privacy redaction, deployment compatibility, and rollback tests pass without fake production data.

### Story 1.6: Discover by Material Family and Brand (FR2, FR3)

As an anonymous filament shopper,
I want to search and browse by Material Family and Brand while seeing distinct Specific Types,
So that I can narrow discovery without confusing related filament formulations.

**Acceptance Criteria:**

**Given** homologated Offer evidence from both active Stores
**When** deterministic taxonomy normalization runs
**Then** durable Material Family, Specific Type, Brand, opaque ID, canonical slug, version, provenance, and reviewed alias records are persisted only from validated mappings
**And** PETG, PETG HF, Rapid PETG, PLA variants, ambiguous labels, and unknown values remain semantically distinct according to fixtures rather than fuzzy or AI matching.

**Given** a Material Family query such as PETG
**When** `getSearchPage` resolves family intent
**Then** results include eligible Offers from all child Specific Types, each row exposes its Specific Type, and the aggregate provides a bounded Specific Type facet
**And** narrowing to one Specific Type excludes siblings without changing source identity or inventing a Merge.

**Given** published Brand and Material Family records
**When** users open `/brands/:brandSlug` or `/materials/:familySlug`
**Then** `getBrowsePage` returns one versioned generation-consistent aggregate using the same visibility, ordering, pagination, result-unit, and failure semantics as Search
**And** unknown slugs return typed notFound, reviewed renames redirect permanently through durable aliases, and no open redirect or ambiguous alias is accepted.

**Given** Home and global navigation
**When** taxonomy data is available
**Then** Materiais, Marcas, and optional Home Material Family chips link to real browse results; active search/filter context is represented with removable semantic chips
**And** the surfaces remain comparison-oriented, with no educational bento, Store index, deal rail, images, or fabricated taxonomy suggestions.

**Given** taxonomy or FTS version changes
**When** a new normalizer/key version is prepared
**Then** fixtures validate every published Offer in a shadow projection, reviewed aliases/lineage are recorded, and projection-epoch CAS makes the version public atomically
**And** mixed taxonomy versions, partial rebuilds, stale concurrent publications, or unreviewed semantic renames cannot become visible.

**Given** keyboard, screen-reader, mobile, tablet, and desktop users
**When** they browse, search, select, remove, or clear taxonomy controls
**Then** controls have programmatic labels/state, visible focus, sufficient contrast, reflow/overflow behavior, and announced result changes consistent with WCAG 2.1 AA
**And** automated journey tests prove Home → family/brand browse → Search works with only real published Offers.

**Given** Epic 1 release verification
**When** all Story 1.x suites and production canary run
**Then** FR1, FR2, and FR3 are demonstrably satisfied across two real Homologated Stores, all migrations and contracts are N/N-1 compatible, and rollback restores the prior healthy version without data loss
**And** no runtime stub, mock Store, fake Offer, placeholder route, incomplete design-system path, or deferred Epic 1 production gate remains.

## Epic 2: Trust Five-Store Coverage

Users receive honest production coverage across all five named MVP Stores, while blocked, broken, contaminated, or non-homologated sources are excluded from active claims. Operators can homologate, observe, degrade, remove, recover, and safely replace Store integrations through audited production workflows. Result rows for these Stores carry the same Epic 1 outbound-sequencing note: informational-only until Epic 3 (`Ver preços`) and Epic 4 (`Ver na loja`).

### Story 2.1: Add Homologated 3D Colors Coverage (FR14)

As a filament shopper,
I want eligible 3D Colors Offers included in the same search experience,
So that I can compare a broader real specialty-Store catalog.

**Acceptance Criteria:**

**Given** current public 3D Colors catalog behavior
**When** its adapter is authored
**Then** a versioned declarative map and only evidence-required typed hooks cover discovery, pagination/variants, canonical PDP identity, prices, original prices, availability, taxonomy evidence, weight, color, diameter, and timestamps
**And** the adapter emits only bounded raw observations and cannot fork shared canonical or publication policy.

**Given** real 3D Colors pages and edge cases
**When** homologation runs
**Then** reviewed fixtures include valid filament, malformed/missing fields, OOS, promo, kit/bundle, redirects, duplicates, and non-filament examples, while a read-only production-safe probe confirms current selectors/contracts
**And** robots ambiguity, anti-bot blocking, extraction drift, unsafe destination, or failed capacity proof blocks activation without bypass.

**Given** a homologated active map
**When** production schedule/queue execution publishes 3D Colors
**Then** atomic completeness, generation, epoch, replay, PricePoint, FTS, state, and telemetry rules remain identical to existing Stores
**And** a 3D Colors failure cannot partially publish or regress other Store generations.

**Given** eligible results from three Stores
**When** users search or browse
**Then** 3D Colors appears as text only on its Offers, coverage derives from current support state, and ordering/filters use the same bounded page snapshot
**And** no hardcoded Store count, fake Offer, duplicated variant, or unsupported source appears.

**Given** production activation
**When** contract, fixture, safe-probe, capacity, security, privacy, search-equivalence, rollback, and Store-transition tests run
**Then** all gates pass and the adapter is observable and supportable without disabled checks, TODO handlers, or runtime mocks
**And** failure automatically preserves prior valid facts under the approved state policy.

### Story 2.2: Add Homologated Filamentos 3D Brasil Coverage (FR14)

As a filament shopper,
I want Filamentos 3D Brasil Offers included in search and browse,
So that I can evaluate another specialist source through the same trusted comparison model.

**Acceptance Criteria:**

**Given** current public Filamentos 3D Brasil catalog evidence
**When** the Store map and required hooks are implemented
**Then** discovery and extraction produce bounded, versioned raw observations with reviewed source identity, variant, price, original price, availability, taxonomy, weight, color, diameter, and provenance
**And** Store-local code cannot manufacture canonical values, R$/kg, promotion, Merge membership, or availability inference.

**Given** catalog pagination, variants, bundles, OOS listings, malformed content, redirect chains, duplicate URLs, and unrelated SKUs
**When** homologation fixtures and the safe probe execute
**Then** all cases have deterministic expected outcomes, non-filament and ambiguous unit-weight items fail publication/ranking policy, and every destination hop passes the shared allowlist
**And** robots failure, blocking, selector drift, or over-budget volume prevents activation and creates bounded audited evidence.

**Given** authoritative-complete, positive-only, failed, quarantined, replayed, and oversized runs
**When** the coordinator processes Filamentos 3D Brasil
**Then** each outcome follows the existing atomic publication and absence policy with immutable terminal state and independent Store generation
**And** duplicate or late messages, mixed versions, and old recovery epochs produce no additional public mutation.

**Given** four active Homologated Stores
**When** public aggregates render Filamentos 3D Brasil Offers
**Then** search/browse identity, fields, facets, support copy, FTS fallback, accessibility, and performance remain equivalent across Stores
**And** user-visible content contains only escaped bounded plain text and no logo or product image.

**Given** a production release or rollback
**When** all adapter, pipeline, migration, queue, capacity, observability, privacy, and user-journey gates run
**Then** the Store can be independently activated, degraded, marked Unsupported, or rolled back without corrupting other coverage
**And** no mock integration or fixture-only production path satisfies completion.

### Story 2.3: Add Homologated Topink3D Filament-Only Coverage (FR14)

As a filament shopper,
I want only valid Topink3D filament Offers included,
So that a multi-category Store broadens coverage without polluting results.

**Acceptance Criteria:**

**Given** Topink3D contains filament and unrelated product categories
**When** discovery and eligibility rules execute
**Then** only positively identified filament PDPs/variants can produce raw candidates for publication, with bounded evidence explaining inclusion or exclusion
**And** printers, resin, accessories, parts, kits with ambiguous unit mass, and unknown categories do not enter public search, normalized price ranking, or taxonomy.

**Given** current Topink3D pages, pagination, variants, promotions, unavailable products, category transitions, and malformed content
**When** the versioned map, typed hooks, fixtures, and read-only safe probe run
**Then** source identity and all extractable fields are deterministic, escaped, provenance-bearing, and covered by reviewed expected outcomes
**And** no classifier, LLM, runtime self-repair, credentialed access, CAPTCHA bypass, or residential proxy is used.

**Given** Store volume and multi-category noise
**When** resource/capacity tests run
**Then** fetch, redirect, parse, candidate, observation, staged-byte, queue, D1 batch, log, duration, and concurrency limits pass with margin for filament-only operation
**And** limit overflow quarantines/fails the run without partial publication or loss of the previous generation.

**Given** five active Homologated Stores
**When** users search and browse
**Then** eligible Topink3D filament Offers participate under the same result, taxonomy, ordering, state, and display rules, and accurate coverage may state five Stores
**And** unsupported/deactivated Topink3D immediately disappears from search/coverage/outbound projection without deleting detail/history facts.

**Given** activation and future map changes
**When** production gates execute
**Then** homologation, robots, safe probe, filament eligibility, destination policy, replay, atomicity, FTS equivalence, privacy, accessibility, performance, canary, and rollback pass
**And** every map version change repeats homologation before publication.

### Story 2.4: Operate Honest and Recoverable Five-Store Coverage (FR14, FR15)

As a FilaTracker operator,
I want audited Store lifecycle, health, recovery, and replacement controls,
So that users see only supportable coverage and production can recover safely.

**Acceptance Criteria:**

**Given** Store evidence and current support state
**When** transient failure, positive-only degradation, robots/policy block, broken-map thresholds, re-homologation, operator deactivation, or replacement occurs
**Then** only legal `active | degraded | unsupported | deactivated` transitions execute through the coordinator with actor, reason, evidence, generation fencing, and immutable audit history
**And** `deactivated` is terminal in v1 while `unsupported → active` requires new homologation, safe probe, and authorized activation.

**Given** any Store transition
**When** its projection transaction commits
**Then** relational visibility, FTS, coverage count, and outbound eligibility change atomically according to the state matrix while Offer detail/history is retained
**And** a promoted Merge is never populated from hidden Offers and public copy never claims five active Stores when fewer qualify.

**Given** fewer than five useful active Stores
**When** coverage policy evaluates
**Then** five-Store claims are paused immediately, replacement work is tracked against the confirmed 14-day interim, and any replacement repeats full policy/capacity/homologation gates
**And** Store count cannot be preserved through anti-bot bypass, contaminated catalog data, or silent degradation.

**Given** run, queue, Store, projection, D1, or Worker failures
**When** operators inspect health and alerts
**Then** allowlisted dashboards/alerts expose Store/run IDs, stage, outcome, support/generation/epoch state, freshness, capacity, DLQ/quarantine, error code, and recommended audited action
**And** sinks redact prohibited request, merchant, destination, device, network, user, and secret data and enforce tested retention/purge.

**Given** a D1 restore or disaster recovery exercise
**When** recovery begins
**Then** work pauses, the external non-regressing recovery epoch advances before resume, D1 is restored, invariants are validated, membership/FTS rebuild under a captured projection epoch, and all old-epoch deliveries are rejected/quarantined
**And** approved RPO, RTO, Time Travel, export/FTS recreation, queue horizon, rollback, and evidence requirements are exercised successfully.

**Given** mixed N/N-1 deployments, queued old contracts, or rollback
**When** Store operations continue
**Then** consumers accept both versions through the complete retry/DLQ/replay/recovery horizon, producers emit only accepted versions, and destructive contraction waits until every horizon expires
**And** no incompatible command, partial projection, or restored stale message can mutate authority.

**Given** Epic 2 production sign-off
**When** all five Store and lifecycle suites run
**Then** FR14 and FR15, capacity, filament-only eligibility, robots policy, scheduling, alerts, recovery, privacy, canary, and rollback are proven with real integrations and isolated production-equivalent resources
**And** no Store adapter, lifecycle transition, health signal, recovery command, or coverage claim remains stubbed, mocked, manually implied, or deferred.

## Epic 3: Compare Offers with Price and Taxonomy Confidence

Users can filter, sort, inspect, and compare exact Merges and unmatched Offers with trustworthy Listing Price, R$/kg, availability, freshness, Store promotions, responsive UX, and per-Offer history. This epic introduces `Ver preços`, the internal navigation from a result row to the Offer/Merge detail comparison page. The complete comparison experience is production-ready without depending on the `Ver na loja` outbound mechanism (FR-11) or outbound analytics (FR-16) — both remain Epic 4 scope, and the `Ver na loja` control (UX-DR11/UX-DR14) is not rendered until Epic 4 implements it; no placeholder action is shipped.

### Story 3.1: Group Only Exact Comparable Offers (FR9, FR10)

As a filament shopper,
I want Offers grouped only when brand, Specific Type, and weight match exactly,
So that I can compare like with like without false confidence.

**Acceptance Criteria:**

**Given** eligible published Offers
**When** the versioned canonical key is computed
**Then** only normalized brand ID, Specific Type ID, and positive known weight grams participate; color and diameter never create or block a key
**And** missing/ambiguous key fields, bundles with unknown unit mass, and conflicting evidence remain standalone without confidence scores, fuzzy matching, ML, or LLM.

**Given** fewer than two eligible Offers for a complete key
**When** result projection runs
**Then** each is a standalone `OfferResult`; at exactly two, a stable opaque `mergeId` is allocated from the unique versioned fingerprint registry and one `MergeResult` replaces both search units atomically
**And** database uniqueness prevents duplicate registry ownership or multiple current memberships.

**Given** a promoted Merge later has one or zero visible members
**When** Store/Offer visibility changes
**Then** one member remains a `MergeResult`, zero removes it from Search while retaining registry, tombstone, route, aliases, and lineage
**And** hidden Offers never populate the public Merge aggregate.

**Given** grouped Offer routes
**When** `/offers/:offerId` is requested
**Then** the Offer remains addressable and canonically links to its current Merge; a reviewed one-survivor alias permanently redirects, while an ambiguous split returns typed gone
**And** IDs are never reused after corrections or splits.

**Given** a canonical-key version change
**When** migration is prepared
**Then** every published Offer is rebuilt into a validated shadow projection, reviewed one-to-one/split lineage is recorded, and global projection-epoch CAS atomically activates it
**And** concurrent stale builds, mixed key versions, unreviewed many-to-one histories, or automatic history merging cannot become public.

**Given** PETG/PETG HF, same-product different-color, different-diameter, unknown-field, kit, URL-change, source-reuse, split, and membership-churn fixtures
**When** domain, D1, replay, FTS, RPC, and route tests run
**Then** exact identity and lifecycle invariants hold under concurrency and rollback
**And** unmatched Offers remain searchable/detail-capable without any runtime matching placeholder.

### Story 3.2: Filter and Sort Comparable Results (FR4, FR6, FR7, FR8)

As a filament shopper,
I want complete filters and honest price sorting,
So that I can quickly narrow Offers to the filament specifications I need.

**Acceptance Criteria:**

**Given** Search or Browse results
**When** page aggregates calculate facets
**Then** bounded Brand, Specific Type, Material Family, weight, Listing Price, availability, optional known color, and diameter facets derive from the same committed visible result snapshot
**And** hidden Stores/Offers and ambiguous values cannot leak into counts or controls.

**Given** the default diameter filter
**When** a user first opens results
**Then** Offers with 1.75 mm or unknown diameter are included and known non-1.75 mm Offers are excluded
**And** the user can explicitly select other diameters or clear the filter while diameter never changes Merge identity.

**Given** default Listing Price ordering
**When** results contain available, unknown, unavailable, stale, and equal-price Offers/Merges
**Then** eligible in-stock results precede OOS, Listing Price ascends, ties resolve by freshness, and ordering is stable across cursor pages
**And** no frete, fabricated discount, unknown weight, or hidden Offer affects rank improperly.

**Given** R$/kg sort
**When** users choose it
**Then** only Offers with valid positive Listing Price and net grams receive a normalized value using integer-safe arithmetic and explicit rounding/formatting
**And** unknown/ambiguous weights are omitted or placed in a clearly separated unavailable position without invented mass.

**Given** filter/sort state in the URL
**When** users submit, remove chips, clear controls, navigate history, or share the URL
**Then** schema-validated canonical parameters reproduce the same bounded result set and active semantic chips
**And** malformed, duplicate, oversized, unsupported, or injection-shaped values yield typed invalid handling without unbounded queries.

**Given** desktop, tablet, mobile, keyboard, and screen-reader use
**When** filters and sort are operated
**Then** sidebar, drawer/top-bar, and mobile sheet patterns preserve focus, labels, selected state, result announcements, reflow, touch targets, and WCAG 2.1 AA
**And** rows remain dense semantic data surfaces rather than image cards.

**Given** performance and consistency verification
**When** worst-case facet combinations and pagination run during publication/state transitions
**Then** one page-atomic aggregate stays within configured row/byte/CPU/deadline/materialization budgets and provisional search p95 <500 ms
**And** FTS/fallback identities, filters, counts, and ordering remain equivalent with no dynamic cross-request cache.

### Story 3.3: Compare Offers on Trustworthy Detail Pages (FR5, FR6, FR7, FR8, FR9, FR10)

As a filament shopper,
I want a dense Offer or Merge detail view,
So that I can compare Store prices and status before deciding where to continue.

**Acceptance Criteria:**

**Given** a visible standalone Offer or promoted Merge
**When** `/offers/:offerId` or `/merges/:mergeId` loads
**Then** exactly one bounded `getOfferPage` or `getMergePage` snapshot returns canonical identity/link, Store support, member Offers, corrected current price facts, projection/support epochs, and one typed outcome
**And** notFound, gone, invalid, overloaded, unavailable, and degraded states map consistently without mixed-generation page data.

**Given** a comparison table
**When** eligible member Offers render
**Then** each Offer URL has one row with Store text name, Listing Price, conditional R$/kg, availability, last checked, stale state, and known color/diameter
**And** no product image, Store logo, unknown-weight R$/kg, false Merge claim, or hidden member appears
**And** this story delivers `Ver preços` as the row-level internal navigation from Search/Browse into this page (UX-DR10); it does not render a `Ver na loja` outbound control — that ships in Epic 4 Story 4.1 per the phased-sequencing decision, with no placeholder or disabled button standing in for it.

**Given** Listing Price ranking or `menor preço` language
**When** Detail renders
**Then** the approved adjacent copy states that prices can change and frete/Store conditions alter final value, plus the footer trust strip
**And** there is no CEP field, frete estimate, checkout total, price guarantee, `tempo real`, or FilaTracker-as-seller claim.

**Given** available, unavailable, unknown, or stale Offers
**When** status is shown
**Then** textual `DISPONÍVEL`, `INDISPONÍVEL`, unknown, and stale treatments use semantic tokens and freshness copy such as `Último preço encontrado`/`Atualizado há …`
**And** status never relies on color alone or uses unsupported `POUCO ESTOQUE`.

**Given** a promoted Merge with color/diameter variation or a standalone unmatched Offer
**When** users inspect Detail
**Then** visible attributes explain the actual rows while the UI never implies color/diameter caused grouping; unmatched state remains clear and complete
**And** PETG and PETG HF cannot be presented as one comparable product.

**Given** all supported breakpoints and assistive input
**When** Detail is navigated
**Then** comparison semantics, captions/headers, keyboard order, focus, responsive scrolling/compact layout, textual status, contrast, zoom, and loading/error announcements meet WCAG 2.1 AA
**And** the approved 1280 px desktop geometry, 12 px mobile margins, mono figures, tonal layers, 1 px rules, and no-shadow system are preserved.

**Given** release verification
**When** identity, membership, state, price, trust-copy, SSR, error, bounds, LCP, responsive, visual-token, and accessibility suites run
**Then** corrected Detail LCP is measured against the provisional <2.5 s target and all invariant tests pass
**And** neither route contains placeholder members, mock DTOs, fabricated comparison values, or deferred production states.

### Story 3.4: Show Store Promotions and Per-Offer Price History (FR13, FR17)

As a filament shopper,
I want honest promotion and historical Listing Price context for each Offer,
So that I can understand Store-provided discounts and prior observed prices without fabricated savings.

**Acceptance Criteria:**

**Given** a Store observation with current and original price
**When** pricing validation runs
**Then** promotion is eligible only if both values are valid positive BRL centavos and Store-supplied original price exceeds current Listing Price
**And** missing/equal/lower original price, parser guesses, or historical movement never creates a strikethrough, promo badge, or discount percentage.

**Given** an Offer’s published price tuple changes
**When** publication commits
**Then** at most one append-only `PricePoint` per Offer/run is created with observed/recorded time and full run/parser/source provenance
**And** availability-only changes create no point and replay uniqueness prevents duplicate samples.

**Given** a parser correction
**When** an authorized correction is published
**Then** a new fact references an acyclic correction lineage with at most one effective successor at a position, while original facts remain audit-only
**And** current and chart reads deterministically fold the same effective lineage without rewriting history.

**Given** at least one prior effective point for an Offer URL
**When** its history section loads
**Then** the bounded per-Offer series renders observed Listing Price in chronological order with accessible labels/table alternative and no Merge-level average as the primary chart
**And** one Offer’s source change, Merge membership change, or another Offer’s history cannot contaminate the series.

**Given** no prior effective point or unavailable history service
**When** Detail renders
**Then** it shows an explicit insufficient-history or typed service error state as applicable
**And** it never fabricates a line, variation, average, savings claim, or empty state for backend failure.

**Given** dense responsive presentation
**When** promo and chart components render
**Then** approved promo tokens, mono values, textual meaning, contrast, keyboard/screen-reader access, responsive chart/table behavior, and trust copy meet WCAG 2.1 AA
**And** visual treatment does not become a deal rail, merchandising card, or decorative price-drop claim.

**Given** retention, correction, replay, bounds, and performance tests
**When** large but allowed histories and mixed versions are exercised
**Then** configured point/byte/deadline/materialization limits, D1 constraints, N/N-1 decoding, privacy redaction, and purge policy pass
**And** FR13 and FR17 are implemented with real persisted facts and no mock series or placeholder correction path.

### Story 3.5: Production-Validate the Complete Comparison Journey (FR4-FR10, FR13, FR17)

As a filament shopper,
I want search-to-comparison behavior to remain correct, fast, accessible, and resilient,
So that I can trust the product under real production conditions.

**Acceptance Criteria:**

**Given** the completed Search, Browse, filter, Merge, Offer, promotion, and history capabilities
**When** end-to-end journeys run across all five Homologated Stores
**Then** Rafael’s PETG flow and Camila’s brand/type flow cover populated, unmatched, exact-Merge, OOS, stale, unknown-weight, promo, no-history, no-match, degraded, and unavailable cases
**And** every visible row and chart derives from authoritative real-ingestion facts.

**Given** concurrent ingestion, Store transitions, FTS rebuild, taxonomy/key migration, queue replay, and web/ingest N/N-1 rollout
**When** users read dynamic pages
**Then** each page remains epoch-consistent, result identities never duplicate/disappear silently, state/coverage is truthful, and typed service failures never masquerade as empty data
**And** rollback preserves accepted contracts, routes, aliases, history, and prior healthy generations.

**Given** mobile and desktop production-like network/device profiles
**When** load and Web Vitals suites run
**Then** search p95 <500 ms and detail LCP <2.5 s are measured against approved datasets and budgets, with regressions blocking release or requiring an explicitly approved architecture/PRD change
**And** no cache or optimization may weaken freshness, visibility, identity, privacy, or error semantics.

**Given** WCAG 2.1 AA conformance review
**When** automated and manual keyboard/screen-reader/zoom/contrast tests cover Home → Results → Detail
**Then** every search, chip, filter, sort, row, table, status, error, chart, and navigation state is operable and understandable at all breakpoints
**And** no route-local visual or interaction exception bypasses the canonical design system.

**Given** security/privacy verification
**When** merchant injection, SSRF/redirect, oversized content, query abuse, log/trace/event inspection, retention expiry, and purge tests execute
**Then** all content and operations remain bounded, escaped, destination-safe, allowlisted, redacted, and purged as specified
**And** no raw query, referrer, destination URL, IP, full User-Agent, stable identifier, secret, or merchant payload reaches a prohibited sink.

**Given** Epic 3 sign-off
**When** the complete invariant matrix, migrations, canary, rollback, observability, runbooks, performance evidence, and accessibility evidence are reviewed
**Then** FR4–FR10, FR13, and FR17 and all applicable UX/NFR/AR requirements are traceably proven
**And** no comparison behavior, edge state, production gate, test, documentation, or operational path remains stubbed, mocked, disabled, TODO-only, or deferred.

## Epic 4: Continue to the Merchant with Measurable Trust

Users can leave through a safe, stable `Ver na loja` path with honest merchant and affiliate disclosure behavior, while FilaTracker measures privacy-bounded idempotent Outbound Clicks as its launch-success event. This epic closes all remaining release, recovery, privacy, performance, accessibility, observability, and deployment gates.

### Story 4.1: Continue Safely to the Current Merchant Listing (FR11)

As an anonymous filament shopper,
I want `Ver na loja` to take me safely to the current merchant listing,
So that I can continue shopping with the Store as source of truth.

**Acceptance Criteria:**

**Given** any Search, Browse, Offer, or Merge row with outbound eligibility
**When** `Ver na loja` renders
**Then** it uses the exact approved pt-BR label, Technical Blue compact control, trailing external-link affordance, visible focus, and assistive announcement
**And** the browser receives only an internal `/out/:offerId` URL rather than a caller-selected merchant destination
**And** this story is where the `Ver na loja` control first appears across all existing Search, Browse, Offer, and Merge surfaces built in Epics 1-3 (per the phased-sequencing decision in those epics) — it is added to those surfaces here, not merely unlocked from a pre-existing disabled state.

**Given** a request to `/out/:offerId`
**When** web invokes the typed outbound RPC
**Then** ingest resolves the current Offer destination from authoritative D1, verifies Store/Offer support and an N/N-1-compatible bounded command contract, and returns one typed outcome
**And** request query/body/header input cannot override host, port, path, query, affiliate parameters, or Store identity.

**Given** a resolved destination
**When** shared destination policy validates it
**Then** every hop is HTTPS, exact reviewed host/port, canonical syntax, credential/fragment-free, public-DNS, Store-scoped, bounded, and revalidated immediately before redirect
**And** DNS/private-network ambiguity, unsupported/deactivated Store, missing Offer, unsafe redirect, expired deadline, or policy failure denies navigation with a safe typed response.

**Given** an eligible available, unknown, OOS, or stale Offer
**When** the user activates outbound
**Then** available/unknown/OOS/stale remain navigable when Store support and destination policy allow, because the merchant is source of truth
**And** freshness/availability never causes the system to use an old unvalidated destination or silently redirect to a different product.

**Given** a safely resolved redirect
**When** web prepares the response
**Then** it creates a cryptographically opaque event ID, schedules idempotent recording with `waitUntil`, returns the approved external redirect and safe cache/referrer headers, and never blocks navigation solely because event persistence fails
**And** web performs no implicit command retry and exposes no D1 or arbitrary RPC authority.

**Given** malformed IDs, bots, abuse, duplicate activation, RPC overload/unavailability, or destination failures
**When** outbound is exercised
**Then** schema, rate, byte, CPU, deadline, subrequest, and response bounds apply; duplicate event IDs are harmless; failures are typed, non-cacheable, and non-redirecting where safety is unproven
**And** destination URLs, referrers, IPs, full User-Agents, device/network fingerprints, and unrelated request data are never logged.

**Given** production verification
**When** SSR/control, keyboard/screen-reader, state matrix, open-redirect, SSRF/DNS, every-hop, replay, unsupported Store, event-failure, mixed-version, canary, and rollback tests run
**Then** FR11 and applicable WCAG/security/privacy requirements pass
**And** there is no raw Store href fallback, mock resolver, placeholder destination, disabled policy, or unmeasured bypass path.

### Story 4.2: Measure Privacy-Bounded Outbound Clicks (FR16)

As a FilaTracker product operator,
I want deduplicated Outbound Click counts over time,
So that I can evaluate the product’s primary launch-success metric without tracking people.

**Acceptance Criteria:**

**Given** a `Ver na loja` activation
**When** event recording reaches ingest
**Then** the allowlisted versioned command stores exactly one event for its opaque event ID with Offer ID, Store ID, coarse recorded timestamp, contract version, and only approved operational provenance
**And** D1 uniqueness preserves idempotency through the full configured event-retention/retry horizon.

**Given** command timeout, duplicate delivery, queue/replay behavior, mixed versions, or transient D1 failure
**When** recording is retried only through an explicit approved idempotent path
**Then** at most one logical event is counted, poison/expired events are bounded and observable, and redirect success remains independent
**And** no generated replacement ID inflates counts.

**Given** analytics storage, logs, traces, request analytics, and platform sinks
**When** privacy controls are inspected
**Then** positive allowlists exclude raw query/referrer/destination URL, IP, full User-Agent, stable user/session/device/network identifiers, accounts, secrets, and unrelated payload
**And** configured retention, deletion, sampling/storage caps, safe shedding, and end-to-end purge verification pass before production.

**Given** an authorized operator requests SM-1 reporting
**When** bounded aggregate counts are calculated for an allowed time range
**Then** results count deduplicated Outbound Clicks without exposing event-level personal tracking data or a public analytics endpoint
**And** search/view diagnostics remain disabled by default and cannot become launch-success metrics.

**Given** abuse or event volume above configured budgets
**When** shedding/deduplication limits activate
**Then** public query and outbound navigation resources are protected, bounded telemetry reports loss/sampling honestly, and no unbounded write or retention path exists
**And** coverage or conversion claims cannot imply precision beyond recorded evidence.

**Given** release and privacy review
**When** idempotency, retention horizon, purge, authorization, limits, failure isolation, aggregate correctness, migration, N/N-1, rollback, and sink inspection tests run
**Then** FR16 is traceably satisfied and SM-1 is operationally countable
**And** no fake events, mock analytics backend, placeholder dashboard, dormant purge job, or undocumented data sink remains.

### Story 4.3: Activate Affiliate Disclosure Without Changing User Trust (FR12)

As an anonymous filament shopper,
I want clear disclosure when affiliate monetization is active,
So that I understand the commercial relationship while recognizing the merchant as seller.

**Acceptance Criteria:**

**Given** affiliates are disabled
**When** public surfaces and outbound destinations render
**Then** no active-affiliate claim or fabricated tag is shown, merchant-as-seller and Listing-Price trust copy remains accurate, and direct approved destination composition is used
**And** absence of monetization never changes ranking, Store eligibility, or Offer visibility.

**Given** an approved affiliate program is configured for a Store
**When** authorized production configuration activates it
**Then** encrypted Store-scoped parameters are composed server-side only after current destination resolution and cannot be supplied or overridden by the caller
**And** the final URL still passes the same every-hop destination policy and contains no secret material.

**Given** one or more active affiliate integrations
**When** ranking, detail, footer, and outbound-relevant trust surfaces render
**Then** approved pt-BR disclosure is clear, accessible, adjacent where legally required, and consistent at every breakpoint
**And** copy never calls FilaTracker the seller, a price owner, a checkout provider, or a guarantor and never hides frete/conditions caveats.

**Given** affiliate configuration is missing, invalid, expired, unsafe, or rolled back
**When** outbound resolves
**Then** policy either uses the reviewed non-affiliate destination or fails safely according to Store configuration, with an audited bounded error
**And** it never leaks configuration, generates a malformed destination, or blocks an otherwise safe direct link solely to preserve commission.

**Given** affiliate status changes during mixed deployment
**When** N/N-1 web/ingest versions serve pages and redirects
**Then** disclosure state and outbound composition remain contract-compatible and generation/config-consistent, with canary and immediate rollback
**And** cached dynamic disclosure or destination responses cannot outlive current configuration.

**Given** legal, accessibility, security, privacy, and regression review
**When** affiliate-off/on/per-Store/rollback scenarios run
**Then** FR12, trust copy, keyboard/screen-reader access, destination safety, event measurement, ranking neutrality, and disclosure evidence pass
**And** activation contains no placeholder disclosure, mock affiliate service, hardcoded secret/tag, or unfinished compliance path.

### Story 4.4: Launch and Operate the Complete Production Product (FR11, FR12, FR16)

As a FilaTracker stakeholder,
I want the complete product released with verified operational safeguards,
So that real users can rely on every defined capability in production.

**Acceptance Criteria:**

**Given** all stories across Epics 1–4
**When** requirements traceability is generated
**Then** FR1–FR17, NFR1–NFR16, AR1–AR30, and UX-DR1–UX-DR26 each map to implemented code, automated/manual evidence, an owner, and a production verification result
**And** any missing, partial, waived, mocked, disabled, or unverifiable item blocks launch.

**Given** the complete migration and two-Worker release
**When** production deployment executes
**Then** expand/migrate/additive-ingest-canary/web activation/verification/contraction ordering, separate identities, encrypted bindings, RPC capability, account binding audit, and immediate rollback follow approved runbooks
**And** web has no D1/queue/schedule/Store secret, local/CI has no production authority, and consumers preserve N/N-1 horizons.

**Given** all five Homologated Stores and production schedules
**When** launch readiness is evaluated
**Then** fixtures, current robots evidence, safe probes, capacity margins, active support state, recent authoritative/positive-only behavior, Store destinations, queue/DLQ, FTS, and coverage claims are verified
**And** fewer than five active Stores automatically pauses five-Store claims and invokes replacement policy rather than weakening homologation.

**Given** production-like traffic and failure injection
**When** performance/resilience tests run
**Then** search p95 <500 ms and detail LCP <2.5 s are evidenced, bounded overload returns typed non-cacheable responses, Store scrape failures remain isolated, dynamic pages remain atomic, and safe outbound remains available according to policy
**And** any target change requires explicit approved product/architecture revision rather than silent acceptance.

**Given** complete accessibility and UX validation
**When** manual and automated tests cover Home → Search/Browse → filters/results → Offer/Merge/history → outbound at desktop, tablet, mobile, keyboard, screen reader, zoom, reduced motion, and contrast settings
**Then** WCAG 2.1 AA and all canonical tokens, copy, components, states, breakpoints, density, no-image/no-logo/no-vitrine rules, and external-transition behavior pass
**And** mockup/Stitch conflicts cannot override `DESIGN.md` or `EXPERIENCE.md`.

**Given** adversarial security and privacy validation
**When** merchant injection, SSRF/open redirect/DNS rebinding, robots failure, decompression/parse/field/observation/log exhaustion, query/RPC abuse, authority escalation, secret scanning, telemetry inspection, retention expiry, and purge verification run
**Then** all boundaries fail safely, remain bounded, redact before emission, and preserve public availability where architecture permits
**And** no prohibited PII, payload, destination, credential, or public administration capability is found.

**Given** a restore, projection rebuild, FTS recreation, queue replay, Store replacement, key migration, and application rollback exercise
**When** the approved recovery runbook is executed
**Then** RPO/RTO, Time Travel/export, external recovery epoch, paused/resumed work, invariant validation, CAS fencing, old-delivery rejection, identity/lineage, corrected history, and prior-version compatibility meet approved targets
**And** every exercise leaves auditable evidence and a healthy canaried service.

**Given** production observability and ownership
**When** Store, run, queue, RPC, D1, FTS, outbound, privacy, performance, and availability thresholds are crossed
**Then** bounded allowlisted alerts reach named owners with runbooks, support/recovery actions are audited, retention/purge jobs are monitored, and launch metric SM-1 is countable
**And** no essential production operation depends on an undocumented manual query, personal credential, placeholder dashboard, or unavailable mock service.

**Given** final release approval
**When** the invariant gate, test suites, migrations, canary, smoke journeys using real published Offers, rollback, docs, legal copy, and operational handoff all pass
**Then** FilaTracker is a complete anonymous pt-BR/BRL production product covering five Homologated specialty Stores and every defined in-scope capability
**And** there are zero runtime stubs, mocks, fake data paths, TODO-only behavior, disabled gates, unresolved production-critical decisions, or deferred in-scope requirements.
