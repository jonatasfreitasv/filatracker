# Ingestion recovery runbook (AD-24)

## Purpose

Advance the external **recovery epoch**, restore D1 safely, and resume ingestion
without accepting late/old-epoch/poison deliveries into publication.

Recovery-epoch authority is a **non-secret ingest deployment/config value**
(`RECOVERY_EPOCH` in `wrangler.ingest.jsonc`). D1 stores only the last accepted
audit snapshot (`store_state.recovery_epoch_snapshot`).

## Pause → increment → deploy → restore → validate → resume

1. **Pause** scheduled discovery and queue consumers (disable cron / pause queue).
2. **Increment** `RECOVERY_EPOCH` in ingest vars (monotonic; never decrease).
3. **Deploy ingest** with the new epoch (before web; web has no queue/D1).
4. **Restore** D1 from backup if required. Do **not** treat restored
   `recovery_epoch_snapshot` as authority — the deployed `RECOVERY_EPOCH` wins.
5. **Validate**:
   - Old-epoch queue messages ACK as no-ops
   - Expired/purged retained payloads → DLQ / quarantine policy
   - Generation CAS rejects mismatched fences
   - Inbox idempotency prevents double publication
6. **Resume** schedule/consumers.
7. Update `store_state.recovery_epoch_snapshot` on the next successful accepted
   publish path so audit matches the live authority.

## Replay

- Poison / digest / unsupported-version deliveries follow quarantine then DLQ
  after `max_retries`.
- Operator-authorized replay only: re-enqueue a new envelope with a fresh
  `messageId` and the **current** recovery epoch, referencing an unexpired
  retained payload artifact.
- Never put full merchant HTML or the retained structured payload in the Queue
  body — digest + artifact id only.

## Purge

Retained payloads expire (`expires_at`). After the recovery/retry/DLQ horizon,
mark `purged_at` and delete `payload_json`. Purge evidence must survive until
the horizon elapses.

## FTS5 export / restore (Story 1.4 / AD-9 / AD-24)

D1 export does **not** support databases containing virtual tables.

1. **Before export:** drop FTS virtual tables (`search_fts_a`, `search_fts_b`)
   while retaining `search_projection_meta` and relational SoT.
2. **Export / import** the relational database.
3. **After import:** recreate FTS virtual tables (see `db/migrations/0003_search_fts.sql`),
   run `rebuildSearchFtsShadow` (FTS-only restore) or `rebuildTaxonomyAndFtsShadow`
   (taxonomy version cutover) from relational SoT under captured projection epoch +
   taxonomy_version + search-write generation, validate ordered identity set, CAS-activate
   the shadow slot together with `taxonomy_version`, and only then resume search/browse
   traffic. Mixed taxonomy versions must not become public. Coverage copy still forbids
   claiming five Stores.
4. Never serve reads from a partially built shadow slot.
