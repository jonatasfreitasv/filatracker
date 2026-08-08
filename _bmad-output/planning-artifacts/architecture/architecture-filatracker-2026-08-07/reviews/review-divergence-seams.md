# Reviewer Gate — Divergence Seams (Closure Re-run)

**Artifact reviewed:** `ARCHITECTURE-SPINE.md`  
**Review mode:** Latest-spine-only adversarial compatibility review under the BMad materiality test  
**Verdict:** **PASS — no remaining material cross-epic divergence seam**  
**Finding count:** 0 Critical · 0 High · 0 Medium · 0 Low

## Gate standard

A finding survives only if it presents a non-obvious, real architectural trade-off where two independently built epics can obey every applicable AD yet produce incompatible behavior. Missing field names, numeric tuning, framework mechanics, and implementation detail do not qualify.

## Service Binding closure verification

### 1. Shared ingest/read failure domain — closed

The earlier counterexample depended on one ingestion epic breaking public RPC while the web epic assumed independent data availability. AD-6 now:

- isolates RPC startup imports from lazy-loaded Store/scheduled/queue code;
- requires invocation failure containment, RPC canary, and immediate rollback;
- explicitly accepts ingest deployment/runtime unavailability as a shared public-data failure domain;
- routes that accepted failure through AD-25 rather than allowing empty-result interpretation.

The topology retains a real availability trade-off, but independent epics can no longer comply while disagreeing about its semantics. One epic cannot claim failure independence, and the other cannot convert backend failure into valid empty data.

### 2. RPC mixed-deployment compatibility — closed

AD-10 and AD-25 now impose the same ordered protocol on RPC as on queues:

- additive ingest server first;
- server accepts N and N-1;
- canary and verification before web N activation;
- old result/error variants remain decodable;
- rollback emits/uses the prior mutually accepted version;
- contraction waits through the rollback horizon.

AD-14 binds CI to RPC N/N-1 compatibility. Independently deployed web and ingest epics no longer have freedom to choose incompatible activation order or version support.

### 3. Cross-call page snapshot mixing — closed

AD-12 and AD-25 require exactly one bounded page-aggregate RPC for each dynamic route. The aggregate reads one committed projection/support epoch and owns rows, facets, coverage, links, and presentation derivations together. Narrow independent RPC composition is no longer compliant, so a web epic cannot combine generation G rows with generation G+1 facets while obeying the spine.

### 4. One-way cache invalidation — closed

AD-12 and the operational cache rule disable cross-request caching for all generation-sensitive dynamic MVP surfaces. The prior invalidation impossibility therefore has no active mechanism to contradict. Future dynamic caching is explicitly gated on a new generation-validation or realizable-invalidation AD rather than left to an independent cache epic.

### 5. RPC failure/deadline/overload drift — closed

AD-25 defines:

- one versioned `RpcOutcome<T>`;
- exhaustive success/degraded/client/resource/backend outcomes;
- native-exception normalization at the ingest boundary;
- per-method deadlines;
- at most one retry for idempotent queries;
- no implicit command retries;
- deterministic web mapping;
- non-cacheable `503` plus `Retry-After` for overload/unavailability;
- a prohibition on empty-state or stale-response substitution.

AD-14 tests unavailable, exception, deadline, overload, and duplicate-command paths. Independent route and RPC epics cannot select contradictory failure behavior while remaining compliant.

### 6. RPC payload and materialization bounds — closed

AD-21 requires configured request/response bytes, rows/history points, cursor/page, execution, CPU/subrequest, and materialization budgets for every method, and forbids unbounded results and streams. AD-25 requires one bounded aggregate. Exact numbers remain legitimate implementation/configuration choices constrained by one owned contract, not an architectural divergence seam.

### 7. Outbound analytics identity/retry behavior — closed

AD-20 assigns the web one opaque event ID, assigns `waitUntil(recordOutbound)` ownership to web, permits retry only for that idempotent command, and requires D1 uniqueness through the retention horizon. AD-25 separately forbids implicit command retries. Independent outbound and analytics epics cannot choose incompatible deduplication or completion semantics.

### 8. RPC caller authority — closed

AD-23:

- limits the production caller inventory to web;
- audits the account binding inventory in deployment policy and CI;
- gives web a deployment-scoped RPC capability;
- requires command methods to verify it;
- denies web every persistence/ingest authority.

AD-21 separately closes generic execution and persistence escape hatches. An operations epic adding an ungoverned caller would violate AD-23 rather than remain an independently compliant alternative.

### 9. Cross-Worker correlation — closed

AD-15 requires a random per-request correlation ID in RPC envelopes, forbids reuse, and AD-13 constrains telemetry fields and retention. The RPC and logging conventions carry the same field across both Workers. Independent observability epics no longer need or have permission to invent incompatible stable identifiers.

### 10. Local/production failure-path parity — closed

AD-14 requires configured-limit and adapter-boundary tests for unavailable targets, native exceptions, deadlines, overload, duplicate commands, mixed versions, and caller-inventory denial. AD-21 binds runtime budgets; AD-23 aligns compatibility/limit policy in CI. Numeric production sizing remains operational tuning, but the semantic paths that web and ingest must implement are fixed and test-gated.

## New adversarial attempts

The following additional attacks do not survive the BMad materiality test:

- **A page aggregate becomes too large:** AD-21's per-method byte/row/history/materialization budgets force bounded pagination; exact limits are tuning.
- **A retry observes a newer epoch:** only the successful aggregate is rendered, and it is internally epoch-consistent; AD-25 forbids composing attempts.
- **A native RPC exception bypasses typed outcomes:** AD-25 requires ingest-boundary normalization and AD-14 tests it; allowing propagation would be noncompliant.
- **A Store task exhausts one invocation's limits:** AD-6 accepts shared target unavailability but contains ordinary invocation failure; AD-25 fixes public behavior.
- **A future cache reintroduces stale state:** the Deferred section requires a new AD before such caching is admissible, so it is outside current independently compliant MVP work.
- **A diagnostic Worker calls the RPC:** AD-23's caller inventory and capability policy make that deployment noncompliant unless the architecture is reviewed.
- **Web and ingest disagree on result/error versions:** AD-10/AD-25's N/N-1 protocol and delayed contraction remove that freedom.
- **Search rows and facets disagree:** AD-12/AD-25 assign the whole presentation snapshot to one aggregate and epoch.
- **Outbound event retries double-count:** AD-20's event ID and D1 uniqueness make replay inert.
- **Backend outage appears as zero matches:** AD-25 explicitly forbids that substitution.

## Conclusion

The latest spine now turns the Service Binding boundary into a single owned, versioned, bounded, page-atomic compatibility contract. The remaining choices are explicit accepted trade-offs or implementation tuning; none allows independently compliant epics to produce incompatible architecture. Reviewer gate passes.
