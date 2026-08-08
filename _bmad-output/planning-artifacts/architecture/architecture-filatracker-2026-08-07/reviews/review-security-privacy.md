# Reviewer Gate — Security & Privacy (Final Re-run)

**Artifact:** `ARCHITECTURE-SPINE.md`  
**Lens:** web/D1 authority, non-public Service Binding, telemetry privacy and retention, plus prior security/privacy findings  
**Verdict:** **PASS**  
**Finding count:** 0 Critical · 0 High · 0 Medium · 0 Low

## Executive assessment

The updated spine resolves the remaining gate findings. The public `web` Worker has no D1, queue, schedule, Store-secret, or migration binding. It can reach data only through a versioned, narrowly typed Cloudflare Service Binding whose non-public ingest/data target exposes product-query and bounded fail-open event/outbound methods, with no generic execution, persistence, administration, queue, migration, or raw-SQL escape hatch. This is an enforceable platform authority boundary rather than an application-only convention.

Telemetry privacy is also closed at architecture level: product events and all application-controlled logs, traces, request analytics, and error telemetry use positive field allowlists and pre-emission redaction; every sink requires bounded retention and purge verification before production, while nonconforming platform sinks must be configured or disabled.

## Verification

### Web has no D1 authority — Pass

- AD-6 states that `web` has no D1 binding and only `ingest` has persistence adapters.
- AD-23 limits `wrangler.web.jsonc` to the ingest/data Service Binding and public-safe configuration, explicitly excluding D1, queues, schedules, Store secrets, and migration authority.
- The deployment envelope and structural seed consistently show the single authoritative D1 bound only to `ingest`.
- AD-14 requires CI to prove public D1-binding denial, preventing configuration drift from silently collapsing the boundary.

### Typed non-public Service Binding — Pass

- AD-6 makes the ingest/data RPC target non-public.
- AD-20 limits outbound input to `offerId`; ingest resolves and revalidates the destination and returns only a bounded redirect decision.
- AD-21 allowlists versioned product-query and fail-open event/outbound RPC methods and explicitly denies administration, Store transition, publication/projection, migration, queue, arbitrary-statement, and raw-SQL capabilities.
- The RPC convention forbids generic execution or persistence escape hatches.
- AD-14 requires RPC contract/compatibility and authority tests.

The boundary therefore constrains a compromised public Worker to the deliberately exposed RPC capabilities rather than granting direct SQL authority over authoritative state.

### Telemetry privacy and retention — Pass

- AD-13 covers product events, application-controlled logs, traces, request analytics, and error telemetry.
- Raw queries, referrers, destination URLs, IP addresses, full User-Agent values, stable identifiers, precise device/network data, account data, secrets, and unrelated payloads are redacted before emission.
- Every sink has bounded retention and purge verification as a production prerequisite.
- Platform sinks must conform or be disabled.
- AD-14 requires telemetry redaction and purge tests; the logging convention reinforces allowlisted structured fields and per-sink retention.
- Exact numeric periods may remain deployment configuration because the architecture fixes the mandatory boundary, release gate, and failure disposition.

### Prior lens closure — Pass

- **SSRF/open redirect:** shared destination policy, exact HTTPS hosts/ports, public DNS, Store scoping, every-hop validation, opaque Offer input, and request-time revalidation.
- **Public mutation/abuse:** narrow RPC allowlist, bounded query/event cost, deduplication/sampling, storage caps, safe shedding, and disabled-by-default search analytics.
- **Secrets/environment isolation:** ingest-only encrypted Store bindings; separate deploy/migration identity; no local/CI production authority; bounded non-publishing activation probes.
- **Resource budgets:** fetch through SSR budgets, oversized-run publication denial, capacity proof, and CI budget tests.
- **Robots:** homologation and per-run checks, fail-closed ambiguity/fetch failure, no bypass, and CI fixtures.

## Gate decision

The security/privacy architecture gate passes with no remaining Critical, High, Medium, or Low findings. Numeric limits, sink periods, and concrete Wrangler declarations remain implementation/configuration work governed by adopted invariants and mandatory CI/release checks; they do not block the spine.
