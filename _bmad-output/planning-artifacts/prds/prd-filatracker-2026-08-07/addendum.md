# FilaTracker PRD Addendum

Companion to `prd.md`. Holds mechanism, rejected alternatives, and technical direction that must not drive the PRD narrative. Locked sources from forge (`forged-idea.md` + forge `.memlog.md`); `docs/raw_plan.md` is a technical draft to cut/align.

## A. Scrape & ingestion (mechanism)

- Deterministic scrape engine + **versioned per-Store map/playbook** in repo.
- AI may generate/update maps **offline only**; **zero LLM** in the scrape job runtime.
- Store goes live only after **homologation** (fixtures). Broken map → **Unsupported Store**; no production auto-repair without re-homologation.
- **No CAPTCHA / anti-bot bypass.** Blocked Store stays Unsupported until official feed/API/affiliate.
- Parser failure must not mass-mark catalog OOS (aligns with PRD §5; raw_plan safety intent retained).

## B. Options considered / rejected (product)

| Option | Outcome | Why |
|--------|---------|-----|
| Mature canonical catalog as launch gate | Rejected | Offers-first; catalog is direction |
| Frete in ranking | Rejected | Trust + scope; disclaimer instead |
| Product images / Store logos | Rejected | Dense UI; asset/ToS burden |
| Product image placeholders / R2 (or any) image proxy (§76) | Rejected | Same kill as no images; no proxy workaround |
| Mercado Livre in MVP | Deferred | Matching + ToS risk |
| Hand-written adapters as only model | Rejected | Maps + deterministic engine |
| LLM per page at scrape time | Rejected | Cost/reliability |
| AI/LLM in Offer matching / Merge | Rejected for MVP | Deterministic rules only; AI offline for maps only |
| Color in Merge key | Rejected | Over-splits / wrong comparisons |
| Diameter in Merge key | Rejected (user) | Default Diameter Filter = 1.75 mm; unknown included; known non-1.75 excluded from default |
| “Best deals” home rails | Rejected for MVP | Anti-vitrine; home = search + optional Material Family chips |
| Price alerts at launch | Rejected (user) | Scope cut |
| Day-1 live affiliate dependency | Deferred | Affiliate-ready only |

## C. MVP Stores (URLs)

Canonical URLs for the five Homologated Stores named in PRD §6.1:

1. https://www.closin.com.br/ — Closin  
2. https://voolt3d.com.br/ — Voolt3D  
3. https://www.3dcolors.com.br/ — 3D Colors  
4. https://www.filamentos3dbrasil.com.br/ — Filamentos 3D Brasil (F3D)  
5. https://www.topink3d.com.br/ — Topink3D  

Selection criterion (forge): utility/recognition, not scrape ease. Multi-category merchants (e.g. Topink3D) need **filament-only** ingest filters (PRD Non-Goal).

## D. Deferred from raw_plan (architecture / UX)

Cloudflare stack, queues, D1 schema, adapter contracts, JSON-LD/browser fallback, rate limits, normalization algorithms, confidence scoring, design-system tokens, exact wireframes, cache/SSRF, robots — implement via architecture + UX specs; do not treat raw_plan sections as PRD requirements.

## E. Competitive notes (research digest)

- Global comps: free+affiliate, often Amazon-heavy (same names as PRD §17).
- Inventory apps (Spoolman, Spoolio, SimplyPrint…) are adjacent, not direct comps.
- Prefer feeds/APIs/affiliate networks over marketplace scrape; reinforces Mercado Livre exclusion from MVP.
