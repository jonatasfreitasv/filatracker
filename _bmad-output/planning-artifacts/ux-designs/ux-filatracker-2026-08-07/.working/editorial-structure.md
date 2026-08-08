# Editorial structure — Finalize polish

**Date:** 2026-08-07  
**Skill:** `bmad-editorial-review-structure`  
**Reader type:** `llm`  
**Purpose:** Canonical DESIGN.md + EXPERIENCE.md for implementers  
**Mode:** Execute (Finalize polish) — not propose-only

## Document summary

| Doc | Purpose | Structure model | Before |
|---|---|---|---|
| DESIGN.md | Visual identity + tokens for implementers | Reference / MECE | ~860 words |
| EXPERIENCE.md | IA, behavior, states, flows | Reference + Key Flows | ~1346 words |

## Applied changes

### Cross-file ownership (CUT / MOVE redundancy)

| Change | Rationale | Impact |
|---|---|---|
| CUT filter taxonomy, diameter default, sort, promo eligibility prose from DESIGN Components | Behavior owns EXPERIENCE; DESIGN keeps visual tokens + pointers | ~80 words |
| CUT frete/disclaimer copy & business rules from DESIGN; keep placement + Voice pointer | True redundancy with Voice / Component Patterns | ~30 words |
| CUT behavioral Don'ts from DESIGN (invent weights, frete-inclusive, etc.) | Live in EXPERIENCE Voice, Banned, States | ~40 words |
| CONDENSE DESIGN Layout breakpoints → token table + pointer to EXPERIENCE Responsive | One breakpoint source of truth | ~35 words |
| DROP "Use" column from EXPERIENCE Component Patterns; fold into rules | Dense-table tighten for LLM scan | ~25 words |
| DROP "Surface" column from State Patterns | Surface implied by state name / treatment | ~20 words |

### Per-file polish

**DESIGN.md**
- PRESERVE YAML frontmatter tokens untouched.
- PRESERVE canonical section order.
- CONDENSE Brand principles; keep mockup links + spines-win.
- Colors / Shapes → compact token tables (structured for LLM).
- Components: visual-only with explicit `EXPERIENCE.md` cross-refs.
- Do's and Don'ts: visual constraints only.

**EXPERIENCE.md**
- PRESERVE required sections + Inspiration & Responsive.
- CONDENSE Foundation orientation filler.
- PRESERVE Voice table, Merge honesty, Banned list, Key Flow climaxes/product decisions.
- Tighten Key Flow narrative (persona steps kept; filler cut).
- Responsive remains canonical breakpoint behavior (tokens cross-ref DESIGN).

### Preserved (explicit)

- All `{token}` / `{components.*}` / `{colors.*}` / `{spacing.*}` cross-refs
- Mockup composition links in both spines (DESIGN Brand; EXPERIENCE IA)
- YAML frontmatter intact (colors, typography, spacing, components, sources)
- Product decisions: diameter default, merge keys, OOS outbound, frete honesty, empty-state non-invention, WCAG floor

## Measured reduction

| Doc | Before | After | Δ |
|---|---|---|---|
| DESIGN.md | 860 | 832 | −3% (ownership split + tables; density over length) |
| EXPERIENCE.md | 1346 | 1196 | −11% |
| Combined | 2206 | 2028 | −8% |

Primary win is MECE ownership (visual vs behavior), not raw length.

## Comprehension trade-offs

None material for LLM consumers: behavioral rules consolidated into EXPERIENCE; visual tokens remain in DESIGN with pointers. Human warmth/orientation was already minimal.
