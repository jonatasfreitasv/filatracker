-- Story 1.3: Offers, runs, inbox, retained payloads, PricePoints, Store state, CAS.
-- Recovery-epoch authority remains external to restored D1 (AD-24).
-- FTS5 is Story 1.4 — relational facts only.

CREATE TABLE store_state (
  store_id TEXT PRIMARY KEY NOT NULL,
  support_state TEXT NOT NULL CHECK (support_state IN ('active', 'degraded', 'unsupported', 'deactivated')),
  support_generation INTEGER NOT NULL CHECK (support_generation >= 0),
  store_generation INTEGER NOT NULL CHECK (store_generation >= 0),
  activation_gate TEXT NOT NULL CHECK (activation_gate IN ('blocked', 'approved')),
  recovery_epoch_snapshot INTEGER NOT NULL CHECK (recovery_epoch_snapshot >= 0),
  last_run_id TEXT,
  last_run_outcome TEXT CHECK (
    last_run_outcome IS NULL OR last_run_outcome IN ('complete', 'partial', 'failed', 'quarantined', 'oversized')
  ),
  last_failure_codes_json TEXT NOT NULL,
  observation_count INTEGER CHECK (observation_count IS NULL OR observation_count >= 0),
  published_offer_count INTEGER CHECK (published_offer_count IS NULL OR published_offer_count >= 0),
  freshness_observed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE store_lifecycle_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('system', 'operator', 'coordinator')),
  reason TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE TABLE ingestion_runs (
  run_id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN (
      'created', 'discovering', 'staged', 'validated', 'publishing',
      'published', 'failed', 'quarantined', 'superseded'
    )
  ),
  probe_id TEXT,
  store_generation INTEGER CHECK (store_generation IS NULL OR store_generation >= 0),
  support_generation INTEGER NOT NULL CHECK (support_generation >= 0),
  projection_epoch INTEGER NOT NULL CHECK (projection_epoch >= 0),
  recovery_epoch INTEGER NOT NULL CHECK (recovery_epoch >= 0),
  publication_class TEXT CHECK (
    publication_class IS NULL OR publication_class IN (
      'authoritative-complete', 'positive-only', 'publish-nothing'
    )
  ),
  failure_codes_json TEXT NOT NULL,
  evidence_digest_sha256 TEXT,
  payload_artifact_id TEXT,
  map_version INTEGER CHECK (map_version IS NULL OR map_version > 0),
  parser_version INTEGER CHECK (parser_version IS NULL OR parser_version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  terminal_at TEXT
);

CREATE UNIQUE INDEX ingestion_runs_store_run_idx ON ingestion_runs (store_id, run_id);

CREATE TABLE ingestion_inbox (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('claimed', 'completed', 'quarantined')),
  recovery_epoch INTEGER NOT NULL CHECK (recovery_epoch >= 0),
  payload_artifact_id TEXT,
  claimed_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE UNIQUE INDEX ingestion_inbox_message_idx ON ingestion_inbox (message_id);

CREATE TABLE retained_payloads (
  artifact_id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  digest_sha256 TEXT NOT NULL,
  contract_version INTEGER NOT NULL CHECK (contract_version > 0),
  map_version INTEGER NOT NULL CHECK (map_version > 0),
  parser_version INTEGER NOT NULL CHECK (parser_version > 0),
  payload_json TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length > 0),
  expires_at TEXT NOT NULL,
  purged_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE offers (
  offer_id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  canonical_pdp_url TEXT NOT NULL,
  merchant_variant_id TEXT,
  continuity_fingerprint TEXT NOT NULL,
  store_generation INTEGER NOT NULL CHECK (store_generation > 0),
  brand TEXT,
  specific_type TEXT,
  material_family TEXT,
  color TEXT,
  diameter_mm TEXT,
  mass_grams INTEGER CHECK (mass_grams IS NULL OR mass_grams > 0),
  listing_price_centavos INTEGER CHECK (
    listing_price_centavos IS NULL OR listing_price_centavos > 0
  ),
  original_price_centavos INTEGER CHECK (
    original_price_centavos IS NULL OR original_price_centavos > 0
  ),
  is_promotion INTEGER NOT NULL CHECK (is_promotion IN (0, 1)),
  availability TEXT NOT NULL CHECK (availability IN ('available', 'unavailable', 'unknown')),
  observed_at TEXT NOT NULL,
  stale_after TEXT NOT NULL,
  published_at TEXT NOT NULL,
  map_version INTEGER NOT NULL CHECK (map_version > 0),
  parser_version INTEGER NOT NULL CHECK (parser_version > 0),
  normalize_policy_version INTEGER NOT NULL CHECK (normalize_policy_version > 0),
  standalone_only INTEGER NOT NULL CHECK (standalone_only IN (0, 1)),
  visible INTEGER NOT NULL CHECK (visible IN (0, 1)),
  tombstoned INTEGER NOT NULL CHECK (tombstoned IN (0, 1))
);

CREATE UNIQUE INDEX offers_source_key_uidx ON offers (source_key);

CREATE TABLE offer_identity_lineage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('alias', 'tombstone', 'reviewed_split', 'quarantine')),
  detail TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (offer_id) REFERENCES offers (offer_id)
);

CREATE TABLE staged_offers (
  run_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  continuity_fingerprint TEXT NOT NULL,
  canonical_pdp_url TEXT NOT NULL,
  merchant_variant_id TEXT,
  brand TEXT,
  specific_type TEXT,
  material_family TEXT,
  color TEXT,
  diameter_mm TEXT,
  mass_grams INTEGER CHECK (mass_grams IS NULL OR mass_grams > 0),
  listing_price_centavos INTEGER CHECK (
    listing_price_centavos IS NULL OR listing_price_centavos > 0
  ),
  original_price_centavos INTEGER CHECK (
    original_price_centavos IS NULL OR original_price_centavos > 0
  ),
  is_promotion INTEGER NOT NULL CHECK (is_promotion IN (0, 1)),
  availability TEXT NOT NULL CHECK (availability IN ('available', 'unavailable', 'unknown')),
  observed_at TEXT NOT NULL,
  map_version INTEGER NOT NULL CHECK (map_version > 0),
  parser_version INTEGER NOT NULL CHECK (parser_version > 0),
  normalize_policy_version INTEGER NOT NULL CHECK (normalize_policy_version > 0),
  standalone_only INTEGER NOT NULL CHECK (standalone_only IN (0, 1)),
  append_price_point INTEGER NOT NULL CHECK (append_price_point IN (0, 1)),
  PRIMARY KEY (run_id, offer_id),
  FOREIGN KEY (run_id) REFERENCES ingestion_runs (run_id)
);

CREATE TABLE price_points (
  price_point_id TEXT PRIMARY KEY NOT NULL,
  offer_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  listing_price_centavos INTEGER NOT NULL CHECK (listing_price_centavos > 0),
  original_price_centavos INTEGER CHECK (
    original_price_centavos IS NULL OR original_price_centavos > 0
  ),
  observed_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  corrects_price_point_id TEXT,
  effective INTEGER NOT NULL CHECK (effective IN (0, 1)),
  FOREIGN KEY (offer_id) REFERENCES offers (offer_id),
  FOREIGN KEY (corrects_price_point_id) REFERENCES price_points (price_point_id)
);

CREATE UNIQUE INDEX price_points_offer_run_uidx ON price_points (offer_id, run_id);
CREATE UNIQUE INDEX price_points_effective_correction_uidx
  ON price_points (corrects_price_point_id)
  WHERE corrects_price_point_id IS NOT NULL AND effective = 1;

-- Correction facts are immutable edges within one Offer. The partial unique
-- index above permits at most one effective successor for a corrected point.
CREATE TRIGGER price_points_correction_same_offer_insert
BEFORE INSERT ON price_points
WHEN NEW.corrects_price_point_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM price_points corrected
   WHERE corrected.price_point_id = NEW.corrects_price_point_id
     AND corrected.offer_id = NEW.offer_id
 )
BEGIN
  SELECT RAISE(ABORT, 'price_point_correction_cross_offer_or_missing');
END;

CREATE TRIGGER price_points_correction_immutable
BEFORE UPDATE ON price_points
WHEN NEW.price_point_id IS NOT OLD.price_point_id
  OR NEW.offer_id IS NOT OLD.offer_id
  OR NEW.store_id IS NOT OLD.store_id
  OR NEW.run_id IS NOT OLD.run_id
  OR NEW.listing_price_centavos IS NOT OLD.listing_price_centavos
  OR NEW.original_price_centavos IS NOT OLD.original_price_centavos
  OR NEW.observed_at IS NOT OLD.observed_at
  OR NEW.recorded_at IS NOT OLD.recorded_at
  OR NEW.corrects_price_point_id IS NOT OLD.corrects_price_point_id
BEGIN
  SELECT RAISE(ABORT, 'price_point_fact_immutable');
END;

CREATE TABLE publication_claims (
  claim_id TEXT PRIMARY KEY NOT NULL,
  store_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  expected_store_generation INTEGER NOT NULL CHECK (expected_store_generation >= 0),
  expected_support_generation INTEGER NOT NULL CHECK (expected_support_generation >= 0),
  expected_projection_epoch INTEGER NOT NULL CHECK (expected_projection_epoch >= 0),
  expected_recovery_epoch INTEGER NOT NULL CHECK (expected_recovery_epoch >= 0),
  status TEXT NOT NULL CHECK (status IN ('open', 'committed', 'aborted')),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES ingestion_runs (run_id)
);

CREATE UNIQUE INDEX publication_claims_one_open_store_uidx
  ON publication_claims (store_id)
  WHERE status = 'open';

-- Seed Closin as inactive / activation blocked until operator gate pass.
INSERT INTO store_state (
  store_id,
  support_state,
  support_generation,
  store_generation,
  activation_gate,
  recovery_epoch_snapshot,
  last_run_id,
  last_run_outcome,
  last_failure_codes_json,
  observation_count,
  published_offer_count,
  freshness_observed_at,
  updated_at
) VALUES (
  'closin',
  'unsupported',
  0,
  0,
  'blocked',
  1,
  NULL,
  NULL,
  '[]',
  NULL,
  NULL,
  NULL,
  '1970-01-01T00:00:00.000Z'
);
