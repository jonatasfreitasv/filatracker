UPDATE store_state
SET support_state = 'degraded',
    support_generation = 1,
    store_generation = 1,
    activation_gate = 'approved',
    display_name = 'Closin',
    observation_count = 134,
    published_offer_count = 134,
    freshness_observed_at = '2026-08-09T12:00:00.000Z',
    updated_at = '2026-08-09T12:00:00.000Z'
WHERE store_id = 'closin';

UPDATE store_state
SET support_state = 'active',
    support_generation = 1,
    store_generation = 1,
    activation_gate = 'approved',
    display_name = 'Voolt3D',
    observation_count = 6,
    published_offer_count = 6,
    freshness_observed_at = '2026-08-10T12:00:00.000Z',
    updated_at = '2026-08-10T12:00:00.000Z'
WHERE store_id = 'voolt3d';

WITH RECURSIVE catalog(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM catalog WHERE n < 134
)
INSERT INTO offers (
  offer_id, store_id, source_key, canonical_pdp_url, merchant_variant_id,
  continuity_fingerprint, store_generation, brand, specific_type,
  material_family, color, diameter_mm, mass_grams,
  listing_price_centavos, original_price_centavos, is_promotion,
  availability, observed_at, stale_after, published_at, map_version,
  parser_version, normalize_policy_version, standalone_only, visible,
  tombstoned, listing_title, search_text
)
SELECT
  printf('e2e_offer_%03d', n),
  'closin',
  printf('closin|https://www.closin.com.br/product-page/e2e-%03d|E2E%03d', n, n),
  printf('https://www.closin.com.br/product-page/e2e-%03d', n),
  printf('E2E%03d', n),
  printf('semantic-v1|e2e=%03d', n),
  1,
  CASE WHEN n % 17 = 0 THEN 'Voolt3D' ELSE 'Marca de teste' END,
  'filament',
  CASE WHEN n % 5 = 0 THEN 'PETG' WHEN n % 2 = 0 THEN 'PETG' ELSE 'PLA' END,
  CASE WHEN n % 2 = 0 THEN 'Preto' ELSE 'Branco' END,
  '1.75',
  1000,
  8000 + n,
  NULL,
  0,
  CASE WHEN n % 11 = 0 THEN 'unknown' ELSE 'available' END,
  printf('2026-08-09T11:%02d:00.000Z', n % 60),
  '2026-08-11T11:00:00.000Z',
  '2026-08-09T12:00:00.000Z',
  1,
  1,
  1,
  0,
  1,
  0,
  CASE
    WHEN n = 1 THEN '<img src=x onerror=alert(1)> Filamento PLA Branco'
    WHEN n = 2 THEN 'Filamento PLA DualStore overlap'
    ELSE printf('Filamento %s %03d', CASE WHEN n % 2 = 0 THEN 'PETG' ELSE 'PLA' END, n)
  END,
  CASE
    WHEN n = 2 THEN 'filamento fallback pla dualstore marca teste produto 002'
    ELSE printf('filamento fallback %s marca teste produto %03d', CASE WHEN n % 2 = 0 THEN 'petg' ELSE 'pla' END, n)
  END
FROM catalog;

WITH RECURSIVE vcatalog(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM vcatalog WHERE n < 6
)
INSERT INTO offers (
  offer_id, store_id, source_key, canonical_pdp_url, merchant_variant_id,
  continuity_fingerprint, store_generation, brand, specific_type,
  material_family, color, diameter_mm, mass_grams,
  listing_price_centavos, original_price_centavos, is_promotion,
  availability, observed_at, stale_after, published_at, map_version,
  parser_version, normalize_policy_version, standalone_only, visible,
  tombstoned, listing_title, search_text
)
SELECT
  printf('e2e_voolt_%02d', n),
  'voolt3d',
  printf('voolt3d|https://voolt3d.com.br/produtos/e2e-voolt-%02d/|VE2E%02d', n, n),
  printf('https://voolt3d.com.br/produtos/e2e-voolt-%02d/', n),
  printf('VE2E%02d', n),
  printf('semantic-v1|voolt-e2e=%02d', n),
  1,
  'Voolt3D',
  'filament',
  'PLA',
  'Branco',
  '1.75',
  1000,
  12000 + n,
  NULL,
  0,
  'available',
  printf('2026-08-10T11:%02d:00.000Z', n),
  '2026-08-12T11:00:00.000Z',
  '2026-08-10T12:00:00.000Z',
  1,
  1,
  1,
  0,
  1,
  0,
  printf('Filamento PLA Voolt Dual %02d', n),
  printf('filamento pla voolt dualstore marca voolt3d produto %02d', n)
FROM vcatalog;

UPDATE offers
SET
  brand_id = CASE brand WHEN 'Voolt3D' THEN 'brd_voolt3d' ELSE NULL END,
  material_family_id = CASE material_family
    WHEN 'PLA' THEN 'fam_pla'
    WHEN 'PETG' THEN 'fam_petg'
    ELSE NULL
  END,
  formulation_specific_type_id = CASE
    WHEN offer_id = 'e2e_offer_010' THEN 'typ_petg-hf'
    WHEN material_family = 'PLA' THEN 'typ_pla'
    WHEN material_family = 'PETG' THEN 'typ_petg'
    ELSE NULL
  END;

UPDATE offers
SET listing_title = 'Filamento PETG HF 010',
    search_text = 'filamento petg petg-hf petghf marca teste produto 010 fallback'
WHERE offer_id = 'e2e_offer_010';

INSERT INTO taxonomy_gone (gone_slug, kind, taxonomy_version, reason)
VALUES ('split-petg', 'family', 1, 'reviewed-split');

INSERT INTO search_fts_a (offer_id, search_text)
SELECT offer_id, replace(search_text, 'fallback ', '')
FROM offers
WHERE store_id IN ('closin', 'voolt3d') AND visible = 1;

UPDATE search_projection_meta
SET active_slot = 'a',
    index_version = 1,
    parser_version = 1,
    projection_epoch = 1,
    search_write_generation = 1,
    updated_at = '2026-08-09T12:00:00.000Z'
WHERE id = 1;

UPDATE projection_meta
SET projection_epoch = 1,
    support_epoch = 2,
    updated_at = '2026-08-09T12:00:00.000Z'
WHERE id = 1;
