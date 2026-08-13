# Store homologation runbook (Closin + Voolt3D)

## Purpose

Homologate a Store adapter with fixtures + a bounded read-only production-safe probe.
There is **no staging environment** (AD-11).

## Where maps live

- `src/adapters/stores/<store>/map.ts` — versioned declarative map (Zod-validated)
- `src/adapters/stores/<store>/hooks.ts` — typed discovery/extraction only
- `src/adapters/stores/<store>/fixtures/` — recorded real-page evidence
- `src/adapters/stores/<store>/robots-evidence/` — robots audit evidence
- `src/adapters/stores/<store>/capacity/` — budgets, dry-run D1 inputs, probe results

Closin is the gold-standard template. Voolt3D mirrors the same layout under
`src/adapters/stores/voolt3d/`.

## Activation status

**Both Closin and Voolt3D publication activation remain BLOCKED by default**
(`activation_gate = blocked`, `support_state = unsupported` in D1 seed).

A Store may be **operator-activated for publication** only after:

1. Homologation gate passes (fixtures, robots, destination policy, budgets)
2. AD-8 bounded set-based D1 `batch()` protocol proof (reuse Stories 1.3/1.4 shape)
3. Migrations, atomicity, replay, rollback, purge verification succeed without stubs
4. A **current safe probe** and **explicit operator approval** set
   `activation_gate = approved` (tooling/runbook — not a public RPC)

Passing automated tests does **not** auto-activate either Store.

**Public search** projects visible Offers into rebuildable D1 FTS5 and serves
`getSearchPage` v2 hits over Service Binding. Unsupported/deactivated Stores are
excluded atomically from relational visibility and the active FTS slot.

Coverage honesty: never claim five-Store / full MVP coverage when only Closin,
Voolt3D, or fewer are active. Prefer `storeSupport`-derived copy.

Rollback: keep the Store inactive; pin/revert `mapVersion` / `parserVersion`;
retain prior Store generation on failed/quarantined/oversized runs.

See also: `docs/runbooks/ingestion-recovery.md`.

## Gate checklist (per Store)

| # | Gate | Closin evidence | Voolt3D evidence |
| --- | --- | --- | --- |
| 1 | Map schema validation | `loadClosinMap()` | `loadVoolt3dMap()` |
| 2 | Fixture suite green | `tests/unit/closin-fixtures.test.ts` | `tests/unit/voolt3d-fixtures.test.ts` |
| 3 | Robots evidence pass | `closin/robots-evidence/` | `voolt3d/robots-evidence/` |
| 4 | Safe probe pass | `CLOSIN_PROBE=1 pnpm run probe:closin` | `VOOLT3D_PROBE=1 pnpm run probe:voolt3d` |
| 5 | Destination policy pass | shared unit tests | shared unit tests |
| 6 | Source-identity + filament-eligibility + promotion | domain + fixtures | domain + fixtures |
| 7 | Completeness/run-outcome matrix | adapter outcomes | adapter outcomes |
| 8 | Adapter capacity + AD-8 D1 protocol | `closin/capacity/` | `voolt3d/capacity/` (protocol reuse) |
| 9 | Telemetry allowlist/redaction | shared | shared |
| 10 | Rollback evidence | inactive by default | inactive by default |

Gate **fails** if any production path uses a mock Store source (AR30).

## Freshness rules

- Stored robots evidence is **audit only**, never authorization.
- Production runs must refetch `/robots.txt` and reevaluate paths before catalog fetches.
- Max robots evidence age for operational use: 24h (`ROBOTS_FRESHNESS_MAX_AGE_MS`).

## Probe safety

- Hard caps: pages, bytes, duration, concurrency (`CLOSIN_BUDGETS` / `VOOLT3D_BUDGETS`)
- Probe runs are always non-publishing (`probeId != null`)
- Do not set production D1/Store secrets in the probe process
- Telemetry is allowlisted and redacts destination URLs / UA / payloads / digests

## CI

PR CI runs recorded fixtures, robots, destination-policy, budgets, binding/import guards,
pipeline/CAS/capacity worker tests, multi-Store isolation, and homologation scripts.
Live probes are optional/manual (`CLOSIN_PROBE=1` / `VOOLT3D_PROBE=1`) because they are network-dependent.

Closin live probe remains quarantined in deferred-work until a current safe probe succeeds.
