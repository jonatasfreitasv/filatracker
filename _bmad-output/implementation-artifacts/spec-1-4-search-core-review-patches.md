---
title: 'Harden Story 1.4 Search Core After Code Review'
type: 'bugfix'
created: '2026-08-09'
status: 'done'
review_loop_iteration: 4
baseline_commit: '6c50615d24bac055fa4b8096595dcbec24c9d891'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/1-4-search-published-closin-offers-end-to-end.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.4 passes its focused tests but can return incomplete or generation-mixed search results under pagination, FTS drift, and concurrent publication/rebuild/support transitions. Its pre-launch v1 compatibility is also unreachable and unnecessary.

**Approach:** Make v2 the initial SearchPage contract, give FTS projection mutations explicit transactional ownership, derive one canonical searchable document for both engines, and build every response from one read-only D1 batch with strict equivalence and cursor validation.

## Boundaries & Constraints

**Always:** Preserve the two-Worker authority boundary; keep D1 relational Offers as source of truth; use reviewed bounded SQL; keep both FTS slots safe under interleaving; return equivalent relational data as visibly degraded whenever FTS is missing, incompatible, or divergent; retain one evaluation instant, deterministic ordering, bounded output, redacted telemetry, and informational-only SSR behavior.

**Ask First:** Any new external service, public route/RPC method, production migration already applied outside local/test environments, or relaxation of a fail-closed invariant.

**Never:** Preserve the pre-launch v1 decoder, accept partial FTS as success, use multiple D1 calls to compose one successful snapshot, infer merchant fields, expose raw query/error data, add FTS triggers, or modify unrelated `dev_tools/runz` work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal search | Compatible complete FTS and relational projection | Same ordered identities, stable total, bounded v2 page and cursor from one batch | N/A |
| FTS mismatch | Missing/extra/reordered identity or incompatible metadata | Relational page from the same batch, outcome `degraded` | Safe qualification only |
| FTS failure | Virtual-table/read failure | A new relational-only batch supplies its own epochs and complete aggregate | `degraded`, or typed unavailable if fallback fails |
| Cursor continuation | Mixed ASC/DESC ties across multiple pages | No duplicate or skipped identities; total remains stable | Malformed/context-mismatched cursor returns `invalid` |
| Concurrent mutation | Publish, Store transition, display-name change, or rebuild interleaves | Active slot remains complete and cursors are invalidated by generation | Stale claim produces zero side effects |
| Query equivalence | Diacritics, punctuation, hyphen, quotes, and `PLA+` | FTS and fallback use identical folded whole-token semantics | Oversized/abusive input returns `invalid` |

</frozen-after-approval>

## Code Map

- `db/migrations/0003_search_fts.sql` -- pre-launch schema for canonical search text, FTS tokenization, rebuild ownership, and transition fencing.
- `src/domain/search-query.ts` -- shared query/document lexer and bounded canonical search text.
- `src/adapters/persistence/fts-writer.ts` -- dual-slot writes plus claimed, validated, cleanup-safe shadow rebuild.
- `src/adapters/persistence/publish-batch.ts` -- claim-bound staged identities and atomic relational/FTS projection writes.
- `src/adapters/persistence/store-health.ts` -- token-fenced support transitions and display metadata generation.
- `src/adapters/persistence/d1-search-catalog.ts` -- one-batch FTS/relational aggregate, equivalence, hydration, ordering, and totals.
- `src/adapters/persistence/search-cursor.ts` -- strict opaque cursor contract.
- `src/contracts/search-page.ts` -- v2-only wire schemas and pagination invariants.
- `src/domain/policy/price-per-kg.ts` -- safe-integer monetary derivation.

## Tasks & Acceptance

**Execution:**
- [x] `src/contracts/search-page.ts`, `src/contracts/index.ts`, RPC tests/client -- keep strict v2-only behavior; bound every cursor/query/qualification/error field and enforce cursor/flag coherence.
- [x] `src/domain/search-query.ts`, `db/migrations/0003_search_fts.sql`, persistence schema -- keep canonical `search_text`; reject oversized raw input before normalization and bind cursors with a compact deterministic query digest.
- [x] `src/adapters/persistence/search-cursor.ts`, publication normalization, `src/domain/policy/price-per-kg.ts` -- canonicalize every persisted/search-ordered instant (not only cursor payloads), keep exact safe fields/arithmetic, and cap derived money to the SearchHit wire bound.
- [x] `src/adapters/persistence/fts-writer.ts` -- use expiring/reclaimable rebuild ownership, fence cutover by versions/epochs/generation, validate with bounded scalar SQL, catch metadata-read, UUID, and claim failures as typed results, and clean only an owned inactive slot.
- [x] `src/adapters/persistence/publish-batch.ts`, `src/adapters/persistence/store-health.ts` -- preselect the active slot only as a mutation-plan hint; condition the publication/support claim inside the atomic batch on that exact slot; prepare writes only for the selected table; make selector failure or slot-race produce zero relational/FTS/meta/audit effects; preserve Store/run/token fencing and display-name generation bumps.
- [x] `src/adapters/persistence/d1-search-catalog.ts` -- use a bounded active-slot selector only as a query-plan hint, then let that selected FTS slot produce ordered `limit + 1` rows in one complete batch that revalidates the slot from its own metadata; never issue inactive-slot MATCH statements; require bounded scalar global symmetric-difference counts between eligible canonical relational matches and selected-slot matches so missing and extra/misindexed documents cannot compensate; validate empty-query pages with the same strict schema/size guard; retain slot-race degradation, safe epochs/cursors, ordered boundary equivalence, wire-safe hydration/counts, envelope headroom, and classified fallback.
- [x] `workers/ingest.ts`, `src/application/get-search-page.ts`, `src/adapters/service-binding/client.ts`, `src/application/ports.ts` -- carry one correlation ID through the Worker deadline boundary, application, catalog, and safe logs; enforce the remaining end-to-end deadline on every RPC attempt and keep the obsolete split snapshot methods removed.
- [x] `tests/unit/story-1-4-contracts.test.ts`, `tests/workers/search-pipeline.test.ts`, RPC tests, publication tests -- prove compensated missing+extra/misindexed FTS identities degrade even when count and early page boundary match; a broken inactive slot cannot degrade reads or block publication/support; slot changes after mutation selection yield zero side effects; empty-query invalid/oversized aggregates fail typed; retain all slot-race, epoch/cursor, correlation, mixed-offset, rebuild, wire-bound, stale-claim, lease, and interleaving regressions.
- [x] Story/context/runbooks/capacity artifacts -- record v2-only pre-launch policy, check off review findings, and update measured FTS statement cost without altering unrelated work.

**Acceptance Criteria:**
- Given any valid page chain at one generation, when all cursors are followed, then every matching identity appears exactly once in deterministic order with one stable total.
- Given FTS failure, incompatibility, or any ordered divergence, when search runs, then it never returns a false `ok` or false empty result.
- Given stale/concurrent publication, support transition, or rebuild ownership, when its CAS loses, then relational state, both FTS slots, metadata, and audit remain consistent.
- Given v1 or an unknown SearchPage envelope, when decoded before first release, then it fails closed; strict v2 remains the only supported wire.

## Spec Change Log

- 2026-08-09: Implemented all approved review patches; strict v2-only search, transactional FTS ownership/fencing, one-batch aggregate equivalence, cursor/order hardening, tests, deploy policy, and measured 134-row capacity evidence are complete.
- 2026-08-09 review loop 1: Independent review found that `ok` pages were still produced entirely by the relational query while FTS only checked set counts; it also exposed permanent rebuild ownership and unclassified whole-batch retry. The code map/tasks now require the active FTS slot to drive ordered hydrated page rows, ordered boundary equivalence, classified fallback, expiring ownership, bounded SQL validation, strict wire bounds, and real deadline enforcement. KEEP: v2-only initial wire, canonical `search_text`, safe price arithmetic, strict cursor structure, claim-bound publication/support writes, metadata-selected active-slot writes, mixed-direction keyset ordering, stable totals, one-batch snapshots, and all existing green regressions.
- 2026-08-09 review loop 1 implementation: Completed every reopened task without changing the frozen intent or KEEP invariants. Active FTS rows now drive healthy pages, ordered page/lookahead equivalence gates `ok`, only classified FTS failures receive one relational retry, rebuild leases are reclaimable and scalar-validated, RPC retries share one remaining deadline, wire/raw bounds and compact query digests are enforced, and deterministic D1/unit regressions cover the repaired paths.
- 2026-08-09 review loop 2: Independent review proved that accepted offset timestamps were normalized only inside cursors while persisted TEXT remained lexicographically ordered; it also found pre-claim rebuild exceptions escaping the typed result and valid persisted values exceeding strict SearchHit/envelope bounds. Amended persistence, aggregate, and test tasks to require canonical stored instants, typed failures across the full rebuild, cursor/query context enforcement, wire-safe hydration/counts, and final-envelope headroom. Known-bad state avoided: tests that validate cursor normalization without exercising persisted mixed-offset pagination, and page-only size checks that still emit an invalid RPC envelope. KEEP: active FTS rows drive healthy pages; ordered relational equivalence gates `ok`; classified fallback is single-shot; leases are reclaimable and scalar-validated; the RPC deadline is shared; v2-only bounds, query digest, one-batch snapshots, transactional publication/support fencing, and all green regressions survive re-derivation.
- 2026-08-09 review loop 2 implementation: Canonical UTC instants now enter staging and persistence before lexical freshness/order comparisons, including correction writes; a real mixed-offset D1 page chain verifies stored chronology. Rebuild metadata/claim exceptions return typed `batch_failed`; cursor/query coherence, money/diameter/total limits, final-envelope headroom, and correlation-safe Service Binding logs are enforced with deterministic regressions. Frozen intent and every KEEP invariant remain unchanged.
- 2026-08-09 review loop 3: Independent review found that the one-batch aggregate still issued MATCH queries against both physical slots and selected metadata afterward, so failure of an inactive slot unnecessarily degraded a healthy active slot. It also found unchecked 64-bit epochs and split correlation IDs across the Worker deadline/application boundary. Amended the aggregate task to allow one bounded slot-selector read solely as a query-plan hint, followed by one complete response-producing batch that revalidates the selected slot and never reads the inactive table; selector failure or a slot race uses a complete relational degraded batch. Added safe-epoch/cursor checks, full typed rebuild coverage, and one end-to-end correlation ID. Known-bad state avoided: dual-slot MATCH inside one batch, pre-read values leaking into a response, and unrelated correlation IDs for the same timed-out operation. KEEP: canonical UTC persistence, active FTS-driven healthy rows, ordered equivalence, single-shot classified fallback, reclaimable scalar-validated rebuilds, strict v2/wire bounds, shared deadline, transactional fencing, and every green regression.
- 2026-08-09 review loop 4: Independent review found that raw FTS count plus the current page boundary could accept a missing legitimate document compensated by an orphan or misindexed document, and that publication/support still opened both physical FTS tables despite active-slot predicates. Amended reads to require scalar global symmetric difference with identical eligibility/parser semantics, and mutations to preselect one slot but acquire their in-batch claim only when metadata still names that slot; only the claimed table is prepared. Added strict empty-page validation. Known-bad state avoided: compensated divergence returning false `ok`, and a broken inactive table aborting active writes. KEEP: response data remains one-batch, selector values never enter envelopes, slot races degrade reads or no-op writes, plus every loop-3 KEEP invariant and green regression.
- 2026-08-09 review loop 3 implementation: Search now reads one bounded active-slot hint and prepares MATCH only for that fixed table; the complete batch independently revalidates its metadata, and selector failure or a slot race yields relational `degraded` data solely from that batch. Safe epochs and cursor money bounds fail typed, rebuild UUID failure is contained, and one caller correlation ID crosses Service Binding, Worker deadline, application, catalog, logs, retries, and native deadline outcomes. Frozen intent and every KEEP invariant remain unchanged.
- 2026-08-09 review loop 4 implementation: Healthy search now requires zero relational-only and zero selected-FTS-only identities across the full eligible token predicate, so compensated drift cannot pass count or early-boundary checks. Publication and support transitions compile only the preselected table and acquire their first in-batch claim/CAS only while metadata still names that slot; selector failure is typed, a slot race produces no guarded effects, and a dropped inactive table is irrelevant. Empty-query aggregates use the strict page schema and byte guard. The AD-8 artifact now records the measured selected-slot shape (148 statements, 3556 binds at 134 rows). Frozen intent and every KEEP invariant remain unchanged.
- 2026-08-09 review loop 4 final patch: Adversarial review found raw persisted cursor boundaries could reach the encoder and support-transition UUID generation could escape typed outcomes. Cursor construction now validates availability, money, canonical UTC time, and bounded identity before encoding, with a final exception guard; UUID failure returns `batch_failed` before batching. The capacity gate now explicitly requires target-tier remeasurement before activation. Deterministic regressions cover every cursor-bound field and the UUID failure path.

## Design Notes

Because D1 exposes transactional snapshot behavior through `batch()` rather than a callback transaction handle, a successful aggregate must return metadata, support, suggestions, relational comparison rows, and the active FTS slot's ordered hydrated `limit + 1` rows from one batch. The FTS rows, not the relational comparison rows, produce an `ok` page. Equality covers total count, ordered page identities, and lookahead at the current cursor boundary. A specifically classified FTS failure may start exactly one complete relational batch whose own metadata populates a degraded response; unrelated batch failures do not trigger duplicate work. Publication/support SQL selects the metadata-designated active slot inside its transaction. Rebuild ownership has a bounded lease that a later attempt can reclaim, and validation uses scalar SQL counts/differences rather than materializing the catalog in Worker memory.

All accepted instants used for persistence ordering are canonical UTC strings before comparison or storage, so the mixed-direction keyset and publication freshness predicates share one chronological representation. Hydration must never construct values rejected by the strict v2 contract: derived money and diameter are bounded or safely nulled, an over-limit total becomes typed overload, and the catalog reserves enough bytes for the application envelope rather than measuring only the page body. A cursor is meaningful only with a non-empty canonical query. The rebuild's typed error surface begins before metadata acquisition and ownership claim.

The physical active slot may be read once before the aggregate only to choose which fixed FTS table is compiled into SQL. That selector contributes no response data. The subsequent batch rereads all metadata and accepts FTS as healthy only if its `active_slot` still equals the selected table; otherwise its own relational rows and metadata form a degraded response. Consequently a successful or degraded response is still composed from exactly one batch, while the inactive slot is never opened by search.

The same plan-hint pattern applies to mutations, but their transactional claim must include the selected slot as a CAS fence before any Store, Offer, FTS, generation, or audit write can occur. A slot race therefore makes the entire guarded batch a no-op and the caller receives a typed retryable failure. Search equivalence includes scalar relational-only and FTS-only identity counts over the full bounded predicate, so equal totals and an equal early boundary cannot hide compensated drift.

## Verification

**Commands:**
- `pnpm run test:search` -- contract and real emulated-D1 search suites pass.
- `pnpm run test:pipeline` -- publication fencing and capacity-sensitive pipeline tests pass.
- `pnpm run check` -- typecheck, lint, unit, Worker, and E2E-configured suites remain green.

**Result (2026-08-09, review loop 1):** `test:search` 43 passed; `test:pipeline` 26 passed; `check` 151 passed, 1 skipped.

**Result (2026-08-09, review loop 2):** `test:search` 46 passed; `test:pipeline` 26 passed; `check` 154 passed, 1 skipped.

**Result (2026-08-09, review loop 3):** `test:search` 52 passed; `test:pipeline` 26 passed; `check` 161 passed, 1 skipped.

**Result (2026-08-09, review loop 4):** `test:search` 58 passed; `test:pipeline` 28 passed; focused loop-4 suites 50 passed; `check` 169 passed, 1 skipped.

## Suggested Review Order

**Snapshot integrity and FTS equivalence**

- Start with the response-producing aggregate, slot revalidation, and typed degradation decisions.
  [`d1-search-catalog.ts:367`](../../src/adapters/persistence/d1-search-catalog.ts#L367)

- Verify global symmetric difference prevents compensated missing and extra documents.
  [`d1-search-catalog.ts:214`](../../src/adapters/persistence/d1-search-catalog.ts#L214)

- Check mixed-direction cursor boundaries and raw tuple validation before encoding.
  [`d1-search-catalog.ts:482`](../../src/adapters/persistence/d1-search-catalog.ts#L482)

**Transactional slot ownership**

- Publication preselects one slot, then fences that choice inside its claim.
  [`publish-batch.ts:130`](../../src/adapters/persistence/publish-batch.ts#L130)

- Support transitions use the same selected-slot CAS and token-guarded effects.
  [`store-health.ts:122`](../../src/adapters/persistence/store-health.ts#L122)

- Shared selector and rebuild lease preserve inactive-slot isolation and safe cutover.
  [`fts-writer.ts:16`](../../src/adapters/persistence/fts-writer.ts#L16)

**Wire, deadline, and correlation boundaries**

- Strict v2 schemas normalize UTC and bound every response field.
  [`search-page.ts:18`](../../src/contracts/search-page.ts#L18)

- One correlation ID and remaining deadline cross every Service Binding attempt.
  [`client.ts:33`](../../src/adapters/service-binding/client.ts#L33)

- Worker deadline handling propagates the same identifier into application and catalog.
  [`ingest.ts:30`](../../workers/ingest.ts#L30)

**Regression evidence**

- Search Workers cover pagination, drift compensation, slot races, and inactive failures.
  [`search-pipeline.test.ts:160`](../../tests/workers/search-pipeline.test.ts#L160)

- Publication Workers prove selected-slot writes and zero-effect lost claims.
  [`publication-pipeline.test.ts:846`](../../tests/workers/publication-pipeline.test.ts#L846)

- Contract tests exercise unsafe epochs, cursors, rebuild failures, and correlation.
  [`story-1-4-contracts.test.ts:313`](../../tests/unit/story-1-4-contracts.test.ts#L313)

- Capacity evidence records reduced fixed cost and mandatory target-tier remeasurement.
  [`capacity-artifact.json:36`](../../src/adapters/stores/closin/capacity/capacity-artifact.json#L36)
