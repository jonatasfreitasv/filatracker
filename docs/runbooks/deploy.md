# Deploy, canary, verification, rollback, and secret handling
# Environments: local + production only (AD-11). No staging.

## Identities

| Identity | May | Must not |
| --- | --- | --- |
| Local / CI | Use emulated D1, local secrets (`.dev.vars`), run tests | Bind production D1, production secrets, migrate prod, deploy |
| Deploy (separate) | Deploy Workers, apply production migrations by immutable DB name, manage encrypted secrets | Commit secrets, disable CI gates |

Production Cloudflare account credentials for deploy/migrate are held only by the deploy identity. Local and CI tokens must be scoped to non-production resources.

## Prerequisites

1. CI green on the candidate commit (typecheck, lint, unit, contract N/N-1, worker integration, binding-denial, contrast, a11y/responsive contracts).
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

1. Deploy **ingest** first (Service Binding target must exist):

```bash
pnpm run deploy:ingest
# equivalent: wrangler deploy -c wrangler.ingest.jsonc
```

2. Canary the RPC surface (`getSearchPage`) against production ingest before activating web traffic on a new web version.
3. Deploy **web**:

```bash
pnpm run deploy:web
# equivalent: react-router build && wrangler deploy -c wrangler.web.jsonc
```

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

1. Confirm `getSearchPage` returns a typed `RpcOutcome` for empty Home (`ok`, zero hits).
2. Confirm invalid query mapping → non-cacheable 400.
3. Confirm forced ingest unavailability → non-cacheable 503 + `Retry-After` (never empty-as-failure).
4. Confirm `wrangler.web` binding inventory still has no D1/queues/schedules/Store secrets.

## Rollback

1. Roll back **web** first to the previous Workers version (immediate).
2. If ingest RPC is incompatible, roll back **ingest** to the last mutually accepted N/N-1 version.
3. Do not partially disable CI gates or substitute mocks to “restore” traffic.

```bash
wrangler rollback -c wrangler.web.jsonc
wrangler rollback -c wrangler.ingest.jsonc
```

## Forbidden

- Disabled CI gates, TODO deploy paths, runtime stubs, or mock substitution in production (AR30).
- Staging environment (AD-11).
- Binding production resources from local/CI identities.
