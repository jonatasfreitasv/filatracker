# Search latency measurement (Story 1.4 provisional + Story 1.5 dual-Store notes)

Run `pnpm run benchmark:search` from a migrated checkout with Chromium installed.
The command creates a unique temporary Wrangler persistence root, migrates and
seeds exactly 134 published Closin Offers (Story 1.4 dataset), starts the real
React Router SSR Worker with the auxiliary ingest Worker, and removes all state
on exit.

**Dual-Store catalog bounds (Story 1.5, measured offline — not production latency):**

| Store | Measured catalog | Bound (+≥20% margin) |
| --- | --- | --- |
| Closin | 111 | 134 |
| Voolt3D | 213 | 256 |
| Combined upper planning envelope | — | 390 |

Do **not** invent production p95 from local emulation. The executable gate still
uses the Closin 134-row dataset below as release-evidence policy.

It discards five warm-up requests and records 50 raw samples for each path:

- `q=filamento`: healthy FTS result, hydrated from relational D1 facts.
- `q=fallback`: intentional FTS/document divergence, producing the equivalent
  relational page with the explicit degraded qualification.

Both paths traverse React Router SSR → Service Binding → ingest Worker → D1 and
materialize 50 of 134 results. The executable gate checks HTTP outcome,
`Cache-Control: no-store`, visible qualification, and identical first-page
Offer IDs before accepting samples. It records response byte sizes,
contract/index/parser versions, Node/OS/CPU device details, Git revision and dirty
state, every raw latency, nearest-rank p50, p95, and max in
[`../evidence/search-latency-134.json`](../evidence/search-latency-134.json).

The command exits nonzero if either nearest-rank p95 is not below the provisional
500 ms target. This is local emulation evidence only: `targetTierMeasured` remains
false, and activation still requires a separate target-tier canary measurement.
