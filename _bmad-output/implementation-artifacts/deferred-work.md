# Deferred Work

## Deferred from: code review of 1-1-set-up-the-initial-project-from-the-official-starter (2026-08-08)

- ~~Home's `"ok"` kind with non-empty hits is never rendered by `app/routes/home.tsx`~~ — **closed in Story 1.4**: null-query invariant keeps Home search-only; non-empty Home hits are treated as an impossible-state message, not a catalog dump.
- ~~`MoneyCentavosSchema` zero/free-price~~ — **closed in Story 1.4**: positive-centavos policy remains fail-closed; zero/free/invalid merchant prices stay null and are not displayed as R$ 0.00 (architecture decision deferred until a separate money-schema change is approved).

## Deferred from: code review of 1-3-publish-closin-through-the-deterministic-pipeline (2026-08-09)

- `wrangler.ingest.jsonc` `INGEST_QUEUE` producer/consumer points at `filatracker-ingest-local` / `filatracker-ingest-dlq-local` with no production override in this diff — deferred: production deploy config not yet defined; real environment/queue names will be set in a future infrastructure/deploy story.
- Missing FK constraints from `ingestion_runs`/`ingestion_inbox`/`retained_payloads`/`offers`/`staged_offers`/`price_points`/`publication_claims` to `store_state(store_id)` permit rows against a nonexistent store (`db/migrations/0002_ingestion_publication.sql`); low real-world risk since store_id is internally controlled by the compiled Store manifest, not user input.
- AD-8 capacity artifacts (`capacity-artifact.json`, `d1-dry-run-fixture.json`) were hand-edited with a "passed-story-1-3" status and a statement-count estimate carried over from Story 1.2 that doesn't match the actual set-based batch shape delivered; should be regenerated from a real measurement, not a hand edit, before activation sign-off. **Story 1.4 note:** publication batches now include three additional set-based FTS statements (DELETE slot docs, INSERT eligible docs, bump `search_write_generation`) — remeasure statement/bind/byte budgets against the Closin 134-row bound before activation.
## Deferred from: code review of 1-4-search-published-closin-offers-end-to-end (2026-08-09)

- Obtain a current successful production safe probe before activating Closin; the latest recorded probe remains quarantined with zero observations, and operator/network authority is required.

## Deferred from: code review of 1-4-search-published-closin-offers-end-to-end (2026-08-09) — completion validation

- Client timeout cannot abort in-flight D1 `batch()` aggregate work after the web Promise.race deadline fires — Cloudflare Workers/D1 cancellation limit; remaining-budget propagation is a separate patch.
- CI `test:search` does not invoke `benchmark:search`, so provisional p95 evidence is not continuously regression-gated; keep as release-evidence policy until a cheaper CI sample profile exists.
- Checked-in `docs/evidence/search-latency-134.json` records `git.dirty: true` against baseline `6c50615…`; recapture on a clean tree before treating the artifact as reproducible release proof.

## Deferred from: code review of 1-5-search-across-two-real-stores (2026-08-10) — chunk A (Voolt3D adapter)

- `pagination.kind: "sitemap-index"` declared in `voolt3d/map.ts` but never dereferenced (only a single `/sitemap.xml` document is fetched) — identical unused field exists verbatim in `closin/map.ts`, so this is pre-existing template debt, not introduced by Story 1.5.
- `budget.decompressedBytes` is never computed from actual decompressed size — it's a verbatim copy of `encodedBytes` in both the Voolt3D and Closin adapters, because the shared `safeFetchText` helper never returns a separate decompressed byte count.
- Voolt3D capacity numbers (213 catalog URLs, ~506KB PDP) are self-reported manual measurements, not backed by the gated `VOOLT3D_PROBE=1` run (`last-probe-result.json` shows `recordedAt: null`) — this is the intended pre-activation state; `activation-gate.md` already tracks "safe probe pass" as the one unchecked, operator-gated item.
- `String.length` used as a byte-budget proxy under-counts multi-byte UTF-8 vs. true byte size; unbounded price magnitude has no sanity ceiling; multiple weight tokens without a kit keyword silently pick the first match; `inferMaterialColor` hardcodes English marketing tokens ("High Speed", "Premium") — all identical pre-existing patterns in the Closin adapter, not introduced by this story.

## Deferred from: code review of 1-5-search-across-two-real-stores (2026-08-10) — chunk B (queue/schedule + migration)

- Hardcoded `recovery_epoch_snapshot = 1` and no `INSERT OR IGNORE`/`ON CONFLICT` on the Voolt3D seed insert (`db/migrations/0004_voolt3d_store_state.sql`) — identical bare-INSERT, hardcoded-epoch pattern already exists in Closin's `0002_ingestion_publication.sql` seed; not new to this story.
- `RECOVERY_EPOCH` env var silently coerces any non-numeric/negative value to `0` with no logging (`parseRecoveryEpoch` in `src/adapters/queue/handlers.ts`) — low likelihood since it's operator-set infra config (`wrangler.ingest.jsonc` sets it to `"1"`), same risk class as other unvalidated env-var trust already accepted in the ingest Worker.
- Queue/DLQ names carry a `-local` suffix with no per-environment override visible in `wrangler.ingest.jsonc` — already tracked as deferred work from the Story 1.3 review above; production deploy config not yet defined.
- New cron cadence (`0 */6 * * *`) and unchanged `max_batch_size`/`max_retries` in `wrangler.ingest.jsonc` are unanalyzed for two stores now sharing one queue — operational tuning question requiring operator input on expected Voolt3D catalog cadence, not a code defect.
