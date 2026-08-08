# Editorial prose — Finalize polish (reader_type: llm)

**Scope:** `DESIGN.md`, `EXPERIENCE.md`  
**Mode:** Apply in place (not propose-only)  
**Date:** 2026-08-07

## Frontmatter

| File | Change |
|---|---|
| `DESIGN.md` | `status: draft` → `status: final` |
| `EXPERIENCE.md` | `status: draft` → `status: final` |
| Both | `updated: 2026-08-07` (unchanged date, confirmed) |

## Applied fixes

| Original Text | Revised Text | Changes |
|---|---|---|
| Listing Price and R$/kg first; frete never implied as included; merchant site is source of truth after **Ver na loja**. | Lead with Listing Price and R$/kg; never imply frete is included; the merchant site is the source of truth after **Ver na loja**. | Explicit lead verb; article + full “source of truth”; unambiguous frete rule |
| Spines win on conflict with mocks… / Spines win on conflict with `mockups/`… | On conflict, these spines supersede mocks… / On conflict, this spine supersedes… | Unambiguous conflict rule (also Elevation parenthetical) |
| Offer/result row | Offer / result row | Spacing + consistent Offer label |
| Telegraphic cross-refs (“…: `EXPERIENCE.md`.”) | “… are in / is defined in `EXPERIENCE.md` …” | Explicit pointers for LLM parse |
| Family → offer results / Brand → offer results | Family → Offer results / Brand → Offer results | Canonical **Offer** capitalization |
| `/stores` optional for v1 — spine-only until decided. | `/stores` is out of scope for v1 until product commits; treat as spine-only (no mock) for now. | Removed soft hedge; explicit status |
| Specific Type / Family | Specific Type, Material Family | Disambiguated two terms |
| promo (store-supplied original > Listing Price only) | promo (only when store-supplied original price exceeds Listing Price) | Unambiguous eligibility |
| merchant SoT | merchant is source of truth | Expanded abbreviation |
| Not merge-aggregate as MVP primary. | Do not use Merge-level aggregates as the MVP primary. | Canonical **Merge**; imperative |
| Color/diameter never merge keys … false merge | Color and diameter are never Merge keys … false Merge | Canonical **Merge** |
| when inactive stores < promised set | when the active store count is below the promised set | Explicit inequality |
| Omit or soft-placeholder disclosure until tags live. | Omit disclosure, or use a soft placeholder, until affiliate tags are live. | Parallel options; explicit “affiliate tags” |
| Results span Material Family including subtypes | Results span the Material Family (including Specific Types) | Canonical **Specific Type** |
| lowest comparable Listing Price clear | lowest comparable Listing Price is clear | Grammar / unambiguous climax |
| Sorts by price or R$/kg … merge keys … (brand + type + weight) | Sorts by Listing Price or R$/kg … Merge keys … (brand + Specific Type + weight) | Terminology consistency |
| Offers may be Merged or unmatched | Offers may appear in a Merge or unmatched | Merge as noun entity |

## Preserved

- Section structure and headings
- All `{token}` / `{components.*}` / `{colors.*}` / `{spacing.*}` / `{typography.*}` / `{rounded.*}` refs
- Frontmatter token maps (DESIGN colors/typography/etc.) beyond status/updated
- Code paths, mockup paths, Portuguese microcopy strings
- Content meaning (comparison tool, frete honesty, Merge keys, diameter default, Ver na loja)
