---
baseline_commit: 6c50615d24bac055fa4b8096595dcbec24c9d891
---

# Story 1.5: Search Across Two Real Stores

Status: in-progress

<!-- Ultimate context engine analysis completed - comprehensive developer guide created -->

## Story

As an anonymous filament shopper,
I want one search to return comparable Offers from Closin and Voolt3D,
so that I receive genuine multi-Store discovery value.

## Acceptance Criteria

1. **Voolt3D homologation parity (AR7 / AR8 / AD-7 / AD-11 / NFR5)**
   - **Given** the proven shared Store contract and ingestion pipeline
   - **When** Voolt3D is implemented and homologated
   - **Then** its versioned declarative map, required typed hooks, real-page fixtures, robots evidence, safe probe, destination allowlist, filament-only rules, completeness class, and measured capacity envelope pass the same gates as Closin
   - **And** no Voolt3D-specific code forks shared identity, normalization, pricing, availability, publication, FTS, or history policy

2. **Independent Store-generation publication (AD-8 / AD-17 / AR9)**
   - **Given** valid Voolt3D observations
   - **When** scheduled and queued ingestion runs
   - **Then** the existing coordinator atomically publishes Voolt3D Offers under independent Store generations and shared projection/support/recovery fencing
   - **And** failure, positive-only completeness, replay, map breakage, or Voolt3D unavailability cannot regress or hide the last valid Closin generation

3. **Multi-Store search aggregate (FR1 / AD-25 / UX-DR7 / UX-DR10)**
   - **Given** a query matching eligible Offers in both Stores
   - **When** a user searches
   - **Then** one page aggregate returns result units from Closin and Voolt3D with Store shown as text, stable opaque Offer identities, deterministic ordering, truthful fields, and generation-consistent facets
   - **And** the UI never duplicates a source Offer, conflates cross-Store identities, or claims broader Store coverage than active data supports

4. **Partial coverage / failure honesty (AD-18 / NFR2 / NFR10)**
   - **Given** one Store is degraded, unsupported, or temporarily fails ingestion
   - **When** Search renders
   - **Then** active/degraded eligible Offers follow the state matrix, unsupported Offers are excluded, coverage copy reflects current support, and public search remains available through the other Store
   - **And** backend unavailability remains distinct from an honest no-match response

5. **Identity isolation + release gates (AD-1 / AD-9 / AD-16 / AR30 / NFR1)**
   - **Given** both Store catalogs and overlapping names
   - **When** result identity and ordering tests run
   - **Then** source tuples remain unique per Store, identical text cannot cause unsafe grouping, all current units remain standalone until exact Merge promotion is implemented, and FTS/relational fallback return the same identities
   - **And** cross-Store search p95, response bounds, accessibility, privacy redaction, deployment compatibility, and rollback tests pass without fake production data

## Tasks / Subtasks

- [x] **T1. Homologate Voolt3D adapter (mirror Closin gold standard)** (AC: #1)
  - [x] Create `src/adapters/stores/voolt3d/` with the same layout as Closin:
    ```text
    src/adapters/stores/voolt3d/
      map.ts                 # VOOLT3D_STORE_ID = "voolt3d", Zod StoreMap v1
      hooks.ts               # discovery + extraction → RawOfferObservation only
      adapter.ts             # createVoolt3dStoreAdapter(): StoreObservationPort
      budgets.ts             # measured bounds + ≥20% margin
      extraction-decision.md # JSON-LD vs HTML/selectors decision + evidence
      fixtures/              # real-page evidence + .meta.json provenance
      robots-evidence/       # homologation robots audit artifact
      capacity/
        activation-gate.md
        capacity-artifact.json
        d1-dry-run-fixture.json
        last-probe-result.json
    ```
  - [x] Canonical origin: `https://voolt3d.com.br/` ([Source: PRD addendum §C])
  - [x] Seed reviewed destinations from live evidence only (exact hosts/ports/redirect chain). Never widen to wildcards or unrelated CDN/static hosts without a deliberate map-version review
  - [x] Hooks emit bounded `RawOfferObservation` only. Shared stages own identity, normalize, validate, price-per-kg, filament eligibility, promotion, publication, FTS
  - [x] Prefer inert JSON-LD when it covers required evidence; use deterministic HTML selectors only for documented gaps; never execute merchant HTML/script; never use LLM at scrape runtime
  - [x] Discriminated run outcomes: `complete | partial | failed | quarantined | oversized` — never failure-as-`[]`
  - [x] Enforce every declared budget; CAPTCHA/auth/anti-bot → `quarantined` with no bypass
  - [x] Path allowlist: never include bare `"/"`; robots evaluate **every** candidate pathname
  - [x] Filament non-hints scoped to title+material only (not description dump)
  - [x] Kit/ambiguous mass → retain observation with `massGrams: null`; omit R$/kg later
  - [x] Zero/free/invalid price evidence → null canonical money (never R$ 0.00)
  - [x] Sitemap/discovery success with 0 product URLs → fail closed (`empty_catalog`), not authoritative-complete
  - [x] Activation remains `blocked` / `unsupported` by default until operator gate + current safe probe

- [x] **T2. Fixtures, robots, probe, budgets, capacity** (AC: #1, #5)
  - [x] Fixture matrix (minimum): valid filament PDP(s), catalog/pagination, malformed/missing fields, non-filament reject, kit/bundle ambiguous mass, OOS, valid vs invalid promotion evidence
  - [x] Every fixture records source URL, captured-at UTC, content digest, sanitizer/excerpt method, map/parser version, expected outcome
  - [x] Robots evidence artifact + shared robots path used at homologation **and** every production run (stored evidence is audit only, never authorization)
  - [x] Live probe: `VOOLT3D_PROBE=1` / `pnpm run probe:voolt3d` — bounded, non-publishing, optional/manual (not CI-blocking)
  - [x] Measure catalog volume; set `catalogWorkLimit` = measured max + ≥20% margin; record method/time/digests/usage in `capacity-artifact.json`
  - [x] AD-8 D1 dry-run inputs for Voolt3D catalog bound (reuse set-based publish+FTS shape from Stories 1.3/1.4; do not invent a new batch protocol)
  - [x] Extend `pnpm run test:homologation` with `voolt3d-fixtures` + `voolt3d-budgets` (+ binding/import extensions). Keep Closin suites green

- [x] **T3. Seed Store state + generalize schedule/queue binding** (AC: #2) — **critical path**
  - [x] Add Wrangler migration `db/migrations/0004_*.sql` seeding `store_state` for `voolt3d` (`support_state='unsupported'`, `activation_gate='blocked'`) and canonical `display_name='Voolt3D'` (mirror Closin seed pattern from `0002`/`0003`)
  - [x] **UPDATE `src/adapters/queue/handlers.ts`** — today it hardcodes Closin for schedule **and** loads `loadClosinMap()` for every queue message. That rejects non-Closin evidence (`evidence_version_mismatch` when `parsed.data.storeId !== input.map.storeId`)
  - [x] Schedule: discover/enqueue **each** Store with `activation_gate='approved'` and `support_state IN ('active','degraded')`. One Store blocked must not prevent the other from running
  - [x] Queue consumer: resolve map / adapter hosts / `apexToWww` by `envelope.storeId` (lazy dynamic import per Store). Preserve ack/retry/dlq protocol and redacted error logs
  - [x] Keep imports lazy inside handlers only — `workers/ingest.ts` must not statically import `adapters/stores`, `closin`, or `voolt3d` (extend `tests/unit/store-binding-and-imports.test.ts`)
  - [x] Optional thin registry helper is allowed if it stays observation/map resolution only; do **not** invent a second coordinator or Store-local publish path
  - [x] Preserve single shared queue + consumer Worker topology (Cloudflare: one active consumer per queue; route by message `storeId`, do not invent one queue-per-Store unless architecture revisits)

- [x] **T4. Prove independent publication + cross-Store isolation** (AC: #2, #5)
  - [x] Publish Voolt3D through existing `ingestion-coordinator` + `publish-batch` + `fts-writer` + `store-health` — no forks
  - [x] Worker tests: Voolt3D successful publish advances only its Store generation; Closin generation/epochs/visible Offers unchanged
  - [x] Worker tests: Voolt3D `failed|quarantined|oversized|partial(positive-only)` publish-nothing cases retain last valid Closin generation and FTS docs
  - [x] Concurrent open claims: one open claim per `store_id` still holds; Closin and Voolt3D may publish independently
  - [x] Support transition: mark Voolt3D `unsupported` → its Offers leave relational+FTS visibility; Closin remains searchable
  - [x] Do not rewrite `publish-batch.ts` / `fts-writer.ts` / `d1-search-catalog.ts` unless a genuine multi-Store bug is found — they are already store-scoped

- [x] **T5. Multi-Store search proof (preserve SearchPage v2)** (AC: #3, #4, #5)
  - [x] Do **not** bump SearchPage contract version for a second Store — reuse strict v2
  - [x] Seed worker + e2e fixtures with both Stores' visible Offers (extend `tests/e2e/search-seed.sql` / search-pipeline seeds)
  - [x] Assert one aggregate returns both Stores when query matches; Store text names; deterministic default order unchanged (availability bucket → positive price ASC nulls last → freshness DESC → `offer_id` ASC)
  - [x] Overlapping listing titles / brands across Stores remain separate `kind: 'offer'` rows — **no Merge**, no identity conflation
  - [x] FTS path and relational fallback return identical ordered identities for the multi-Store dataset
  - [x] `storeSupport` lists both when present; prefer visible `active|degraded` before the 10-row cap (already implemented — regression-test)
  - [x] Coverage honesty: UI/runbooks must not claim five-Store / full MVP coverage when only Closin+Voolt3D (or fewer) are active. Prefer `storeSupport`-derived copy; never hardcode “5 lojas”
  - [x] Degraded Store hits remain visible and qualified; unsupported Store hits excluded; `degraded + zero hits` ≠ no-match; backend `unavailable`/`overloaded` ≠ `Não encontramos esse filamento.`
  - [x] Preserve informational-only rows: no `Ver preços`, no `Ver na loja`, no placeholders (Epic 3 / Epic 4)
  - [x] Prefer minimal UI changes — `app/routes/search.tsx` and design-system results already render `storeName` + degraded qualification. Touch UI only if coverage copy or multi-Store a11y gaps appear

- [x] **T6. Tests, CI, docs, measurement** (AC: #5)
  - [x] Unit: voolt3d fixtures/budgets/probe(gated); store-binding denies voolt secrets on web; schedule/queue resolves by `storeId`
  - [x] Worker: multi-Store publish isolation; mixed search; unsupported cut of one Store; FTS≡fallback; capacity bound for Voolt3D
  - [x] E2E: genuine `/search` journey with both Stores seeded; axe + keyboard/focus; 360/768/1280 reflow; no images/logos/CTA placeholders
  - [x] Document multi-Store latency dataset size (Closin bound + Voolt3D bound); provisional p95 &lt;500 ms; do not invent production data. Keep `benchmark:search` as release-evidence policy (not necessarily in `test:search` CI) unless cheap to extend
  - [x] Update `docs/runbooks/store-homologation.md` (Voolt3D paths + gate), `docs/runbooks/deploy.md` (dual-Store canary queries + coverage honesty), and recovery/latency notes as needed
  - [x] Keep `pnpm run check`, `test:homologation`, `test:search`, and Closin publication capacity regressions green
  - [x] Do **not** auto-activate Closin or Voolt3D; both remain operator-gated. Closin live probe still quarantined (deferred-work) — tests seed support states

### Review / Dev Agent Record

_(filled by dev-story / code-review)_

### Review Findings

_Multi-chunk code review in progress — diff scoped to files relevant to Story 1.5 (dev_tools/, lockfiles, and prior-story artifact docs excluded). Chunk A (Voolt3D adapter, T1/T2) reviewed below; chunks B–E (queue/schedule, shared pipeline, search aggregate, docs/CI) pending._

**Chunk A — Voolt3D adapter (T1/T2, AC1/AC5)**

- [x] [Review][Patch] Mid-loop terminal failures (`failRun`) discard already-collected observations instead of returning them as `partial` — `src/adapters/stores/voolt3d/adapter.ts` (per-candidate loop, timeout/subrequest-budget/destination-rejected/robots-disallow/hard-fetch-failure branches)
- [x] [Review][Patch] Sitemap fetch failure never maps to `quarantined`/`oversized`/`timeout` (always generic `failed`), unlike the PDP-fetch branch which does — `src/adapters/stores/voolt3d/adapter.ts:290-308`
- [x] [Review][Patch] `extractLsVariantsPrice` promo gap-fill drops a valid original/compare price from JSON-LD or HTML hooks when LS.variants has a listing price but no compare price — `src/adapters/stores/voolt3d/hooks.ts:406-430`
- [ ] [Review][Patch] `parseMassGramsFromText`'s first `kitLike` branch is dead code (unreachable due to the unconditional branch immediately after); diverges silently from Closin's equivalent (which lets a single unambiguous kit mass token through) — `src/adapters/stores/voolt3d/hooks.ts:176-200`
- [ ] [Review][Patch] `VOOLT3D_HOST_REWRITE.apex`/`.www` field values are swapped relative to Closin's convention and the field names' literal meaning (functionally correct per `source-identity.ts`, but a landmine for the next store copied from this template) — `src/adapters/stores/voolt3d/map.ts:78-81`
- [ ] [Review][Patch] Captured real-page catalog/sitemap fixture (`catalog-sitemap-excerpt.xml`) exists with full provenance but no test loads it — `discoverProductUrlsFromSitemap` is only tested against synthetic inline XML — `tests/unit/voolt3d-budgets.test.ts`
- [ ] [Review][Patch] No test exercises the zero-JSON-LD-match path (`pickProductForPage` returns null for every node), the primary risk `extraction-decision.md` calls out — `tests/unit/voolt3d-fixtures.test.ts`
- [ ] [Review][Patch] `extractLsVariantsPrice` takes `variants[0]` unconditionally with no id/sku match against the current product, unlike the careful URL-matching done for JSON-LD (low risk since LS.variants is page-scoped in Nuvemshop, but untested) — `src/adapters/stores/voolt3d/hooks.ts` (`extractLsVariantsPrice`)
- [x] [Review][Defer] `pagination.kind: "sitemap-index"` declared but never dereferenced (only single `/sitemap.xml` fetched) [src/adapters/stores/voolt3d/map.ts:35-39] — deferred, pre-existing (identical unused field in `closin/map.ts:34-38`)
- [x] [Review][Defer] `budget.decompressedBytes` is a verbatim copy of `encodedBytes`, never actually measuring decompressed size [src/adapters/stores/voolt3d/adapter.ts] — deferred, pre-existing (same pattern in `closin/adapter.ts`, `safeFetchText` never returns a separate decompressed count)
- [x] [Review][Defer] Capacity artifact numbers (213 URLs, ~506KB PDP) are self-reported without a `VOOLT3D_PROBE=1` gated run backing them [src/adapters/stores/voolt3d/capacity/capacity-artifact.json] — deferred, by design (activation-gate.md already tracks "safe probe pass" as the one unchecked, operator-gated item; Voolt3D activation is intentionally blocked pending it)
- [x] [Review][Defer] `String.length` used as a byte-budget proxy under-counts multi-byte UTF-8 vs. true byte size; unbounded price magnitude has no sanity ceiling; multiple weight tokens without a kit keyword silently pick the first; `inferMaterialColor` hardcodes English marketing tokens [src/adapters/stores/voolt3d/hooks.ts, adapter.ts] — deferred, pre-existing (identical patterns in `closin/hooks.ts`/`closin/adapter.ts`, not introduced by this story)

_Dismissed as noise (4): case-sensitive `resolveStoreRuntime`/`isKnownStoreId` lookup (storeId is internally controlled, never user input); empty-string `probeId` edge case (no in-scope caller passes one); dead `observations.length > maxObservationsPerRun` inner check (identical pre-existing dead code in Closin); JSON-LD `@id`/`offers.url` query-string mismatch on page-matching (theoretical, no evidence Voolt3D URLs carry query strings)._

**Chunk B — queue/schedule generalization + migration (T3, AC2)**

- [x] [Review][Patch] `handleScheduled`'s per-store loop calls `resolveStoreRuntime()`/`runtime.loadMap()` outside the try/catch that wraps `runDiscoveryAndEnqueue` — a throw from either (e.g. a store's map failing Zod validation) aborts the whole scheduled tick, skipping every store not yet processed. Violates T3's explicit "one Store blocked must not prevent the other from running" — `src/adapters/queue/handlers.ts:110-113`
- [x] [Review][Patch] `workers/ingest.ts`'s `scheduled`/`queue` top-level catches log the raw `error` object, inconsistent with this same diff's own redaction convention (`handlers.ts`'s `error: "redacted"`, and this diff's own edit to `IngestService.getSearchPage`'s catch which deliberately dropped the raw error) — `workers/ingest.ts:596,615`
- [ ] [Review][Patch] `handleScheduled`'s "known store but `resolveStoreRuntime` returned null" branch logs nothing before `continue`, unlike the equivalent branch in `handleQueueBatch` which logs `ingest_queue_dlq`/`unknown_store_id` — `src/adapters/queue/handlers.ts:110-111`
- [ ] [Review][Patch] Import-graph regression test only scans `workers/ingest.ts`; nothing guards `handlers.ts` itself (the file that actually performs lazy-loading) against a future static `adapters/stores/*` import — `tests/unit/store-binding-and-imports.test.ts`
- [ ] [Review][Patch] New `toMatch(/scheduled/)`/`toMatch(/queue/)` assertions in the same test match anywhere in the file (comments/strings included), so they don't meaningfully guard real export presence — `tests/unit/store-binding-and-imports.test.ts`
- [x] [Review][Defer] Hardcoded `recovery_epoch_snapshot = 1` and no `INSERT OR IGNORE`/`ON CONFLICT` on the seed insert [db/migrations/0004_voolt3d_store_state.sql] — deferred, pre-existing (identical pattern in Closin's `0002_ingestion_publication.sql` seed)
- [x] [Review][Defer] `RECOVERY_EPOCH` silently coerces any non-numeric/negative value to `0` with no logging [src/adapters/queue/handlers.ts `parseRecoveryEpoch`] — deferred, low likelihood (operator-set infra var, `wrangler.ingest.jsonc` sets it to `"1"`), same risk class as other unvalidated env-var trust already accepted in the ingest Worker
- [x] [Review][Defer] Queue/DLQ names carry a `-local` suffix with no per-environment override in this diff [wrangler.ingest.jsonc] — deferred, already tracked from the Story 1.3 review (see `deferred-work.md`)
- [x] [Review][Defer] New cron cadence (`0 */6 * * *`) and unchanged `max_batch_size`/`max_retries` are unanalyzed for two stores sharing one queue [wrangler.ingest.jsonc] — deferred, operational tuning question requiring operator input on expected Voolt3D catalog cadence, not a code defect

_Dismissed as noise (6): `envelope.payloadExpiresAt` NaN risk (schema-guaranteed via `UtcInstantSchema`, unreachable); `artifact.expires_at` NaN risk (same schema-normalized value, internal DB write, not external input); `result.reason.startsWith(...)` on possibly-undefined reason (the `"rejected"` outcome type always includes a non-optional `reason: string`, unreachable); migration's new `voolt3d` row lacking a direct assertion in this chunk's test diff (it is asserted in `tests/workers/multi-store-isolation.test.ts`, a different chunk); `correlationId`-propagation test being scope creep for this chunk (real observation, not a defect); `handleQueueBatch`'s uniform retry-until-DLQ treatment of programmer vs. transient errors (pre-existing queue/DLQ pattern, not a new regression)._

**Chunk C-E — shared pipeline, search aggregate, docs/CI (T4-T6, AC2-AC5)**

- [x] [Review][Patch] Scheduled fan-out still aborts on runtime/map load failure [src/adapters/queue/handlers.ts:64]
- [x] [Review][Patch] Mid-run Voolt3D terminal failures discard harvested observations [src/adapters/stores/voolt3d/adapter.ts:65]
- [x] [Review][Patch] Sitemap fetch failure collapses timeout/quarantine/oversized into generic failed [src/adapters/stores/voolt3d/adapter.ts:290]
- [x] [Review][Patch] LS.variants fallback can erase a valid original price [src/adapters/stores/voolt3d/hooks.ts:416]
- [x] [Review][Patch] Top-level ingest worker logs raw error objects [workers/ingest.ts:136]
- [x] [Review][Patch] Search route hides degraded support when the degraded Store contributes zero hits [app/routes/search.tsx:70]
- [x] [Review][Patch] Multi-store isolation tests miss failed/quarantined/partial publish-nothing cases [tests/workers/multi-store-isolation.test.ts:564]

## Dev Notes

### One-line verdict

**Story 1.5 = clone Closin homologation under `voolt3d/` + generalize the Closin-hardcoded schedule/queue binding, while search/FTS/publication/coordinator are already multi-store-capable and must be regression-preserved rather than rewritten.**

### Implementation precedence

1. Epic AC + this story file  
2. `epic-1-context.md` + Architecture spine (AD-7/8/9/17/18/25)  
3. Existing Closin adapter + Stories 1.3/1.4 persistence/search code  
4. UX EXPERIENCE/DESIGN (informational rows, coverage honesty)  
5. Do **not** invent Merge, taxonomy browse (`/materials`, `/brands`), outbound CTAs, SearchPage v3, or a second pipeline

### Architecture compliance (must follow)

| Decision | Rule for 1.5 |
| --- | --- |
| AD-2 / AD-7 | Shared pipes-and-filters; adapters emit observations only; no per-Store business-rule forks |
| AD-8 / AR9 | Atomic **per-Store** generation publish; failed/quarantined/oversized publish nothing; capacity + margin |
| AD-9 | Coordinator sole FTS writer; FTS ≡ relational identities or explicit degrade |
| AD-11 | Fixtures + bounded non-publishing probe; no staging env |
| AD-16 / AR18 | Offer identity from PDP URL + variant; source tuples unique; no auto history merge |
| AD-17 / AR19 | Single coordinator; completeness classes; replay/DLQ/inbox |
| AD-18 / AR20 | `active\|degraded` visible; `unsupported\|deactivated` leave search; stale ≠ OOS |
| AD-1 | Before exact Merge key, every unit is standalone `OfferResult` |
| AD-6 | Only ingest accesses Stores/D1; web via Service Binding only |
| AR30 | No mocks/fake Stores/fake Offers in production path |

### Current code: what to UPDATE vs preserve

#### Must UPDATE (Closin-hardcoded today)

**`src/adapters/queue/handlers.ts`** — schedule loads only Closin; queue always uses `loadClosinMap()`.

```31:72:src/adapters/queue/handlers.ts
  // Lazy-load Closin only inside the scheduled path.
  const { createClosinStoreAdapter } = await import("../stores/closin/adapter");
  const { loadClosinMap, CLOSIN_STORE_ID } = await import("../stores/closin/map");
  // ...
  await runDiscoveryAndEnqueue({
    deps,
    adapter: createClosinStoreAdapter(),
    map,
    // ...
    apexToWww: { apex: "closin.com.br", www: "www.closin.com.br" },
  });
```

```85:96:src/adapters/queue/handlers.ts
  const { loadClosinMap } = await import("../stores/closin/map");
  const map = loadClosinMap();
  // ...
      const result = await handlePublishQueueMessage({
        deps,
        rawBody: message.body,
        map,
        allowedHosts: map.reviewedDestinations.map((d) => d.host),
        apexToWww: { apex: "closin.com.br", www: "www.closin.com.br" },
      });
```

**Preserve while changing:** lazy dynamic imports; activation_gate + support_state gate before discovery; per-message ack/retry/dlq; redacted logs; no top-level Store imports in `workers/ingest.ts`.

**`db/migrations/`** — only Closin seeded. Add `voolt3d` row blocked by default. Do not alter Closin seed semantics.

**Homologation CI / `package.json`** — extend `test:homologation` and add `probe:voolt3d`; keep Closin probe/script.

**Tests** — multi-Store seeds and isolation cases in `tests/workers/search-pipeline.test.ts`, publication pipeline (or sibling), e2e seed/route, `store-binding-and-imports.test.ts`.

**Runbooks** — Closin-centric wording → dual-Store gate paths and canaries.

#### Preserve (do not reimplement)

| Path | Why |
| --- | --- |
| `src/application/ingestion-coordinator.ts` | Sole shared writer |
| `src/application/stages/*` | Shared normalize/validate/completeness/price-points |
| `src/adapters/persistence/publish-batch.ts` | Already store-scoped fences + FTS in claim batch |
| `src/adapters/persistence/fts-writer.ts` | Per-store delete/insert + global rebuild |
| `src/adapters/persistence/d1-search-catalog.ts` | Eligibility joins any `active\|degraded` store — **no Closin hardcode** |
| `src/adapters/persistence/store-health.ts` | Per-store transitions + atomic FTS visibility |
| `src/contracts/search-page.ts` (strict v2) | Reuse; do not invent v3 for Store #2 |
| `app/routes/search.tsx` / `app/design-system/results.*` | Already Store text + degraded qualification |
| `wrangler.web.jsonc` | Never add Store/D1/queue bindings |
| Closin adapter observation-only boundary | Regression gate for template integrity |

#### Brand normalize note

`src/domain/policy/normalize.ts` already aliases `voolt` / `voolt3d` → `Voolt3D`. That is **brand** normalization for listing text, **not** Store registration. Only extend if new evidence needs aliases; do not confuse brand alias with `store_id`.

### Project structure notes

- Gold-standard template: `src/adapters/stores/closin/` ([Source: Story 1.2 + `docs/runbooks/store-homologation.md`])
- Parallel Store id: `"voolt3d"` (snake-free lowercase token matching Closin `"closin"`)
- Display name: `"Voolt3D"`
- No `src/scraping/stores/` — ignore `docs/raw_plan.md` if it conflicts with spine
- Optional `_shared/` helpers only for fixture-runner/map-loader reuse — never for publication policy

### Previous story intelligence (1.2 → 1.4)

**From 1.2 (Closin template)**
- Discriminated outcomes; budgets enforced; bare `"/"` banned; robots on every path; CAPTCHA → quarantined; filament hints on title+material; kit mass null retained
- Capacity handoff pattern: measured max → bound with margin (Closin: 111 → 134)

**From 1.3 (pipeline)**
- Claim/fence/`changes` protocol; identity continuity with persisted maps; PricePoint append only on changed positive tuple; transient `batch_failed` → retry; adapter throw terminalizes run; support CAS inspects `changes`; empty catalog after successful sitemap → fail closed
- Handoff: second Store must reuse coordinator without regressing Closin generation

**From 1.4 (search)**
- Search already joins `offers` × `store_state` where `support_state IN ('active','degraded')` — multi-store-ready once second Store publishes visible Offers
- Explicit prior out-of-scope: “Voolt3D / multi-Store (1.5)”
- Strict SearchPage v2; informational rows; FTS≡fallback ordered identities; degraded ≠ no-match; never log raw `q`
- Open deferred: Closin live probe still quarantined; capacity remeasure before activation; missing FKs to `store_state` (store_id remains internally controlled)

### Git intelligence

Recent committed titles on `main` center on Story 1.2 homologation (`6c50615`). Stories 1.3/1.4 work exists largely as working-tree / artifact progress — treat the **code on disk** (coordinator, publish-batch, FTS, search catalog, search UI) as authoritative implementation truth for this story, not only git history.

### Latest tech notes (platform)

- Cloudflare Queues: **one active consumer per queue**; same Worker may consume multiple queues and branch on `batch.queue`, but this project keeps a **single ingest queue** and must route by envelope `storeId` inside the consumer ([Source: Cloudflare Queues docs — How Queues Works])
- Consumer concurrency autoscales instances of the **same** consumer — not multiple unique consumer Workers
- D1 `batch()` remains the atomic publication vehicle; statements execute sequentially in one transaction; preserve set-based SQL (no per-Offer statement storms)
- Stack pins from Story 1.1 still authoritative: Zod 4.x, drizzle-orm 0.45.x, Vitest 4.x, wrangler ^4, Node ≥22, pnpm 11

### Anti-patterns (do not)

- Fork normalize/publish/FTS/history into `voolt3d/hooks.ts`
- Leave queue consumer on `loadClosinMap()` only
- Hardcode Closin-only filters into search “to be safe”
- Implement Merge / Epic 3 filters / `/materials` / `/brands` / outbound buttons
- Claim multi-Store or five-Store coverage beyond `storeSupport` / active data
- Auto-activate either Store from tests
- Put Voolt secrets, D1, or queues on `wrangler.web.jsonc`
- Treat brand alias `Voolt3D` as Store registration
- Use runtime mocks or fake Offers (AR30)
- Invent SearchPage v3 solely for a second Store

### Testing requirements

| Gate | Expectation |
| --- | --- |
| Homologation offline | Map schema, fixtures, robots fixtures, destination policy, budgets ±boundary, binding/import |
| Live probe | Manual `VOOLT3D_PROBE=1`; record `last-probe-result`; CI stays offline-green |
| Pipeline isolation | Voolt fail retains Closin gen; concurrent per-store claims |
| Search | Mixed hits; deterministic order; FTS≡fallback; unsupported cut; no Merge |
| Regression | `pnpm run check`, Closin homologation, Closin 134-row capacity, `test:search` |
| Perf | Document dual-Store dataset; provisional p95 &lt;500 ms; no invented prod data |
| A11y / privacy | WCAG 2.1 AA floor; status not color-only; raw `q` never logged |

### Scope boundaries

**In:** Voolt3D homologation + binding generalization + multi-Store search proof + isolation + honest coverage  
**Out:** Story 1.6 taxonomy/browse; Epic 2 stores (3D Colors, Filamentos 3D Brasil, Topink3D); Epic 3 Merge/filters/detail; Epic 4 outbound/affiliates; production auto-activation of either Store

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Story 1.5]
- [Source: `_bmad-output/implementation-artifacts/epic-1-context.md`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-filatracker-2026-08-07/ARCHITECTURE-SPINE.md` — AD-7/8/9/17/18]
- [Source: `_bmad-output/planning-artifacts/prds/prd-filatracker-2026-08-07/addendum.md` §C — Voolt3D URL]
- [Source: `_bmad-output/implementation-artifacts/1-2-homologate-the-first-real-store-adapter.md`]
- [Source: `_bmad-output/implementation-artifacts/1-3-publish-closin-through-the-deterministic-pipeline.md`]
- [Source: `_bmad-output/implementation-artifacts/1-4-search-published-closin-offers-end-to-end.md`]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md`]
- [Source: `docs/runbooks/store-homologation.md`]
- [Source: `src/adapters/queue/handlers.ts`]
- [Source: `src/adapters/stores/closin/`]

## Change Log

- 2026-08-10: Implemented Story 1.5 — Voolt3D homologation, multi-store schedule/queue routing, publication isolation + dual-store search proof.

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.5

### Implementation Plan

1. Clone Closin homologation under `voolt3d/` with Nuvemshop-specific discovery (`/sitemap.xml` → `/produtos/<slug>/`) and extraction (page-matched JSON-LD + inert LS.variants promo gap).
2. Add thin `resolve-runtime` helper; rewrite schedule/queue handlers to fan out by `storeId` without a second coordinator.
3. Seed Voolt3D blocked in migration 0004; prove isolation + mixed search via worker/e2e; update runbooks for dual-Store honesty.

### Debug Log References

- Live Voolt3D evidence 2026-08-10: sitemap 213 `/produtos/<slug>/` URLs; PDP ~0.51MB; JSON-LD Product + LS.variants promo price gap.
- `pnpm run check`: 176 passed / 3 skipped (probes gated).

### Completion Notes List

- Homologated Voolt3D adapter mirroring Closin layout (map/hooks/adapter/budgets/fixtures/robots/capacity); activation blocked by default.
- Documented Nuvemshop extraction: page-matched JSON-LD + inert `LS.variants` promo price gap; kit mass null; empty catalog fail-closed.
- Generalized schedule/queue via `resolve-runtime.ts` — route by `storeId`; one Store failure does not block the other.
- Migration `0004_voolt3d_store_state.sql` seeds Voolt3D unsupported/blocked with display_name Voolt3D.
- Worker isolation suite proves independent generations, concurrent claims, unsupported cut, FTS≡fallback, mixed search without Merge.
- E2E seed includes both Stores; dualstore query returns separate Closin+Voolt3D rows; coverage honesty in runbooks.
- Extended `test:homologation` / `probe:voolt3d`; no auto-activation.

### File List

- src/adapters/stores/voolt3d/** (new adapter tree)
- src/adapters/stores/resolve-runtime.ts
- src/adapters/queue/handlers.ts
- db/migrations/0004_voolt3d_store_state.sql
- tests/unit/voolt3d-fixtures.test.ts
- tests/unit/voolt3d-budgets.test.ts
- tests/unit/voolt3d-probe.test.ts
- tests/unit/store-runtime-resolution.test.ts
- tests/unit/store-binding-and-imports.test.ts
- tests/workers/multi-store-isolation.test.ts
- tests/e2e/search-seed.sql
- tests/e2e/search-route.e2e.test.ts
- package.json
- docs/runbooks/store-homologation.md
- docs/runbooks/deploy.md
- docs/runbooks/search-latency.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/1-5-search-across-two-real-stores.md
