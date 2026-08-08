# Store homologation runbook (Closin)

## Purpose

Homologate a Store adapter with fixtures + a bounded read-only production-safe probe.
There is **no staging environment** (AD-11).

## Where maps live

- `src/adapters/stores/<store>/map.ts` — versioned declarative map (Zod-validated)
- `src/adapters/stores/<store>/hooks.ts` — typed discovery/extraction only
- `src/adapters/stores/<store>/fixtures/` — recorded real-page evidence
- `src/adapters/stores/<store>/robots-evidence/` — robots audit evidence
- `src/adapters/stores/<store>/capacity/` — budgets, dry-run D1 inputs, probe results

Closin is the gold-standard template for later Stores.

## Activation status

**Closin remains NOT activated for publication.**

Activation stays blocked until:

1. This homologation gate passes (Story 1.2)
2. Story 1.3 completes the AD-8 bounded set-based D1 `batch()` proof
3. An operator explicitly activates coverage

Rollback: keep the Store inactive; pin/revert `mapVersion` / `parserVersion` without partial publish.

## Gate checklist

| # | Gate | Evidence |
| --- | --- | --- |
| 1 | Map schema validation | `StoreMapSchema.parse(closinMap)` + unit tests |
| 2 | Fixture suite green | `tests/unit/closin-fixtures.test.ts` |
| 3 | Robots evidence pass | `robots-evidence/homologation-evidence.json` + robots unit tests |
| 4 | Safe probe pass | `CLOSIN_PROBE=1 pnpm exec vitest run tests/unit/closin-probe.test.ts --project unit` |
| 5 | Destination policy pass | `tests/unit/destination-policy.test.ts` |
| 6 | Source-identity + filament-eligibility + promotion policy | domain unit tests + fixtures |
| 7 | Completeness/run-outcome matrix | `store-contracts` + adapter failure outcomes |
| 8 | Adapter capacity + **pending** AD-8 D1 proof | `capacity/capacity-artifact.json` (`ad8ProofStatus: pending-story-1-3`) |
| 9 | Telemetry allowlist/redaction; sink disabled | `telemetry-redaction.ts` + budget tests |
| 10 | Rollback evidence | Store inactive; map/parser pins; no publication path in 1.2 |

Gate **fails** if any production path uses a mock Store source (AR30).

## Freshness rules

- Stored robots evidence is **audit only**, never authorization.
- Production runs must refetch `/robots.txt` and reevaluate paths before catalog fetches.
- Max robots evidence age for operational use: 24h (`ROBOTS_FRESHNESS_MAX_AGE_MS`).

## Probe safety

- Hard caps: pages, bytes, duration, concurrency (`CLOSIN_BUDGETS`)
- No D1 Offer/FTS writes, no queues, no projection-epoch mutation
- Do not set production D1/Store secrets in the probe process
- Telemetry is allowlisted and redacts destination URLs / UA / payloads

## CI

PR CI runs recorded fixtures, robots, destination-policy, budgets, and binding/import guards.
Live probe is optional/manual (`CLOSIN_PROBE=1`) because it is network-dependent.
