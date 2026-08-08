# Reconcile: forge `.memlog.md` → PRD artifacts

**Input:** `_bmad-output/forge/filament-price-spec/.memlog.md`  
**Against:** `prd.md`, `addendum.md`  
**Date:** 2026-08-07  
**Rule:** Gaps only where forge **(decision)** / **(lock)** are missing or contradicted in PRD artifacts. Notes, cracks, assumptions, kills-as-detail, and superseded interim decisions are mapped but are not gaps unless a live lock/decision is unmet.

---

## 1. Coverage map (forge → PRD)

### Locks

| Forge lock | PRD / addendum | Status |
|------------|----------------|--------|
| Offers ingest/search is day-1 product; mature canonical catalog is direction, not launch gate | `prd.md` §1, §4.3, §6.1–6.2 | Covered |
| PETG HF ≠ PETG (and analogous subtypes) do not collapse in Merge | `prd.md` Glossary, FR-9 | Covered |
| Specific types stay separate in Merge | `prd.md` FR-9, §6.1 | Covered |
| Parent-family search includes all subtypes; specific type visible/filterable | `prd.md` FR-2, UJ-1 | Covered |
| Frete 100% out of MVP; rank/compare on listing price only | `prd.md` FR-6, §5, §6.2 | Covered |
| Value prop = specialty multi-store coverage + taxonomy (type / R$/kg), not frete | `prd.md` §1, §17 | Covered |
| Mercado Livre out of MVP; focus specialty stores | `prd.md` §2.2, FR-14, §6.2 | Covered |
| Launchable MVP = 5 active BR specialty stores (no ML) | `prd.md` §6.1, FR-14 | Covered |
| MVP source of truth = forged decisions; `raw_plan.md` = technical draft to cut | `prd.md` §0; `addendum.md` intro | Covered |
| No CAPTCHA / anti-bot bypass; blocked store → Unsupported until feed/API/affiliate | `prd.md` FR-15, §5; `addendum.md` A | Covered |
| No product images in MVP; dense/objective UI | `prd.md` FR-5, §4.2, §5, §12 | Covered |
| Store identity = text name only; no logos | `prd.md` FR-5, §5; `addendum.md` B | Covered |
| Scrape = deterministic engine + versioned per-store map; AI offline only; zero LLM in scrape runtime | `prd.md` §5, §6.1; `addendum.md` A–B | Covered |
| Store live only after homologation; broken map → Unsupported; no production AI retry/auto-repair | `prd.md` FR-14–15; `addendum.md` A–B | Covered |

### Decisions

| Forge decision | PRD / addendum | Status |
|----------------|----------------|--------|
| Session: canonical matching not the focus; robustness = product overall | Process meta; product outcome aligned via offers-first | Covered (outcome) |
| MVP = multi-store offer search; group only when match obvious (option 2) | `prd.md` §1, FR-9–10 | Covered |
| Match MVP: rules on title + brand + model; **no AI in MVP match; AI future only** | Merge key later refined (see below). **No-AI match** only implied by FR-9 “deterministic,” not explicit Non-Goal | **Gap** (no-AI match) |
| Match MVP: brand + filament type + weight; color out of merge | `prd.md` FR-9, Glossary | Covered (supersedes prior key shape) |
| Merge key: brand + specific type/line (not generic PLA/PETG only) + weight; color out | `prd.md` FR-9, §6.1 | Covered |
| Taxonomy layers: browse/search multi-group (parent + children); merge stays on specific type + brand + weight | `prd.md` FR-2, FR-9, Glossary | Covered |
| Taxonomy: Material Family → Specific Type → brand → weight; color out of merge | `prd.md` Glossary, §4.3 | Covered |
| Frete/conditions disclaimer still required; product neither calculates nor displays frete | `prd.md` FR-6 | Covered |
| Store selection criterion: utility/recognition, not scrape ease alone | `addendum.md` C | Covered |
| Downstream BMAD (spec/PRD/epics) starts from forged-idea, not full raw_plan | `prd.md` §0 | Covered |
| Scrape direction → locked as engine + offline AI maps (see locks) | `addendum.md` A | Covered |

### Kills (product outcome)

| Forge kill | PRD / addendum | Status |
|------------|----------------|--------|
| Remote manufacturer/store product images, product placeholders, R2 image proxy (§76) | Generic “no product images” in PRD/addendum B; **§76 specifics (placeholders, R2 proxy) not named** | Outcome covered; **Gap** (named kill detail) |
| Store logos as assets (§77) | `prd.md` FR-5; `addendum.md` B | Covered |
| Hand-written adapters as only model; LLM per scrape page/job; production map auto-repair without homologation | `addendum.md` A–B | Covered |

### Notes / cracks / assumptions (not gap-eligible unless they hardened into locks)

| Item | Disposition in PRD artifacts |
|------|------------------------------|
| Diameter not mentioned in merge — left open in forge | PRD **closed**: diameter out of Merge key (Glossary, FR-4, FR-9). Not a forge lock → not a reconcile gap; PRD advanced past forge open |
| “PETG cheapest” include subtypes? | Resolved by parent-family lock; FR-2 + FR-6 |
| Min store count hypothesis 5–8 | Locked to 5; §6.1 |
| Logos stay or go? | Locked to text-only; covered |
| AI map offline vs runtime; map format; who approves | Runtime locked offline+homologation; format/approver still architecture-open (not forge locks) |
| Assumption: value in aggregating non-ML specialty stores | Embodied in §1 / §17 |

### Supersession note

Forge decision “Match MVP: título + marca + modelo” was refined by later decisions to **brand + Specific Type + weight**. PRD follows the refined key. Title-as-match-input is not restated in PRD (architecture/normalization). Treated as **superseded**, not a live missing lock—except the accompanying **“Sem AI no MVP” (match)** clause, which was never revoked and remains a live decision (see Gaps).

---

## 2. Gaps (missing or contradicted)

1. **No AI for Match/Merge in MVP** — Forge decision: “Sem AI no MVP; AI só futuro” (match context); also preserved in `forged-idea.md` (“Sem AI no match do MVP”). PRD/addendum explicitly Non-Goal LLM only for **scrape runtime**. FR-9 says “deterministic rules” but does not lock “no AI matching” as a Non-Goal. **Missing explicit lock.**

2. **§76 image-path kill specifics** — Forge kill: remote images, **product placeholders**, **R2 image proxy**. Addendum B rejects “Product images / Store logos” only. Product outcome (no images) is covered; the named architecture kills are **missing** from rejected/options record.

---

## 3. Non-gaps (checked, not listed above)

- Offers-first vs canonical catalog, merge key, color out, family rollup, frete out + disclaimer, ML out, 5 stores, utility selection, text-only store identity, no product images (product-level), scrape engine + offline AI maps, homologation, no CAPTCHA bypass, forged-idea as SoT / raw_plan draft — all present and consistent.
- No forge **lock** is contradicted by `prd.md` / `addendum.md`.
- Diameter-out in PRD does not contradict a forge lock (forge left diameter open).
- Price history chart / named five stores / affiliate-ready outbound are PRD (or later) additions; forge memlog did not lock against them.

---

## 4. Suggested PRD follow-ups (optional)

- Add Non-Goal: no AI/LLM in Match/Merge for MVP (deterministic rules only); AI matching deferred.
- Extend `addendum.md` B with rejected: product image placeholders; R2 (or any) image proxy for MVP.
