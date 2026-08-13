-- Story 1.5: seed Voolt3D Store state (activation blocked / unsupported by default).
-- Mirror Closin seed semantics from 0002/0003 — do not auto-activate.

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
  updated_at,
  display_name
) VALUES (
  'voolt3d',
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
  '1970-01-01T00:00:00.000Z',
  'Voolt3D'
);
