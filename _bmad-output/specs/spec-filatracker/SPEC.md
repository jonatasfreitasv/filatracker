---
id: SPEC-filatracker
companions:
  - ../../planning-artifacts/prds/prd-filatracker-2026-08-07/prd.md
  - ../../planning-artifacts/prds/prd-filatracker-2026-08-07/addendum.md
  - ../../planning-artifacts/ux-designs/ux-filatracker-2026-08-07/EXPERIENCE.md
  - ../../planning-artifacts/ux-designs/ux-filatracker-2026-08-07/DESIGN.md
  - ../../planning-artifacts/architecture/architecture-filatracker-2026-08-07/ARCHITECTURE-SPINE.md
sources: []
---

# FilaTracker

## Why

Brazilian 3D-printer users must search specialty stores separately to find filament. FilaTracker provides a trusted, pt-BR comparison of Listing Price and R$/kg across Brazilian specialty stores, using honest taxonomy and merchant handoff without implying frete-inclusive pricing or checkout.

## Capabilities

- **CAP-1**
  - **intent:** Anonymous shoppers can search and browse filament Offers across active Homologated Stores by free text, Material Family, Specific Type, and brand.
  - **success:** A login-free search returns multi-store Offers when available, family searches include labeled child types, brand and material browse are reachable, and no-match searches show an explicit empty state.

- **CAP-2**
  - **intent:** Shoppers can filter and deterministically order Offers for like-for-like comparison.
  - **success:** Required filament filters work; the default diameter includes 1.75 mm and unknown values; sorting supports Listing Price and valid R$/kg; and availability, price, and freshness ties resolve deterministically.

- **CAP-3**
  - **intent:** Shoppers can compare grouped or unmatched Offers using objective price, merchant, availability, freshness, and filament attributes.
  - **success:** Dense comparison exposes Store-supplied facts, omits fabricated R$/kg and promotions, uses no imagery or logos, and places a frete disclaimer beside every ranking or cheapest claim.

- **CAP-4**
  - **intent:** The system can group only genuinely equivalent Offers while keeping uncertain Offers independently discoverable.
  - **success:** Merge uses exact normalized brand, Specific Type, and weight only; color and diameter never affect membership; incomplete or ambiguous Offers remain unmatched; and bundles receive no fabricated unit economics.

- **CAP-5**
  - **intent:** Shoppers can leave for a merchant through a stable, measurable, affiliate-ready handoff.
  - **success:** Every **Ver na loja** action uses the internal outbound resolver, reaches an allowlisted Store destination, and attempts idempotent Outbound Click recording; a valid redirect proceeds when persistence fails, successfully persisted event IDs count once, and later disclosed affiliate parameters require no CTA change.

- **CAP-6**
  - **intent:** Shoppers can inspect stored Listing Price history for an individual Store Offer.
  - **success:** Offer detail renders that Offer's stored price history when available and an honest insufficient-history state otherwise, with no Merge aggregate, alert, signup, or notification UI.

- **CAP-7**
  - **intent:** Operators can ingest and expose filament Offers only from policy-compliant Homologated Stores.
  - **success:** Closin, Voolt3D, 3D Colors, Filamentos 3D Brasil, and Topink3D pass fixture and capacity gates before activation; blocked or broken Stores become Unsupported; incomplete runs cannot mass-mark Offers unavailable; and Unsupported Stores are excluded from public coverage.

## Constraints

- v1 is a fully anonymous, responsive, strongly mobile-usable web product in pt-BR and BRL only; no native app or authentication.
- Day-1 value is searchable Offers from the five named launch Stores, with filament-only ingestion from multi-category Stores; a mature canonical catalog is not a launch gate.
- Listing Price excludes frete and is the only ranking price; unknown weight yields no R$/kg, and no price, freshness, or checkout guarantee may be implied.
- Offers unrefreshed for more than 48 hours remain visible as stale; unavailable and stale Offers from active or degraded Stores remain outbound-capable.
- The required public surfaces, behavior, responsive states, accessibility floor, copy, visual tokens, and image-free dense presentation are normative as defined by the adopted UX companions.
- Every outbound action is labeled **Ver na loja**, announces external navigation, and uses the internal resolver; history is scoped to one Offer URL.
- Ingestion is deterministic and fixture-homologated; runtime AI/ML matching, runtime LLM extraction, CAPTCHA bypass, credentialed scraping, robots-policy disregard, and production auto-repair are forbidden.
- Failed or incomplete ingestion preserves prior published state and cannot infer absence; fewer than five active Stores pauses full-coverage claims and triggers a replacement attempt within 14 days.
- The adopted Architecture Spine is normative in full, including AD-1 through AD-25, its stack, boundaries, invariants, release gates, and deferred-decision constraints.
- D1 is the sole authority; publication and projections are atomic, generation-fenced, replay-safe, and cannot expose mixed or partial generations.
- Exactly two Workers exist: public web has no D1 or ingestion authority and calls non-public ingest/data through typed, versioned Service Binding contracts with N/N-1 rollout compatibility.
- Merchant content, destinations, and public commands are untrusted, allowlisted, and resource-bounded; product analytics is limited to minimized product events, while bounded redacted operational logs, traces, errors, ingestion-health, and security telemetry remain required; backend failure must never appear as an empty result.
- Only isolated local and production environments exist; dynamic MVP responses have no cross-request cache.
- Production release requires the Architecture Spine's identity, compatibility, publication, replay, security, privacy, recovery, performance, and accessibility gates; provisional targets are search p95 below 500 ms, detail LCP below 2.5 s, and WCAG 2.1 AA on the core flow.

## Non-goals

- No marketplace, cart, checkout, payment, seller portal, public write or partner API, native app, authentication, accounts, alerts, watchlists, reviews, email capture, push, or notifications in MVP.
- No frete, CEP, tax, landed-cost ranking, price guarantees, Mercado Livre aggregation, images, logos, proxies, visual catalog grids, deal rails, or showcase merchandising.
- No spool inventory, print-farm or printer integration, resin, accessories, non-filament products, Merge-level history, color- or diameter-based Merge, forced or probabilistic matching, or production AI/LLM behavior.
- No day-1 affiliate dependency, display ads, programmatic SEO farms, Store microsites, best-deal or recently-reduced experiences, or policy-violating coverage optimization.

## Success signal

- An anonymous shopper completes search → comparison → **Ver na loja**, reaches an allowed merchant destination, and produces one countable Outbound Click. Launch success uses Outbound Click count; its numeric threshold is set after a public-traffic baseline.

## Assumptions

- Search and product-view events may support diagnostics but are not success metrics.

## Open Questions

- What weekly Outbound Click threshold applies after baseline traffic is known?
- What post-MVP trigger enables affiliate parameters and disclosure?
- How deep should v1 SEO coverage extend beyond search, detail, and basic brand and material browse?
- Which normalization dictionaries, Store-map schema and hooks, extraction strategies, query grammar, and queue parameters satisfy the architecture fixtures and homologation gates?
- Before production, what telemetry and observation retention periods, RPO, RTO, Time Travel tier, and export cadence are approved?
