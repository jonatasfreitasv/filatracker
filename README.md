# FilaTracker

Comparação anônima de preços de listagem de filamentos 3D (pt-BR).

## Stack

- React Router v8 SSR on Cloudflare Workers (`create-cloudflare` official starter)
- Two Workers: public `filatracker-web` + non-public `filatracker-ingest`
- D1 only on ingest; web calls typed Service Binding RPC (`getSearchPage`)
- pnpm `11.20.0`, Node `>=22.22.0`

## Local

```bash
cp .dev.vars.example .dev.vars
pnpm install
pnpm run db:migrate:local
pnpm run dev
```

Desktop helper (start/stop, migrations, checks, sprint): `pnpm run runz`

## Checks

```bash
pnpm run check   # typecheck + lint + test
```

## Store maps / homologation

Store declarative maps live under `src/adapters/stores/<store>/`.
Homologation (fixtures + bounded read-only probe) **precedes** ingestion/publication.
Closin is the first real adapter and remains **not activated** for publication until Story 1.3 + operator activation.

See [docs/runbooks/store-homologation.md](docs/runbooks/store-homologation.md).

## Deploy

See [docs/runbooks/deploy.md](docs/runbooks/deploy.md). Deploy **ingest before web**.
