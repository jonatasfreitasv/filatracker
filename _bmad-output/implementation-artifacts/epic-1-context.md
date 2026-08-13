# Epic 1 Context: Find Real Filament Offers

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Deliver the first production-ready discovery slice for anonymous Brazilian filament shoppers: responsive free-text search and public Material Family and Brand browsing over real published Offers from at least two active Homologated Stores. The epic establishes the architecture, ingestion, taxonomy, and search needed for that journey. Rows are informational in this phase, with no `Ver preços`, `Ver na loja`, runtime mocks, placeholders, or fabricated data.

## Stories

- Story 1.1: Set Up the Initial Project from the Official Starter
- Story 1.2: Homologate the First Real Store Adapter
- Story 1.3: Publish Closin Through the Deterministic Pipeline
- Story 1.4: Search Published Closin Offers End to End
- Story 1.5: Search Across Two Real Stores
- Story 1.6: Discover by Material Family and Brand

## Requirements & Constraints

- Anonymous users must be able to submit bounded free-text searches over active/degraded Homologated Store Offers. Empty and no-match queries render an honest empty state, never an error or fabricated substitute.
- Completion requires real end-to-end publication and discovery from Closin and Voolt3D. Activation requires current robots evidence, filament-only extraction, a safe read-only probe, reviewed destinations, real-page fixtures, and measured headroom. CAPTCHA, authentication, policy ambiguity, blocking, or fetch failure fails closed without bypass.
- Material Family search includes every eligible child Specific Type while keeping Specific Type visible and narrowable. Public `/materials/:familySlug` and `/brands/:brandSlug` entry points use only validated, versioned taxonomy with durable reviewed aliases; fuzzy or AI/LLM classification is prohibited.
- Rows show Store text, brand and Specific Type when known, Listing Price, conditional R$/kg, availability, freshness, and known color/diameter. Unknowns remain null or omitted. Images, Store logos, accounts, deal rails, and non-filament products are excluded.
- Active and degraded Offers remain visibly qualified; unsupported and deactivated Store Offers are excluded. Staleness is derived independently after 48 hours. Only explicit out-of-stock evidence or authoritative-complete absence may mark an Offer unavailable; parser or scrape failure cannot do so.
- Backend overload or unavailability must produce a typed, non-cacheable 503 with `Retry-After`, not a false empty result. Dynamic pages cannot use cross-request caching. Search has a provisional production p95 target below 500 ms.
- Merchant content is bounded untrusted plain data. Enforce fetch, redirect, decompression, parse, field, observation, query, response, concurrency, duration, FTS, SSR, and log budgets. Never execute merchant HTML; redact raw queries, URLs, IPs, full user agents, secrets, and unrelated payloads from telemetry.
- Before the first release, each new contract starts at one strict initial version with no invented predecessor. After a version is released, later changes must pass N/N-1 compatibility alongside migration, Worker, authority, replay, database/FTS, limits, privacy, responsive, performance, and WCAG 2.1 AA verification. Production cannot depend on stubs, mock Stores, fake Offers, disabled gates, or TODO wiring.

## Technical Decisions

- Bootstrap from the official `create-cloudflare` React Router v8 SSR starter, preserving `workers/app.ts`, declared ranges, and lockfile authority. Use a hexagonal modular monolith and one deterministic shared ingestion pipeline.
- Deploy exactly two Workers from one codebase. Public `web` owns SSR and a typed Service Binding only; non-public `ingest` alone owns D1, Store access, queues, schedules, persistence, publication, and typed RPC. Local and CI identities must be unable to bind production resources or authority.
- D1 relational data is the sole transactional authority. Drizzle stays behind persistence ports; Wrangler migrations evolve schema, while reviewed explicit SQL owns FTS5 and publication. FTS is rebuildable, with one document per visible result unit and an identity-equivalent relational fallback.
- `src/contracts/` owns versioned Zod contracts and `src/domain/identity/` owns source identity. Use opaque IDs, explicit nulls, positive integer BRL centavos/grams, UTC instants, closed enums, per-request correlation IDs, and provenance. Offer identity derives from reviewed PDP URL plus merchant variant; incompatible histories cannot be conflated.
- Store adapters are versioned declarative maps plus narrowly typed hooks that emit bounded `RawOfferObservation` values. Shared stages exclusively own identity, normalization, taxonomy, eligibility, availability, pricing, history, and persistence policy.
- One coordinator owns run, Store-generation, publication, and projection state. A bounded set-based D1 transaction fences publication by Store/support generation and projection/recovery epoch. Runs are replay-safe; failed, quarantined, superseded, or oversized runs preserve the prior generation.
- Search and browse each use one generation-consistent aggregate RPC snapshot. Versioned `RpcOutcome<T>` responses expose exactly one of `ok`, `degraded`, `invalid`, `notFound`, `gone`, `overloaded`, or `unavailable`; web may retry an idempotent query at most once within budget.

## UX & Interaction Patterns

- The surface is responsive, pt-BR-only, BRL-only, anonymous, and mobile-strong. Its shell has the wordmark, global search, `Materiais`, and `Marcas`; Home is search-first with optional real Material Family chips.
- All routes consume the canonical `app/design-system/`. Use Hanken Grotesk for interface copy and JetBrains Mono for prices, R$/kg, weights, diameters, freshness, and table labels. Align BRL prices right.
- Results use dense semantic tables or compact rows: desktop uses a 1280 px container and roughly 3/9 filter/results layout, tablet uses a filter bar/drawer, and mobile uses 12 px margins with a filter sheet and semantic scroll or compact rows. Tables never become image cards.
- Use tonal layers and 1 px outlines, a 2 px visible focus ring, 4 px control radii, 2 px badge radii, and pills only for filter chips. Do not use shadows, gradients, glass effects, imagery, oversized heroes, or decorative status color.
- Loading uses skeleton rows without fake Offers. Status is textual and never color-only. The exact no-match copy is `Não encontramos esse filamento.`, followed only by suggestions backed by real published Material Families.
- Epic 1 rows are informational only. Do not render `Ver preços`, `Ver na loja`, disabled controls, or placeholders for either later action.

## Cross-Story Dependencies

Story 1.1 establishes the two-Worker boundary, contracts, schema, RPC outcomes, routes, design system, and empty-search behavior used by every later story. Story 1.2 proves Closin's adapter and activation evidence before Story 1.3 may publish it; Story 1.3 supplies the authoritative generation and FTS inputs consumed by Story 1.4. Story 1.5 must reuse the same adapter contract, coordinator, normalization, publication, and search semantics for Voolt3D without regressing Closin. Story 1.6 depends on validated published evidence from both Stores and closes the epic by adding durable taxonomy, browse aggregates, aliases, and the complete real-data journey.
