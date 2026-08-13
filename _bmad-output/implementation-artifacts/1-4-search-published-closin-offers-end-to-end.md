---
baseline_commit: 6c50615d24bac055fa4b8096595dcbec24c9d891
---

# Story 1.4: Search Published Closin Offers End to End

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an anonymous filament shopper,
I want to search the real Offers published from Closin,
so that I can discover available filament without visiting the Store catalog manually.

## Acceptance Criteria

1. **FTS write on visibility update (AR10 / AD-9)**
   - **Given** active/degraded Closin Offers published by Story 1.3 (planning text saying “Story 1.2” is a typo)
   - **When** the publication coordinator updates search visibility
   - **Then** it writes one versioned FTS5 document per visible standalone `OfferResult` using reviewed explicit SQL and the same eligibility, identity, normalization, and freshness rules as relational reads
   - **And** unsupported/deactivated, non-filament, quarantined, invalid, or unpublished observations cannot enter FTS

2. **`getSearchPage` page aggregate (AR23 / AR27 / AD-25)**
   - **Given** a valid bounded free-text query
   - **When** `getSearchPage` executes
   - **Then** one D1 snapshot returns a versioned page aggregate containing result discriminant, opaque identity, display fields, facets supported by the current slice, Store support, projection/support epochs, correlation ID, bounded cursor, and typed outcome
   - **And** no Drizzle type, raw merchant content, unbounded row set, generic SQL capability, or persistence authority crosses RPC

3. **SSR `/search?q=...` informational rows (UX-DR10 informational-only)**
   - **Given** search terms matching brand, Material Family, Specific Type, or Store listing title evidence
   - **When** the user submits `/search?q=...`
   - **Then** SSR renders only matching real Closin Offer rows with Store text name, brand/Specific Type where known, Listing Price, conditional R$/kg, availability, freshness, known color/diameter, and no image or logo
   - **And** unknown fields remain honest null/omitted states rather than inferred display values
   - **And** rows are informational-only: no `Ver preços` detail link or `Ver na loja` outbound control is rendered (Epic 3 / Epic 4), and no placeholder or disabled control stands in for them

4. **Honest no-match (UX-DR19)**
   - **Given** a query with no eligible published match
   - **When** Search renders
   - **Then** it shows `Não encontramos esse filamento.` and only real Material Family suggestions derived from published taxonomy
   - **And** it does not invent Offers, silently broaden into unrelated products, or expose quarantined/hidden data

5. **FTS fallback / degradation (AD-9)**
   - **Given** FTS is unavailable, stale during rebuild, or fails invariant validation
   - **When** search executes
   - **Then** the validated relational fallback returns equivalent result identities and parser semantics under the same bounds, or the service emits an explicit observed degraded/unavailable outcome
   - **And** no Offer can appear both standalone and Merged or disappear silently because a partial index was accepted

6. **Visibility matrix (AD-18)**
   - **Given** active, degraded, unsupported, or deactivated Store states and available, unavailable, unknown, or stale Offer states
   - **When** search visibility is evaluated
   - **Then** active/degraded Offers remain qualified and visible, unsupported/deactivated Offers are excluded, and stale composes independently with availability
   - **And** state transitions atomically update relational and FTS visibility under generation fencing

7. **Dense results UX (UX-DR2 / UX-DR7 / UX-DR18)**
   - **Given** desktop, tablet, and mobile users
   - **When** populated results render
   - **Then** the approved dense table/compact-row pattern, monospaced aligned figures, textual statuses, semantic headings/table structure, loading skeletons, keyboard operation, visible focus, and responsive overflow/reflow are applied
   - **And** no product card grid, image placeholder, Store logo, decorative promotion, or guarantee language appears

8. **Abuse / privacy bounds (AD-13 / AD-21)**
   - **Given** malformed, oversized, abusive, or expensive queries and cursors
   - **When** they reach the web or RPC boundary
   - **Then** schema validation, length/token/row/response/CPU/deadline/materialization limits, safe error copy, and abuse shedding prevent unbounded work
   - **And** raw query text is neither logged nor retained as analytics by default

9. **Generation consistency / failure honesty (AD-25 / NFR2 / NFR10)**
   - **Given** repeated reads during publication, Store-state transitions, or deployment
   - **When** Search is requested
   - **Then** every page is generation-consistent from one aggregate, dynamic responses are not cross-request cached, and mixed contract versions decode according to compatibility policy
   - **And** native exceptions, deadlines, overload, and unavailable states never become false empty results

10. **Release verification (AR30 / NFR1 / NFR3)**
    - **Given** production release verification
    - **When** search quality, security, performance, and accessibility suites run against real emulated D1/Workers and homologated fixtures
    - **Then** result identity, eligibility, FTS/fallback equivalence, state visibility, limits, injection handling, SSR, responsive behavior, WCAG 2.1 AA, and provisional p95 &lt;500 ms are measured and pass
    - **And** the deployed flow contains no runtime mock, fake Offer, placeholder query path, or deferred production wiring

## Tasks / Subtasks

- [x] **T1. Persist bounded listing evidence + implement an explicit SearchPage v2 contract** (AC: #2, #3, #8, #9)
  - [x] Carry `listingTitle` through `NormalizedOfferFacts` → `StagedOffer` → `staged_offers` → `offers`; source it only from v2 `titleEvidence`, canonicalize with NFKC/trim/whitespace collapse, reject controls, and enforce the existing 512-character evidence bound in Zod and SQL
  - [x] Treat listing title as bounded untrusted **plain text**, never raw merchant HTML. It may supply `SearchHit.title` and FTS terms only after normalization; React must render it as text, and tests must prove HTML-like input is escaped rather than interpreted
  - [x] Use `SEARCH_PAGE_CONTRACT_VERSION = 2` as the strict initial SearchPage wire because the product has no released predecessor; reject every other version and unknown object keys. Introduce N/N-1 only after the first released contract exists
  - [x] Deploy ingest before web and verify strict v2 end to end; there is no pre-launch v1 rollback target to retain
  - [x] Extend strict `SearchPageQuery` v2 with optional `cursor` and `limit` (default/max 50); reject unknown/repeated/malformed parameters and cap the encoded cursor at 1,024 UTF-8 bytes
  - [x] Extend `SearchHit` / `SearchPage` with:
    - `kind: offer|merge` preserved for architecture compatibility, while this story emits **only** `offer`
    - opaque Offer identity, bounded normalized title, brand, Material Family, color, diameter, mass, Listing Price, conditional R$/kg, Store ID/text name, availability enum, independent stale/freshness, and observation time
    - `nextCursor: string|null`, `hasNextPage`, bounded totals, at most 20 published Material Family suggestions, and at most 10 Store support summaries `{ storeId, displayName, supportState }`
  - [x] Do **not** expose current `offers.specific_type` (`filament|filament_kit|unknown`) as UX “Specific Type”; that field is product format/kind, not formulation such as PETG HF. Label it separately as `Formato` only if useful, omit `unknown`, and keep genuine `specificTypeLabel` null unless a reviewed deterministic subtype exists. Story 1.6 owns durable subtype taxonomy/aliases
  - [x] Replace/supersede `inStock` with `available|unavailable|unknown`; compute `stale` from the monotonic successfully published `observedAt`/`stale_after`, using one request evaluation instant
  - [x] Keep positive-centavos policy fail-closed: zero/free/invalid merchant prices remain null and are not displayed as R$ 0.00 without a separate architecture decision
  - [x] Derive R$/kg only from positive Listing Price and unambiguous net mass. A kit/bundle with ambiguous per-spool mass must omit R$/kg; never treat aggregate kit mass as a single spool
  - [x] Update `src/contracts/index.ts`, runtime decoders, and contract tests for v1/v2/unknown-version/unknown-key behavior

- [x] **T2. FTS5 schema, lifecycle metadata, and sole-writer transactions (AD-8 / AD-9 / AR10)** (AC: #1, #5, #6)
  - [x] Add Wrangler migration `db/migrations/0003_search_fts.sql` with bounded `listing_title`, canonical Store `display_name`, two fixed FTS5 slots (active/shadow), and `search_projection_meta` containing active slot, index/parser version, projection epoch, and a monotonically advanced search-write generation
  - [x] **Never** use SQLite FTS triggers — coordinator/persistence writes with reviewed explicit SQL only
  - [x] Use explicit set-based `DELETE` + `INSERT ... SELECT` for FTS maintenance; do not assume normal-table UPSERT semantics and do not add one FTS statement per Offer
  - [x] Extend `executePublicationBatch` so relational Offer visibility, active-slot FTS documents, and search-write generation commit in the same generation-fenced `db.batch([...])`; every new mutation must join the existing open publication claim and preserve all Story 1.3 claim/fence/`changes` ordering guarantees
  - [x] One FTS document per visible standalone OfferResult (Closin-only; Merge documents are Epic 3 — do not invent Merge rows)
  - [x] Index only approved normalized text: brand, Material Family, genuine subtype when available, and bounded listing title. Never index raw HTML, description payloads, or the internal product-kind token as if it were UX Specific Type
  - [x] **UPDATE `src/adapters/persistence/store-health.ts`:** one audited, generation-fenced support transition must atomically update Store state/generation, `projection_meta.support_epoch`, relational `offers.visible`, active FTS visibility, search-write generation, and audit. `active|degraded` restores eligible relational visibility and reindexes; `unsupported|deactivated` removes it. Stale/concurrent transitions roll back completely
  - [x] Shadow rebuild captures projection epoch + search-write generation, builds the inactive fixed slot from relational SoT, validates count and exact ordered identity set, and CAS-activates only if both values are unchanged. A concurrent publication/transition makes the build stale and it must be discarded/restarted (or explicitly caught up) before cutover
  - [x] Clean abandoned shadow data safely after failed validation/CAS; search reads only the metadata-selected active slot and never a partially built slot
  - [x] Re-run the Closin 134-row AD-8 capacity proof after adding FTS statements/bytes; record actual statement count, binds, SQL/staged bytes, duration, rollback, and margin
  - [x] D1 export does **not** support databases containing virtual tables: recovery/export tooling must drop FTS before export, recreate it after import/restore, rebuild from relational SoT under captured epochs, validate, CAS-activate, and only then resume traffic

- [x] **T3. One-snapshot `SearchCatalogPort`: FTS → hydrate → relational fallback** (AC: #2, #4, #5, #6, #8, #9)
  - [x] **UPDATE** `src/adapters/persistence/d1-search-catalog.ts` — stop returning always-empty hits
  - [x] Replace the split `getEpochs()` + `searchPublished()` port with one aggregate operation returning epochs, Store support, hits, count, suggestions, pagination, and qualification from one D1 single-statement or read-only `batch()` snapshot. If FTS fails and fallback starts a new snapshot, its own epochs must populate the response
  - [x] FTS returns opaque identities only; hydrate display fields from relational published Offers and canonical Store metadata inside that same snapshot. Never import/hardcode the Closin adapter/map in the search catalog
  - [x] Eligibility join: `offers.visible=1`, not tombstoned, Store `support_state IN ('active','degraded')`, Closin-only for this story’s fixtures (architecture must not hard-fork multi-store — filter by published data)
  - [x] Implement one canonical query tokenizer/grammar shared by FTS and fallback. Specify/test NFKC, pt-BR diacritics/case behavior, whitespace, punctuation, quotes, hyphens, `PLA+`, wildcard/operator escaping, at most 12 tokens, and AND/OR semantics; fallback must bind values and must not inherit raw `LIKE` wildcard semantics. If it wraps tokens in `LIKE`, cap each canonical token at 48 UTF-8 bytes so the escaped pattern plus `%` delimiters stays within D1's 50-byte pattern limit
  - [x] Use one deterministic default order for both paths and cursoring: availability bucket (`available`, `unknown`, `unavailable`), positive Listing Price ASC with null last, freshness/`observed_at` DESC, then `offer_id` ASC. Full user-selectable sort/filter chrome remains Story 3.2
  - [x] Encode a bounded opaque versioned cursor containing the last sort tuple plus canonical-query fingerprint, parser/index version, projection/support epoch, and search-write generation. Structurally validate it; query/epoch/version mismatch returns typed `invalid` with safe restart copy—never silently mixes pages
  - [x] Return `nextCursor|null` and `hasNextPage`; prove no duplicate/skipped identities across pages and reject oversized, malformed, repeated, or mismatched cursors
  - [x] Empty canonical query (`null`) is an invariant: it returns zero hits and keeps Home search-only. Cover absent `q`, `q=`, whitespace, and NFKC-to-empty; never dump the catalog and never classify these as 503
  - [x] No-match is **only** `ok` + zero hits. Material Family suggestions come from visible published `offers.material_family`, are deduplicated/sorted deterministically, and link to `/search?q=<label>`; do not invent Story 1.6 taxonomy records/slugs
  - [x] FTS fallback equivalence means identical parser behavior, eligibility, ordered identities/discriminants, pagination boundaries, facets/suggestions, and display hydration—not merely the same identity set. Otherwise return explicit `degraded`/`unavailable`
  - [x] Enforce configured caps: 120 query scalars, 512 query bytes, 12 tokens, 1,024 cursor bytes, 50 hits/page plus at most one lookahead row, 20 suggestions, 10 Store summaries, 256 KiB serialized aggregate, and the configured 2,000 ms end-to-end RPC deadline. Avoid materializing unbounded candidate rows; map D1/CPU/subrequest/capacity overload distinctly
  - [x] Search logging at all four layers (`get-search-page`, ingest RPC, Service Binding client, loader) may contain only an allowlisted error code + correlation ID. Never log the raw query, bound SQL args, arbitrary `Error.message`, stack, or error object

- [x] **T4. Application / RPC wiring** (AC: #2, #8, #9)
  - [x] Refactor `getSearchPage` to call the single aggregate port once; do not fetch epochs separately or compose snapshots in application code
  - [x] Strict-parse SearchPage v2 requests at `workers/ingest.ts` and decode v2/v1 outcomes at the Service Binding client; native parse/decode failures become safe typed outcomes without query/error leakage
  - [x] Keep `IngestService.getSearchPage` as the only public-data query method and preserve lazy Store/queue imports
  - [x] Preserve ≤1 idempotent retry within the total deadline. `retryAfterSeconds` is client-facing guidance propagated on the final 503; do not sleep for that full duration inside SSR, and test the two-attempt deadline budget
  - [x] Preserve all typed outcome rules. `degraded` always retains its qualification and data; `degraded + zero hits` must not be reclassified as honest no-match
  - [x] Preserve `Cache-Control: no-store` on Home/Search

- [x] **T5. Design system + SSR results UI** (AC: #3, #4, #7, #10)
  - [x] Add reusable dense results table / compact-row primitives under `app/design-system/` (tokens already exist) — no route-local design forks
  - [x] **UPDATE** `app/routes/search.tsx` to render real hit rows (today only shows a count / empty / degraded copy)
  - [x] Keep Home search-only. Close the Story 1.1 deferred item with the null-query invariant/test rather than adding a preview or catalog dump; `app/routes/home.tsx` changes only if needed to enforce an explicit impossible-state/failure path
  - [x] EmptyState: exact `Não encontramos esse filamento.` + Material Family suggestion chips/links only when suggestions are real published families (chips may link to `/search?q=...` for now — `/materials/:slug` is Story 1.6)
  - [x] Render `degraded` hits with the same rows plus visible qualification; degraded zero shows qualification/unavailable treatment, never `Não encontramos esse filamento.`
  - [x] Format BRL / R$/kg / mass / diameter / freshness with JetBrains Mono; use truthful pt-BR labels, textual availability + stale, and never label `filament`/`filament_kit` as Specific Type
  - [x] Place the approved frete/conditions disclaimer adjacent to populated results/ranking; do not claim “menor preço”, checkout total, guarantee, or “tempo real”
  - [x] LoadingRows skeletons already exist — wire consistently; never show fake Offer content
  - [x] Render merchant-derived strings as escaped text; no images/logos/cards/CTAs, and no `Ver preços`/`Ver na loja` placeholder

- [x] **T6. Tests, CI, docs, measurement** (AC: #10)
  - [x] Unit: strict v2/unknown contract decode; strict keys; cursor bounds/epoch/query binding; canonical tokenizer/escaping; kit R$/kg omission; visibility matrix; ordered FTS/fallback equivalence; sentinel raw-query redaction through every logging layer
  - [x] Worker integration with real migrated emulated D1: publish → active-slot FTS → aggregate RPC; transition active/degraded ↔ unsupported/reactivated; interleave publication/support transition with reads; fallback; rebuild validation/CAS rejection; injection/oversized input; empty vs no-match vs degraded vs unavailable
  - [x] Prove Story 1.4 emits only `offer` while preserving `offer|merge` decoding, and that stale uses one snapshot evaluation instant
  - [x] Add a genuine route/SSR browser test backed by seeded emulated D1/Workers, not only static HTML fixtures; cover populated and degraded-populated search, semantic table, keyboard/focus, axe, 360/768/1280 reflow, and no document overflow/images/logos/CTA placeholders
  - [x] Measure provisional p95 &lt;500 ms for FTS and fallback; document dataset size, runtime/device, warm-up, sample count, percentile calculation, result, and response/materialization limits
  - [x] Update `docs/runbooks/store-homologation.md`, `docs/runbooks/ingestion-recovery.md`, and `docs/runbooks/deploy.md`; pre-launch deploy order is migration → ingest v2 canary → real published-search/fallback verification → web v2 activation
  - [x] Update Story 1.3 capacity artifacts/tests with measured FTS batch cost and close the Home/money entries in `deferred-work.md` with the decisions above
  - [x] Keep `pnpm run check`, homologation, and pipeline suites green; add focused scripts if useful (`test:search`)

### Review Findings

- [x] [Review][Patch] Remove pre-launch SearchPage v1 compatibility and use v2 as the initial contract; introduce N/N-1 only after the first released version [src/contracts/search-page.ts:90] — product has not launched, so there is no deployed v1 consumer or rollback target to preserve.
- [x] [Review][Patch] Prevent concurrent FTS rebuild cleanup from clearing a slot that has become active [src/adapters/persistence/fts-writer.ts:226]
- [x] [Review][Patch] Make a stale Store-support CAS suppress every relational and FTS side effect [src/adapters/persistence/store-health.ts:128]
- [x] [Review][Patch] Fence publication and support-transition FTS writes to the active slot selected inside the atomic operation [src/adapters/persistence/publish-batch.ts:373]
- [x] [Review][Patch] Return epochs, support, suggestions, hits, totals, and hydration from one D1 snapshot [src/adapters/persistence/d1-search-catalog.ts:180]
- [x] [Review][Patch] Validate complete ordered FTS/fallback equivalence instead of accepting a non-empty partial index [src/adapters/persistence/d1-search-catalog.ts:477]
- [x] [Review][Patch] Implement mixed-direction keyset pagination explicitly for `observed_at DESC` [src/adapters/persistence/d1-search-catalog.ts:143]
- [x] [Review][Patch] Give FTS and relational fallback identical diacritic, punctuation, hyphen, `PLA+`, and token-boundary semantics [src/adapters/persistence/d1-search-catalog.ts:321]
- [x] [Review][Patch] Validate persisted index/parser versions and projection epoch before treating FTS as healthy [src/adapters/persistence/d1-search-catalog.ts:184]
- [x] [Review][Patch] Bind every staged row's run and Store identity to the publication claim [src/adapters/persistence/publish-batch.ts:197]
- [x] [Review][Patch] Catch post-build validation/CAS failures and clean only a still-inactive shadow slot [src/adapters/persistence/fts-writer.ts:180]
- [x] [Review][Patch] Strictly validate every cursor sort field, numeric bound, timestamp, identifier, and unknown key [src/adapters/persistence/search-cursor.ts:47]
- [x] [Review][Patch] Keep `totalCount` stable across cursor pages by counting the full matching set [src/adapters/persistence/d1-search-catalog.ts:343]
- [x] [Review][Patch] Bound the synthesized fallback hit title to the v2 contract limit [src/adapters/persistence/d1-search-catalog.ts:83]
- [x] [Review][Patch] Advance a cursor-bound generation when Store display metadata changes [src/adapters/persistence/store-health.ts:304]
- [x] [Review][Patch] Reject unsafe-integer price arithmetic before deriving R$/kg [src/domain/policy/price-per-kg.ts:40]
- [x] [Review][Patch] Enforce `hasNextPage === (nextCursor !== null)` in the SearchPage decoder [src/contracts/search-page.ts:177]
- [x] [Review][Patch] Render reachable next-page navigation and announce the stable result count [app/routes/search.tsx:64]
- [x] [Review][Patch] Preserve both query and cursor when retrying a failed continuation page [app/routes/search.tsx:133]
- [x] [Review][Patch] Visibly qualify hits from Stores whose support state is degraded [app/routes/search.tsx:64]
- [x] [Review][Patch] Remove per-row `Date.now()` freshness calculation and render deterministic freshness from the backend fact [app/design-system/results.tsx:26]
- [x] [Review][Patch] Give every compact mobile result value a visible semantic label [app/design-system/results.css:107]
- [x] [Review][Patch] Replace static `page.setContent` fixtures with a genuine `/search` browser journey through SSR, Service Binding, ingest Worker, and seeded emulated D1 [tests/e2e/search-route.e2e.test.ts:1]
- [x] [Review][Patch] Add an executable 134-row FTS/fallback benchmark with recorded raw samples and nearest-rank percentiles [docs/runbooks/search-latency.md:1]
- [x] [Review][Patch] Make the capacity proof calculate/assert statements, binds, bytes, duration, and rollback instead of trusting hand-recorded JSON [tests/workers/publication-pipeline.test.ts:399]
- [x] [Review][Patch] Install Chromium in CI and include the genuine route E2E in the focused search release gate [package.json:24]
- [x] [Review][Defer] Obtain a current successful production safe probe before activating Closin [src/adapters/stores/closin/capacity/activation-gate.md:13] — deferred, pre-existing external activation requirement
- [x] [Review][Patch] Treat punctuation-only `/search?q=!!!` as no-match (or invalid), not `empty-home` blank results [app/lib/search-loader.ts:147]
- [x] [Review][Patch] Replace Home empty copy that claims nothing is published when the catalog may already have Offers [app/routes/home.tsx:77]
- [x] [Review][Patch] Prefer visible `active|degraded` stores in the Store-support summary before applying the 10-row cap [src/adapters/persistence/d1-search-catalog.ts:142]
- [x] [Review][Patch] Enforce query scalar/UTF-8 bounds in the web loader before Service Binding RPC [app/lib/search-loader.ts:96]
- [x] [Review][Patch] Add a live SSR `/search` no-match journey to the release-gate e2e suite [tests/e2e/search-route.e2e.test.ts:1]
- [x] [Review][Patch] Canonicalize `nowIso` before persisting Store support transitions [src/adapters/persistence/store-health.ts:155]
- [x] [Review][Patch] Reject `listingPriceCentavos` above `MONEY_CENTAVOS_MAX` during normalize/validate publish [src/domain/policy/validate.ts:31]
- [x] [Review][Patch] Give past-end cursor pages an explicit empty/end state instead of orphan count-only UI [app/routes/search.tsx:126]
- [x] [Review][Patch] Bind page `limit` into the cursor payload / context so limit changes cannot reshuffle pages [src/adapters/persistence/search-cursor.ts:100]
- [x] [Review][Patch] Propagate remaining client deadline budget into ingest `getSearchPage` instead of always starting a fresh `RPC_DEADLINE_MS` window [src/adapters/service-binding/client.ts:49]
- [x] [Review][Defer] Client timeout cannot abort in-flight D1 `batch()` aggregate work [src/adapters/service-binding/client.ts:54] — deferred, pre-existing Cloudflare Workers/D1 cancellation limit
- [x] [Review][Defer] CI `test:search` does not run `benchmark:search` so provisional p95 evidence is not regression-gated [package.json:24] — deferred, pre-existing release-evidence policy choice
- [x] [Review][Defer] Checked-in latency evidence records `git.dirty: true` against baseline HEAD [docs/evidence/search-latency-134.json:27] — deferred, pre-existing measurement hygiene until a clean-tree recapture

## Dev Notes

### Implementation precedence

1. This story’s Acceptance Criteria + task guardrails
2. `ARCHITECTURE-SPINE.md` — **AD-1, AD-9, AD-10, AD-12, AD-13, AD-14, AD-15, AD-18, AD-21, AD-23, AD-25** (also AD-8 extension seam for FTS visibility in the same batch)
3. UX `DESIGN.md` / `EXPERIENCE.md` for dense table + empty copy
4. `docs/raw_plan.md` is **non-canonical**

### Scope reality check

| In scope | Out of scope (later) |
| --- | --- |
| FTS5 writer + shadow rebuild/CAS | Voolt3D / multi-Store (1.5) |
| Real `getSearchPage` hits over Closin | Material/Brand browse routes (1.6) |
| `/search` informational dense rows | Merge grouping / dual OfferResult→MergeResult (3.1) |
| Relational fallback + degraded honesty | Full filter/sort chrome (3.2) |
| Bounded cursor + abuse limits | `Ver preços` (3.3) |
| Material Family suggestions from published data | `Ver na loja` / `/out` (4.1) |

**Predecessor:** Story 1.3 published relational Offers/PricePoints/Store state. **Do not re-implement publication.** Extend the batch with FTS visibility.

### Critical code gaps the implementer must close

| Gap | Why it matters |
| --- | --- |
| `d1-search-catalog.ts` always returns `hits: []` | Story 1.3 intentionally preserved empty search — 1.4 owns real reads |
| `getSearchPage` reads epochs before calling `searchPublished` | Rows/facets can come from a different generation than the envelope — replace the split port with one aggregate snapshot |
| `transitionStoreSupport` changes only Store state/audit | AC6 requires atomic Store state + support epoch + relational/FTS visibility, including reactivation |
| `titleEvidence` not persisted on Offers | AC requires matching listing title — add bounded listing title through publish |
| `SearchHit.inStock: boolean \| null` | AD-18 availability is ternary + independent stale — extend contract |
| Search v1 “N-1” aliases the same schema and runtime boundaries do not decode strictly | Story 1.4 needs a real v2/v1 rollout and strict request/response validation |
| No `color` / cursor contract on SearchPage | AC requires color plus stable, epoch-bound pagination—not merely a cursor string |
| `store_state` has no canonical display name | Search must not hardcode/import Closin Store code; persist bounded generic Store metadata |
| `search.tsx` has no result rows | UI incomplete for FR-1 |
| Loader/Search discard `degraded` hits and can classify degraded-zero as no-match | Backend degradation must remain visible and must never become a false empty result |
| FTS absent from migrations | `0002_*.sql` explicitly deferred FTS to 1.4 |

### Architecture compliance (must follow)

| AD | Requirement for 1.4 |
| --- | --- |
| AD-1 | Search units are standalone `OfferResult` only until Merge exists; never emit fake Merge |
| AD-8 | FTS visibility updates share the publication `batch()` fences (staged AD-8 completion for FTS) |
| AD-9 | Coordinator sole FTS writer; explicit SQL; one doc/unit; shadow+CAS; equivalent fallback or explicit degrade |
| AD-10 | Drizzle stays in persistence; FTS/publication use reviewed SQL; strict initial v2 before launch, N/N-1 only after a released predecessor exists |
| AD-12 | Routes `/` + `/search`; no cross-request cache for dynamic search |
| AD-13 | Untrusted plain text; redact raw query; budgets on FTS/SSR |
| AD-15 | Contracts in `src/contracts/` only; money/mass/null rules |
| AD-18 | Visibility transitions atomically update relational + FTS + support epoch; 48h stale is independent of availability and evaluated once per page |
| AD-21 | Bounded RPC; no SQL escape hatch to web |
| AD-23 | Web has no D1; ingest owns D1 + `getSearchPage` |
| AD-25 | One persistence aggregate snapshot—not sequential epoch/search calls; typed outcomes; never false empty |

### Current code being modified — read before editing

| Path | Current state | This story |
| --- | --- | --- |
| `src/adapters/persistence/d1-search-catalog.ts` | Always empty hits; reads `projection_meta` | **UPDATE** — FTS + relational hydrate + fallback |
| `src/adapters/persistence/publish-batch.ts` | Relational Offer/PricePoint/CAS only | **UPDATE** — atomic FTS upsert/delete in same batch |
| `src/adapters/persistence/store-health.ts` | State/audit transition does not update Offer/FTS visibility or support epoch | **UPDATE** — atomic fenced state + epoch + relational/FTS cut/restore |
| `src/adapters/persistence/schema.ts` | Offers without listing title / FTS | **UPDATE** — listing title column(+meta); FTS not via Drizzle schema if virtual |
| `src/application/get-search-page.ts` | Reads epochs and results separately; may log native errors | **UPDATE** — one aggregate call, cursor/degraded, allowlisted logs |
| `src/application/ports.ts` | Split `getEpochs()` + `searchPublished(query)` | **UPDATE** — one page-snapshot aggregate port |
| `src/domain/search-query.ts` | NFKC/trim/limits | **EXTEND** — shared parser/grammar for FTS+fallback |
| `src/contracts/search-page.ts` | v1 hit with `inStock`; N-1 aliases v1; object schemas are not strict | **UPDATE** — strict v2 + real v1 decoder, cursor/color/support |
| `src/contracts/index.ts` | Exports v1 search contract | **UPDATE** — export explicit v2/v1 decoders/types |
| `src/contracts/offer.ts`, `src/application/stages/normalize-validate.ts` | Title evidence is dropped before staged Offer | **UPDATE** — carry bounded normalized title; preserve internal product-kind semantics |
| `app/routes/search.tsx` | Empty/count only | **UPDATE** — dense informational rows |
| `app/design-system/*` | Shell, Empty, Loading, SearchControl | **EXTEND** — Offer results table/rows |
| `app/lib/search-loader.ts` | Degraded-zero becomes no-match; degraded hits are not preserved by view logic | **UPDATE** — strict cursor params + degraded honesty |
| `app/routes/home.tsx` | Non-empty results branch is unreachable by intended null-query contract | **PRESERVE/guard** search-only Home; enforce impossible-state invariant, no preview |
| `src/adapters/service-binding/client.ts` | Typed at compile time but does not runtime-decode responses | **UPDATE** — v2/v1 decode + bounded retry deadline + safe logs |
| `workers/ingest.ts` | RPC accepts compile-time type without strict runtime parse | **UPDATE** request decode while preserving lazy schedule/queue imports |
| `wrangler.web.jsonc` | SB only | **PRESERVE** — never D1 |
| `db/migrations/` | `0001` meta, `0002` publication | **NEW** `0003` FTS (+ offer title column) |
| `docs/runbooks/store-homologation.md` | “search empty until 1.4” | **UPDATE** |
| `docs/runbooks/ingestion-recovery.md` | Relational recovery | **UPDATE** — FTS recreate/rebuild |
| `docs/runbooks/deploy.md` | Canary verifies the empty-search foundation | **UPDATE** — v1/v2 target-first real-search/fallback canary |
| Closin capacity artifacts/tests | Story 1.3 measurement predates FTS writes | **UPDATE** — regenerate measured 134-row proof |

### Target NEW / primary touch tree

```text
db/migrations/0003_search_fts.sql          # NEW — FTS5 + listing_title column
src/adapters/persistence/fts-*.ts          # NEW — explicit set-based writer/reader/rebuilder helpers
src/domain/search-query.ts                 # EXTEND — FTS grammar / escaping
app/design-system/…                        # EXTEND — ResultsTable / OfferRow (informational)
tests/unit/story-1-4-*.test.ts             # NEW
tests/workers/search-pipeline.test.ts      # NEW — publish→search e2e under pool-workers
tests/e2e/…                                # EXTEND — real SSR populated/degraded responsive + a11y flow
```

### Field mapping (prevent wrong UX / wrong schema)

| UX / AC label | Published source / decision | Display rule |
| --- | --- | --- |
| Store text name | Add bounded canonical `display_name` to generic Store metadata (`Closin` in seed), never Store-adapter import/hardcode | Always text; no logo |
| Brand | `offers.brand` | null → omit |
| Specific Type (UX) | Not represented honestly today; current `offers.specific_type` is product kind `filament\|filament_kit\|unknown` | Keep `specificTypeLabel` null unless a reviewed subtype exists; never label product kind as Specific Type |
| Format / product kind | Legacy `offers.specific_type` | Optional separate `Formato: filamento\|kit`; omit unknown |
| Material Family (match + suggestions) | `offers.materialFamily` | suggestions only from visible published values |
| Listing title (match/display) | Add NFKC/trim/collapse bounded plain text from observation `titleEvidence` | index and expose as escaped text; never raw HTML/description payload |
| Listing Price | `listing_price_centavos` | null → omit; mono BRL |
| R$/kg | positive price + unambiguous net mass only | omit for unknown mass and ambiguous kits/bundles; never infer per-spool mass |
| Availability | `availability` enum | textual; not boolean-only |
| Freshness / stale | monotonic successfully published `observedAt` + `stale_after` | evaluate against one request instant; `Atualizado há …` / stale marker; no “tempo real” |
| Color / diameter | `color`, `diameter_mm` | omit when null |

### Anti-patterns (will fail review / AR30)

| Do NOT | Why |
| --- | --- |
| FTS triggers syncing from Offers | AD-9 forbids triggers |
| Dual-write FTS outside publication/transition batch | Partial visibility / AD-8–9 |
| Per-Offer FTS statement fan-out | Regresses the bounded Story 1.3 batch; use set-based SQL and remeasure capacity |
| Treat FTS as SoT for price/availability | Relational tables remain authoritative |
| Return MergeResult or duplicate Offer as both Merge+Offer | Epic 3 / AD-1 |
| Call `getEpochs()` separately from result/facet reads | Envelope and page can describe different committed generations |
| Treat `filament\|filament_kit` as Specific Type | Product kind is not formulation taxonomy; PETG HF honesty would be broken |
| Accept/emit v2 without real v1 decoder and target-first rollout | Breaks mixed deployment/rollback |
| Cursor not bound to query/parser/epochs/order | Can skip, duplicate, or mix generations silently |
| Render `Ver preços` / `Ver na loja` placeholders | UX-DR10 sequencing |
| Card grid / images / Store logos | NFR16 / UX |
| Log raw query or arbitrary native error/message/stack | Search terms or bound SQL arguments may leak; allowlist code + correlation ID only |
| Map backend failure to empty no-match | NFR2 / AD-25 |
| Map `degraded + zero hits` to no-match | Partial/untrusted search cannot prove that no match exists |
| Cross-request cache dynamic search | AD-12 |
| Give web D1 or raw SQL | AD-23 |
| Invent brand/type/family/price/mass/suggestions | NFR7 |
| Claim multi-Store search done | Story 1.5 |
| Use AI/LLM for search ranking/normalize | Non-goal |
| New npm search engine (Meilisearch/etc.) | Architecture = D1 FTS5 |

### Previous story intelligence (1.3)

- Status **done**. Coordinator + guarded set-based `batch()` + queues + Store health exist.
- **Handoff:** relational Offers ready to project; FTS intentionally absent.
- Review closed many fencing patches — do not regress claim/fence/`changes` checks when inserting FTS statements into the batch.
- Capacity: Closin bound **134** rows with margin; FTS writes add statements — re-check batch statement/param budgets (100 bound params/query, 30s batch, set-based SQL).
- `titleEvidence`/`descriptionEvidence` exist on observation v2 and Closin hooks — pipeline currently does not persist title onto Offers.
- Keep ingest lazy-import + web binding-denial tests green.
- Activation gate may still be blocked in prod; tests should seed `active`/`degraded` Store state + visible Offers via fixtures, not assume live activation.

### Previous story intelligence (1.1 / 1.2)

- Empty-search honesty, `RpcOutcome`, Service Binding client, design-system Shell/Empty/Loading already ship.
- Reuse `normalizeSearchQuery`, `callGetSearchPage`, loader outcome mapping — extend, don’t rewrite.
- Stack pins unchanged unless strictly required: Zod **4.4.3**, drizzle-orm **0.45.2**, Vitest **4.1.10**, pool-workers **0.20.2**, wrangler **^4.119.0**, Node `>=22.22.0`, pnpm **11.20.0**.

### Git intelligence

| Commit | Relevance |
| --- | --- |
| Working tree (uncommitted 1.3) | Publication pipeline, schema `0002`, empty search preserved |
| `6c50615` | Story 1.2 Closin adapter homologation |
| `ccb56e0` | Story 1.1 two-Worker empty search foundation |

Prefer no new dependencies. FTS5 is built into D1/SQLite.

### Library / framework requirements

| Tech | Pin / note |
| --- | --- |
| D1 FTS5 | Supported SQLite extension (`fts5`, `fts5vocab`) — [Cloudflare D1 SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/) |
| Tokenizer | Use and document a reviewed `unicode61` configuration; prove pt-BR diacritic/case/punctuation behavior and exact fallback equivalence |
| Drizzle | Persistence only; **do not** model FTS virtual tables as normal Drizzle tables if that fights migrations — reviewed SQL is authoritative for FTS |
| Zod 4.4.3 | Use strict v2 request/response schemas plus an explicit strict v1 decoder; do not rely on default unknown-key stripping |
| React Router 8 SSR | Preserve `workers/app.ts`; loaders already call ingest RPC |
| Vitest pool-workers | Real D1 migration apply + publish + search e2e |

### Latest tech information (2026-08-09)

- D1 includes FTS5; use `CREATE VIRTUAL TABLE … USING fts5(...)`.
- Architecture forbids content-sync **triggers**; use application explicit INSERT/DELETE/rebuild SQL (content= external-content patterns that require triggers are a poor fit unless triggers are avoided via standalone/contentless docs owned by the writer).
- D1 export is unsupported while virtual tables exist. Operational export must drop FTS first; import/restore must recreate and rebuild it from relational SoT before resume ([Cloudflare D1 import/export limitation](https://developers.cloudflare.com/d1/best-practices/import-export-data/) + AD-24).
- D1 `batch()` still: sequential, rollback on statement error, zero-row conditional UPDATE is **not** an error — keep fence/`changes` protocol when adding FTS statements.
- Current relevant limits remain 100 bound parameters per statement, 100 KB SQL per statement, 50 bytes per `LIKE`/`GLOB` pattern, and 30 seconds for the entire batch; individual-statement limits apply inside `batch()` ([Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)).
- No dependency upgrades required for FTS.

### Testing requirements

| Gate | Requirement |
| --- | --- |
| Contracts | Strict v2 + explicit v1 decode; N-2/unknown keys rejected; `notFound`/`gone` remain illegal for `getSearchPage` |
| Snapshot | Epochs, Store support, rows, count, cursor, facets/suggestions come from one aggregate read; interleaving cannot mix generations |
| Cursor/order | Query/parser/index/epoch-bound cursor; total deterministic order; no duplicate/skip; malformed/stale cursor → `invalid` restart |
| FTS writer/rebuild | Publish visible Offer → one active doc; set-based writes; shadow count+ordered identity validation; concurrent-change CAS rejection; no triggers |
| Equivalence | Same fixtures → identical parser behavior, ordered identities, pagination, facets/suggestions, and hydrated DTOs |
| Visibility | active/degraded visible; unsupported/deactivated atomically cut; reactivation restores; stale+availability compose |
| Honesty | `unavailable\|overloaded\|degraded` never becomes no-match; exact no-match copy only for `ok` zero |
| Taxonomy/money | Product kind never labeled Specific Type; ambiguous kit mass never yields R$/kg; no invented price/type/family |
| Abuse | Query/token/cursor/page/response/materialization/CPU/deadline limits and operator injection are rejected or shed safely |
| Privacy | Sentinel raw `q` absent from logs/telemetry even when native errors contain it; merchant HTML-like title renders as text |
| UI/a11y | Real SSR populated + degraded rows; dense table; adjacent frete disclaimer; no CTAs; WCAG 2.1 AA across breakpoints |
| Perf/capacity | FTS and fallback p95 &lt;500 ms documented with method; regenerated 134-row publication/FTS capacity evidence |
| Regression | `/`, `/search`, absent/empty/whitespace q; binding-denial; lazy imports; homologation; pipeline; `pnpm run check` |

### Project Structure Notes

- Keep hexagonal layout: domain parser + application use case; FTS SQL only under `src/adapters/persistence/`.
- Do not create `src/search/` service outside existing ports, and do not add a third Worker.
- Closin adapter remains observation-only — no Store-local FTS.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Story 1.4]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-filatracker-2026-08-07/ARCHITECTURE-SPINE.md` — AD-1, AD-9, AD-12, AD-18, AD-25]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-filatracker-2026-08-07/DESIGN.md` / `EXPERIENCE.md`]
- [Source: `_bmad-output/implementation-artifacts/1-3-publish-closin-through-the-deterministic-pipeline.md` — handoff]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` — Home non-empty hits; money zero]
- [Source: `src/adapters/persistence/d1-search-catalog.ts`, `src/adapters/persistence/store-health.ts`, `src/application/get-search-page.ts`, `src/application/ports.ts`]
- [Source: `src/contracts/search-page.ts`, `src/contracts/offer.ts`, `src/application/stages/normalize-validate.ts`]
- [Source: `app/lib/search-loader.ts`, `app/routes/search.tsx`, `app/routes/home.tsx`, `src/adapters/service-binding/client.ts`, `workers/ingest.ts`]
- [Source: Cloudflare D1 SQL statements — FTS5 module support: https://developers.cloudflare.com/d1/sql-api/sql-statements/]
- [Source: Cloudflare D1 import/export limitations: https://developers.cloudflare.com/d1/best-practices/import-export-data/]
- [Source: Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/]

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.5

### Debug Log References

- FTS MATCH initially failed under JOIN alias form in Miniflare; fixed via subquery `offer_id IN (SELECT … MATCH ?)` and isolated FTS errors from relational count/fallback.
- `getSearchPage` snapshot narrowing required an explicit `switch` for TypeScript exhaustiveness after the aggregate port change.

### Completion Notes List

- Review hardening removed unreleased v1 compatibility: SearchPage **v2** is the strict initial wire; N/N-1 begins only after a first released predecessor exists.
- Added `0003_search_fts.sql` (dual FTS5 slots + `search_projection_meta` + `display_name`), set-based FTS writes inside publication claim batches, and atomic Store support ↔ visibility/FTS transitions.
- Replaced empty `d1-search-catalog` with one-snapshot aggregate (FTS → hydrate → relational fallback), opaque epoch-bound cursors, shared tokenizer, and allowlisted logging.
- Wired ingest RPC strict parse + Service Binding decode/retry; SSR dense `ResultsTable` with no CTAs/images; Home null-query invariant preserved.
- Tests: `test:search`, worker publish→FTS→search pipeline, e2e populated/degraded a11y fixtures; `pnpm run check` green. Provisional latency documented in `docs/runbooks/search-latency.md`.
- Release closure replaced static browser fixtures with an isolated 134-row live SSR/Service Binding/ingest/D1 journey, executable latency evidence, and actual batch/rollback instrumentation. Target-tier performance and the external safe probe remain unclaimed activation gates.

### File List

- `db/migrations/0003_search_fts.sql`
- `src/contracts/search-page.ts`
- `src/contracts/index.ts`
- `src/contracts/offer.ts`
- `src/domain/policy/listing-title.ts`
- `src/domain/policy/price-per-kg.ts`
- `src/domain/policy/normalize.ts`
- `src/domain/search-query.ts`
- `src/application/stages/normalize-validate.ts`
- `src/application/ports.ts`
- `src/application/get-search-page.ts`
- `src/adapters/persistence/schema.ts`
- `src/adapters/persistence/fts-writer.ts`
- `src/adapters/persistence/search-cursor.ts`
- `src/adapters/persistence/d1-search-catalog.ts`
- `src/adapters/persistence/publish-batch.ts`
- `src/adapters/persistence/store-health.ts`
- `src/adapters/service-binding/client.ts`
- `src/adapters/stores/closin/capacity/capacity-artifact.json`
- `workers/ingest.ts`
- `app/lib/search-loader.ts`
- `app/lib/search-error.ts`
- `app/lib/search-url.ts`
- `app/routes/search.tsx`
- `app/routes/home.tsx`
- `app/design-system/results.tsx`
- `app/design-system/results.css`
- `app/design-system/index.ts`
- `app/app.css`
- `tests/unit/story-1-4-contracts.test.ts`
- `tests/unit/get-search-page.test.ts`
- `tests/unit/contracts-and-bindings.test.ts`
- `tests/unit/rpc-client.test.ts`
- `tests/unit/story-1-3-contracts.test.ts`
- `tests/workers/search-pipeline.test.ts`
- `tests/workers/publication-pipeline.test.ts`
- `tests/e2e/fixtures.ts`
- `tests/e2e/live-app-harness.ts`
- `tests/e2e/search-seed.sql`
- `tests/e2e/search-route.e2e.test.ts`
- `tests/e2e/search-latency-benchmark.e2e.test.ts`
- `scripts/search-latency-benchmark.mjs`
- `docs/evidence/search-latency-134.json`
- `docs/runbooks/store-homologation.md`
- `docs/runbooks/ingestion-recovery.md`
- `docs/runbooks/deploy.md`
- `docs/runbooks/search-latency.md`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `package.json`
- `.github/workflows/ci.yml`
- `vite.config.ts`

## Change Log

- 2026-08-09: Ultimate context engine analysis completed — comprehensive developer guide created from epics, architecture, UX/PRD, Story 1.3 handoff, current code, and D1 FTS5 platform notes. Status → `ready-for-dev`.
- 2026-08-09: Context quality validation applied — clarified page-atomic persistence reads, Store transition visibility, SearchPage v2/v1 rollout, truthful subtype semantics, deterministic cursor/order, FTS shadow lifecycle/export recovery, degraded UX, privacy, capacity, and real SSR/performance gates. Status remains `ready-for-dev`.
- 2026-08-09: Implemented end-to-end published Closin search (FTS writer, SearchPage v2, dense SSR results, fallback honesty, tests/docs). Status → `review`.
- 2026-08-09: Final adversarial release-closure review resolved all local findings; live route, benchmark, capacity/rollback, pipeline, and full checks passed. Status → `done`; production safe probe and target-tier measurement remain activation gates.
- 2026-08-09: Completion-validation code review found 10 residual patches (punctuation no-match, Home copy, storeSupport ordering, loader bounds, live no-match e2e, nowIso canonicalize, money max, past-end UI, cursor limit bind, deadline propagation); all applied and `pnpm run test:search` green. Status remains `done`.
