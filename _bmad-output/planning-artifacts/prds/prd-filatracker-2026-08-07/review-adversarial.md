# Adversarial Review: FilaTracker PRD

**Targets:** `prd.md`, `addendum.md` (companion)  
**Date:** 2026-08-07  
**Stance:** Cynical / defect-first. Assumptions tagged `[ASSUMPTION]` treated as unpaid IOUs, not settled product law.  
**Verdict:** **Do not treat this PRD as implementation-ready.** Core wedge (safe multi-store compare) is undermined by untestable merge/freshness rules, a success metric with no threshold, diameter/color display holes that will burn trust, and soft-kill/ops policy dressed up as product FRs. Fix the contradictions and make FRs falsifiable before architecture or epics lock to this text.

---

## Findings

- Launch success is defined “solely” by SM-1 (Outbound Clicks) while an `[ASSUMPTION]` explicitly defers any numeric target until after a traffic baseline—so “success” cannot fail or pass at launch; it can only be narrated afterward. That is metric theater, not a gate.

- Soft-kill (“cannot sustain five useful Homologated Stores → revisit MVP”) is the real viability tripwire, yet SM-2 (5/5 store uptime) is labeled diagnostic-only and “useful” is undefined. Product can “succeed” on clicks with two live Stores, or soft-kill while SM-1 looks fine—hidden dual scoreboard.

- FR-10 depends on “Match confidence,” but addendum §D parks confidence scoring in architecture and says not to treat raw_plan as PRD requirements. The PRD asserts a confidence-gated behavior without defining what confidence is, who sets thresholds, or how to test “insufficient.”

- Merge key omits diameter by deliberate decision (FR-9: diameter differences do not block or create Merges). For a BR hobbyist on a Bambu-class printer, merging 1.75 mm with 2.85 mm under “same Offer group” is a reputation landmine; FR-4 only says diameter *may* appear as filter—optional honesty for a mandatory physical constraint.

- Color is out of the Merge key, but FR-5’s required comparison fields omit color (and diameter). Users can therefore see a “Merged” cheapest row that silently mixes colors/diameters. The honesty doctrine (“false merge worse than duplicate”) is incomplete if the UI does not surface the dimensions you refused to key on.

- “Brand” and “Specific Type” and “weight” are treated as crisp atoms in FR-9 consequences, while the glossary admits brand is “as resolved” and weight is “parsed net weight when known.” Without normalization rules (aliases, “1kg” vs “1000g”, gross vs net, Premium/Silk line parsing), the “testable” PETG vs PETG HF bullet is a single happy-path demo, not a suite.

- Taxonomy work is smuggled in as “offers-first.” Material Family rollups, Specific Type labels, brand browse, and Merge groups *are* a catalog spine. Rejecting “mature canonical catalog as launch gate” while requiring family search, brand browse, and safe Merge still schedules catalog engineering under a different name—scope leak with deniability.

- FR-13 (price history chart) is in launch scope while alerts/accounts are cut. Open Q2 leaves per-Offer vs per-Merge aggregation unresolved; merge/unmerge over time will rewrite what a “group history” means. Chart-without-retention/aggregation rules is storage and trust scope that the Non-Goals never budget.

- Memlog shows an earlier lock of “no history charts” then an override to chart-in-launch. The PRD presents FR-13 as settled product without acknowledging that history aggregation is still an open question—false finality on a swinging decision.

- Freshness is load-bearing for trust (UJ edge case, FR-8, Reputation guardrail) but the stale window is an `[ASSUMPTION]` deferred to ops/architecture, duplicated as Open Q1. “Stale or deactivated Offers are not presented as current in-stock without qualification” is untestable until the window and hide-vs-label behavior exist—yet launch copy and ranking assumptions already depend on it.

- Sort rules for “cheapest” are partly assumption (in-stock over OOS; tie-break price then freshness) while SM-1 rewards outbound clicks. Nothing stops ranking/UX from maximizing clicky “mais barato” presentations within the letter of FR-6 as long as a frete disclaimer exists somewhere. SM-C3 names the abuse but does not define a detectable violation.

- R$/kg sort (FR-4) with FR-7 omitting unknown weights creates a second ranking universe where Offers that hide or fail weight parse drop out or sort oddly. No rule for approximate/bundle weights, “1 kg approx,” or multi-spool packs—easy path to misleading “best R$/kg” claims.

- FR-1 says “Offer-centric results”; UJ-1 opens “a result” then compares Offers; FR-5 allows Merged group or unmatched Offer. The unit of a search hit (Offer vs Merge vs Family landing) is never pinned. QA cannot write a single expected-results contract for search.

- FR-3 requires brand and Material Family browse “reachable from the public IA,” while §13 `[ASSUMPTION]` makes `/stores` optional and Open Q7 leaves SEO page depth open. Browse/SEO can balloon into a content site without a Non-Goal ceiling (“no programmatic SEO farm,” “no store microsites,” etc.).

- FR-14/FR-15 “consequences” include “no silent anti-bot bypass” and “not shown as active coverage”—policy assertions that cannot be verified from the public product under test. Homologation/Unsupported is mostly ops; calling it a functional requirement creates false confidence that product QA covers scrape ethics.

- Soft-kill and five named Stores (utility/recognition over scrape ease, addendum §C) plus Open Q5 (replacement policy undefined) means launch viability hinges on ToS/anti-bot luck at merchants chosen *because* they are hard. The PRD has no Non-Goal that FilaTracker will not become a full-time scrape-ops shop, yet that is the implied operating model.

- “Prefer public pages/feeds” (§15) is weasel language next to a scrape-first MVP and robots deferred to architecture (addendum §D). Legal/ToS risk is acknowledged in Risks but not converted into an explicit Non-Goal (e.g. no ignoring robots, no credentialed scrape, no residential-proxy fleet)—reputation and legal exposure remain aspirational.

- Affiliate path is “ready” on day-1 (internal outbound endpoint assumption) while disclosure is only required “when affiliate monetization is enabled” (FR-12). Stakes memlog cites affiliate reputation; shipping click-wrapping infrastructure without shipping disclosure UX and copy review is a classic bait-and-switch setup when tags flip on.

- Privacy claims (“fully anonymous,” “minimize PII,” analytics = clicks + optional searches) do not define what the outbound logger may store (IP, UA, opaque session, referrer). FR-16 is testable as a counter and untestable as a privacy boundary—missing Non-Goal on identity stitching/fingerprinting.

- Performance and a11y NFRs are `[ASSUMPTION]` imports from raw_plan (p95/LCP) and WCAG 2.1 AA “target,” while §0 says raw_plan is not canonical. Tagging borrowed SLOs as assumptions indexes the debt without owning pass/fail criteria—“strong mobile usability required” remains slogan-grade.

- Open Q6 filament-only ingest is also an `[ASSUMPTION]` and a Risk mitigation. Topink3D is in the MVP five *because* it is multi-category; excluding printers/resin is undecided product scope living in three places. Until it is a hard Non-Goal with testable ingest fixtures, catalog pollution is scheduled.

- Primary user journeys assume specialty-store search beats the user’s ML habit (UJ-1 Rafael still “usually checks… plus ML”), while Non-Users exclude ML-only shoppers and Competitive Context admits coverage-vs-ML risk. There is no diagnostic for “user still left to check ML,” so SM-1 can rise from curiosity clicks while the wedge fails.

- Emotional JTBD demands confidence that frete is not hidden as included; ranking language and climaxes still center “lowest listing price” / cheapest comparable Offer. Disclaimer-as-mitigation is the entire defense. Missing Non-Goal: no “preço final,” no strikethrough “savings vs frete,” no badge that implies landed cost.

- Addendum holds a product-trust rule—“parser failure must not mass-mark catalog OOS”—that never appears as a PRD FR or Non-Goal. Trust-critical behavior is split so the decision source (§0) can claim purity while the failure mode lives in a companion doc implementers may skim.

- Counter-metric SM-C1 (do not maximize Merge rate) has no measurement definition or alert threshold. Teams under pressure to make results “look complete” will maximize Merges until a scandal; the counter-metric is moral advice, not instrumentation.

- SM-3 (search → outbound conversion) is “optional diagnostic, not a success gate,” which in practice means it will be gamed (narrow denominator, exclude empty searches, count only detail views). Naming it without forbidding optimization invites a shadow primary KPI.

- Day-1 may use direct Store URLs behind an internal outbound endpoint (assumption) while Open Q3 still asks whether redirect is mandatory. Click measurability for SM-1 is therefore not actually locked—primary metric identity depends on an open transport question.

- No Non-Goal for user-submitted prices, store self-serve claiming, public write APIs, third-party scrapers of FilaTracker, or “price guarantee / we match” marketing—adjacent scope that affiliate-era growth teams always try to add once SM-1 stagnates.

- No Non-Goal for resin, pellets, printers, parts, or CNC adjacent SKUs beyond the contested Q6 assumption; no Non-Goal for bilingual UI, foreign stores, or USD—internationalization creep is only blocked by a locale assumption, not a Non-Goal.

- `[ASSUMPTION]` tags are indexed in §9 as if enumeration equals control. Critical launch behaviors (sort preference, stale window, filament-only, no ads, WCAG, perf, SM-1 quota, outbound wrapping) remain assumptions concurrently listed as Open Questions. The index creates false confidence that Fast-path inference was reviewed when it was only filed.

- Glossary Homologated vs Unsupported is clean; product-visible “coverage” claims are not. Nothing forbids marketing or UI chrome that implies nationwide specialty coverage while two of five Stores are Unsupported—SM-C2 blocks bypass, not overclaiming coverage.

- “No LLM-in-the-loop at scrape runtime” is a Non-Goal, but Merge/taxonomy still need deterministic rules that raw_plan deferred as normalization algorithms. The PRD forbids the glamorous shortcut and leaves the boring matching engine unspecified—implementation will either invent match AI later or ship brittle string equality.

- Competitive Context asserts a BR specialty underserved wedge as research-backed positioning; memlog still flags who/problem/why-now as under-specified from forge. Vision confidence exceeds discovery evidence—launch narrative risk if specialty aggregation is not actually how BR buyers shop.

- Platform §10 “read-oriented public/search surfaces as needed” leaves a public API door open with no Non-Goal (“no public documented API / no partner feed in MVP”), inviting extra surface area under the same anonymous analytics and scrape-derived data liabilities.

---

## Cross-cutting pattern

The document is strongest where it cuts scope (no frete, no ML, no images, no accounts, no bypass) and weakest where it must be precise to keep trust (merge dimensions shown in UI, freshness, weight/brand normalization, success thresholds, coverage claims). `[ASSUMPTION]` and Open Questions repeatedly park the exact decisions that would make FRs falsifiable. Treat every assumption that affects ranking, merge, freshness, ingest filters, or monetization disclosure as a blocking PRD hole—not as architecture trivia.

---

## Suggested fix directions (non-ranked)

Resolve diameter/color display requirements on comparison; define merge normalization or mark FR-9/10 as needing a companion match spec before build; pick stale window + hide/label behavior; either set an SM-1 threshold/timebox or stop calling it “launch success”; promote filament-only and no-ads to Non-Goals; move parser-failure OOS rule into PRD FRs; close Q2/Q3/Q5 before calling MVP locked.
