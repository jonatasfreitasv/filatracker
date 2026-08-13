# Voolt3D extraction decision (map/parser v1)

## Platform

Nuvemshop / Tiendanube storefront at `https://voolt3d.com.br/` (evidence 2026-08-10).

## Strategy (priority order)

1. **Inert JSON-LD** (`application/ld+json`) — parse as text only; never evaluate as script.
2. Prefer the `Product` node whose `@id` or `offers.url` **matches the PDP URL**.
   Nuvemshop pages embed related-product JSON-LD blocks; first-`Product` wins is unsafe.
3. **Documented price gap:** during promotions, JSON-LD `offers.price` may equal the
   compare-at / list price while the true listing price lives in inert
   `LS.variants = [...]` text in the HTML source. Extract that array via bounded
   regex + `JSON.parse` (text only — never execute merchant script).
4. Deterministic HTML selectors only for documented gaps (price display hooks as last resort).
5. **Never** execute merchant HTML/script; **never** use LLM at scrape runtime.
6. Browser fallback is **not** enabled — no evidence requires it for Voolt3D v1.

## Mass / weight

JSON-LD `weight` is shipping weight (often 1.3 KGM including spool). Prefer mass
tokens from title/description (`1Kg`, `1 kg`). Kit/ambiguous multi-unit titles retain
`massGrams: null` (omit R$/kg later in shared policy).

## Filament eligibility

Shared `classifyFilamentEligibility` on title+material only (not description dump).
Non-filament SKUs (printers, accessories) are omitted as `non_filament`.

## Outcomes

Discriminated run outcomes only: `complete | partial | failed | quarantined | oversized`.
Never treat failure as `[]`.
