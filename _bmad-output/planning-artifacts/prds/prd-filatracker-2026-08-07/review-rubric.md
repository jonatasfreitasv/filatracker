# PRD Quality Review — FilaTracker PRD

## Overall verdict
The PRD holds up: it has a clear product thesis (Brazil specialty-store Offers, listing-price honesty, safe Merge over false completeness), explicit Non-Goals, earned UJs, and counter-metrics that protect trust rather than inflate activity. Mechanism is correctly parked in the addendum with rejected alternatives. What is at risk for build readiness is done-ness around Merge confidence and a few ops/UX opens (freshness, history aggregation, Store replacement) that still lack owners, plus an Assumptions Index that does not roundtrip every inline tag.

## Decision-readiness — adequate

Trade-offs are mostly stated as decisions, not smoothed into “balances.” Vision (§1) and Non-Goals (§5) name what was given up: no frete calculation, no checkout, no visual catalog, ML out of MVP. Addendum §B is the strongest decision surface—each rejected option has an Outcome and Why (e.g. “Mature canonical catalog as launch gate | Rejected | Offers-first”). Soft kill (§15, §6.1) and “False merge < duplicate” (§15 Reputation) are real product bets. Open Questions (§8) are mostly genuine (freshness window, history aggregation, Store replacement), not rhetorical.

Gaps for a decision-maker: there are zero `[NOTE FOR PM]` callouts despite real tensions (soft kill, Q5 replacement policy, day-1 outbound logging). Soft kill says only “revisit MVP viability” without who decides or what “useful” means beyond SM-2’s 5/5. SM-1 locks metric identity but defers the numeric launch bar (`[ASSUMPTION: Exact launch target… is set after first traffic baseline]`), so “green light success” is defined qualitatively only.

### Findings
- **medium** Soft kill is named but not decision-complete (§15, §8 Q5) — “Cannot sustain five useful Homologated specialty Stores → revisit MVP viability” leaves owner, threshold of “useful,” and replacement policy as Open Q5. *Fix:* Add a `[NOTE FOR PM]` with interim rule (e.g. replace within N days / pause launch messaging) or close Q5 before build.
- **low** No `[NOTE FOR PM]` callouts at live tensions (§8, §11, §15) — Affiliate timing (Q4), outbound redirect (Q3), and soft kill are deferred without PM-facing friction markers. *Fix:* Tag 2–3 highest-stakes opens with `[NOTE FOR PM]`.

## Substance over theater — strong

Content is earned for this product shape. Two UJs (Rafael, Camila) drive FR cross-refs; JTBD (§2.1) is specific (“cheapest listing price… without treating PETG HF as the same as PETG”). Vision would not swap into a generic price site—it names pt-BR, specialty Stores outside ML, Offers-first, ranking on listing price only. Competitive Context (§17) and Addendum §E are brief and wedge-focused (“Brazil specialty-store coverage + taxonomy”), not innovation theater. NFRs (§14) are product-specific (no anti-bot bypass, no fabricated weights, scrape failure must not take down browse) with soft numeric targets assumed from raw_plan rather than empty “must be scalable.” Aesthetic (§12) reinforces the comparison-tool anti-storefront choice.

No findings that add information beyond this judgment.

## Strategic coherence — strong

Thesis is explicit: searchable Homologated specialty Offers in Brazil, honest taxonomy/Merge, merchant as source of truth, day-1 value without mature catalog. Feature groups (§4.1–4.7) follow that arc—discovery, trust surfaces, Merge honesty, affiliate-ready outbound, history chart, Store ops policy, Outbound Click analytics. MVP (§6) is an experience/problem-solving scope (five named Stores, offers-first), not a platform backlog. SM-1 (Outbound Clicks as sole launch success) validates the funnel thesis; SM-C1/C2/C3 counter-metrics (“Do not maximize Merges,” “Do not keep Stores active by bypassing,” no frete clickbait) actively protect the thesis instead of measuring vanity activity.

No findings that add information beyond this judgment.

## Done-ness clarity — adequate

Most FRs carry testable consequences: empty state (FR-1), PETG family includes HF (FR-2), no product images / text Store names (FR-5), no CEP field (FR-6), no fabricated R$/kg (FR-7), PETG vs PETG HF never merge solely by family (FR-9), chart empty state when history insufficient (FR-13), ML not a Store (FR-14). That is enough for many stories.

Where “done” blurs: FR-10 depends on “Match confidence is insufficient” without defining confidence or deterministic thresholds in the PRD (Addendum §D defers “confidence scoring” to architecture). FR-8’s stale behavior is consequence-shaped but the window is Open Q1 / ASSUMPTION. FR-13’s unit of history (per-Offer vs per-Merge) is Open Q2. FR-3’s “browse surfaces are reachable” is thin on what constitutes done IA. §10 “strong mobile usability required” and §14 “feel interactive” are adjectives softened by assumed p95/LCP bounds—usable if architecture locks them, not if they stay soft forever.

### Findings
- **high** Match confidence undefined for FR-10 (§4.3 FR-10; Addendum §D) — Consequence requires unmatched-when-insufficient, but “Match confidence” is not in the Glossary and scoring is deferred. Engineers cannot know the pass/fail boundary. *Fix:* Define minimal deterministic rules in-PRD (or state “confidence = exact brand+Specific Type+weight match only; no probabilistic merge in MVP”) and drop or glossary “confidence.”
- **medium** Freshness window and history aggregation still open (§8 Q1–Q2; FR-8, FR-13) — Both affect acceptance of core trust/history FRs. *Fix:* Close with default numbers/rule in PRD or mark `[NON-GOAL for MVP]` for history aggregation choice with an interim default.
- **low** FR-3 browse done-ness thin (§4.1 FR-3) — “Brand and Material Family browse surfaces are reachable” does not specify list vs facet vs dedicated routes beyond IA sketch (§13). *Fix:* One consequence naming required entry points (e.g. `/marcas`, `/materiais` or equivalent).

## Scope honesty — strong

Omissions do real work. §5 Non-Goals and §6.2 Out of Scope for MVP include reasons (ML matching + ToS; frete trust cut; alerts/accounts cut; images asset/ToS; catalog not launch gate). Inline Out of Scope under §4.1/§4.5 reinforces. Assumptions are tagged and mostly indexed (§9). Addendum §B makes de-scope honest rather than silent. Filament-only ingest for multi-category Stores is both Open Q6 and ASSUMPTION—transparent. Open-item density (7 OQs + several ASSUMPTIONs) is appropriate for Fast-path if architecture owns mechanism; the sharp edge is Store replacement / soft kill still open while launch requires five Stores.

### Findings
- **medium** Soft-kill / Store replacement left open while MVP hard-requires five Stores (§6.1, §8 Q5, §15) — Scope honesty names the risk but does not record an interim product rule. *Fix:* Close Q5 with a one-line replacement/degrade policy or `[NOTE FOR PM]` blocking launch messaging until closed.

## Downstream usability — adequate

As a chain-top PRD (§0: decision source for UX, architecture, epics), extractability is mostly good: Glossary (§3) is load-bearing and terms recur in FRs/UJs/SMs; FR-1…FR-16 and UJ-1/UJ-2 are contiguous with named protagonists; SM IDs and counter-metrics cross-validate FRs; Stores named with URLs in §6.1 and Addendum §C; mechanism correctly out of narrative in addendum.

Weak spots for source-extraction: “Match confidence” (§4.3) is used without Glossary entry; Assumptions Index (§9) misses several inline tags (§11 ads, §13 `/stores`, §14 performance and WCAG); slight wording drift (“Merged group” vs “Merge”).

### Findings
- **medium** Assumptions Index incomplete (§9 vs §11, §13, §14) — Inline tags for no display ads, optional `/stores`, p95/LCP soft targets, and WCAG 2.1 AA are not listed in §9. Downstream cannot trust the index as complete. *Fix:* Roundtrip every inline `[ASSUMPTION]` into §9 (and reverse-check).
- **low** “Match confidence” not glossaried (§4.3 FR-10) — Domain noun appears in a FR without §3 definition. *Fix:* Add Glossary term or rephrase FR-10 to deterministic Merge-key language only.

## Shape fit — strong

Public consumer comparison site with meaningful UX—UJs with named protagonists are appropriate and used (not overhead). Capability/mechanism (scrape maps, homologation, Cloudflare stack) correctly lives in Addendum §A/§D rather than forcing a tech-spec shape onto the PRD. Rigor matches chain-top stakes without over-formalizing (two UJs, brief competitive note, no persona zoo). Brownfield raw_plan is explicitly non-canonical (§0, Addendum §D)—right relationship.

No findings that add information beyond this judgment.

## Mechanical notes

- **Assumptions Index roundtrip:** Broken for at least: §11 “no display ads in MVP UI”; §13 “/stores index optional for v1”; §14 performance soft targets; §14 “Target WCAG 2.1 AA for core flows.” Indexed entries otherwise appear to match inlined tags in §4 and §7–§8.
- **ID continuity:** FR-1–FR-16, UJ-1–UJ-2, SM-1–SM-3, SM-C1–SM-C3 look contiguous and unique; cross-refs (UJ→FR, SM→FR, §6.1 Stores) resolve.
- **Glossary drift:** “Merge” / “Merged group” / “Merge key” used interchangeably; “Homologated Store” consistent. “Match confidence” used once without Glossary. Color and diameter correctly described as out of Merge key without needing glossary entries.
- **UJ protagonists:** UJ-1 Rafael, UJ-2 Camila—both named with context inline.
- **Required sections:** Vision, users/UJs, Glossary, Features/FRs, Non-Goals, MVP scope, Success Metrics (with counters), Open Questions, Assumptions Index, NFRs, risks—present and fit for this product type. `[NOTE FOR PM]` unused entirely.
