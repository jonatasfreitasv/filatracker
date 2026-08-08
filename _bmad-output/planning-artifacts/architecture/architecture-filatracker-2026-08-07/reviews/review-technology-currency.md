# Reviewer Gate — Technology Currency and Platform Fit

**Artifact reviewed:** `ARCHITECTURE-SPINE.md`  
**Review date:** 2026-08-07  
**Method:** final re-read of the updated spine; live npm registry checks for every named package/version; current official Cloudflare Service Binding RPC, Wrangler, React Router, Workers, D1, Queues, FTS5, and migration documentation; React Router runtime requirements; comparison with the previously generated `create-cloudflare@2.70.17` React Router starter.

## Verdict

**PASS WITH ONE LOW-SEVERITY ADVISORY.**

The two-Worker Service Binding/no-web-D1 topology is directly supported by current Cloudflare Workers. The prior high-severity D1 authority mismatch is closed: `web` has only a Service Binding, while non-public `ingest` alone holds the authoritative D1 binding and exposes a narrow RPC surface.

All package versions remain real, current npm `latest` releases where the spine claims current resolutions. Starter ranges, TypeScript, Node, multi-Worker extension, D1/Drizzle fit, FTS5, migrations, Queues, and recovery caveats remain accurate.

No critical, high, or medium technology-currency/fit findings remain.

## Final Topology Verification

### Two Workers with Service Binding RPC — PASS

Cloudflare Service Bindings officially allow one Worker to call another without using a publicly accessible URL. RPC through `WorkerEntrypoint` is the recommended mode for internal method-oriented APIs:

- the caller declares a `services` binding in Wrangler;
- the bound Worker exposes only its declared RPC methods;
- only Workers on the account with the binding can call those methods;
- a target Worker need not expose a public route;
- local multi-Worker Service Bindings are supported;
- one web → ingest call is well within the 32-Worker-invocation request-chain limit.

The spine accurately applies this:

- `web` owns public React Router SSR;
- `web` has no D1, queue, schedule, Store-secret, or migration binding;
- `web` calls only versioned product-query and fail-open event/outbound RPC methods;
- `ingest` alone binds D1 and owns persistence adapters;
- `ingest` can combine RPC entrypoints with queue and scheduled handlers;
- `ingest` has no public route and returns no raw SQL/arbitrary-execution capability;
- separate Wrangler configs and CI binding-matrix tests enforce the deployment boundary.

For first deployment, Cloudflare requires the Service Binding target (`ingest`) to exist before deploying the caller (`web`). This is an implementation/release-order requirement, not an architecture defect.

### D1 authority boundary — PASS

The former issue was that a D1 Worker binding cannot be made read-only or table-scoped. The updated spine no longer attempts that unsupported configuration. Instead:

- `wrangler.web.jsonc` contains no D1 binding;
- `wrangler.ingest.jsonc` is the sole authoritative D1 binding;
- RPC methods provide the platform-enforced reachability boundary;
- versioned schemas and narrow method definitions provide the application contract;
- no generic `fetch` proxy, query string, statement, or persistence escape hatch is exposed.

This is a valid platform-enforced privilege separation model for exactly two Workers.

## Prior Finding Closure

### Starter ranges and lockfile authority — CLOSED

The spine correctly records starter declarations separately from exact lockfile resolutions:

- `react-router ^8` → 8.3.0
- `React ^19.2.7` → 19.2.8
- `@cloudflare/vite-plugin ^1.51.0` → 1.51.0
- `Wrangler ^4.119.0` → 4.119.0
- `Vite ^8.0.3` → 8.2.1
- `TypeScript ^5.9.3` → 5.9.3

It no longer calls semver ranges exact pins and correctly makes the committed lockfile authoritative.

### TypeScript starter default — CLOSED

The starter declaration/resolution is correctly represented as TypeScript `^5.9.3` / 5.9.3. TypeScript 7.0.2 remains the registry’s current release but is not misrepresented as a starter default.

### Node baseline — CLOSED

Node.js `>=22.22.0` matches the live `react-router@8.3.0` engine requirement and satisfies the other selected build tools.

### Two-Worker starter extension — CLOSED

The spine preserves `workers/app.ts`, adds `workers/ingest.ts`, provides separate Wrangler configs, defines the Service Binding boundary, and separates runtime bindings and deployment identities. It no longer presents the second Worker as starter-generated.

### D1 FTS5 recovery caveat — CLOSED

AD-24 and the operational envelope correctly require dropping/recreating FTS virtual tables around D1 export. Rebuildable FTS and projection-epoch fencing make the documented Cloudflare workaround coherent.

### D1, Drizzle, migrations, testing, and Queues fit — CLOSED

- D1 supports FTS5 and transactional `batch()`.
- Drizzle ORM supports the D1 Worker binding.
- Wrangler supports versioned D1 SQL migrations and Drizzle nested layouts.
- Vitest 4.1.10 and `@cloudflare/vitest-pool-workers` 0.20.2 are compatible.
- Queues remains at-least-once, with one active consumer Worker per queue and concurrent invocations; the spine requires idempotency and durable inbox handling.

## Remaining Advisory

### F-1 — LOW — WCAG 2.1 AA is valid but not the latest W3C target

WCAG 2.1 remains a stable, referenceable W3C Recommendation, so the spine’s commitment is valid. W3C encourages WCAG 2.2, which is backward-compatible and adds nine success criteria. WCAG 2.2 AA is the more current default unless a regulatory baseline specifically calls for 2.1.

This advisory does not block the technology gate.

## Currency and Compatibility Matrix

| Commitment | Live status on 2026-08-07 | Result |
| --- | --- | --- |
| create-cloudflare 2.70.17 | npm `latest`; official starter CLI | Pass |
| react-router 8.3.0 | npm `latest`; Node >=22.22; React >=19.2.7 | Pass |
| React 19.2.8 | npm `latest` | Pass |
| @cloudflare/vite-plugin 1.51.0 | npm `latest`; official Workers integration | Pass |
| Wrangler 4.119.0 | npm `latest`; Service Binding/D1/Queues configuration | Pass |
| Vite 8.2.1 | npm `latest`; compatible with React Router and Cloudflare plugin | Pass |
| TypeScript 5.9.3 starter resolution | Accurate starter resolution | Pass |
| Node.js >=22.22.0 | Matches React Router v8 engine floor | Pass |
| pnpm 11.20.0 | npm `latest`; Node floor satisfied | Pass |
| drizzle-orm 0.45.2 | npm `latest`; D1 driver supported | Pass |
| drizzle-kit 0.31.10 | npm `latest`; D1 migration layout supported | Pass |
| Zod 4.4.3 | npm `latest`; runtime-neutral | Pass |
| Vitest 4.1.10 | npm `latest`; Vite 8-compatible | Pass |
| @cloudflare/vitest-pool-workers 0.20.2 | npm `latest`; official Workers integration | Pass |
| Cloudflare Service Binding RPC | Current; internal Worker-to-Worker RPC | Pass |
| Exactly two Workers / one D1 | Supported; D1 bound only to ingest | Pass |
| D1 FTS5 | Officially supported | Pass; export caveat recorded |
| D1 migrations | Officially supported through Wrangler | Pass |
| Cloudflare Queues | Current; architecture matches delivery semantics | Pass |

## Sources

- Cloudflare Service Bindings: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
- Cloudflare Service Binding RPC: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/
- Cloudflare Wrangler Service Binding configuration: https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings
- Cloudflare local binding support: https://developers.cloudflare.com/workers/local-development/bindings-per-env/
- Cloudflare React Router guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/
- Cloudflare D1 Worker API: https://developers.cloudflare.com/d1/worker-api/
- Cloudflare D1 FTS5 support: https://developers.cloudflare.com/d1/sql-api/sql-statements/
- Cloudflare D1 import/export limitations: https://developers.cloudflare.com/d1/best-practices/import-export-data/
- Cloudflare D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/
- Cloudflare Queues delivery guarantees: https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- React Router v8 requirements: https://reactrouter.com/upgrading/v7
- W3C WCAG overview: https://www.w3.org/WAI/standards-guidelines/wcag/
- Live npm registry metadata queried on 2026-08-07 for all Stack packages.

## Gate Summary

- **Critical:** 0
- **High:** 0
- **Medium:** 0
- **Low:** 1

The technology currency and Cloudflare Workers/D1 fit gate passes.
