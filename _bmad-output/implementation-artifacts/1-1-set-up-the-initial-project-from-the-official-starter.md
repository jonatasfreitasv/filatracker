---
baseline_commit: NO_VCS
---

# Story 1.1: Set Up the Initial Project from the Official Starter

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an anonymous filament shopper,
I want a responsive search-first FilaTracker surface backed by the real production architecture,
so that I can access the product and receive honest empty results before Store Offers are published.

## Acceptance Criteria

1. **Official starter bootstrap (AR1 / AD-3)**
   - **Given** a clean repository and the approved architecture
   - **When** the project is bootstrapped
   - **Then** it uses the official `create-cloudflare` React Router v8 SSR starter, preserves `workers/app.ts`, commits the lockfile, and uses the specified Node/pnpm/TypeScript/React/Vite/Wrangler baseline
   - **And** no unofficial adapter or parallel SPA/API application is introduced.

2. **Two Workers + isolation (AR3 / AR12 / AD-6 / AD-11 / AD-23 / NFR11)**
   - **Given** local and production configurations
   - **When** bindings are inspected and both Workers start
   - **Then** exactly `web` and `ingest` exist, `web` has only public-safe configuration, the typed ingest Service Binding, and the deployment-scoped RPC capability secret, and only `ingest` binds D1
   - **And** local/CI identities cannot address production resources, secrets, migrations, or deploy authority.

3. **Minimal schema + contracts + RPC (AR17 / AR27 / AD-10 / AD-15 / AD-25)**
   - **Given** the initial schema and service boundary
   - **When** migrations and contracts are built
   - **Then** only entities required by the functional empty-search slice are created, all cross-boundary Zod schemas live in `src/contracts/`, D1/Drizzle schemas remain inside ingest persistence adapters, and the page query returns a bounded versioned `RpcOutcome<SearchPage>`
   - **And** money, mass, time, nullability, enums, correlation ID, limits, and typed outcomes follow AR17/AR27.

4. **Honest empty Home/Search SSR (FR1 / UX-DR4 / UX-DR5 / UX-DR19)**
   - **Given** an empty authoritative production-equivalent catalog
   - **When** a user opens `/`, submits an empty query, or submits a non-matching query to `/search`
   - **Then** SSR renders the pt-BR search-first Home or the explicit no-match state `Não encontramos esse filamento.` from the real aggregate RPC result
   - **And** it never renders fake Offers, fixture data, a runtime mock, an error page, or a false “service unavailable means no results” state.

5. **RPC failure normalization (NFR2 / AD-25)**
   - **Given** ingest RPC is unavailable, overloaded, exceeds its deadline, or throws
   - **When** Home/Search requests data
   - **Then** native failures are normalized to typed outcomes, one in-budget retry is allowed only for the idempotent query, and overload/unavailability returns non-cacheable 503 with `Retry-After`
   - **And** the UI never substitutes an empty result or cached dynamic response.

6. **Design system + anti-vitrine UX (applicable Story 1.1 baseline of UX-DR1–5, UX-DR18, UX-DR21–24, UX-DR26 / NFR9 / NFR16)**
   - **Given** the canonical UX contract
   - **When** Home and Search render at desktop, tablet, and mobile breakpoints
   - **Then** `app/design-system/` owns the complete approved tokens, Hanken Grotesk/JetBrains Mono usage, shell, search control, focus treatment, responsive geometry, loading rows, and honest empty state
   - **And** there are no product images, image-logo assets, Store logos, avatar, deal rail, Store ticker, glass, gradient, shadow stack, giant hero, or route-local visual constants; the textual FilaTracker wordmark is allowed.

7. **WCAG 2.1 AA on Home/Search (NFR3 / UX-DR25 baseline)**
   - **Given** keyboard and assistive-technology users
   - **When** they navigate Home and Search
   - **Then** the implemented slice meets WCAG 2.1 AA for semantics, contrast, zoom/reflow, keyboard operation, announced loading/error/empty state, and visible 2 px focus
   - **And** automated accessibility checks cover the core interactions.

8. **CI / deploy production gates (AR30 / AD-14 / AD-23)**
   - **Given** a candidate production release
   - **When** CI and deployment verification run
   - **Then** typecheck, lint, unit, contract N/N-1, Worker integration, binding-denial, migration, SSR, error mapping, limit, responsive, and accessibility tests pass against isolated real adapters/emulators
   - **And** documented production deploy, canary, verification, rollback, and secret-handling commands contain no disabled gate, TODO path, runtime stub, or mock substitution.

## Tasks / Subtasks

- [x] **T1. Bootstrap official starter into repo root** (AC: #1)
  - [x] Invoke **`create-cloudflare@2.70.17`** with `--framework=react-router` in a temporary directory, then merge into repo root without destroying `_bmad/`, `_bmad-output/`, `.claude/`, `.agents/`, `docs/`, or `design-artifacts/`
  - [x] Treat starter output as NEW code; after the merge, preserve starter-generated `workers/app.ts` except for narrowly required context/binding integration
  - [x] Preserve starter-declared semver ranges; switch package manager to **pnpm 11.20.0**; commit `pnpm-lock.yaml` as the exact-resolution authority
  - [x] Enforce Node `>=22.22.0` in `engines` and CI, `packageManager: pnpm@11.20.0`, and the approved starter ranges: TypeScript `^5.9.3`, React `^19.2.7`, Vite `^8.0.3`, Wrangler `^4.119.0`, `@cloudflare/vite-plugin` `^1.51.0`
  - [x] Compare the generated lockfile with the approved resolution snapshot in **Stack baseline**. Do not silently accept newer range-compatible patches; either keep the approved resolution or obtain an explicit compatibility review/approval first, then record its verification evidence in this story's completion notes
  - [x] Confirm SSR (`react-router.config.ts` ssr true); reject any SPA/API split or unofficial adapter
  - [x] Initialize git if absent; add sensible `.gitignore` (node_modules, `.wrangler`, dist, env secrets); do not commit secrets

- [x] **T2. Split into two Workers + Wrangler configs** (AC: #2)
  - [x] Add `workers/ingest.ts` as a non-public `WorkerEntrypoint` exposing only the implemented `getSearchPage` query; do not add placeholder Store, schedule, queue, command, or generic-fetch handlers
  - [x] Replace single starter wrangler with `wrangler.web.jsonc` + `wrangler.ingest.jsonc`
  - [x] Configure the Cloudflare Vite plugin as `cloudflare({ configPath: './wrangler.web.jsonc', auxiliaryWorkers: [{ configPath: './wrangler.ingest.jsonc' }] })` so one local command exercises the real Service Binding; Wrangler `main` remains `workers/app.ts`
  - [x] Ensure web `services[].service` exactly matches the ingest Wrangler `name`
  - [x] `web`: typed Service Binding to ingest + deployment-scoped RPC capability secret + public-safe config/static-assets binding only — **never** D1, queues, schedules, Store secrets, or migration authority; the secret must never enter client bundles or logs
  - [x] `ingest`: sole D1 binding (+ local isolation), explicit RPC entrypoint, no `routes`, `workers_dev: false`, and preview URLs disabled where supported. Provision the capability boundary now; verify it on command methods only when later stories introduce commands
  - [x] Prove local/CI identities cannot bind production resources, migrate, or deploy (separate deploy identity documented)
  - [x] Deploy order note: ingest before web (Service Binding target must exist)

- [x] **T3. Hexagonal layout + empty-search contracts** (AC: #3)
  - [x] Create source tree: `src/contracts/`, `src/domain/` (minimal), `src/application/` (ports + `getSearchPage` use case), `src/adapters/persistence/`, `src/adapters/service-binding/`
  - [x] Do **not** create `src/adapters/stores/` yet (Story 1.2)
  - [x] Add Zod **4.4.3**, drizzle-orm **0.45.2**, drizzle-kit **0.31.10**
  - [x] Define all cross-boundary Zod schemas and inferred types in `src/contracts/`: versioned `RpcOutcome<T>` and `SearchPage` (outcome: `ok | degraded | invalid | notFound | gone | overloaded | unavailable`; contract version; projection/support epochs; random per-request correlation ID; bounded limits)
  - [x] Money = positive integer BRL centavos; mass = positive integer grams; times = UTC; unknowns = explicit `null`; omit = absent from contract version
  - [x] Keep D1/Drizzle schemas inside `src/adapters/persistence/`; `src/contracts/` must never contain ORM schemas or leak Drizzle types
  - [x] Migrations in `db/migrations/` via Wrangler: only singleton projection/support epoch metadata and other structures demonstrably required to read the authoritative empty slice — **no** Offer/Merge/Store/PricePoint/FTS/pipeline schema upfront
  - [x] Configure `migrations_dir` (and `migrations_pattern` if Drizzle emits nested files); use the immutable database name rather than a mutable binding name in production migration commands

- [x] **T4. Implement `getSearchPage` RPC end-to-end** (AC: #3, #4, #5)
  - [x] Ingest exposes typed Service Binding RPC method `getSearchPage`
  - [x] Web loader for `/` and `/search` calls **one** page-aggregate RPC via typed client; no D1 from web
  - [x] Empty catalog → `ok` with zero results (never fabricate Offers)
  - [x] V1 query contract accepts one optional `q` only: Unicode NFKC, trim and collapse whitespace; empty canonicalizes to Home; after normalization, maximum 120 Unicode scalar values and 512 UTF-8 bytes; repeated/unknown parameters, control characters, or over-limit input return `invalid`/400. Cursor, filters, and sort are not accepted until their owning stories
  - [x] Normalize native exceptions and deadline-exceeded failures at the ingest boundary (`unavailable` unless explicit overload evidence exists); web: at most one in-budget retry for this idempotent query
  - [x] Map `overloaded` / `unavailable` → non-cacheable **503** + `Retry-After`; never render empty-as-failure; no cross-request cache for dynamic search responses (AD-12)
  - [x] Initial outcome mapping: `ok` renders Home/empty data; `invalid` returns non-cacheable 400 with an announced validation surface; `overloaded`/`unavailable` return non-cacheable 503; `notFound`/`gone` are not emitted by `getSearchPage` v1 and fail contract tests if observed; `degraded` must remain explicit and may not be rendered as ordinary empty data
  - [x] Error UI must use one shared design-system surface, pt-BR plain language, an `aria-live` announcement, preserved search input, and a retry action only for retryable 503 states; do not expose native exception text or correlation IDs to the user

- [x] **T5. Home + Search SSR surfaces (pt-BR)** (AC: #4, #6)
  - [x] Routes: `/` (search-first Home) and `/search` (bounded query). Canonicalize an empty submitted query back to `/` so empty input is a valid Home state, not a no-match or error state
  - [x] A non-matching non-empty query renders the exact copy `Não encontramos esse filamento.`
  - [x] Shell: textual FilaTracker wordmark and one shared `SearchControl`; no auth/avatar, Store logo, or image-logo asset. On Home, use a single primary search instance rather than duplicating shell and page search fields
  - [x] Omit actionable `Materiais` and `Marcas` navigation until Story 1.6 supplies real taxonomy destinations. Do not render dead links, disabled placeholder controls, invented index routes, or mock browse content; Story 1.6 adds both items to the shell
  - [x] **Absent** (not placeholders): `Ver preços`, `Ver na loja` (Epic 3 / 4)
  - [x] Loading: dense skeleton rows only (UX-DR18) — no fake Offer rows
  - [x] Material Family suggestions on empty: only real taxonomy when present; empty catalog ⇒ no invented suggestions (UX-DR19)

- [x] **T6. Design system from DESIGN.md** (AC: #6)
  - [x] Seed `app/design-system/` from the **entire DESIGN.md front matter** (all semantic colors, six typography styles, radii, spacing, geometry, and component mappings), not only the summary below
  - [x] Export shared tokens/primitives for Shell, SearchControl, EmptyState, ErrorState, LoadingRows, and focus treatment; routes may compose them but may not define visual constants
  - [x] Fonts: **Hanken Grotesk** (UI/prose), **JetBrains Mono** (prices, R$/kg, weights, diameters, freshness, label-caps)
  - [x] Self-host the required WOFF2 font assets with `font-display: swap` and documented system fallbacks; no runtime third-party font request, and the UI must remain readable when font loading fails
  - [x] Tokens: slate industrial + accent `#0EA5E9`; 4px spacing base; control radius 4px; badge 2px; container max 1280px; dense row 40px; 2px focus ring
  - [x] Accessibility correction: literal DESIGN.md pairs fail AA (`#0EA5E9`/white, current status foregrounds). Retain `#0EA5E9` only as a non-text brand accent; remap focus rings and interactive controls to `#0369A1` on white/light surfaces, stock foreground to `#047857`, OOS to `#B91C1C`, and promo/stale to `#92400E`, keeping the documented subtle backgrounds. No declared component pair may retain a failing mapping; do not alter colors route-locally
  - [x] Add automated contrast assertions for every declared foreground/background pair (4.5:1 for normal text; 3:1 for non-text focus/component boundaries). WCAG 2.1 AA is binding; implementation should avoid preventing later WCAG 2.2 adoption
  - [x] Elevation: tonal layers + 1px outlines only — **no** shadows, glass, gradients, product imagery, image-logo assets, or Store logos; the textual FilaTracker wordmark remains required
  - [x] `DESIGN.md` / `EXPERIENCE.md` win over mockups/Stitch/Tailwind-CDN demos (UX-DR26). Starter Tailwind (if present) may be used as a vehicle for tokens — never copy Stitch M3 palette/shadows
  - [x] No route-local color/type/spacing/status/focus forks

- [x] **T7. Accessibility** (AC: #7)
  - [x] WCAG 2.1 AA on Home/Search: semantics, contrast, zoom/reflow, keyboard, announced loading/error/empty, visible 2px focus
  - [x] LoadingRows appear only during client navigation, set the owning region `aria-busy`, expose one polite status announcement, respect reduced motion, and never contain merchant-like content
  - [x] Automated a11y checks cover cold Home, keyboard search submission, loading, successful empty/no-match, invalid input, and retryable 503 states
  - [x] Responsive browser matrix must include at least 360x800, 768x1024, and 1280x800: 12px mobile margins, no page-level horizontal overflow, usable search, visible focus, readable state copy, and correct single-column/tablet/desktop reflow

- [x] **T8. Tests + CI + deploy docs** (AC: #8)
  - [x] Vitest **4.1.10** + `@cloudflare/vitest-pool-workers` **0.20.2**
  - [x] Gate matrix for this slice: typecheck, lint, unit, contract N/N-1 (envelope versioning), multi-Worker RPC integration, **binding-denial** (web must not bind D1/queues/schedules/Store secrets), migration, SSR Home/empty/no-match, 400/503 error mapping, limits, responsive browser checks, contrast, and a11y
  - [x] Test doubles **only** in automated tests — never in runtime paths (AR30)
  - [x] Document production deploy, canary (RPC before activation), verification, rollback, secret-handling — no disabled gates / TODO stubs
  - [x] Local + production only — no staging environment (AD-11)

### Review Findings

- [x] [Review][Patch] `headers()` in Home/Search discards `loaderHeaders`/`errorHeaders`, dropping `Retry-After` on 503 responses [app/routes/home.tsx:26, app/routes/search.tsx:28]
- [x] [Review][Patch] `LoadingRows` component exists but is never rendered by any route — no client-navigation loading state is wired up [app/design-system/components.tsx:134, app/routes/home.tsx, app/routes/search.tsx]
- [x] [Review][Patch] `tests/unit/a11y-responsive.test.ts` only regex-matches source files; it never renders DOM or invokes `axe-core`/`playwright` despite both being installed and the file's own docblock claiming axe-core coverage [tests/unit/a11y-responsive.test.ts]
- [x] [Review][Patch] Home route accepts a non-empty `q` directly (no redirect to `/search`) and renders the wrong copy for the no-match state instead of the mandated `Não encontramos esse filamento.` [app/routes/home.tsx:49-54]
- [x] [Review][Patch] Native/thrown RPC failures in `loadSearchPage`'s catch block bypass the retry budget entirely — normalized to `unavailable` on first failure with zero retries [app/lib/search-loader.ts:88-94]
- [x] [Review][Patch] `wrangler.web.jsonc` has no `assets` binding/directory — the production Worker has no configured way to serve the built client bundle, fonts, or favicon [wrangler.web.jsonc]
- [x] [Review][Patch] All RPC/native-failure catch blocks swallow the original error with zero logging, making real bugs indistinguishable from transient infra failures in production [app/lib/search-loader.ts:92, src/application/get-search-page.ts:37+84, workers/ingest.ts:33]
- [x] [Review][Patch] `IngestService.getSearchPage`'s deadline parsing has no NaN/`<=0` guard — a misconfigured `RPC_DEADLINE_MS` causes every RPC call to time out immediately [workers/ingest.ts:25]
- [x] [Review][Patch] `callGetSearchPage`'s retry loop retries immediately on `overloaded` with no backoff, ignoring the outcome's own `retryAfterSeconds` guidance [src/adapters/service-binding/client.ts:39-42]
- [x] [Review][Patch] Duplicate/redundant `IngestRpc` and `IngestServiceBinding` type definitions for the same RPC surface [src/adapters/service-binding/client.ts:7-13]
- [x] [Review][Defer] Home's `"ok"` kind with non-empty hits is never rendered — unreachable in this story since the catalog is provably always empty; needed before Story 1.4 populates real hits [app/routes/home.tsx] — deferred, pre-existing scope boundary (Story 1.4)
- [x] [Review][Defer] `MoneyCentavosSchema` requires `.positive()`, which would reject a legitimate zero/free-price listing once real Offer data lands [src/contracts/search-page.ts:32] — deferred, not reachable until real prices are populated (Story 1.4+)

**Patches applied (2026-08-08):** All 10 patch findings fixed; `pnpm run check` green (typecheck, lint, 49 tests — up from 31, adding `tests/e2e/a11y-responsive.e2e.test.ts`, a real Playwright + axe-core suite across the T7 viewport matrix). Implementing the real a11y test (replacing the old regex-only one) surfaced two additional genuine bugs, fixed alongside: the footer's `ink-muted`/`surface-sunken` color pair failed WCAG AA (4.34:1, needed 4.5:1) despite passing the self-referential token-level contrast test — recolored to `ink-secondary` (9.45:1) and added the pair to `contrastPairs`; and `/search` had no level-one heading in any state — added a visually-hidden `<h1>` matching Home's pattern.

**Dismissed as noise (10):** Contract N/N-1 schema being a direct alias (explicitly allowed at v1 baseline per story); D1 migration re-application idempotency (Wrangler tracks applied migrations); vestigial `.env*` rules in `.gitignore` (harmless, unused by Workers `.dev.vars` convention); unused design-system badge/chip tokens (intentional full-DESIGN.md seed per T6); `postinstall || true` (low impact, typecheck would surface real breakage); `RPC_CAPABILITY_SECRET` unread (by design — story explicitly defers verification to command methods in later stories); `compatibility_date` set to today (standard for a new bootstrap); asymmetric optional-chaining style between Home/Search (cosmetic, not reachable); wide `^8` range on `react-router` (correct — story requires preserving starter's declared range); binary font/favicon assets initially appearing "missing" from the review diff (confirmed present on disk — artifact of diff construction, not a code defect).

## Dev Notes

### Implementation precedence

1. This story's Acceptance Criteria and explicit task guardrails
2. `ARCHITECTURE-SPINE.md`
3. `DESIGN.md` and `EXPERIENCE.md`
4. Mockups/Stitch for composition reference only

When literal UX tokens conflict with WCAG 2.1 AA, the centralized accessibility correction in T6 wins. Do not resolve source conflicts inside an individual route.

### Scope reality check

This is **not** a blank hello-world scaffold. Story 1.1 ships a **production empty-search vertical slice**: official starter → two-Worker topology → real `web`→`ingest` RPC → SSR Home/Search over an **empty authoritative catalog** → design system → a11y → CI/deploy gates.

This is only the **FR1 foundation**. FR1 is not complete until Stories 1.4/1.5 serve real published Offers across the intended Store progression.

### Anti-patterns (will fail review / AR30)

| Do NOT | Why |
| --- | --- |
| Seed fake Offers / fixture catalog in runtime | AC4 / AR30 |
| Treat RPC failure as empty results | AC5 / AD-25 |
| Bind D1 on `web` | AD-6 / AD-23 |
| Full schema upfront (Offers, Merges, Stores, queues, FTS) | Empty-search slice only |
| Implement Store adapters / Closin | Story 1.2 |
| Implement ingestion pipeline / queues / cron | Story 1.3 |
| Populate real search hits | Story 1.4 |
| Browse `/materials`, `/brands` taxonomy | Story 1.6 |
| Render `Ver preços` / `Ver na loja` placeholders | Epic 3 / 4 — **absent** |
| Use `docs/raw_plan.md` layout (`components/`, single wrangler, shadcn aesthetic) | Non-canonical; spine + DESIGN.md win |
| Nest app under `_bmad-output` or `apps/web` monorepo | Architecture: root modular monolith |
| Force npm “latest” maxima over starter ranges / lockfile | AD-3 |
| Use `create-cloudflare@latest` (2.70.18+) without review | Pin **2.70.17** per Stack |

### Bootstrap procedure (greenfield repo)

Repo today is planning-only (no `package.json`, no git). Preserve existing trees:

```text
_bmad/  _bmad-output/  .claude/  .agents/  docs/  design-artifacts/
```

Recommended approach:

1. Scaffold with C3 into a **temp directory**, then merge files into repo root.
2. Official docs command shape: `npm create cloudflare@2.70.17 -- <name> --framework=react-router`  
   Docs: https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/
3. Convert to pnpm 11.20.0; regenerate lockfile; keep starter semver ranges.
4. Split wrangler; add ingest Worker; wire hexagonal folders.

### Stack baseline (re-verified 2026-08-08)

| Item | Approved declaration / resolution | npm latest 2026-08-08 | Rule |
| --- | --- | --- | --- |
| create-cloudflare | invocation **2.70.17** | 2.70.18 | Keep the reviewed CLI pin |
| react-router | `^8` / 8.3.0 | 8.3.0 | Preserve starter range |
| React | `^19.2.7` / 19.2.8 | 19.2.8 | Preserve starter range |
| @cloudflare/vite-plugin | `^1.51.0` / 1.51.0 | 1.51.1 | New patch requires explicit resolution review |
| Wrangler | `^4.119.0` / 4.119.0 | 4.120.0 | New minor requires explicit resolution review |
| Vite | `^8.0.3` / 8.2.1 | 8.2.1 | Preserve starter range |
| TypeScript | `^5.9.3` / 5.9.3 | 7.0.2 | Do not jump major |
| Node.js | `>=22.22.0` / CI 22.22.0 | n/a | React Router v8 engine floor |
| pnpm | **11.20.0** | 11.20.0 | Exact |
| Zod | 4.4.3 | 4.4.3 | Exact project addition |
| drizzle-orm / drizzle-kit | 0.45.2 / 0.31.10 | same | Exact project additions |
| Vitest / workers pool | 4.1.10 / 0.20.2 | 4.1.10 / 0.20.3 | Keep reviewed pool until compatibility update is recorded |

The committed lockfile is authoritative. Because the registry moved after the architecture review, completion notes must record the exact resolved set and the verification decision for any difference; never replace the reviewed baseline with `latest` implicitly.

### Target source tree

```text
app/
  routes/                 # Home, Search SSR
  design-system/          # from DESIGN.md
src/
  contracts/              # Zod RpcOutcome, SearchPage, …
  domain/                 # minimal policy for empty search
  application/            # getSearchPage use case + ports
  adapters/
    persistence/          # ingest-only D1/Drizzle
    service-binding/      # typed web client + ingest RPC target
workers/
  app.ts                  # PRESERVE from starter
  ingest.ts               # ADD
wrangler.web.jsonc
wrangler.ingest.jsonc
vite.config.ts               # web entry + ingest auxiliary Worker
drizzle.config.ts
db/migrations/
tests/
.github/workflows/           # CI gates
docs/runbooks/               # deploy/canary/verify/rollback/secrets
```

All implementation files above are NEW in the current planning-only repository. The only UPDATE rule starts after scaffolding: preserve the generated `workers/app.ts` and starter configuration semantics while extending them narrowly for this slice.

### RPC / SearchPage contract rules (AD-25 / AR27)

- One bounded aggregate per dynamic page: `getSearchPage` for Home/Search.
- Every response: versioned `RpcOutcome<SearchPage>` with contract version, projection/support epochs, random correlation ID, exactly one outcome discriminant.
- Outcomes: `ok | degraded | invalid | notFound | gone | overloaded | unavailable`.
- Web: ≤1 in-budget retry for idempotent query; never implicit command retry.
- `overloaded`/`unavailable` → non-cacheable 503 + `Retry-After`.
- Empty catalog is `ok` with zero hits — distinct from unavailable.

### Home/Search state contract

| State | HTTP / cache | Required presentation | Announcement / action |
| --- | --- | --- | --- |
| Cold Home or empty submit | 200, `no-store` | Search-first Home; empty submit canonicalizes to `/` | Search has an accessible label; no error announcement |
| Loading navigation | n/a | Dense neutral LoadingRows only | `aria-busy=true`, one polite loading status, reduced-motion safe |
| Valid no-match | 200, `no-store` | `Não encontramos esse filamento.`; no invented suggestions | Announce result count/state once |
| Invalid query | 400, `no-store` | `Revise sua busca e tente novamente.` | Announce error; keep search editable |
| Degraded | 200, `no-store`, only when usable qualified data exists | `Alguns dados podem estar indisponíveis no momento.` | Announce qualification; no invented results |
| Overloaded / unavailable | 503, `no-store`, `Retry-After` | `Não foi possível carregar a busca agora. Tente novamente em instantes.` | Announce error; manual retry control |

`notFound` and `gone` belong to resource routes and are invalid emissions from `getSearchPage` v1. Contract tests must reject them rather than invent Search behavior.

### Empty-search schema guidance

Create the **minimum** D1 structures so `getSearchPage` can read an authoritative empty catalog (e.g. projection/support epoch bookkeeping and empty result path). Defer Store, Offer, Merge, PricePoint, FTS, queue, outbound tables to the stories that first need them. [Source: implementation-readiness-report — no upfront full-schema]

### UX copy & shell (must match exactly)

| Element | Requirement |
| --- | --- |
| Locale | pt-BR |
| Currency display | BRL (when prices exist later) |
| No-match | `Não encontramos esse filamento.` |
| Home | Search-first; optional Material Family chips only if real; **no** deal rails |
| Shell | Textual wordmark + shared search; no avatar. Materiais/Marcas are intentionally absent until Story 1.6 can make them real links |
| Trust | Frete/conditions honesty in footer strip where applicable (UX-DR21); no `tempo real` / price guarantees |
| Actions | No `Ver preços` / `Ver na loja` in this story |

### Security / privacy from day one

- Public `web` has **no** D1, queue, schedule, Store-secret, or migration binding.
- Narrow typed Service Binding only; capability secret on commands; CI audits caller inventory (only production web may call ingest RPC).
- Local/CI cannot bind prod D1/secrets/migrate/deploy.
- Telemetry: allowlisted fields; redact query/referrer/URL/IP/UA/secrets before emission (foundation; full product events are Epic 4).
- No public admin/write API.

### Testing standards

- Prefer Worker integration tests against isolated real adapters/emulators over mocks.
- Binding-denial test is mandatory (web config must fail if D1 appears).
- Contract N/N-1: envelope must remain decodable across adjacent versions even at v1 baseline (establish pattern now).
- Workers Vitest runs in the Workers runtime with isolated per-test-file storage; use its D1 migration helpers and multi-Worker/JSRPC recipes rather than a parallel Node runtime.
- Browser-level responsive and a11y automation covers the explicit T7 viewport/state matrix. Any added browser/a11y dependency must be recorded as a reviewed project addition and locked.
- AR30: passing CI with disabled gates or runtime stubs = incomplete.

### Project Structure Notes

- Alignment: root modular monolith per Architecture Structural Seed — **not** a multi-package apps monorepo.
- Preserve BMAD/planning trees; app code coexists at repo root.
- Starter may emit Tailwind — OK as implementation vehicle if tokens map to DESIGN.md; Stitch/HTML mocks are reference only.
- `/stores` omitted in v1 (AD-12).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 1 / Story 1.1]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-filatracker-2026-08-07/ARCHITECTURE-SPINE.md` — AD-3, AD-6, AD-10–15, AD-23, AD-25, Stack, Structural Seed]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-filatracker-2026-08-07/DESIGN.md`]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-filatracker-2026-08-07/EXPERIENCE.md`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-filatracker-2026-08-07/prd.md` — anonymous pt-BR web, anti-vitrine, empty-state]
- [Source: `_bmad-output/planning-artifacts/implementation-readiness-report-2026-08-08.md` — empty-search schema timing]
- [Source: Cloudflare React Router guide — https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/]
- [Source: Cloudflare multi-Worker local development — https://developers.cloudflare.com/workers/local-development/multi-workers/]
- [Source: Cloudflare Vite auxiliary Workers — https://developers.cloudflare.com/workers/vite-plugin/reference/api/#interface-pluginconfig]
- [Source: Cloudflare Service Binding RPC — https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/]
- [Source: Cloudflare Workers Vitest integration — https://developers.cloudflare.com/workers/testing/vitest-integration/]
- [Source: Cloudflare D1 migrations — https://developers.cloudflare.com/d1/reference/migrations/]
- [Source: W3C WCAG overview — https://www.w3.org/WAI/standards-guidelines/wcag/]

### Git Intelligence Summary

- No git repository and no application commits yet — greenfield for app code.
- No previous story learnings to inherit; this story establishes baseline patterns for all later Epic 1 work.

### Latest Tech Information

- Official bootstrap (docs): `npm create cloudflare@latest -- <name> --framework=react-router` — for this project pin CLI to **`create-cloudflare@2.70.17`**.
- Starter preserves `workers/app.ts` as web entry; `main` points there; SSR enabled in React Router config.
- Cloudflare Vite plugin runs server code in Workers runtime locally and supports auxiliary Workers. Configure ingest as an auxiliary Worker for local development; do not invent a parallel Node SSR path.
- Service Binding RPC exposes explicit `WorkerEntrypoint` methods without a public URL. The target Worker must be deployed first; additive ingest/N/N-1 canary precedes web activation.
- Workers Vitest supports multi-Worker and JSRPC tests plus D1 migrations in isolated local storage; use the official integration.
- D1 migration tooling supports `migrations_dir`/`migrations_pattern`; production commands should identify the immutable database name to reduce wrong-target risk.
- Registry latest on 2026-08-08 moved beyond parts of the reviewed snapshot (C3 2.70.18, Vite plugin 1.51.1, Wrangler 4.120.0, Workers pool 0.20.3). This is upgrade intelligence, not permission to change the approved baseline.

### Project Context Reference

- No `project-context.md` found in the repo. Follow Architecture spine + this story file + DESIGN/EXPERIENCE as the implementation contract.
- `docs/raw_plan.md` is a **non-canonical** technical seed — ignore when it conflicts (single wrangler, shadcn, seed fake data, old epic structure).

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.5

### Debug Log References

- C3 `create-cloudflare@2.70.17 --framework=react-router` fails if `--ts=true` is passed (language filter drops react-router); used `--framework=react-router --platform=workers --no-deploy --no-git --no-agents`.
- Starter package.json initially resolved `@cloudflare/vite-plugin@^1.51.1` and `wrangler@^4.120.0` from registry drift; pinned back to approved `1.51.0` / `4.119.0` via `pnpm-workspace.yaml` overrides.
- Vitest pool 0.20.2 uses `cloudflareTest` plugin API (not legacy `defineWorkersProject` /config export).

### Completion Notes List

- Bootstrapped official React Router v8 Cloudflare starter (C3 2.70.17) into repo root; preserved BMAD/planning trees; initialized git; SSR enabled (`ssr: true`).
- Converted to pnpm 11.20.0 with committed `pnpm-lock.yaml`.
- **Resolution verification (kept approved baseline, not starter's newer patches):** `@cloudflare/vite-plugin@1.51.0`, `wrangler@4.119.0`, `vite@8.2.1`, `typescript@5.9.3`, `react@19.2.8` (range `^19.2.7`), `vitest@4.1.10`, `@cloudflare/vitest-pool-workers@0.20.2`, `zod@4.4.3`, `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`. Starter had emitted vite-plugin `^1.51.1` / wrangler `^4.120.0`; explicitly rejected in favor of Stack baseline.
- Two Workers: `filatracker-web` + `filatracker-ingest` (`IngestService` WorkerEntrypoint, `getSearchPage` only); Vite auxiliaryWorkers; web has INGEST service binding + RPC_CAPABILITY_SECRET; ingest alone binds D1.
- Hexagonal empty-search slice: contracts, domain query normalization, application use case, D1 persistence adapter, typed SB client with ≤1 retry.
- Minimal migration `projection_meta` singleton only.
- Home/Search SSR pt-BR with honest empty/no-match, 400/503 mapping, no-store; smoke-verified locally.
- Design system from DESIGN.md + WCAG AA remaps; self-hosted WOFF2 fonts.
- CI workflow + deploy runbook (local+production only).
- `pnpm run check` green: typecheck, lint, 31 tests.

### File List

- `.dev.vars.example`
- `.github/workflows/ci.yml`
- `.gitignore`
- `.npmrc`
- `.vscode/settings.json`
- `README.md`
- `app/app.css`
- `app/design-system/components.css`
- `app/design-system/components.tsx`
- `app/design-system/contrast.ts`
- `app/design-system/fonts/hanken-grotesk-400.woff2`
- `app/design-system/fonts/hanken-grotesk-600.woff2`
- `app/design-system/fonts/hanken-grotesk-700.woff2`
- `app/design-system/fonts/jetbrains-mono-500.woff2`
- `app/design-system/fonts/jetbrains-mono-700.woff2`
- `app/design-system/index.ts`
- `app/design-system/tokens.css`
- `app/design-system/tokens.ts`
- `app/lib/search-loader.ts`
- `app/root.tsx`
- `app/routes.ts`
- `app/routes/home.tsx`
- `app/routes/search.tsx`
- `db/migrations/0001_projection_meta.sql`
- `docs/runbooks/deploy.md`
- `drizzle.config.ts`
- `eslint.config.js`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `public/favicon.ico`
- `react-router.config.ts`
- `src/adapters/persistence/d1-search-catalog.ts`
- `src/adapters/persistence/schema.ts`
- `src/adapters/service-binding/client.ts`
- `src/application/get-search-page.ts`
- `src/application/ports.ts`
- `src/contracts/index.ts`
- `src/contracts/search-page.ts`
- `src/domain/search-query.ts`
- `tests/unit/a11y-responsive.test.ts`
- `tests/unit/contracts-and-bindings.test.ts`
- `tests/unit/contrast.test.ts`
- `tests/unit/get-search-page.test.ts`
- `tests/unit/rpc-client.test.ts`
- `tests/workers/apply-migrations.ts`
- `tests/workers/ingest-rpc.test.ts`
- `tsconfig.cloudflare.json`
- `tsconfig.json`
- `tsconfig.node.json`
- `vite.config.ts`
- `vitest.config.ts`
- `vitest.unit.config.ts`
- `vitest.workers.config.ts`
- `workers/app.ts`
- `workers/ingest.ts`
- `wrangler.ingest.jsonc`
- `wrangler.web.jsonc`


## Change Log

- 2026-08-08: Implemented Story 1.1 empty-search vertical slice (starter bootstrap → two Workers → RPC → SSR → design system → a11y/CI). Status → review.
- 2026-08-08: Story context created via bmad-create-story (ultimate context engine). Status → ready-for-dev.
- 2026-08-08: Story context re-reviewed against all planning artifacts, source-state audit, official current docs, npm registry, and WCAG contrast calculations; ambiguity, version-drift, multi-Worker, outcome-state, UX, accessibility, file-plan, and test guardrails corrected. Status remains ready-for-dev.
- Completion note: Ultimate context engine analysis completed - comprehensive developer guide created.
- 2026-08-08: bmad-code-review (adversarial + edge-case + acceptance-auditor layers) found 10 patch, 2 defer, 10 dismissed findings. All 10 patches applied and verified (`pnpm run check` green, 49 tests). Also fixed two real bugs surfaced by the new axe-core test itself (footer contrast, missing Search `<h1>`). Status → done.
