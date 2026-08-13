# Runz (FilaTracker)

Desktop control panel for **local development** of FilaTracker: start/stop the Vite + Workers stack, apply local D1 migrations, run checks, browse BMAD sprint status, and inspect local Wrangler D1 state.

## Prerequisites

- **Node** `>=22.22.0` and **pnpm** `11.20.0` (same as the project root)
- **Rust** toolchain (stable) and **Cargo**, for Tauri
- **macOS / Linux:** `lsof` in `PATH` for port discovery
- From the project root: `pnpm install`

## Run

From the repository root:

```bash
pnpm run runz
```

Or directly:

```bash
pnpm -C dev_tools/runz tauri dev
```

The first time you open Runz, set **Project root** to the absolute path of `filatracker` (the folder that contains `pnpm-workspace.yaml`, `wrangler.web.jsonc`, and `workers/`), then click **Save**. **Auto-detect** walks up from the current working directory.

## Tabs

| Tab | Purpose |
| --- | --- |
| **Apps** | Start/stop `pnpm run dev` / `preview`, logs, health probe, port sweep |
| **Env Setup** | Copy `.dev.vars`, local D1 migrate, `cf-typegen` |
| **Env Infos** | Runtime + file readiness checks |
| **Migrations** | `pnpm run db:migrate:local` |
| **Tests** | `test`, `test:homologation`, `probe:closin`, Runz tests |
| **Quality** | `typecheck`, `lint`, `test`, `check` |
| **Sprint** | BMAD `sprint-status.yaml` |
| **MD Viewer** | Markdown under `docs/`, `_bmad-output/`, root |
| **Data** | Browse local `.wrangler/state` D1 |
| **Terminals** | Cursor Agent / Codex / Claude Code / ZSH |

## Development

```bash
pnpm -C dev_tools/runz run typecheck
pnpm -C dev_tools/runz run test
pnpm -C dev_tools/runz tauri build
```

Rust sources live in `src-tauri/`; UI in `src/`.
