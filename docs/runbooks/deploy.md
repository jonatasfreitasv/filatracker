# Deploy, canary, verification, rollback, and secret handling
# Environments: local + production only (AD-11). No staging.

## Identities

| Identity | May | Must not |
| --- | --- | --- |
| Local / CI | Use emulated D1, local secrets (`.dev.vars`), run tests | Bind production D1, production secrets, migrate prod, deploy |
| Deploy (separate) | Deploy Workers, apply production migrations by immutable DB name, manage encrypted secrets | Commit secrets, disable CI gates |

Production Cloudflare account credentials for deploy/migrate are held only by the deploy identity. Local and CI tokens must be scoped to non-production resources.

## Prerequisites

1. CI green on the candidate commit (typecheck, lint, unit, strict SearchPage v2 contract, worker integration, binding-denial, contrast, a11y/responsive contracts).
2. `RPC_CAPABILITY_SECRET` generated per deployment and stored only as an encrypted Worker secret (never in git, logs, or client bundles).
3. Production D1 created; note the **immutable database name** (not the binding name) for migration commands.

## Local development

```bash
cp .dev.vars.example .dev.vars
pnpm install
pnpm run db:migrate:local
pnpm run dev
```

One Vite process exercises `web` + auxiliary `ingest` with the real Service Binding.

## Production migration

Use the immutable database name:

```bash
wrangler d1 migrations apply <IMMUTABLE_DB_NAME> --remote -c wrangler.ingest.jsonc
```

Never point local/CI credentials at production D1.

## Deploy order (mandatory)

1. Apply D1 migrations (including `0003_search_fts.sql` and `0004_voolt3d_store_state.sql`) to the immutable DB name.
2. Deploy **ingest** first with strict SearchPage **v2** acceptance (the initial pre-launch wire):

```bash
pnpm run deploy:ingest
```

3. Canary real published search + FTS/relational fallback against production ingest
   before activating web traffic.
4. Deploy **web** (emits/depends on SearchPage v2):

```bash
pnpm run deploy:web
```

5. Verify rollback by rolling web and ingest back together; there is no released v1 consumer to preserve.

## Secrets

```bash
# Web — deployment-scoped capability (commands verify later; provisioned now)
wrangler secret put RPC_CAPABILITY_SECRET -c wrangler.web.jsonc

# Ingest — same deployment-scoped value for future command verification
wrangler secret put RPC_CAPABILITY_SECRET -c wrangler.ingest.jsonc
```

Rotate by putting a new value and redeploying ingest then web. Never echo secrets in CI logs.

## Canary / verification

After ingest deploy, before or during web activation:

1. Confirm `getSearchPage` returns typed `RpcOutcome` for empty Home (`ok`, zero hits, null query).
2. Confirm a known published Closin query returns `offer` hits with Store text name and no CTAs.
3. Confirm a dual-Store canary (Closin + Voolt3D, when both are operator-activated) returns
   separate `offer` rows with distinct `storeId` / Store text names — never Merge, never
   “5 lojas” / full-MVP coverage copy beyond active `storeSupport`.
4. Confirm FTS failure path returns explicit `degraded` (never false empty no-match).
5. Confirm invalid query / cursor mapping → non-cacheable 400.
6. Confirm forced ingest unavailability → non-cacheable 503 + `Retry-After`.
7. Confirm `wrangler.web` binding inventory still has no D1/queues/schedules/Store secrets.
8. Confirm raw query text is absent from allowlisted logs (code + correlation ID only).
9. Confirm one Store unsupported/degraded does not hide the other Store’s last valid generation.

## Rollback

1. Roll back **web** first to the previous Workers version (immediate).
2. SearchPage v2 is the initial contract; roll ingest back with web if the RPC changes.
3. Do not drop FTS slots, `listing_title`, or `search_text` columns during rollback.
4. Introduce N/N-1 compatibility only after the first released SearchPage version exists.
5. Do not partially disable CI gates or substitute mocks to “restore” traffic.

```bash
wrangler rollback -c wrangler.web.jsonc
wrangler rollback -c wrangler.ingest.jsonc
```

## Forbidden

- Disabled CI gates, TODO deploy paths, runtime stubs, or mock substitution in production (AR30).
- Staging environment (AD-11).
- Binding production resources from local/CI identities.
