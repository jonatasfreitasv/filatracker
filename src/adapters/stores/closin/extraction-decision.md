# Closin extraction strategy decision (Story 1.2)

**Date:** 2026-08-08  
**Map/parser version:** 1 / 1  
**Status:** approved for homologation

## Decision

1. **Primary:** Parse bounded `application/ld+json` Product nodes as **inert JSON text** (never execute `<script>`).
2. **Fallback:** Deterministic HTML `data-hook` selectors only for listing/secondary price display gaps.
3. **Browser / headless:** Not enabled — live PDPs expose usable JSON-LD for required evidence fields.
4. **LLM / runtime codegen:** Forbidden.

## Evidence

- Reviewed PDP `https://www.closin.com.br/product-page/petg-laranja-1kg` (2026-08-08) exposes schema.org Product JSON-LD with `sku`, `brand`, `Offers.price`, `Offers.Availability`.
- Executable Wix bundles are present in full HTML (~2MB) and must be ignored.

## Failure behavior

| Condition | Outcome |
| --- | --- |
| Missing/malformed JSON-LD | No invented fields; availability `unknown` when offer evidence absent |
| Zero/free/invalid price text | `listingPriceCentavos: null` + bounded raw evidence |
| Ambiguous kit mass | `massGrams: null`, observation retained |
| CAPTCHA / auth / robots deny | Fail-closed run outcome; no bypass |
