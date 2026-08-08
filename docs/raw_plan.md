# FILAMENT PRICE — RAW PRODUCT SPEC / BMAD INPUT

Version: 0.1
Status: Initial Product Specification
Product Type: Public filament price comparison/search engine
Primary Market: Brazil
Language: pt-BR
Currency: BRL
Administration UI: NONE
Authentication: NONE for MVP
Primary Infrastructure: Cloudflare
Primary Goal: Help users find the lowest current prices for 3D printing filament across multiple online stores.

---

# 1. PRODUCT VISION

Build a fast, visually attractive public website that automatically collects filament products from multiple online stores, normalizes the data, identifies equivalent products across different stores, and presents the best available prices.

The central product concept is:

"Search the filament you want and immediately see where it is cheapest."

The system must distinguish between:

* Store listings
* Brands
* Product families/models
* Material
* Color
* Diameter
* Spool weight
* Variants

Multiple store listings referring to the same physical filament must be grouped into a canonical product whenever possible.

Example:

Store A:
"Bambu Lab PETG HF Black 1KG 1.75mm"

Store B:
"Filamento Bambu PETG-HF Preto 1000g"

Store C:
"BambuLab PETG HF - Black - 1 Kg"

These should resolve to:

Brand:
Bambu Lab

Product family:
PETG HF

Material:
PETG

Variant:
Black / 1 kg / 1.75 mm

And appear as one product with multiple offers.

---

# 2. MVP OBJECTIVES

The MVP must allow the user to:

1. Search filament products.
2. Browse products by material.
3. Browse products by brand.
4. Filter search results.
5. Sort products by effective price.
6. See the cheapest store for each product.
7. Open the original store product page.
8. Compare multiple offers of the same filament.
9. See price per kilogram.
10. See when the price was last checked.
11. Identify out-of-stock products.
12. Find promotions automatically captured from stores.

The MVP must automatically:

1. Crawl configured stores.
2. Discover product pages.
3. Extract filament information.
4. Normalize product information.
5. Normalize brand names.
6. Deduplicate product families.
7. Match listings from different stores to canonical products.
8. Maintain current offers.
9. Maintain basic price history.
10. Detect unavailable listings.
11. Retry failed scraping jobs.

---

# 3. NON-GOALS FOR MVP

Do NOT implement:

* Admin dashboard.
* User accounts.
* Social login.
* Shopping cart.
* Checkout.
* Marketplace.
* Store inventory management.
* Store authentication.
* Affiliate dashboard.
* Seller portal.
* User reviews.
* Ratings.
* Wishlists.
* Email alerts.
* Push notifications.
* Mobile applications.
* Machine-learning training pipelines.
* LLM dependency for every scraped product.
* Real-time scraping triggered by every user search.

Architecture must nevertheless permit these features later.

---

# 4. CORE DOMAIN MODEL

Use the following conceptual hierarchy:

BRAND
↓
PRODUCT FAMILY
↓
PRODUCT VARIANT
↓
STORE OFFER

Example:

Brand
Bambu Lab

Product Family
PETG HF

Variant
Black / 1 kg / 1.75 mm

Offers
Amazon — R$ 119.90
3D Fila — R$ 129.00
Store X — R$ 109.90

The UI primarily presents PRODUCT VARIANTS.

Offers are children of a product variant.

---

# 5. TERMINOLOGY

## Brand

Manufacturer or commercial filament brand.

Examples:

* Bambu Lab
* Elegoo
* Voolt3D
* 3D Fila
* eSUN
* Polymaker
* Creality
* SUNLU

---

## Material

Canonical material category.

Initial allowed values:

PLA
PLA+
PLA-CF
PETG
PETG-HF
PETG-CF
ABS
ABS-GF
ASA
ASA-CF
TPU
TPE
PC
PC-CF
PA
PA6
PA12
PA-CF
PA-GF
PVA
BVOH
HIPS
PVB
PP
PEEK
PEKK
OTHER

Do not assume store terminology is canonical.

Example:

"PETG High Speed"
"Rapid PETG"
"PETG-HF"

may refer to different product families even though all are PETG derivatives.

Therefore:

material != product family

---

## Product Family

Manufacturer-specific commercial filament model.

Examples:

Bambu Lab PETG HF
Elegoo Rapid PETG
Polymaker PolyLite ASA
eSUN PLA+
Bambu Lab PETG-CF

---

## Product Variant

A purchasable physical configuration of a product family.

Variant fields can include:

* color
* color normalized
* spool weight
* filament diameter
* finish
* special characteristics

Example:

Bambu Lab PETG HF
Black
1 kg
1.75 mm

---

## Offer

One store listing selling one product variant.

Examples:

Bambu Store:
R$129

Amazon:
R$149

Mercado Livre:
R$119

---

# 6. CORE TECH STACK

Use TypeScript throughout unless there is a strong technical reason not to.

## Application

React Router v8
React
TypeScript
Vite
Cloudflare Vite Plugin

Runtime:
Cloudflare Workers

Use server-side rendering where appropriate.

---

## UI

Tailwind CSS
shadcn/ui
Lucide icons

Preferred component philosophy:

* clean
* dense enough for price comparison
* premium visual appearance
* fast
* responsive
* minimal animation
* excellent mobile usability

Avoid:

* massive landing-page hero
* excessive gradients
* glassmorphism everywhere
* giant cards
* dashboard-like appearance

This is a SEARCH / PRICE COMPARISON PRODUCT.

Information density is desirable.

---

# 7. CLOUDFLARE INFRASTRUCTURE

Use:

Cloudflare Workers
Cloudflare Static Assets
Cloudflare D1
Cloudflare Queues
Cloudflare Cron Triggers

Optional/fallback:

Cloudflare Browser Run

Possible future use:

Cloudflare R2
Cloudflare KV
Cloudflare Analytics Engine
Cloudflare Workers AI

Do NOT introduce these unless justified.

---

# 8. SYSTEM ARCHITECTURE

Logical components:

[PUBLIC WEB]
|
v
[WEB/SSR WORKER]
|
v
[D1 DATABASE]

Scraping:

[CRON]
|
v
[SCRAPE SCHEDULER]
|
v
[SCRAPE QUEUE]
|
+--------------------+
|                    |
v                    v
[HTTP SCRAPER]     [BROWSER SCRAPER]
|                    |
+---------+----------+
|
v
[PARSER]
|
v
[NORMALIZER]
|
v
[MATCH ENGINE]
|
v
[D1 DB]

---

# 9. SCRAPING PRINCIPLES

Every store must use a STORE ADAPTER.

Do not create one giant scraper containing store-specific conditions.

Interface:

StoreAdapter {
storeId
discoverProducts()
fetchProduct()
parseProduct()
}

Possible extension:

StoreAdapter {
configuration
discoveryStrategy
parsingStrategy
browserRequired
}

Each store adapter must be isolated.

Example:

src/scraping/stores/
amazon/
mercado-livre/
bambu-store/
elegoo/
voolt3d/
3dfila/

Do not assume all stores will be scrapable by the same method.

---

# 10. SCRAPING PRIORITY

Always use the cheapest available method.

Priority:

1. Public structured API when available and allowed.
2. JSON-LD / Schema.org Product data.
3. Embedded page JSON.
4. Static HTML parsing.
5. Browser-rendered HTML.
6. Browser automation.

Browser rendering must NOT be the default.

Reason:

* slower
* more expensive
* more fragile

---

# 11. STORE DISCOVERY

Store adapters may discover products using one or more strategies:

Sitemap
Category page crawling
Search result crawling
Store API
Merchant feed
Known product URLs

Preferred order:

Sitemap > API/feed > category crawl > search crawl.

Discovery output:

{
storeId
url
externalProductId?
discoveredAt
}

URLs must be normalized before storage.

Remove known tracking query parameters.

---

# 12. SCRAPED RAW PRODUCT

Never directly write parsed data into canonical product tables.

First create/update a raw offer record.

Raw scraped representation:

ScrapedOffer {
storeId
sourceUrl
externalProductId

rawTitle
rawBrand
rawPrice
rawOriginalPrice
rawCurrency
rawAvailability
rawImageUrl
rawDescription

rawMetadata

fetchedAt
}

Preserving raw input is important for debugging matching problems.

---

# 13. NORMALIZATION PIPELINE

Pipeline:

RAW
↓
SANITIZATION
↓
ATTRIBUTE EXTRACTION
↓
BRAND NORMALIZATION
↓
MATERIAL NORMALIZATION
↓
WEIGHT NORMALIZATION
↓
DIAMETER NORMALIZATION
↓
COLOR NORMALIZATION
↓
PRODUCT FAMILY MATCHING
↓
VARIANT MATCHING
↓
OFFER UPSERT

---

# 14. TEXT NORMALIZATION

For matching only, generate normalized strings.

Rules:

* Unicode normalization.
* lowercase.
* trim.
* collapse whitespace.
* normalize punctuation.
* remove trademark symbols.
* normalize hyphens.
* normalize separators.
* normalize common units.
* remove repeated manufacturer name where appropriate.

Example:

"Bambu Lab® PETG-HF - Preto / 1 KG"

matching representation:

"bambu lab petg hf preto 1kg"

Never replace the display product name with this normalized representation.

Store both:

display_name
normalized_name

---

# 15. BRAND DEDUPLICATION

Brand table:

brands

Fields:

id
name
slug
normalized_name
website_url
logo_url nullable
created_at
updated_at

Additional table:

brand_aliases

Fields:

id
brand_id
alias
normalized_alias

Example:

Brand:

Bambu Lab

Aliases:

BambuLab
Bambu
Bambu Lab Store

All aliases resolve to:

brand_id = Bambu Lab

---

# 16. BRAND RESOLUTION ALGORITHM

Resolution order:

1. Exact normalized alias.
2. Exact canonical normalized name.
3. Explicit parser/store mapping.
4. Conservative fuzzy matching.
5. Create unresolved candidate.

Never automatically merge two brands solely because the strings are vaguely similar.

Examples that should normalize:

"BambuLab"
"Bambu Lab"

Examples that MUST NOT accidentally merge:

"3D Fila"
"Fila"

Brand matching threshold must be conservative.

---

# 17. MATERIAL NORMALIZATION

Maintain canonical material aliases.

Example:

PETG aliases:

pet-g
petg

PETG-HF aliases:

petg hf
petg high flow
high flow petg

But manufacturer product terminology must not be overwritten blindly.

Example:

Elegoo "Rapid PETG"

Material:
PETG

Product family:
Rapid PETG

Do NOT normalize product family to PETG-HF.

---

# 18. PRODUCT FAMILY MATCHING

Canonical family key should conceptually be:

brand + family/model

Example:

brand = Elegoo
family = Rapid PETG

Do NOT include:

color
weight
diameter
store
price

in family identity.

Product family fields:

id
brand_id
name
slug
normalized_name
material_id
description nullable
manufacturer_url nullable
image_url nullable
created_at
updated_at

---

# 19. PRODUCT VARIANT MATCHING

Canonical variant identity should usually include:

product_family_id
color_normalized
weight_grams
diameter_mm

Potential optional discriminator:

finish
special_variant

Example canonical key:

family:bambu-petg-hf
color:black
weight:1000
diameter:1.75

---

# 20. COLOR NORMALIZATION

Store:

color_name
color_normalized
color_hex nullable

Examples:

Preto
Black
Jet Black

may normalize to:

black

BUT do not aggressively merge manufacturer-specific color names when they represent meaningfully different colors.

Example:

Matte Black
Black

should normally remain different if sold as different SKUs.

Possible fields:

display_color
base_color
manufacturer_color

Example:

manufacturer_color = "Obsidian Black"
base_color = "black"

Matching prefers manufacturer_color when available.

---

# 21. WEIGHT NORMALIZATION

Canonical unit:

grams

Examples:

1 kg -> 1000
1000g -> 1000
0.5kg -> 500
250g -> 250

Never assume 1 spool = 1 kg.

If weight cannot be determined:

weight_grams = NULL

This lowers matching confidence.

---

# 22. DIAMETER NORMALIZATION

Canonical unit:

millimeters.

Examples:

1.75
1,75 mm
1.75mm

-> 1.75

Do not assume every product is 1.75 mm when missing.

Can use:

diameter_mm = NULL

---

# 23. PRICE NORMALIZATION

Store monetary values as integer cents.

Example:

R$ 129,90

price_cents = 12990
currency = BRL

Never use floating point for monetary values.

---

# 24. PRICE PER KG

Calculate:

price_per_kg_cents =
price_cents / (weight_grams / 1000)

Only calculate when:

weight_grams > 0

Examples:

R$100 / 1kg
= R$100/kg

R$60 / 500g
= R$120/kg

Use PRICE PER KG extensively in UI because spool sizes differ.

---

# 25. EFFECTIVE PRICE

MVP effective price:

effective_price = product price

Shipping is NOT included unless the store provides universally applicable shipping.

Never display:

"cheapest"

based on shipping assumptions that are unknown.

UI language:

"Menor preço do produto"

Future:

CEP-based landed price.

---

# 26. OFFER MODEL

offers

id
store_id
product_variant_id nullable
external_product_id nullable

source_url
canonical_url

title
normalized_title

price_cents
original_price_cents nullable
currency

availability_status

image_url nullable

seller_name nullable
seller_external_id nullable

weight_grams nullable
diameter_mm nullable

matching_status
matching_confidence

first_seen_at
last_seen_at
last_checked_at

created_at
updated_at

---

# 27. AVAILABILITY STATUS

Enum:

IN_STOCK
OUT_OF_STOCK
PREORDER
UNKNOWN
DISCONTINUED

Do not delete offers immediately when unavailable.

Maintain history.

---

# 28. STORES

stores

id
name
slug
base_url
logo_url nullable
active
scraping_enabled
scrape_interval_minutes
browser_required
created_at
updated_at

Store configuration lives primarily in source code for MVP.

There is NO ADMIN UI.

---

# 29. PRICE HISTORY

price_history

id
offer_id
price_cents
original_price_cents nullable
availability_status
observed_at

Do not create duplicate history rows when nothing changed unnecessarily.

Create new price history event when:

price changed
OR
availability changed

Optionally create periodic snapshots later.

---

# 30. RAW SCRAPE STORAGE

scrape_results

id
store_id
url

raw_title
raw_brand
raw_price
raw_currency
raw_availability

raw_json

content_hash

scraped_at

parse_status
parse_error nullable

Retention can be bounded.

Do NOT keep full page HTML indefinitely in D1.

If raw HTML retention becomes necessary, use R2.

---

# 31. SCRAPE JOB MODEL

scrape_jobs

id
store_id
url
job_type

status

attempt_count
last_error nullable

scheduled_at
started_at nullable
completed_at nullable

created_at

Possible job types:

DISCOVER
PRODUCT_REFRESH
PRODUCT_INITIAL
REPROCESS

Possible status:

QUEUED
PROCESSING
SUCCESS
FAILED
DEAD

---

# 32. QUEUE ARCHITECTURE

Recommended initial queues:

scrape-products
scrape-dead-letter

Messages must be small.

Example:

{
"storeId": "uuid",
"url": "...",
"jobType": "PRODUCT_REFRESH",
"attempt": 0
}

Do NOT put HTML inside Queue messages.

---

# 33. RETRIES

Transient errors:

HTTP 429
HTTP 500
HTTP 502
HTTP 503
network timeout
browser failure

must retry.

Use exponential backoff where appropriate.

Do not retry indefinitely.

After retry limit:

send to dead-letter handling / persist failure.

Store consecutive failure count.

---

# 34. RATE LIMITING

Every store must have its own crawl policy.

Configuration example:

{
concurrency: 2,
requestsPerMinute: 20,
minDelayMs: 1000
}

Do not aggressively scrape websites.

Respect:

* rate limits
* terms where applicable
* robots directives where applicable
* reasonable crawl frequency

The platform must be designed so frequency can be configured per store.

---

# 35. CRAWL FREQUENCY

Initial recommendation:

High-priority stores:
every 2–4 hours

Normal stores:
every 6 hours

Low-change stores:
every 12–24 hours

Do not scrape all products simultaneously from Cron.

Cron should enqueue work.

Queue consumers perform actual scraping.

---

# 36. MATCH ENGINE

The matching engine is one of the most critical parts of the product.

Goal:

Offer -> Product Variant

Matching must produce:

MATCHED
UNMATCHED
AMBIGUOUS

And:

confidence score 0–1

---

# 37. MATCH FEATURES

Matching features:

brand
family/model
material
manufacturer SKU
EAN/GTIN
color
weight
diameter
normalized title

Strong identifiers:

GTIN/EAN
manufacturer SKU

Medium identifiers:

brand + model + weight + color

Weak identifiers:

title similarity

Never match primarily by price.

---

# 38. MATCHING STRATEGY

Stage 1:
Extract explicit identifiers.

Stage 2:
Resolve brand.

Stage 3:
Resolve material.

Stage 4:
Extract model/family terms.

Stage 5:
Generate candidate families for same brand/material.

Stage 6:
Score candidates.

Stage 7:
Resolve variant.

Stage 8:
Apply confidence threshold.

Suggested logic:

> = 0.92
> automatic match

0.75–0.92
ambiguous / do not merge unless strong structured identifiers exist

< 0.75
unmatched

The exact weights may change after real data is collected.

False positive merge is substantially worse than duplicate products.

Therefore optimize matching conservatively.

---

# 39. AI / LLM POLICY

LLMs are OPTIONAL.

Do not make scraping dependent on an LLM.

Core extraction should use deterministic logic.

Potential future use:

* resolving ambiguous model names
* suggesting brand aliases
* extracting difficult attributes
* offline normalization jobs

If Workers AI is introduced:

LLM output must never directly merge entities without deterministic validation.

---

# 40. SLUGS

Examples:

/marca/bambu-lab

/material/petg

/filamento/bambu-lab-petg-hf

/filamento/bambu-lab-petg-hf-black-1kg

Slugs should be stable.

Changing display names must not unnecessarily break URLs.

---

# 41. PUBLIC PAGES

Required:

/
/buscar
/filamentos
/filamento/:slug
/marcas
/marca/:slug
/materiais
/material/:slug
/lojas
/loja/:slug

Optional SEO pages later:

/ofertas
/mais-baratos
/queda-de-preco

---

# 42. HOME PAGE

Primary goal:

SEARCH.

Top section should immediately contain:

Headline:
"Encontre o melhor preço para seu próximo filamento"

Large search bar.

Placeholder:

"Busque por PETG, Bambu Lab, ASA, Rapid PETG..."

Secondary quick filters:

PLA
PETG
ASA
ABS
TPU
PETG-CF

Below:

Best current deals

Popular materials

Popular brands

Recently reduced prices

No oversized marketing hero.

Search must be visible without scrolling on desktop.

---

# 43. SEARCH EXPERIENCE

Search should support examples such as:

"petg"
"petg cf"
"bambu petg"
"bambu petg hf"
"asa preto"
"elegoo rapid petg"
"petg 1kg"
"petg preto"

Search should query canonical product data, not raw store listings.

Potential search fields:

brand
family
material
color
aliases

---

# 44. SEARCH RESULT CARD

Each card should show:

Product image
Brand
Product family
Material
Color when relevant
Weight
Lowest current price
Price/kg
Number of stores
Lowest-price store
Last price refresh
Discount indicator if applicable

Example:

Bambu Lab
PETG HF — Black — 1 kg

R$ 109,90
R$ 109,90/kg

a partir de 3 lojas

[Ver preços]

---

# 45. PRODUCT DETAIL PAGE

Header:

Product image
Brand
Product family
Variant
Material
Weight
Diameter

Price summary:

Current lowest price
Price/kg
Number of available offers

Offer table:

Store
Price
Price/kg
Availability
Last checked
CTA

CTA:

"Ver na loja"

Open original URL.

Use:

rel="nofollow sponsored noopener"

when appropriate for commercial outbound links.

---

# 46. OFFER SORTING

Default order:

1. IN_STOCK
2. lowest price
3. freshest data

Unknown availability comes below confirmed in-stock.

Out-of-stock offers at bottom.

---

# 47. FILTERS

MVP filters:

Brand
Material
Color/base color
Weight
Diameter
Price range
Availability

Optional:

Store

Sorting:

Lowest price
Lowest price/kg
Highest discount
Recently updated
A–Z

---

# 48. DISCOUNTS

Discount percentage may only be shown when:

original_price_cents exists
AND
original_price_cents > price_cents

Formula:

(original - current) / original * 100

Do not invent discount percentages from historical prices.

Historical low can be displayed separately later.

---

# 49. FRESHNESS

Every offer has:

last_checked_at

Display human-friendly freshness:

"Atualizado há 18 min"
"Atualizado há 2 h"

Define stale threshold.

Initial recommendation:

24 hours.

If an offer is older than stale threshold:

show:

"Preço ainda não verificado recentemente"

Do not present stale data as guaranteed current price.

---

# 50. SEARCH IMPLEMENTATION

MVP:

D1 queries
normalized searchable columns
indexes

Do NOT introduce Elasticsearch, Typesense, Algolia or external search engine initially.

Potential SQLite FTS support may be evaluated.

Start simple.

Search normalization:

accent-insensitive
case-insensitive
normalized whitespace
brand aliases
material aliases

---

# 51. DATABASE TABLES

Minimum tables:

brands
brand_aliases

materials
material_aliases

product_families

product_variants

stores

offers

price_history

scrape_jobs

scrape_results

Optional:

product_aliases
color_aliases

---

# 52. DATABASE INDEXES

Create indexes for common queries.

Examples:

brands.slug

product_families.brand_id
product_families.material_id
product_families.slug
product_families.normalized_name

product_variants.product_family_id
product_variants.weight_grams
product_variants.diameter_mm

offers.product_variant_id
offers.store_id
offers.price_cents
offers.availability_status
offers.last_checked_at

price_history.offer_id
price_history.observed_at

scrape_jobs.status
scrape_jobs.store_id

Do not prematurely create excessive indexes.

---

# 53. API DESIGN

Use server-side routes / resource routes.

Public endpoints conceptually:

GET /api/search

GET /api/products

GET /api/products/:slug

GET /api/brands

GET /api/brands/:slug/products

GET /api/materials

GET /api/materials/:slug/products

GET /api/stores

No public mutation endpoints.

Scraping infrastructure must not expose unrestricted HTTP endpoints.

---

# 54. SEARCH API

GET /api/search

Parameters:

q
brand
material
color
weight
diameter
minPrice
maxPrice
availability
sort
page
limit

Example:

/api/search?q=petg&brand=bambu-lab&sort=price_asc

Response:

{
items: [],
pagination: {
page,
limit,
total,
totalPages
},
filters: {}
}

---

# 55. PRODUCT RESPONSE SHAPE

ProductVariantDTO:

{
id,
slug,
brand: {
id,
name,
slug
},

family: {
id,
name,
slug
},

material: {
id,
name,
slug
},

color: {
displayName,
baseColor
},

weightGrams,
diameterMm,

imageUrl,

price: {
lowest,
pricePerKg,
currency,
offerCount
},

offers: []
}

---

# 56. STORE ADAPTER CONTRACT

Conceptual TypeScript:

interface StoreAdapter {
id: string;

discover(ctx: DiscoveryContext): Promise<DiscoveredProduct[]>;

scrape(
url: string,
ctx: ScrapeContext
): Promise<ScrapedProduct>;
}

ScrapedProduct:

{
externalId?: string;
url: string;

title: string;
brand?: string;

price?: number;
originalPrice?: number;
currency?: string;

availability?: string;

imageUrl?: string;

sku?: string;
gtin?: string;

description?: string;

attributes?: Record<string, string>;

raw?: unknown;
}

---

# 57. HTML PARSING

Prefer standards before custom selectors.

Extraction priority:

1. JSON-LD Product.
2. OpenGraph / meta.
3. embedded structured state.
4. CSS selectors.
5. heuristics.

Store-specific selectors may override generic extraction.

---

# 58. JSON-LD

When Schema.org Product data exists, attempt to extract:

name
brand
sku
gtin
image
offers.price
offers.priceCurrency
offers.availability

Do not blindly trust malformed structured data.

Validate all fields.

---

# 59. BROWSER FALLBACK

Store adapter property:

renderMode:

STATIC
BROWSER
AUTO

AUTO:

attempt normal fetch.

If required content is absent or JS shell detected:

use Browser Run.

Do not browser-render twice in the same job unnecessarily.

---

# 60. SCRAPER OBSERVABILITY

Track per store:

successful requests
failed requests
parse failures
products discovered
products changed
HTTP response codes
average scrape duration
last successful crawl

No admin UI required.

Use logs/Cloudflare observability initially.

---

# 61. PARSER FAILURE DETECTION

A scraper returning HTTP 200 does NOT mean success.

Detect unexpected states.

Example:

If historically a store returns:

price
title
availability

and suddenly >50% of pages are missing price:

flag probable parser breakage.

Do not mark every product out-of-stock due to parsing failure.

This is critical.

---

# 62. OUT-OF-STOCK SAFETY

Never infer OUT_OF_STOCK merely because price parsing failed.

Distinguish:

PARSE_ERROR

from:

OUT_OF_STOCK

An offer becomes OUT_OF_STOCK only from a reliable availability signal.

---

# 63. OFFER DEACTIVATION

If product disappears:

do not immediately delete.

After repeated confirmed absence:

mark unavailable.

Potential future:

DISCONTINUED.

Historical data remains.

---

# 64. DATA QUALITY

Each normalized offer should have a quality score.

Possible signals:

brand resolved
material resolved
family resolved
weight resolved
color resolved
diameter resolved
SKU present
GTIN present

Not mandatory in UI.

Useful internally.

---

# 65. MATCHING CONFIDENCE

Persist:

matching_confidence
matching_method

Possible methods:

GTIN
SKU
EXACT_RULE
NORMALIZED_RULE
FUZZY
MANUAL_SEED
UNMATCHED

Even without an admin, these fields are important for future corrections.

---

# 66. INITIAL SEED DATA

Maintain repository seed files for:

brands
brand aliases
materials
material aliases
color aliases

Example:

data/
brands.ts
materials.ts
colors.ts

These are deterministic reference data.

Database migrations/seed command imports them.

---

# 67. MANUAL OVERRIDES WITHOUT ADMIN

Because there is no admin UI, support source-controlled overrides.

Example:

config/matching-overrides.ts

Possible rules:

specific URL -> family
specific SKU -> family
brand alias -> canonical brand
product alias -> canonical family

This is essential for fixing edge cases during MVP.

---

# 68. DESIGN SYSTEM

Style direction:

modern
premium
technical
e-commerce comparison
clean
high information density

Base:

neutral light background
dark typography

Optional subtle accent:
orange / amber or green for price-related highlights.

Avoid excessive colors.

Components:

SearchBar
ProductCard
PriceDisplay
PriceBadge
DiscountBadge
MaterialBadge
BrandLogo
OfferTable
FilterSidebar
FilterDrawer
SortSelect
Pagination
EmptyState
PriceHistoryChart future
Breadcrumb

---

# 69. DESKTOP LAYOUT

Search results:

Left:
filter sidebar

Right:
results

Product grid:

3–4 cards depending viewport.

Alternative list mode can be evaluated later.

Price should visually dominate product cards.

---

# 70. MOBILE

Filters open as bottom sheet / drawer.

Search remains prominent.

Product cards must remain compact.

Price and CTA cannot require horizontal scrolling.

Offer table should convert to vertically stacked offer rows.

---

# 71. PERFORMANCE REQUIREMENTS

Targets:

LCP < 2.5 s typical
CLS < 0.1

Avoid unnecessary client-side JS.

Use server loaders for initial data.

Images:

lazy loading
fixed dimensions/aspect ratios
remote image handling

Cache suitable public responses.

---

# 72. CACHE STRATEGY

Cache public responses where safe.

Candidate pages:

brand pages
material pages
product pages
search result GETs

Short cache windows:

30–300 seconds depending route.

Price updates do not need instant global propagation.

Do not cache scraper mutation operations.

---

# 73. SEO

Important because product/material/brand queries have strong organic-search potential.

Every canonical product page must have:

unique title
description
canonical URL
OpenGraph metadata

Example:

"Bambu Lab PETG HF Preto 1kg: compare preços"

Structured data can later include:

Product
Offer
AggregateOffer

Only expose structured price data that accurately represents current indexed offers.

---

# 74. SITEMAP

Generate sitemap containing:

brands
materials
product families
product variants

Do not include arbitrary search-query URLs.

---

# 75. ROBOTS

Public product pages indexable.

Internal/API paths not intended for indexing.

Search parameter combinations should generally not become unlimited SEO pages.

Prevent crawl explosion.

---

# 76. PRODUCT IMAGES

MVP:

Use store/manufacturer remote image URLs.

Preferred image resolution strategy:

1. manufacturer image when known
2. representative offer image
3. placeholder

Do NOT duplicate all images into R2 initially.

Future optimization may proxy/cache images.

---

# 77. STORE LOGOS

Store logos may be stored as static app assets when legally appropriate.

Otherwise show text-based store identity.

---

# 78. SECURITY

No authentication in MVP.

Still protect:

internal scrape triggers
queue consumers
internal diagnostics

Never expose:

Cloudflare tokens
Browser API credentials
internal store configuration
scraper debug payloads

Validate all URL input.

Prevent SSRF.

Scrapers must only fetch allowlisted store domains.

---

# 79. SSRF PROTECTION

Critical.

Scraping functions MUST NOT accept arbitrary public URLs.

Every URL must map to an enabled configured store.

Allowed hostname validation required.

Reject:

localhost
127.0.0.1
private IP ranges
Cloudflare metadata/internal targets
unexpected protocol

Only HTTP/HTTPS store domains.

---

# 80. CONTENT SANITIZATION

Treat scraped text as untrusted input.

Never render raw scraped HTML.

Descriptions must be plain text or sanitized.

No scripts or HTML from merchants may reach the frontend.

---

# 81. SCRAPER LEGAL / OPERATIONAL RULE

Each adapter should prefer official/public data sources when available.

Do not implement techniques intended to defeat:

CAPTCHA
login controls
access restrictions
anti-bot challenges

If a merchant intentionally blocks automated access:

mark the store as unsupported and investigate an official feed/API/affiliate integration.

---

# 82. MONOREPO / PROJECT STRUCTURE

Recommended:

/
app/
components/
routes/
features/
lib/
styles/

workers/
scraper/

src/
db/
domain/
matching/
normalization/
scraping/

migrations/

config/

tests/

docs/

wrangler.jsonc

Keep domain code framework-independent whenever practical.

Possible organization:

src/domain/
brand.ts
material.ts
product.ts
offer.ts

src/normalization/
normalize-brand.ts
normalize-color.ts
normalize-material.ts
normalize-price.ts
normalize-weight.ts
normalize-diameter.ts

src/matching/
family-matcher.ts
variant-matcher.ts
match-score.ts

src/scraping/
core/
stores/

---

# 83. PACKAGE MANAGER

Use:

pnpm

Pin Node version.

Commit:

pnpm-lock.yaml

---

# 84. CODE QUALITY

Required:

TypeScript strict mode
ESLint
Prettier
Vitest

Avoid `any` unless isolated and justified.

Use Zod for external/untrusted data validation where useful.

---

# 85. TESTING STRATEGY

Unit tests are mandatory for normalization and matching.

High priority tests:

price parser
weight parser
diameter parser
brand resolver
material resolver
color resolver
product family matcher
variant matcher

Store scraper fixtures should use saved HTML/JSON fixtures when possible.

Do not make normal unit tests depend on live websites.

---

# 86. SCRAPER FIXTURE TEST

Each adapter should contain fixtures.

Example:

stores/elegoo/
adapter.ts
parser.ts
fixtures/
product-01.html
parser.test.ts

Expected parsed output is asserted.

This makes scraper breakage easy to detect.

---

# 87. MATCHING TEST CASES

Must include cases such as:

"Bambu Lab PETG HF Preto 1KG"
"BambuLab PETG-HF Black 1000g"

should match if all other identifiers support equivalence.

But:

"Bambu PETG Basic Black"
"Bambu PETG HF Black"

must NOT match.

And:

"Elegoo Rapid PETG"
"Bambu PETG HF"

must NEVER match merely because both are high-speed PETG.

---

# 88. PRICE TEST CASES

Inputs:

"R$ 129,90"
"129,90"
"R$129.90"
"129.90 BRL"

Normalize carefully based on locale/context.

Expected:

12990 cents

Do not incorrectly parse:

R$ 1.299,90

Expected:

129990 cents.

---

# 89. OBSERVABILITY

Use Cloudflare Workers observability/logging initially.

Log structured events.

Example:

{
event: "scrape.success",
store: "example",
url: "...",
durationMs: 810
}

Error:

{
event: "scrape.parse_failed",
store: "...",
url: "...",
parserVersion: "..."
}

Avoid logging full HTML.

---

# 90. ANALYTICS

MVP can use Cloudflare Web Analytics.

Track:

searches
product views
outbound store clicks

Do not require personal user profiles.

Potential custom event:

outbound_offer_click

Fields:

productVariantId
offerId
storeId
position
priceCents

---

# 91. AFFILIATE SUPPORT

Not required initially.

But outgoing URLs must pass through a URL resolver function.

Example:

resolveOutboundUrl(offer)

This enables affiliate parameters later without changing frontend logic.

Never embed affiliate logic throughout UI components.

---

# 92. OUTBOUND CLICK

Preferred:

User clicks "Ver na loja"

Option A:
direct merchant URL.

Future:
internal redirect endpoint records analytics then redirects.

Example:

/out/:offerId

Future endpoint:

validate offer
record click
redirect 302

---

# 93. PAGINATION

Server-side pagination.

Default:

24 products

Maximum public API:

100

Never fetch the entire catalog to browser and filter client-side.

---

# 94. EMPTY STATES

Search no results:

"Não encontramos esse filamento."

Suggest:

* removing color
* searching only material
* searching brand

Do not fabricate substitute matches.

---

# 95. PRICE DISPLAY

Brazilian formatting:

R$ 109,90

Use Intl.NumberFormat('pt-BR', {
style: 'currency',
currency: 'BRL'
})

Do not manually concatenate currency formatting.

---

# 96. TIME DISPLAY

Database:

UTC timestamps.

Frontend:

display localized times.

Persist ISO-compatible timestamps.

---

# 97. D1 MIGRATIONS

All schema changes via migrations.

Never manually change production DB schema without migration.

Commands/scripts must support:

dev DB
preview DB
production DB

---

# 98. ENVIRONMENTS

Minimum:

local
production

Recommended:

local
preview
production

Separate D1 databases for production and non-production.

Do not scrape production stores automatically from local tests.

---

# 99. CONFIGURATION

Environment variables / bindings:

DB
SCRAPE_QUEUE
BROWSER optional

Potential:

ENVIRONMENT
PUBLIC_SITE_URL

Secrets must never be committed.

---

# 100. CRON FLOW

Cron handler does NOT scrape whole catalog directly.

Cron:

1. Determine stores due for refresh.
2. Determine URLs needing refresh.
3. Batch/enqueue scrape messages.
4. Exit.

Queue performs network work.

---

# 101. SCRAPE PRIORITIZATION

Refresh priority:

1. popular offers/products
2. stale offers
3. offers with recent price volatility
4. remaining products

MVP may simply use:

oldest last_checked_at first.

This prevents large catalogs from always refreshing in same order.

---

# 102. DISCOVERY SCHEDULE

Discovery should be less frequent than price refresh.

Example:

Product price refresh:
every 4–6 hours.

Catalog discovery:
every 12–24 hours.

Store-specific configuration may override.

---

# 103. DUPLICATE URL HANDLING

Normalize merchant URLs.

Remove:

utm_*
gclid
fbclid
affiliate parameters when not intrinsic to product identity

Maintain:

canonical_url

Unique constraint conceptually:

store_id + canonical_url

when appropriate.

---

# 104. MARKETPLACE SPECIAL CASE

Marketplaces such as Mercado Livre/Amazon may have:

multiple sellers
duplicate listings
bundles
kits
different spool quantities

Do not assume one marketplace listing = canonical manufacturer SKU.

Potential fields:

seller_name
listing_quantity
bundle_quantity

Bundles must not be matched to single-spool variants unless price normalization explicitly understands bundle size.

---

# 105. BUNDLE DETECTION

Examples:

"Kit 2 Filamentos PLA 1kg"

total_weight = 2000g
bundle_quantity = 2

Do not interpret:

weight per spool = 2kg.

Need:

unit_weight_grams
bundle_quantity
total_weight_grams

MVP may exclude ambiguous bundles from canonical comparison.

Preferred behavior:

if bundle cannot be confidently normalized:

keep offer unmatched rather than corrupt pricing.

---

# 106. SHIPPING

MVP does not calculate shipping.

UI footer/disclaimer:

"Os preços podem mudar a qualquer momento. Frete e condições da loja podem alterar o valor final."

Do not claim checkout total.

---

# 107. PRICE GUARANTEE

Never imply prices are guaranteed.

Use wording:

"Último preço encontrado"

or

"Preço verificado há X"

Store remains source of truth.

---

# 108. INITIAL STORE STRATEGY

Do NOT implement 20 stores immediately.

Start with 3–5 representative stores.

Select stores covering different technical patterns:

1 static/easy store
1 Shopify/WooCommerce-like store
1 JavaScript-heavy store
1 marketplace if practical

Use this to validate the adapter architecture.

---

# 109. STORE ONBOARDING CHECKLIST

For every new store:

Identify allowed hostnames.

Identify discovery method.

Identify product data source.

Determine static/browser mode.

Implement adapter.

Create HTML fixtures.

Add parser tests.

Define rate limits.

Run discovery.

Inspect sample normalization.

Enable scheduled crawl.

---

# 110. MVP DEVELOPMENT PHASES

PHASE 1 — FOUNDATION

Cloudflare project
React Router
D1
schema
migrations
seed data
base UI
core domain types

---

PHASE 2 — NORMALIZATION

price parser
brand normalization
material normalization
weight normalization
diameter normalization
color normalization

Complete unit tests.

---

PHASE 3 — SCRAPING ENGINE

adapter contract
HTTP fetcher
JSON-LD parser
queue
cron
retry handling
scrape persistence

Implement first store.

---

PHASE 4 — PRODUCT MATCHING

brand resolver
family matcher
variant matcher
confidence score
unmatched flow

---

PHASE 5 — PUBLIC PRODUCT EXPERIENCE

homepage
search
filters
product list
product page
offers table
brand pages
material pages

---

PHASE 6 — MULTI-STORE

Implement remaining initial stores.

Validate deduplication against real dataset.

---

PHASE 7 — HARDENING

parser fixture tests
rate limiting
stale pricing
failure detection
SEO
sitemap
analytics
performance

---

# 111. MVP SUCCESS CRITERIA

System is MVP-ready when:

At least 3 stores are automatically scraped.

At least 500 real listings can be processed.

Canonical brands are deduplicated.

Equivalent products across stores can be grouped.

False-positive product merges are rare and detectable.

Search works without external search infrastructure.

Users can find:

brand
material
model

Users can sort by lowest price.

Price/kg works correctly.

Offer pages link to merchant.

Scraping resumes automatically after transient failures.

A broken parser cannot mass-mark products as out-of-stock.

System deploys entirely to Cloudflare without conventional servers.

---

# 112. PERFORMANCE ACCEPTANCE

Search API:

target p95 < 500 ms under ordinary load.

Product page:

server response target < 500 ms excluding external assets.

Scraping does not block public requests.

A slow merchant cannot degrade frontend response times.

---

# 113. DATA QUALITY ACCEPTANCE

For products marked MATCHED:

brand must be resolved.

family must be resolved.

variant identity must have enough information to avoid obvious false merges.

When unsure:

UNMATCHED is preferred over incorrect MATCHED.

---

# 114. SCRAPER ACCEPTANCE

A store adapter is complete only when:

product discovery works
product price is extracted
product name is extracted
availability can be determined or safely marked UNKNOWN
fixture tests exist
retry behavior works
rate limit is configured
failure does not corrupt existing offers

---

# 115. UX ACCEPTANCE

A new visitor must be able to:

open homepage
search "PETG"
see products
filter by brand
see lowest price
open product
compare stores
click merchant

without account creation.

---

# 116. ARCHITECTURAL RULES

RULE 1:
Store-specific scraping logic never leaks into domain matching code.

RULE 2:
Raw scraped strings never define canonical entities directly without normalization.

RULE 3:
False merge is worse than duplicate.

RULE 4:
Browser scraping is fallback, not default.

RULE 5:
Public frontend never performs merchant scraping.

RULE 6:
Scraping never happens synchronously from user search.

RULE 7:
Queues isolate scraping workloads.

RULE 8:
Cron schedules work; Queue executes work.

RULE 9:
Price is integer cents.

RULE 10:
Weight canonical unit is grams.

RULE 11:
Diameter canonical unit is millimeters.

RULE 12:
UTC in database.

RULE 13:
No admin UI in MVP.

RULE 14:
No authentication in MVP.

RULE 15:
No external database unless D1 proves insufficient.

RULE 16:
No external search engine in MVP.

RULE 17:
No LLM in critical request path.

RULE 18:
All scrapers use allowlisted domains.

RULE 19:
Parsing failure must never silently become out-of-stock.

RULE 20:
Every canonicalization decision should be reproducible.

---

# 117. IMPORTANT PRODUCT DECISION

Do not model the system as:

SCRAPED PRODUCT A
SCRAPED PRODUCT B
SCRAPED PRODUCT C

shown separately.

Model it as:

CANONICAL PRODUCT

with:

OFFER A
OFFER B
OFFER C

This distinction is foundational.

---

# 118. SUGGESTED FIRST D1 SCHEMA

Conceptual schema only; implementation agent should generate migrations.

brands

* id TEXT PK
* name TEXT NOT NULL
* normalized_name TEXT NOT NULL
* slug TEXT UNIQUE NOT NULL
* website_url TEXT
* logo_url TEXT
* created_at TEXT NOT NULL
* updated_at TEXT NOT NULL

brand_aliases

* id TEXT PK
* brand_id TEXT NOT NULL FK
* alias TEXT NOT NULL
* normalized_alias TEXT NOT NULL UNIQUE

materials

* id TEXT PK
* name TEXT NOT NULL
* slug TEXT UNIQUE NOT NULL

material_aliases

* id TEXT PK
* material_id TEXT NOT NULL FK
* alias TEXT NOT NULL
* normalized_alias TEXT NOT NULL UNIQUE

product_families

* id TEXT PK
* brand_id TEXT NOT NULL FK
* material_id TEXT FK
* name TEXT NOT NULL
* normalized_name TEXT NOT NULL
* slug TEXT UNIQUE NOT NULL
* image_url TEXT
* created_at TEXT NOT NULL
* updated_at TEXT NOT NULL

product_variants

* id TEXT PK
* product_family_id TEXT NOT NULL FK
* slug TEXT UNIQUE NOT NULL
* manufacturer_color TEXT
* base_color TEXT
* weight_grams INTEGER
* diameter_mm REAL
* image_url TEXT
* created_at TEXT NOT NULL
* updated_at TEXT NOT NULL

stores

* id TEXT PK
* name TEXT NOT NULL
* slug TEXT UNIQUE NOT NULL
* base_url TEXT NOT NULL
* logo_url TEXT
* active INTEGER NOT NULL
* scraping_enabled INTEGER NOT NULL
* scrape_interval_minutes INTEGER NOT NULL
* browser_required INTEGER NOT NULL DEFAULT 0
* created_at TEXT NOT NULL
* updated_at TEXT NOT NULL

offers

* id TEXT PK
* store_id TEXT NOT NULL FK
* product_variant_id TEXT FK
* external_product_id TEXT
* source_url TEXT NOT NULL
* canonical_url TEXT NOT NULL
* title TEXT NOT NULL
* normalized_title TEXT NOT NULL
* sku TEXT
* gtin TEXT
* price_cents INTEGER
* original_price_cents INTEGER
* currency TEXT NOT NULL DEFAULT 'BRL'
* availability_status TEXT NOT NULL
* image_url TEXT
* seller_name TEXT
* unit_weight_grams INTEGER
* bundle_quantity INTEGER
* total_weight_grams INTEGER
* diameter_mm REAL
* matching_status TEXT NOT NULL
* matching_confidence REAL
* matching_method TEXT
* first_seen_at TEXT NOT NULL
* last_seen_at TEXT NOT NULL
* last_checked_at TEXT NOT NULL
* created_at TEXT NOT NULL
* updated_at TEXT NOT NULL

price_history

* id TEXT PK
* offer_id TEXT NOT NULL FK
* price_cents INTEGER
* original_price_cents INTEGER
* availability_status TEXT NOT NULL
* observed_at TEXT NOT NULL

scrape_jobs

* id TEXT PK
* store_id TEXT NOT NULL FK
* url TEXT NOT NULL
* job_type TEXT NOT NULL
* status TEXT NOT NULL
* attempt_count INTEGER NOT NULL DEFAULT 0
* last_error TEXT
* scheduled_at TEXT NOT NULL
* started_at TEXT
* completed_at TEXT
* created_at TEXT NOT NULL

scrape_results

* id TEXT PK
* store_id TEXT NOT NULL FK
* url TEXT NOT NULL
* raw_title TEXT
* raw_brand TEXT
* raw_price TEXT
* raw_currency TEXT
* raw_availability TEXT
* raw_json TEXT
* content_hash TEXT
* parse_status TEXT NOT NULL
* parse_error TEXT
* scraped_at TEXT NOT NULL

---

# 119. FUTURE CAPABILITIES

Architecture should allow later introduction of:

User accounts
Favorites
Price alerts
Price-drop notifications
CEP shipping calculation
Affiliate links
Coupon support
Historical charts
Historical lowest price
Store reliability score
Filament technical properties
Print temperature
Bed temperature
Material comparison
Product reviews
Stock alerts
International stores
Multiple currencies
Amazon affiliate integration
Merchant feeds
Official merchant partnerships
Public API

Do not implement these now.

---

# 120. POSSIBLE DIFFERENTIATOR — FUTURE

Eventually product pages could become a filament knowledge base.

Example:

Bambu Lab PETG HF

Best current price
Historical price

Manufacturer specs:
Printing temp
Bed temp
Density
Heat resistance
Recommended drying
Maximum volumetric speed

Compatible printers
Community profile recommendations

But this is NOT part of initial MVP.

Initial competitive advantage is:

GOOD NORMALIZATION
+
GOOD PRODUCT MATCHING
+
FAST SEARCH
+
ACCURATE PRICES

---

# 121. BMAD AGENT INSTRUCTIONS

When converting this spec into PRD / Architecture / Epics:

Do not simplify away the canonical product / variant / offer model.

Treat deduplication and matching as first-class domain functionality.

Do not build an admin.

Do not add authentication.

Do not replace Cloudflare D1 without demonstrating a concrete limitation.

Do not introduce unnecessary microservices.

Prefer one deployable full-stack application plus isolated auxiliary scraping Worker if useful.

Prefer boring deterministic code over AI classification.

Design scraping adapters so adding a new store does not require changing the core scraping pipeline.

Generate comprehensive tests for normalization before implementing large numbers of stores.

Do not use Browser Run where ordinary fetch can obtain the data.

Scraping jobs must be idempotent.

Database upserts must be safe to retry.

Queue message delivery must be assumed to be repeatable.

Do not rely on exactly-once execution.

---

# 122. INITIAL EPICS

EPIC 1
Project Foundation and Cloudflare Infrastructure

EPIC 2
Filament Domain and Database Schema

EPIC 3
Normalization Engine

EPIC 4
Brand and Product Deduplication

EPIC 5
Scraping Framework

EPIC 6
First Store Adapter

EPIC 7
Cloudflare Queue and Scheduled Crawling

EPIC 8
Canonical Product Matching Engine

EPIC 9
Public Search Experience

EPIC 10
Product Comparison Page

EPIC 11
Brand and Material Discovery Pages

EPIC 12
Additional Store Adapters

EPIC 13
Price History and Freshness

EPIC 14
SEO and Structured Data

EPIC 15
Observability and Scraper Hardening

---

# 123. FIRST IMPLEMENTATION MILESTONE

The first vertical slice should NOT attempt the complete platform.

Implement:

1 store
20–50 products
real D1
real scraper
normalization
canonical brands
canonical families
canonical variants
offers
public homepage
search
product detail
price display

Deploy it to Cloudflare.

Only after the complete vertical slice works should additional stores be added.

---

# 124. FIRST MULTI-STORE MILESTONE

Add second store containing overlapping products.

The milestone succeeds when:

Store A:
"Bambu Lab PETG HF Black 1kg"

Store B:
"BambuLab PETG-HF Preto 1000g"

can resolve to the same canonical variant when evidence supports equivalence.

The product page then displays:

Bambu Lab PETG HF
Black
1kg

Store A — R$ X
Store B — R$ Y

with the lowest price automatically identified.

This is the core proof that the product works.

---

# 125. FINAL PRODUCT PRINCIPLE

The system is not a scraper website.

The system is a FILAMENT PRODUCT CATALOG + PRICE ENGINE whose ingestion mechanism happens to include scraping.

Scraping should therefore remain replaceable.

A future official merchant API, product feed, affiliate feed, CSV import, or marketplace API must be able to produce the same normalized Offer model.

All ingestion sources converge into:

Canonical Brand
→ Canonical Product Family
→ Canonical Variant
→ Offer
→ Price History

This normalized catalog is the core asset of the system.
