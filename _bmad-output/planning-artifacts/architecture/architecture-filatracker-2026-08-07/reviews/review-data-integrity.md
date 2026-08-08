# Reviewer Gate — Data Integrity (Final Re-run)

**Artifact:** `ARCHITECTURE-SPINE.md`  
**Lens:** bounded D1 promotion, fencing, identity/lineage, FTS, inbox/ack and payload retention, state transitions, recovery, corrections, and database constraints  
**Verdict:** **PASS — no blocker or high-severity data-integrity gaps remain.**

The spine is implementation-ready at architecture altitude for this lens. The previously blocking/high gaps now have explicit invariants, ownership, failure behavior, and verification gates.

## Remaining architecture-level findings

1. **[MEDIUM] The 48-hour stale clock has no explicit anchor.**  
   AD-18 says `stale` is independently derived after 48 hours, but no longer states whether the clock starts from the Offer observation’s `observedAt`, its successful publication/recording time, or the Store run completion time. Those timestamps can diverge after staging, retry, or recovery. One canonical anchor and monotonicity rule is still needed so search, detail, ranking, cache, and FTS-derived presentation cannot disagree at the boundary.

2. **[LOW] Correction lineage validity is not explicitly constrained beyond non-dangling references.**  
   AD-19 now defines deterministic effective-history folding and supersession, closing the prior ambiguity. AD-22 prevents dangling lineage but does not explicitly require correction edges to remain same-Offer, acyclic, and single-effective-successor per corrected position. These can be enforced by the coordinator plus invariant tests; naming them would make the deterministic fold total even under operator correction mistakes.

## Verified closed

- **Bounded atomic D1 promotion:** AD-8 defines one set-based bounded `batch()`, complete CAS/commit scope, maximum-volume proof, safety margin, and fail-safe oversized behavior.
- **Publication fencing:** Store, projection, support, and external recovery epochs prevent stale, concurrent, mixed-version, and post-restore publication.
- **Offer/Merge identity and lineage:** AD-16 quarantines incompatible same-source reuse through a continuity fingerprint; AD-5 preserves versioned Merge IDs, tombstones, migration lineage, and atomic shadow cutover.
- **FTS consistency:** AD-9 requires single ownership, epoch capture/CAS, validated shadow rebuild, equivalent fallback, and no silent partial result.
- **Inbox/ack and payload retention:** effects and inbox completion share the publication transaction; acknowledgement follows commit; immutable digest-verified payloads and inbox rows outlive retry, DLQ/replay, mixed-version, and recovery horizons.
- **Availability and support transitions:** two completeness classes, positive-only behavior, explicit OOS/absence authority, generation-fenced support transitions, and the visibility matrix prevent mass-OOS and cross-surface drift.
- **Recovery:** AD-24 anchors a non-regressing epoch outside restored D1 and rejects every old-epoch delivery after restore.
- **Price corrections:** AD-19 preserves append-only audit facts while deterministic lineage folding supplies one effective current/chart history.
- **Database constraints:** AD-22 requires foreign keys, checks, uniqueness, replay keys, non-dangling lineage, and generation/run CAS.
