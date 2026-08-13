---
title: 'Close Story 1.4 Search Experience and Release Evidence'
type: 'bugfix'
created: '2026-08-09'
status: 'done'
review_loop_iteration: 1
baseline_commit: '6c50615d24bac055fa4b8096595dcbec24c9d891'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/1-4-search-published-closin-offers-end-to-end.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-search-core-review-patches.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.4's search core is hardened, but later pages are unreachable in the rendered product, Store degradation and mobile field meaning are not visible enough, freshness can vary between SSR and hydration, and the claimed route/performance/capacity evidence is not reproducible.

**Approach:** Complete the anonymous search journey and replace static or hand-recorded release claims with isolated, executable verification through the real React Router SSR → Service Binding → ingest Worker → D1 path.

## Boundaries & Constraints

**Always:** Preserve informational-only rows, strict v2 decoding, `no-store`, cursor/query binding, the single backend stale fact, visible degraded qualification, semantic responsive markup, isolated temporary D1 state, the two-Worker boundary, and target-tier activation gates.

**Ask First:** Any production probe, Store activation, deployment, new runtime dependency, public API/route, or relaxation of the 500 ms provisional target.

**Never:** Fabricate benchmark/capacity numbers, call static component markup a route E2E, expose SQL/D1 to web, persist shared local test state, add merchant CTAs/images, modify `dev_tools/runz`, or claim the external Closin safe probe passed.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Continuation | `hasNextPage` and cursor | Accessible next link preserves canonical query; count remains announced | 503 retry preserves query and cursor |
| Store degraded | Healthy FTS, degraded Store | Hits remain visible with explicit Store qualification | Never mislabel aggregate as degraded |
| Mobile/SSR | 360 px or hydration boundary | Every value has a visible label; freshness text is deterministic | Invalid observation renders honest unknown |
| Live route | Isolated migrated/seeded D1 | Browser reaches real SSR, binding, ingest, FTS/fallback and pagination | Harness cleans state and fails closed |
| Evidence | 134 rows | Raw latency samples and actual capacity/rollback metrics are reproducible | Target breach or mismatch exits nonzero |

</frozen-after-approval>

## Code Map

- `app/routes/search.tsx` -- page navigation, result count, retry context, Store qualification.
- `app/design-system/results.tsx`, `results.css` -- deterministic freshness and labeled compact rows.
- `tests/e2e/live-app-harness.ts`, `search-seed.sql` -- isolated real Vite/Workers/D1 environment.
- `tests/e2e/search-route.e2e.test.ts` -- genuine route, SSR, accessibility, responsive, pagination checks.
- `scripts/search-latency-benchmark.mjs` -- executable 134-row FTS/fallback measurement artifact.
- `tests/workers/publication-pipeline.test.ts` -- actual plan metrics and capacity rollback proof.

## Tasks & Acceptance

**Execution:**
- [x] `app/lib/search-loader.ts`, `app/routes/search.tsx` -- preserve cursor in errors/retry; render stable count, next-page link, and Store-degraded qualification.
- [x] `app/design-system/results.tsx`, `app/design-system/results.css` -- remove `Date.now()`, render deterministic observation/stale text, and label every mobile value.
- [x] `vite.config.ts`, `tests/e2e/live-app-harness.ts`, `tests/e2e/search-seed.sql`, route E2E tests -- run the actual SSR/binding/Worker/D1 chain on isolated migrated state; cover healthy, degraded, pagination, keyboard, axe, 360/768/1280, no overflow/CTA/image, and escaped merchant text.
- [x] `scripts/search-latency-benchmark.mjs`, evidence JSON, runbook -- collect 5 warmups + 50 raw samples for FTS and fallback over 134 rows; calculate nearest-rank p50/p95/max and enforce p95 under 500 ms without claiming target-tier completion.
- [x] `tests/workers/publication-pipeline.test.ts`, capacity artifact -- instrument actual batch statements/binds/bytes and prove late-failure rollback at the 134-row bound.
- [x] `package.json`, CI -- install Chromium and include live route verification in the focused search/release gates.
- [x] Story review findings -- check off fixed items; retain the external safe-probe defer honestly.

**Acceptance Criteria:**
- Given more than one result page, when a user follows navigation or retries a failed continuation, then the canonical query/cursor chain remains reachable without duplicates or reset.
- Given healthy FTS with a degraded Store, when results render at any supported viewport, then Store degradation and every compact-row field remain visibly and semantically identified.
- Given the isolated release commands, when they run from a clean checkout with Chromium installed, then real SSR/D1 route tests, raw 134-row latency evidence, capacity metrics, and rollback checks are reproducible and fail on regression.

## Spec Change Log

- 2026-08-09: Implemented the release-closure UI, isolated live route harness, 134-row route/latency evidence, actual D1 batch instrumentation, late-failure rollback proof, and Chromium CI gate. External safe probe and target-tier measurement remain activation gates.
- 2026-08-09 review loop 1: Blind and edge review hardened cleanup under shutdown failure, bounded Wrangler subprocesses, active-slot rollback snapshots, Offer-ID evidence, fallback continuation, retry composition, hydration stability, keyboard reachability, mobile metadata labels, runtime provenance, artifact-linked capacity assertions, and the Story handoff record. KEEP: isolated two-Worker route, strict pagination/cursor behavior, deterministic absolute freshness, raw provisional samples, no target-tier/safe-probe claim, and all approved search-core invariants.

## Design Notes

The live harness uses a unique temporary persistence root shared by Wrangler migration/seed commands and the Cloudflare Vite plugin. Vite starts the existing auxiliary ingest Worker; response data therefore crosses the deployed architectural boundary. The harness owns startup, port selection, shutdown, and cleanup. Production probing and target-tier canary measurement remain separate activation gates.

## Verification

**Commands:**
- `pnpm run test:search` -- core plus genuine route E2E pass.
- `pnpm run test:pipeline` -- measured capacity and rollback pass.
- `pnpm run benchmark:search` -- writes raw 134-row FTS/fallback evidence and enforces provisional p95.
- `pnpm run check` -- typecheck, lint, and complete tests pass.

**Result (2026-08-09):** `test:search` 65 passed across unit/Workers/live route; `test:pipeline` 29 passed; live route 6 passed; benchmark 1 passed with 5 warmups + 50 samples per path and raw evidence. Capacity measured 147 actual publication statements, 3,553 binds, 104,295 SQL bytes total (2,508 max per statement), 45,630 bound-value bytes, and a complete rollback from a deliberate failure at statement 148 over 134 staged rows. Local evidence is provisional; neither target-tier performance nor the external Closin safe probe is claimed.

**Result (2026-08-09, review loop 1):** Focused live route 6 passed; benchmark 1 passed (FTS nearest-rank p95 30.306 ms, fallback p95 25.874 ms); focused capacity/rollback 2 passed; `test:search` 65 passed; `test:pipeline` 29 passed; `check` 148 passed, 2 skipped. Evidence now records 50 stable Offer IDs per path, raw response bytes, Apple M4/10 logical CPUs, baseline Git revision, and truthful dirty state. Capacity assertions read the checked-in artifact, including 101,047 serialized staged bytes and 2,972 canonical search-text bytes; rollback compares the dynamically selected active slot's exact contents and metadata. Target-tier measurement and the external safe probe remain unclaimed.

## Suggested Review Order

**User journey and honesty**

- Start with pagination, stable counts, degraded Store qualification, and retry context.
  [`search.tsx:46`](../../app/routes/search.tsx#L46)

- Review deterministic freshness and semantic compact-row labels.
  [`results.tsx:26`](../../app/design-system/results.tsx#L26)

- Confirm opaque continuation retry URL preservation independently.
  [`search-url.ts:1`](../../app/lib/search-url.ts#L1)

- Verify loader error context and retry composition share one typed payload.
  [`search-error.ts:11`](../../app/lib/search-error.ts#L11)

**Real route boundary**

- Inspect isolated migrations, seed sharing, Worker startup, port selection, and cleanup.
  [`live-app-harness.ts:38`](../../tests/e2e/live-app-harness.ts#L38)

- Follow the real SSR pagination, fallback, accessibility, responsive, and security journey.
  [`search-route.e2e.test.ts:32`](../../tests/e2e/search-route.e2e.test.ts#L32)

- Verify Vite uses the harness-owned persistence root.
  [`vite.config.ts:13`](../../vite.config.ts#L13)

**Executable evidence**

- Review raw-sample collection, identity/outcome checks, percentiles, bytes, and threshold enforcement.
  [`search-latency-benchmark.e2e.test.ts:52`](../../tests/e2e/search-latency-benchmark.e2e.test.ts#L52)

- Inspect actual publication batch metrics and 134-row capacity assertions.
  [`publication-pipeline.test.ts:477`](../../tests/workers/publication-pipeline.test.ts#L477)

- Verify the deliberately late failure rolls back the entire 134-row transaction.
  [`publication-pipeline.test.ts:569`](../../tests/workers/publication-pipeline.test.ts#L569)

**Release gates**

- Confirm the focused search command includes the live route test.
  [`package.json:24`](../../package.json#L24)

- Confirm CI installs Chromium before running the focused gate.
  [`ci.yml:33`](../../.github/workflows/ci.yml#L33)
