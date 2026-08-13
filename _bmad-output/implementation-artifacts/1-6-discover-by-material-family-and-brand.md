---
baseline_commit: 3470f12e815f2cbf7a5984176fd297d8a87cf131
---

# Story 1.6: Discover by Material Family and Brand

Status: done

<!-- Ultimate context engine analysis completed - comprehensive developer guide created -->

## Story

As an anonymous filament shopper,
I want to search and browse by Material Family and Brand while seeing distinct Specific Types,
so that I can narrow discovery without confusing related filament formulations.

## Acceptance Criteria

1. **Durable taxonomy from validated mappings (FR2 / FR3 / AD-5 / AD-7 / AD-15)**
   - **Given** homologated Offer evidence from both active Stores
   - **When** deterministic taxonomy normalization runs
   - **Then** durable Material Family, formulation Specific Type, Brand, opaque ID, canonical slug, version, provenance, and reviewed alias records are persisted only from validated mappings
   - **And** PETG, PETG HF, Rapid PETG, PLA variants, ambiguous labels, and unknown values remain semantically distinct according to fixtures rather than fuzzy or AI matching

2. **Family-intent search + Specific Type facet (FR2 / AD-1 / AD-9 / AD-25)**
   - **Given** a Material Family query such as PETG
   - **When** `getSearchPage` resolves family intent
   - **Then** results include eligible Offers from all child Specific Types, each row exposes its Specific Type, and the aggregate provides a bounded Specific Type facet
   - **And** narrowing to one Specific Type excludes siblings without changing source identity or inventing a Merge

3. **Browse aggregates + alias redirects (FR3 / AR13 / AR14 / AD-12 / AD-25 / AR27)**
   - **Given** published Brand and Material Family records
   - **When** users open `/brands/:brandSlug` or `/materials/:familySlug`
   - **Then** `getBrowsePage` returns one versioned generation-consistent aggregate using the same visibility, ordering, pagination, result-unit, and failure semantics as Search
   - **And** unknown slugs return typed `notFound`, reviewed renames redirect permanently (HTTP 301) through durable aliases, and no open redirect or ambiguous alias is accepted

4. **Nav, Home chips, removable context (UX-DR3 / UX-DR4 / UX-DR5 / UX-DR6 / UX-DR19)**
   - **Given** Home and global navigation
   - **When** taxonomy data is available
   - **Then** Materiais, Marcas, and optional Home Material Family chips link to real browse results; active search/filter context is represented with removable semantic chips
   - **And** the surfaces remain comparison-oriented, with no educational bento, Store index, deal rail, images, or fabricated taxonomy suggestions

5. **Taxonomy/FTS version cutover (AD-5 / AD-9 / AR10)**
   - **Given** taxonomy or FTS version changes
   - **When** a new normalizer/key version is prepared
   - **Then** fixtures validate every published Offer in a shadow projection, reviewed aliases/lineage are recorded, and projection-epoch CAS makes the version public atomically
   - **And** mixed taxonomy versions, partial rebuilds, stale concurrent publications, or unreviewed semantic renames cannot become visible

6. **Browse accessibility (NFR3 / NFR9 / UX-DR25)**
   - **Given** keyboard, screen-reader, mobile, tablet, and desktop users
   - **When** they browse, search, select, remove, or clear taxonomy controls
   - **Then** controls have programmatic labels/state, visible focus, sufficient contrast, reflow/overflow behavior, and announced result changes consistent with WCAG 2.1 AA
   - **And** automated journey tests prove Home → family/brand browse → Search works with only real published Offers

7. **Epic 1 release verification (FR1 / FR2 / FR3 / AR16 / AR30 / NFR2 / NFR10)**
   - **Given** Epic 1 release verification
   - **When** all Story 1.x suites and production canary run
   - **Then** FR1, FR2, and FR3 are demonstrably satisfied across two real Homologated Stores, all migrations and contracts are rollout-compatible for the version that is actually deployed, and rollback restores the prior healthy version without data loss
   - **And** no runtime stub, mock Store, fake Offer, placeholder route, or incomplete design-system path remains
   - **And** Epic 1 sign-off stays blocked until both Stores have current successful safe probes, explicit operator approval, and any remaining deferred production gates are either closed or deliberately re-baselined with owner/date

## Tasks / Subtasks

- [x] **T1. Durable taxonomy schema + fixtures + normalize lookup** (AC: #1, #5)
  - [x] Add additive Wrangler migration `db/migrations/0005_taxonomy.sql` (do **not** rewrite 0001–0004):
    ```sql
    -- material_families (family_id PK, slug UNIQUE, label, taxonomy_version, provenance)
    -- specific_types    (formulation subtype; family_id FK; slug UNIQUE; NOT filament|kit)
    -- brands            (brand_id PK, slug UNIQUE, label, taxonomy_version, provenance)
    -- taxonomy_aliases  (alias_slug PK, kind IN ('family','specific_type','brand'),
    --                    target_id, reviewed CHECK (reviewed = 1))
    -- projection_meta   ADD COLUMN taxonomy_version INTEGER NOT NULL DEFAULT 1
    -- offers / staged_offers ADD nullable FKs:
    --   brand_id, material_family_id, formulation_specific_type_id
    ```
  - [x] Canonical slug grammar (lock this; do not bikeshed): `^[a-z0-9]+(?:-[a-z0-9]+)*$`, max 128, NFKC then ASCII fold. Examples: `petg`, `petg-hf`, `rapid-petg`, `pla`, `pla-plus`, `voolt3d`, `3d-fila`
  - [x] Seed reviewed records from current dictionaries **without collapsing subtypes**:
    - Families: PLA, PETG, ABS, ASA, TPU, PC, Nylon, PVA, HIPS, other
    - Formulation types (minimum fixtures): PLA, PLA+, PETG, PETG HF, Rapid PETG, PA6, PA12, plus one identity type per remaining family
    - Brands from `BRAND_ALIASES` in `normalize.ts` (`closin`→Closin, `voolt`/`voolt3d`→Voolt3D, …) unless new reviewed evidence explicitly introduces a different canonical Brand record
  - [x] **Do not** put canonical slugs in `taxonomy_aliases` as self-aliases (redirect loop). Aliases are old/alternate slugs only
  - [x] **Do not** insert ambiguous aliases. Ambiguous split of a previously public slug → `gone`, not a guessed 301
  - [x] UPDATE `src/domain/policy/normalize.ts`: bump `NORMALIZE_POLICY_VERSION` to **2**. Look up durable records (DB-backed at publish time; fixture maps are the reviewed source compiled into the seed). Stop collapsing `pla+`/`pla plus`→PLA-with-no-subtype and `pa6`/`pa12`→Nylon-with-no-subtype
  - [x] **KEEP** `normalizeSpecificType()` as product kind `filament | filament_kit | unknown` — that field feeds R$/kg + `standaloneOnly`. Add a **new** function (e.g. `normalizeFormulationSpecificType`) for PETG HF / Rapid PETG / PLA+
  - [x] Unknown/ambiguous evidence → explicit `null` (family, formulation type, brand). No fuzzy substring, no LLM, no “best guess”
  - [x] Domain fixtures under `src/domain/taxonomy/` (or `src/domain/policy/taxonomy-fixtures.ts`) covering: PETG vs PETG HF vs Rapid PETG; PLA vs PLA+; PA6 vs PA12 vs Nylon family; unknown; ambiguous kit/bundle; brand-alias text vs Store registration (`voolt3d` browse brand semantics must not be confused with `store_id`)

- [x] **T2. Publish path: persist ids, extend FTS document, remasure capacity** (AC: #1, #5)
  - [x] UPDATE `src/application/stages/normalize-validate.ts` to attach `brandId` / `materialFamilyId` / `formulationSpecificTypeId` (and denormalized labels) onto staged Offers. Keep product-kind `specificType` unchanged
  - [x] UPDATE `src/adapters/persistence/publish-batch.ts` `buildSearchDocument` inputs to include brand + family + **formulation** labels/aliases (not product-kind `filament`/`filament_kit`)
  - [x] UPDATE `src/adapters/persistence/schema.ts` + Drizzle types for new tables/columns. FTS remains reviewed SQL, not a Drizzle virtual table
  - [x] If taxonomy IDs travel through `StagedOffer`, explicitly update `src/contracts/offer.ts` + related decoders/tests; otherwise resolve them inside persistence/publication before DB write. Do **not** silently widen a strict versioned contract
  - [x] Remeasure AD-8 statement/bind/byte budgets after extra columns + FTS tokens (Closin 134 + Voolt3D bound). Do not invent production data
  - [x] Store adapters stay observation-only — no taxonomy forks in `closin/hooks.ts` or `voolt3d/hooks.ts`

- [x] **T3. Family-intent search + phased SearchPage evolution** (AC: #2)
  - [x] Rollout rule: follow `expand -> migrate -> additive consumer -> verify -> producer/web N`. For 1.6 that means: apply `0005`; add `getBrowsePage` + schema support on ingest; deploy web with browse callers and any decoder widening; only then emit widened SearchPage data / taxonomy cutover. If SearchPage v2 has not yet been a released predecessor, preserve the strict initial-wire discipline from Story 1.4 instead of assuming N/N-1 already exists
  - [x] Family-intent rule: after existing `tokenizeSearchQuery`, if the **entire** canonical query (joined tokens) exactly equals a family alias/label/slug, treat as family intent → filter by `material_family_id` (all children). `"PETG branco"` is ordinary AND text search, not family rollup. `"petg hf"` matching a specific-type alias is **type intent** (that type only)
  - [x] UPDATE `hydrateHit` — stop hardcoding `specificTypeLabel: null`. Fill from formulation taxonomy label only. Never copy `offers.specific_type` (`filament|kit`)
  - [x] UPDATE `suggestionsFrom` to read taxonomy tables (real `id`/`slug`/`label`), not `DISTINCT material_family` with `slug === label`
  - [x] SearchPage **v3** additive wire (only after v2 is a real predecessor; otherwise phase the same fields without breaking the initial strict wire):
    - `SEARCH_PAGE_CONTRACT_VERSION = 3`
    - Query: existing `q`/`cursor`/`limit` + optional `type` (formulation specific-type slug)
    - Page: existing fields + `brandSuggestions` (same `{id,slug,label}` shape, max 20) + `specificTypeFacet` (bounded `{slug,label,count}[]`, max 20; empty when not family/type intent)
    - `getSearchPage` still **must not** emit `notFound`/`gone`
  - [x] When v3 is used, web accepts `contractVersion` 2 **and** 3; v2 pages hydrate `brandSuggestions=[]` and `specificTypeFacet=[]`. Do **not** combine this with a same-step producer rollout that would strand older consumers
  - [x] Narrowing: `/search?q=PETG&type=petg-hf` excludes sibling types. Removing the type chip returns all children. Does **not** create a Merge
  - [x] UPDATE `app/lib/search-loader.ts` `parseSearchParams` allowed keys: `q`, `cursor`, `type`. Unknown/repeated params still → `invalid` / 400
  - [x] UPDATE `app/lib/search-url.ts` + search pagination `nextPageHref` to preserve `type` (and only `type`) across pages/retry. Do not drop family-intent narrowing on “Próxima página”
  - [x] UPDATE `app/lib/search-error.ts` so invalid/unavailable flows preserve `type` alongside `q` and `cursor`; retry/error surfaces must not widen results accidentally
  - [x] FTS and relational fallback return the **same ordered identities** for family-intent and type-narrowed queries, or explicit `degraded`
  - [x] UPDATE `src/adapters/persistence/search-cursor.ts`: cursor digest must include expanded intent + `type` + `taxonomy_version` so a mixed-version cursor is `invalid`

- [x] **T4. `getBrowsePage` + routes + 301/404/410** (AC: #3)
  - [x] NEW `src/contracts/browse-page.ts` — `BROWSE_PAGE_CONTRACT_VERSION = 1`, **no predecessor**
    - Query: `{ kind: "material" | "brand", slug, cursor?, limit?, type? }`
    - Page: entity `{ id, slug, label, kind }`, same `hits` as `SearchHit`, `specificTypeFacet`, `materialFamilySuggestions`, `brandSuggestions`, `storeSupport`, cursors, limits
    - Outcomes: `ok | degraded | invalid | notFound | gone | overloaded | unavailable` (browse **does** use `notFound`/`gone`)
  - [x] NEW `src/application/get-browse-page.ts` + `BrowseCatalogPort` mirroring `getSearchPage` (one snapshot, ≤1 idempotent retry, allowlisted logs, no raw slug/q in telemetry)
  - [x] NEW `src/adapters/persistence/d1-browse-catalog.ts` — reuse `ELIGIBLE_JOIN`, `ORDER_SQL`, `hydrateHit`, FTS/fallback, support query. Do **not** copy-paste a second eligibility matrix
  - [x] Add `IngestService.getBrowsePage` in `workers/ingest.ts` with the same deadline/`withDeadline`/unavailable mapping. Keep Store imports lazy; default `fetch` stays 404
  - [x] Clone `callGetBrowsePage` in `src/adapters/service-binding/client.ts` (≤1 retry, correlation check, 256KiB cap)
  - [x] **Deploy ingest (new RPC method) first**, then web callers — Cloudflare Service Binding rule: add method on callee, then caller
  - [x] `app/routes.ts`:
    ```ts
    route("search", "routes/search.tsx"),
    route("materials/:familySlug", "routes/materials.$familySlug.tsx"),
    route("brands/:brandSlug", "routes/brands.$brandSlug.tsx"),
    ```
    No `/materials` or `/brands` index. No `/stores`. No splat catch-all that could open-redirect
  - [x] NEW `app/lib/browse-loader.ts`: illegal slug characters (`/`, `..`, whitespace, `%2f`) → `invalid` (400). ASCII-lowercase then resolve: canonical → 200; reviewed alias → 301; unknown → 404; split/gone → 410. Location is an internal `/materials/…` or `/brands/…` path only — never a caller-supplied URL. `overloaded`/`unavailable` → 503 + `Retry-After`; `Cache-Control: no-store`
  - [x] Alias 301 target is always the **canonical slug of the same kind**. Reject any alias whose target is external, a different kind, or another alias (no hop chains). Max 1 hop
  - [x] Zero-hit browse of a **known** slug is `ok` + empty state `Não encontramos esse filamento.` — **not** 404 and **not** 503
  - [x] Browse pages reuse `ResultsTable` / `OfferRow` / `EmptyState` / `LoadingRows` / `QualificationBanner`. Informational rows only: no `Ver preços`, no `Ver na loja`, no `VER`, no placeholders

- [x] **T5. Shell nav, Home chips, removable context chips** (AC: #4, #6)
  - [x] UPDATE `Shell` to render `<nav aria-label="Navegação principal">` with **Materiais** and **Marcas** only when the page aggregate supplies real published entities. Each item is a disclosure or list of links to `/materials/:slug` / `/brands/:slug` — never `#`, never disabled, never a bento index
  - [x] When a list is empty, **omit that nav item** (same honesty as omitting Home chips)
  - [x] `aria-current="page"` on the active family/brand link
  - [x] Home: render `SuggestionChips` from `materialFamilySuggestions` when non-empty; href `/materials/${slug}` (not `/search?q=`). No “Acesso Rápido”, no hardcoded PLA/PETG/ASA set, no pulse chrome
  - [x] UPDATE `SuggestionChips` default href to `/materials/${slug}`
  - [x] Active context chips must reflect the surface that owns the scope: on browse pages show family/brand scope plus Specific Type narrowing when present; on `/search` show free-text `q` and Specific Type narrowing. Each chip has an accessible name including facet + value + remove action (not a naked “×”)
  - [x] Removing a chip widens results (type chip → all children; browse family/brand chip → nearest unscoped browse/search surface defined by the page, not an undeclared Search brand parameter). Announce count via existing `role="status"` `aria-live="polite"`
  - [x] Flip `tests/unit/a11y-responsive.test.ts` “omits Materiais/Marcas until Story 1.6” → nav exists, is labeled, and is not dead
  - [x] **UX-DR26:** do **not** implement `mockups/browse-materials.html` / Stitch materiais (educational “Catálogo Técnico”, difficulty meters, temps, SKU counters, blur orbs). Brand browse has **no mock** — same dense Offer table, no logo wall

- [x] **T6. Taxonomy/FTS shadow + CAS cutover** (AC: #5)
  - [x] Reuse `rebuildSearchFtsShadow` lease/CAS pattern in `fts-writer.ts` — do **not** invent a second coordinator
  - [x] New taxonomy version: rebuild every published Offer’s taxonomy assignment + FTS docs in a shadow; fixture-validate; CAS `projection_epoch` **and** `taxonomy_version` together so mixed versions never become public
  - [x] Concurrent publication during rebuild follows existing catch-up/stale-rebuild rules (AD-9)
  - [x] Unreviewed rename/split cannot cut over. One-to-one reviewed rename → survivor ID + alias 301. Split → new IDs + old slug `gone`
  - [x] Ingestion stays on the old `normalizePolicyVersion` until CAS succeeds

- [x] **T7. Tests, CI, docs, Epic 1 close** (AC: #6, #7)
  - [x] Unit: taxonomy fixtures (PETG≠PETG HF≠Rapid PETG; PLA≠PLA+); alias 301 vs ambiguous gone vs unknown 404; slug grammar; no fuzzy; product-kind never shown as Specific Type; SearchPage v2|v3 decode; BrowsePage v1 `notFound`/`gone` illegal for search
  - [x] Worker: publish both Stores → family browse includes children; type narrow excludes siblings; FTS≡fallback identities; unsupported Store cut still hides that Store on browse; taxonomy CAS rejects mixed version; family-intent `q=PETG` matches `/materials/petg` identities
  - [x] E2E: seed taxonomy + at least one PETG HF row distinct from generic PETG; Home chip → `/materials/petg`; Marcas → `/brands/voolt3d` (or seeded brand); Search family-intent; chip remove; axe + keyboard/focus; 360/768/1280; no images/logos/CTA placeholders
  - [x] Extend `pnpm run test:search` or add `test:browse` and include it in `check`. Keep `test:homologation`, `test:pipeline`, Closin 134-row capacity green
  - [x] Runbooks: ingest-first canary for `getBrowsePage`; taxonomy+FTS rebuild on restore; coverage honesty still forbids “5 lojas”
  - [x] Epic 1 close checklist: FR1/FR2/FR3 evidenced; no leftover `/search?q=<label>` chip hack; no dead Materiais/Marcas; no runtime stubs; N/N-1 SearchPage v2 decoder retained; rollback note for 0005

## Dev Notes

### Review Findings

- [x] [Review][Patch] Taxonomy shadow cutover mutates live `offers` rows before CAS, so a failed activation can leak new taxonomy assignments and `search_text` without an atomic version switch [`src/adapters/persistence/fts-writer.ts:394`]
- [x] [Review][Patch] Shadow taxonomy rebuild cannot recover reviewed formulation subtypes for pre-1.6 offers and instead falls back null rows to the family slug, collapsing distinctions like PETG HF or PLA+ after rebuild [`src/adapters/persistence/fts-writer.ts:401`]
- [x] [Review][Patch] Taxonomy/FTS rebuild rewrites `search_text` without reviewed alias tokens, breaking alias-based search until affected offers are republished [`src/adapters/persistence/fts-writer.ts:417`]
- [x] [Review][Patch] Type-intent searches build `specificTypeFacet` from the whole catalog because exact type intent never binds the matched family scope [`src/adapters/persistence/d1-search-catalog.ts:279`]
- [x] [Review][Patch] Removing the free-text chip navigates to `/search?type=...`, but the loader canonicalizes that valid type-only state back to `/`, dropping the active narrowing [`app/lib/search-loader.ts:124`]

### One-line verdict

**Story 1.6 = persist reviewed taxonomy (family / formulation type / brand + slugs/aliases) + family-intent search + `getBrowsePage` on `/materials/:familySlug` and `/brands/:brandSlug`, while search/FTS/publication stay shared and Epic 1 rows stay informational.**

### Implementation precedence

1. Epic AC + this story file
2. `epic-1-context.md` + Architecture spine (AD-5/9/12/15/18/25)
3. Existing SearchPage v2 + `d1-search-catalog` + `fts-writer` + `ResultsTable`
4. UX EXPERIENCE/DESIGN (**override** mockups — browse-materials.html is an anti-mock)
5. Do **not** invent Merge, full FR-4 filters, outbound CTAs, `/stores`, Offer contract v2, or a second pipeline

### Footgun #1 — product kind ≠ Specific Type

`offers.specific_type` / `normalizeSpecificType()` is **product format**: `filament | filament_kit | unknown`. It already drives `derivePricePerKgCentavos` and `standaloneOnly`.

UX Specific Type is **formulation**: PETG, PETG HF, Rapid PETG, PLA+. Story 1.4 left `specificTypeLabel: null` on purpose and forbade showing product kind as “Tipo específico”.

If you assign `filament` to `specificTypeLabel`, FR2/FR9 honesty is dead.

### Footgun #2 — current dictionaries collapse subtypes

Today `pla+`/`pla plus` → family `PLA` with no subtype, and `pa6`/`pa12` → family `Nylon` with no subtype. That **violates** this story. Version 2 must persist a child Specific Type. Family search “PLA” still includes PLA+; narrowing to `pla-plus` excludes generic PLA.

### Footgun #3 — brand alias ≠ Store id

Current code maps `voolt` and `voolt3d` brand evidence to canonical brand **Voolt3D**. That does **not** make `store_id = "voolt3d"` a browse entity or Store index. Marcas browse is filament brand, not `/stores` (UX-DR3).

### Architecture compliance (must follow)

| Decision | Rule for 1.6 |
| --- | --- |
| AD-1 | Result units stay standalone `OfferResult` until Epic 3 Merge. Family membership must not merge PETG + PETG HF |
| AD-2 / AD-7 | Taxonomy policy in domain + shared stages. Store maps emit observations only |
| AD-4 / AD-9 / AR10 | D1 is truth; FTS is a rebuildable projection; coordinator/publication remains the **sole FTS writer**; one doc per visible unit; fallback ≡ identities or explicit `degraded` |
| AD-5 | Mixed normalizer/taxonomy versions never public; shadow all published Offers; reviewed lineage; projection-epoch CAS |
| AD-12 / AR13 / AR14 | Routes `/materials/:familySlug`, `/brands/:brandSlug`; opaque IDs + durable unique slug aliases + 301 rename; no `/stores`; no cross-request cache |
| AD-13 | Alias Location is internal-only. No caller-selected redirect target. Merchant HTML stays escaped plain text |
| AD-15 / AR17 | Versioned Zod in `src/contracts/`. Explicit nulls. New BrowsePage v1 (no predecessor). Any SearchPage v3 step must respect the actual released-predecessor horizon |
| AD-18 | Browse is a search/coverage surface: `active\|degraded` visible; `unsupported\|deactivated` excluded; stale ≠ OOS |
| AD-21 / AD-23 | `getBrowsePage` is a page-query only. No admin/taxonomy-mutation RPC |
| AD-25 / AR27 | One aggregate per page. Browse outcomes include `notFound`/`gone`. Overload → 503 + `Retry-After`, **never** empty browse |
| AD-6 | Web never binds D1. Browse reads via Service Binding only |
| AR30 | No mocks, fake Offers, placeholder routes, or “wire later” nav |

### Current code: what to UPDATE vs preserve

#### Must UPDATE

**`src/domain/policy/normalize.ts`** — in-memory maps; `NORMALIZE_POLICY_VERSION = 1`; collapses PLA+/PA6; `normalizeSpecificType` is product kind. File already says “Story 1.6 still owns durable browse taxonomy”.

**`src/application/stages/normalize-validate.ts`** — copies string brand/family/product-kind onto staged Offers. Attach taxonomy ids.

**`src/adapters/persistence/d1-search-catalog.ts`** — `hydrateHit` sets `specificTypeLabel: null`; `suggestionsFrom` uses `slug === label`; no family-intent path.

**`src/adapters/persistence/publish-batch.ts`** — `buildSearchDocument([brand, materialFamily, listingTitle])` omits formulation tokens.

**`src/contracts/search-page.ts`** — v2 frozen by 1.4/1.5. Additive v3 + keep v2 decoder. Comment on `MaterialFamilySuggestion.slug` still says “until Story 1.6 slugs exist”.

**`src/contracts/offer.ts`** — `StagedOfferSchema` is strict and versioned. If taxonomy IDs ride the staged contract, update it deliberately and cover decoder/tests.

**`src/contracts/index.ts`** — new `browse-page` exports and any additive search contract exports must be re-exported through the barrel used by web/worker/tests.

**`src/application/ports.ts` / `get-search-page.ts`** — add browse port; family-intent lives in catalog, not a second RPC compose.

**`workers/ingest.ts`** — only `getSearchPage` today. Add `getBrowsePage` with identical deadline/redaction. Preserve lazy `scheduled`/`queue`.

**`src/adapters/service-binding/client.ts`** — clone browse client; extend `IngestServiceBinding`.

**`app/routes.ts`** — only `/` and `/search`.

**`app/routes/home.tsx`** — ignores `materialFamilySuggestions`. Add real chips. Keep null-query invariant (Home is not a catalog dump).

**`app/routes/search.tsx`** — chips → `/search?q=label`. Point at `/materials/:slug`; render type chips + `specificTypeLabel`.

**`app/lib/search-loader.ts`** — allow `type`; do not treat unknown slug logic here (that’s browse).

**`app/lib/search-error.ts` / `app/lib/search-url.ts`** — preserve `type` across invalid/unavailable/retry flows so narrowing survives pagination and retry.

**`src/adapters/persistence/search-cursor.ts`** — bind cursor context to expanded intent + `type` + `taxonomy_version`; mixed-version cursors must fail closed.

**`app/design-system/components.tsx`** — Shell is wordmark + search only. Add real nav from aggregate data.

**`app/design-system/results.tsx`** — `SuggestionChips` href hack; `OfferRow` already shows `specificTypeLabel` as “Tipo específico” when non-null.

**`tests/unit/a11y-responsive.test.ts`** — currently **forbids** Materiais/Marcas strings.

**`tests/e2e/search-seed.sql`** — brands `"Marca de teste"` / `"Voolt3D"`; families PLA/PETG only; `specific_type` is `filament`. Add taxonomy rows + at least one PETG HF vs PETG pair.

**`package.json`** — extend `test:search` or add `test:browse`.

#### Preserve (do not reimplement)

| Path | Why |
| --- | --- |
| `src/application/ingestion-coordinator.ts` | Sole writer; taxonomy cutover is extra CAS, not a second coordinator |
| `src/adapters/persistence/fts-writer.ts` | Dual-slot shadow + lease CAS — **reuse** |
| `src/adapters/persistence/publish-batch.ts` claim protocol | Store-generation fences stay as-is |
| `src/domain/identity/*` | Offer source-tuple lineage ≠ taxonomy aliases |
| `src/domain/policy/price-per-kg.ts` | Still keyed off product-kind `filament_kit` |
| `src/adapters/stores/closin/*`, `voolt3d/*` | Observation-only |
| `src/adapters/queue/handlers.ts` | Already multi-store |
| `src/contracts/offer.ts` v1 | Keep product-kind `SpecificTypeSchema`; don’t overload it |
| `wrangler.web.jsonc` | No D1/queues |
| `workers/app.ts` | SSR entry |
| `db/migrations/0001–0004` | Additive 0005 only |
| Home null-query invariant | 1.4 |
| Informational rows / no CTAs | Epic 1 sequencing |
| Search empty copy `Não encontramos esse filamento.` | UX-DR19 |

### Project structure notes

```text
src/contracts/browse-page.ts          # NEW BrowsePage v1
src/contracts/taxonomy.ts             # NEW record DTOs (optional if kept in browse-page)
src/domain/policy/normalize.ts        # UPDATE v2 lookup
src/domain/taxonomy/                  # NEW fixtures + slug/alias helpers
src/application/get-browse-page.ts    # NEW
src/adapters/persistence/d1-browse-catalog.ts  # NEW — reuse search eligibility
db/migrations/0005_taxonomy.sql       # NEW
app/routes/materials.$familySlug.tsx  # NEW
app/routes/brands.$brandSlug.tsx      # NEW
app/lib/browse-loader.ts              # NEW
```

No `src/scraping/`. No educational `/materials` index. Architecture ER has no taxonomy tables — 0005 is the AD-10/AD-22 implementation of AD-12’s “opaque IDs + durable unique slug aliases”.

### Previous story intelligence

**From 1.3**
- Dictionaries are source-controlled, versioned, fixture-proven; unknown → null; no fuzzy
- Explicit handoff: “Story 1.6 still owns durable browse taxonomy, aliases, and slugs”
- `normalizePolicyVersion` already on every Offer — bump with shadow cutover of **every** published Offer
- Offer identity aliases (`offer_identity_lineage`) are **source-tuple** continuity — do not reuse that table for brand/family slugs

**From 1.4**
- SearchPage v2 strict; FTS≡fallback ordered identities; one D1 snapshot; ≤1 RPC retry; `Cache-Control: no-store`
- `specificTypeLabel` null unless reviewed subtype exists — **this story fills it**
- Suggestions link to `/search?q=<label>` until `/materials/:slug` — **close this hack**
- Out of scope then: “Material/Brand browse routes (1.6)”
- Do not log raw `q`
- Degraded + 0 hits ≠ `Não encontramos esse filamento.`
- E2E harness: `tests/e2e/live-app-harness.ts` + `search-seed.sql` (migrate → seed → Vite SSR)

**From 1.5**
- Search/FTS/publication already multi-store; do not rewrite them
- Do not invent SearchPage v3 **for a second Store** — 1.6 **does** own the FR2 facet / brand list wire bump
- `voolt` brand alias is not Store registration (current code maps `voolt` / `voolt3d` → `Voolt3D`)
- Coverage copy must not claim five Stores
- Open deferred (do not “fix” in 1.6 unless you touch the file): Closin/Voolt live probes still operator-gated; missing FKs to `store_state`; queue names `-local`

### Git intelligence

Local git history is shallow here: `3470f12` (`sync general`), `6c50615` (`1-2-homologate-the-first-real-store-adapter`), `ccb56e0` (`checkpoint`). Stories 1.3–1.5 are represented more reliably by implementation artifacts + code on disk than by a clean per-story commit sequence. **Treat code on disk as authority**, not only git history. Recent patterns to copy: strict Zod contracts, WorkerEntrypoint RPC + `withDeadline`, D1 `batch()` snapshots, allowlisted `{ code, correlationId }` logs, e2e live harness.

### Latest tech information

- **React Router 8** Framework mode: add routes in `app/routes.ts` with `route("materials/:familySlug", "routes/materials.$familySlug.tsx")`. Loader `params.familySlug` is typed via `./+types/…`. Use existing `throw redirect(path, 301)` / `data(..., { status })` patterns from `search-loader.ts`. Do not introduce `@react-router/fs-routes`
- **Cloudflare Service Bindings RPC:** add `getBrowsePage` on `IngestService` (callee) and deploy ingest **before** web calls it. New methods on `WorkerEntrypoint` are additive; old `getSearchPage` callers keep working. RPC payload cap is 32 MiB platform-side; this app stays on the 256 KiB SearchPage budget
- **Search contract rollout:** additive SearchPage evolution must be consumer-before-producer once a released predecessor exists. If Story 1.6 lands before SearchPage v2 is a released public wire, preserve Story 1.4's strict-initial-wire rule and phase browse/taxonomy separately
- **Permanent slug aliases:** use **HTTP 301** (GET page-to-page rename). 308 is for method-preserving API/POST moves; browse is GET. React Router `redirect(url, 301)`. `Cache-Control: no-store` still applies to the browse response after follow
- Stack pins unchanged: Zod 4.4.x, drizzle-orm 0.45.x, Vitest 4.x, wrangler ^4, Node ≥22, pnpm 11, React 19, RR ^8

### Anti-patterns (do not)

- Treat `filament` / `filament_kit` as UX Specific Type
- Keep `pla+` collapsed into PLA with no child type
- Implement `browse-materials.html` educational bento / Stitch “Catálogo Técnico”
- Invent `/materials` or `/brands` showcase indexes, logo walls, or `/stores`
- Put Materiais/Marcas in the shell as `#` / disabled / “coming soon”
- Call `getSearchPage` + `getBrowsePage` from the same page (AD-25: one aggregate)
- Feed browse through `getSearchPage({ q: familyLabel })` as a substitute for slugs/`notFound`/301
- Open-redirect via unvalidated `redirect(userSlug)` or alias targets
- Alias hop chains or self-alias 301 loops
- Second FTS writer, triggers, or per-Store taxonomy
- Merge / `Ver preços` / `Ver na loja` / `VER` / disabled OOS outbound
- Full FR-4 filter sidebar (price, stock, diameter default) — that is Story 3.2
- SearchPage silent field add without v3 + v2 decoder
- Offer contract v2 “just in case”
- Hardcoded chip set `PLA / PETG / ASA / ABS / TPU / PETG-CF`
- Copy “Comparação em tempo real”, “14 ACTIVE”, “1.248 SKUs”, “Categorias Populares”, “Acesso Rápido”
- Auto-activate Closin/Voolt3D
- Log raw query, slug, or destination URL
- Cross-request cache on browse

### Testing requirements

| Gate | Expectation |
| --- | --- |
| Taxonomy fixtures | PETG ≠ PETG HF ≠ Rapid PETG; PLA ≠ PLA+; unknown → null; no fuzzy |
| Aliases | reviewed 301; unknown 404; split 410; invalid slug 400; no open redirect |
| Search family-intent | `q=PETG` includes children; `type=petg-hf` excludes siblings; FTS≡fallback |
| Browse ≡ search | `/materials/petg` identities match family-intent search for the same snapshot |
| Visibility | unsupported Store absent on browse; degraded still qualified; 503 ≠ empty |
| RPC | Search still rejects `notFound`/`gone`; Browse emits them; N/N-1 v2|v3 |
| E2E | Home → chip/nav → browse → search; axe; 360/768/1280; no CTAs/images |
| Regression | `pnpm run check`, `test:homologation`, `test:pipeline`, `test:search` |
| Perf | Provisional search p95 &lt;500 ms still documented; no invented prod data |
| Privacy | raw `q`/slug never logged; correlationId + code only |

### Scope boundaries

**In:** durable taxonomy + aliases; family-intent search; bounded Specific Type facet; `/materials/:familySlug` + `/brands/:brandSlug`; `getBrowsePage`; Home chips; Materiais/Marcas nav; shadow/CAS; Epic 1 close

**Out:** Merge (3.1); full filters/sort/diameter default (3.2); Offer/Merge detail + `Ver preços` (3.3); history/promo (3.4); `Ver na loja` / `/out` (4.1); affiliate (4.3); stores 3–5 (Epic 2); production auto-activation; educational material encyclopedia; `/stores`; images/logos

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Story 1.6, AR10/13/14/27, UX-DR3/4/6/19]
- [Source: `_bmad-output/implementation-artifacts/epic-1-context.md`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-filatracker-2026-08-07/ARCHITECTURE-SPINE.md` — AD-5, AD-9, AD-12, AD-15, AD-18, AD-25]
- [Source: `_bmad-output/planning-artifacts/prds/prd-filatracker-2026-08-07/prd.md` — Glossary, FR-2, FR-3, FR-9, §13 IA]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-filatracker-2026-08-07/EXPERIENCE.md` — Shell, browse IA, empty copy, anti-vitrine]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-filatracker-2026-08-07/DESIGN.md` — chips, no imagery, UX-DR26]
- [Source: `_bmad-output/implementation-artifacts/1-3-publish-closin-through-the-deterministic-pipeline.md`]
- [Source: `_bmad-output/implementation-artifacts/1-4-search-published-closin-offers-end-to-end.md` — specificTypeLabel handoff]
- [Source: `_bmad-output/implementation-artifacts/1-5-search-across-two-real-stores.md`]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md`]
- [Source: `src/domain/policy/normalize.ts`]
- [Source: `src/contracts/search-page.ts`]
- [Source: `src/adapters/persistence/d1-search-catalog.ts`]
- [Source: `https://reactrouter.com/start/framework/routing` — dynamic segments]
- [Source: `https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/` — deploy callee method first]

## Change Log

- 2026-08-13: Ultimate context engine analysis completed — comprehensive developer guide created from epics, architecture, UX/PRD, Stories 1.3–1.5, current code, and platform notes. Status → `ready-for-dev`.
- 2026-08-13: Story review adjustments applied — aligned Voolt brand mapping with current code, clarified staged-contract/versioning expectations, added retry/cursor file coverage, and phased rollout / Epic 1 release-gate guidance.
- 2026-08-13: Implemented durable taxonomy, family-intent SearchPage v3, BrowsePage v1 routes, Home/nav chips, taxonomy+FTS CAS, remasured 134-row AD-8, and Epic 1 close tests/docs. Status → `review`.

## Dev Agent Record

### Agent Model Used

Composer (Cursor Grok 4.5)

### Debug Log References

- Staged INSERT was `27 values for 28 columns` until the SELECT list gained the third taxonomy bind (`brand_id` / `material_family_id` / `formulation_specific_type_id`).
- Family-intent `q=pla` no longer uses FTS `MATCH`; selector fencing tests now use `filamento`.
- Client navigation pulled `cloudflare:workers` via `buildBrowseRetryPath` living in `browse-loader.ts`; moved the helper to `app/lib/search-url.ts`.

### Implementation Plan

- Keep Offer v1 unwiden: taxonomy IDs live on `StagedOfferPublication` + publish-time lookup, never the public Offer contract.
- Share `ELIGIBLE_JOIN` / hydrate / order between search and browse; family/type intent filters `material_family_id` / `formulation_specific_type_id`.
- SearchPage v3 producer with v2 hydrate (`brandSuggestions=[]`, `specificTypeFacet=[]`); BrowsePage v1 includes `redirect` so web can emit internal 301 without D1.
- Taxonomy cutover reuses FTS dual-slot lease and CASes `projection_epoch` + `taxonomy_version` together.

### Completion Notes List

- Durable taxonomy fixtures + `0005_taxonomy.sql` seed families/types/brands/aliases; `NORMALIZE_POLICY_VERSION = 2`; PLA+ / PETG HF / PA6 stay distinct children.
- Publish path writes taxonomy FKs and formulation tokens into `search_text`. Closin 134-row AD-8 remasured: 147 statements, 3955 binds, max 29 binds/statement.
- Family-intent search + type facet; SearchPage v3 with v2 decoder; cursor v2 binds intent/type/taxonomy_version.
- `getBrowsePage` + `/materials/:familySlug` + `/brands/:brandSlug`; reviewed alias HTTP 301 (`/brands/voolt` → `/brands/voolt3d`); unknown 404; split 410; `Cache-Control: no-store`.
- Shell Materiais/Marcas from published entities; Home chips → `/materials/${slug}`; removable context chips on search and browse.
- `rebuildTaxonomyAndFtsShadow` reuses FTS lease/CAS; mixed taxonomy targets rejected.
- Tests: 202 passed (unit/workers/e2e). `test:search` / `test:browse` added. Runbooks cover ingest-first `getBrowsePage` canary, taxonomy+FTS restore, and 0005 rollback-as-restore.
- Epic 1 product close: FR1/FR2/FR3 evidenced on two homologated Stores. Production activation remains blocked on operator-gated safe probes (deferred, unchanged).

### File List

- `_bmad-output/implementation-artifacts/1-6-discover-by-material-family-and-brand.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `app/design-system/components.css`
- `app/design-system/components.tsx`
- `app/design-system/index.ts`
- `app/design-system/results.css`
- `app/design-system/results.tsx`
- `app/lib/browse-loader.ts`
- `app/lib/search-error.ts`
- `app/lib/search-loader.ts`
- `app/lib/search-url.ts`
- `app/routes.ts`
- `app/routes/brands.$brandSlug.tsx`
- `app/routes/home.tsx`
- `app/routes/materials.$familySlug.tsx`
- `app/routes/search.tsx`
- `db/migrations/0005_taxonomy.sql`
- `docs/runbooks/deploy.md`
- `docs/runbooks/ingestion-recovery.md`
- `package.json`
- `src/adapters/persistence/catalog-shared.ts`
- `src/adapters/persistence/d1-browse-catalog.ts`
- `src/adapters/persistence/d1-search-catalog.ts`
- `src/adapters/persistence/fts-writer.ts`
- `src/adapters/persistence/publish-batch.ts`
- `src/adapters/persistence/schema.ts`
- `src/adapters/persistence/search-cursor.ts`
- `src/adapters/service-binding/client.ts`
- `src/adapters/stores/closin/capacity/capacity-artifact.json`
- `src/application/get-browse-page.ts`
- `src/application/get-search-page.ts`
- `src/application/ports.ts`
- `src/application/stages/normalize-validate.ts`
- `src/contracts/browse-page.ts`
- `src/contracts/index.ts`
- `src/contracts/search-page.ts`
- `src/domain/policy/normalize.ts`
- `src/domain/taxonomy/fixtures.ts`
- `src/domain/taxonomy/index.ts`
- `src/domain/taxonomy/lookup.ts`
- `src/domain/taxonomy/search-tokens.ts`
- `src/domain/taxonomy/slug.ts`
- `tests/e2e/search-route.e2e.test.ts`
- `tests/e2e/search-seed.sql`
- `tests/unit/a11y-responsive.test.ts`
- `tests/unit/contracts-and-bindings.test.ts`
- `tests/unit/get-search-page.test.ts`
- `tests/unit/rpc-client.test.ts`
- `tests/unit/story-1-4-contracts.test.ts`
- `tests/unit/story-1-6-contracts.test.ts`
- `tests/unit/taxonomy.test.ts`
- `tests/workers/browse-pipeline.test.ts`
- `tests/workers/multi-store-isolation.test.ts`
- `tests/workers/search-pipeline.test.ts`
- `workers/ingest.ts`
