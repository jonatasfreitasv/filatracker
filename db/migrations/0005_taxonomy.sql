-- Story 1.6: durable Material Family / formulation Specific Type / Brand taxonomy.
-- Additive only — do not rewrite 0001–0004. FTS remains reviewed SQL, not Drizzle.

CREATE TABLE material_families (
  family_id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE
    CHECK (length(slug) >= 1 AND length(slug) <= 128 AND slug = lower(slug) AND instr(slug, ' ') = 0),
  label TEXT NOT NULL CHECK (length(label) >= 1 AND length(label) <= 64),
  taxonomy_version INTEGER NOT NULL CHECK (taxonomy_version > 0),
  provenance TEXT NOT NULL CHECK (length(provenance) >= 1 AND length(provenance) <= 128)
);

CREATE TABLE specific_types (
  specific_type_id TEXT PRIMARY KEY NOT NULL,
  family_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
    CHECK (length(slug) >= 1 AND length(slug) <= 128 AND slug = lower(slug) AND instr(slug, ' ') = 0
      AND slug NOT IN ('filament', 'kit', 'filament_kit', 'unknown')),
  label TEXT NOT NULL CHECK (length(label) >= 1 AND length(label) <= 128),
  taxonomy_version INTEGER NOT NULL CHECK (taxonomy_version > 0),
  provenance TEXT NOT NULL CHECK (length(provenance) >= 1 AND length(provenance) <= 128),
  FOREIGN KEY (family_id) REFERENCES material_families (family_id)
);

CREATE TABLE brands (
  brand_id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE
    CHECK (length(slug) >= 1 AND length(slug) <= 128 AND slug = lower(slug) AND instr(slug, ' ') = 0),
  label TEXT NOT NULL CHECK (length(label) >= 1 AND length(label) <= 512),
  taxonomy_version INTEGER NOT NULL CHECK (taxonomy_version > 0),
  provenance TEXT NOT NULL CHECK (length(provenance) >= 1 AND length(provenance) <= 128)
);

-- Reviewed alternate/old slugs only. Canonical slugs must not be inserted here.
CREATE TABLE taxonomy_aliases (
  alias_slug TEXT PRIMARY KEY NOT NULL
    CHECK (length(alias_slug) >= 1 AND length(alias_slug) <= 128 AND alias_slug = lower(alias_slug) AND instr(alias_slug, ' ') = 0),
  kind TEXT NOT NULL CHECK (kind IN ('family', 'specific_type', 'brand')),
  target_id TEXT NOT NULL,
  reviewed INTEGER NOT NULL CHECK (reviewed = 1)
);

-- Split / retired public slugs. Browse of these slugs is 410 Gone, not a guessed 301.
CREATE TABLE taxonomy_gone (
  gone_slug TEXT NOT NULL
    CHECK (length(gone_slug) >= 1 AND length(gone_slug) <= 128 AND gone_slug = lower(gone_slug) AND instr(gone_slug, ' ') = 0),
  kind TEXT NOT NULL CHECK (kind IN ('family', 'specific_type', 'brand')),
  taxonomy_version INTEGER NOT NULL CHECK (taxonomy_version > 0),
  reason TEXT NOT NULL CHECK (length(reason) >= 1 AND length(reason) <= 128),
  PRIMARY KEY (kind, gone_slug)
);

ALTER TABLE projection_meta ADD COLUMN taxonomy_version INTEGER NOT NULL DEFAULT 1
  CHECK (taxonomy_version > 0);

ALTER TABLE offers ADD COLUMN brand_id TEXT REFERENCES brands (brand_id);
ALTER TABLE offers ADD COLUMN material_family_id TEXT REFERENCES material_families (family_id);
ALTER TABLE offers ADD COLUMN formulation_specific_type_id TEXT REFERENCES specific_types (specific_type_id);

ALTER TABLE staged_offers ADD COLUMN brand_id TEXT REFERENCES brands (brand_id);
ALTER TABLE staged_offers ADD COLUMN material_family_id TEXT REFERENCES material_families (family_id);
ALTER TABLE staged_offers ADD COLUMN formulation_specific_type_id TEXT REFERENCES specific_types (specific_type_id);

CREATE INDEX offers_brand_id_idx ON offers (brand_id);
CREATE INDEX offers_material_family_id_idx ON offers (material_family_id);
CREATE INDEX offers_formulation_type_id_idx ON offers (formulation_specific_type_id);

INSERT INTO material_families (family_id, slug, label, taxonomy_version, provenance) VALUES
  ('fam_pla', 'pla', 'PLA', 1, 'reviewed-fixture-v1'),
  ('fam_petg', 'petg', 'PETG', 1, 'reviewed-fixture-v1'),
  ('fam_abs', 'abs', 'ABS', 1, 'reviewed-fixture-v1'),
  ('fam_asa', 'asa', 'ASA', 1, 'reviewed-fixture-v1'),
  ('fam_tpu', 'tpu', 'TPU', 1, 'reviewed-fixture-v1'),
  ('fam_pc', 'pc', 'PC', 1, 'reviewed-fixture-v1'),
  ('fam_nylon', 'nylon', 'Nylon', 1, 'reviewed-fixture-v1'),
  ('fam_pva', 'pva', 'PVA', 1, 'reviewed-fixture-v1'),
  ('fam_hips', 'hips', 'HIPS', 1, 'reviewed-fixture-v1'),
  ('fam_other', 'other', 'other', 1, 'reviewed-fixture-v1');

INSERT INTO specific_types (specific_type_id, family_id, slug, label, taxonomy_version, provenance) VALUES
  ('typ_pla', 'fam_pla', 'pla', 'PLA', 1, 'reviewed-fixture-v1'),
  ('typ_pla-plus', 'fam_pla', 'pla-plus', 'PLA+', 1, 'reviewed-fixture-v1'),
  ('typ_petg', 'fam_petg', 'petg', 'PETG', 1, 'reviewed-fixture-v1'),
  ('typ_petg-hf', 'fam_petg', 'petg-hf', 'PETG HF', 1, 'reviewed-fixture-v1'),
  ('typ_rapid-petg', 'fam_petg', 'rapid-petg', 'Rapid PETG', 1, 'reviewed-fixture-v1'),
  ('typ_abs', 'fam_abs', 'abs', 'ABS', 1, 'reviewed-fixture-v1'),
  ('typ_asa', 'fam_asa', 'asa', 'ASA', 1, 'reviewed-fixture-v1'),
  ('typ_tpu', 'fam_tpu', 'tpu', 'TPU', 1, 'reviewed-fixture-v1'),
  ('typ_pc', 'fam_pc', 'pc', 'PC', 1, 'reviewed-fixture-v1'),
  ('typ_nylon', 'fam_nylon', 'nylon', 'Nylon', 1, 'reviewed-fixture-v1'),
  ('typ_pa6', 'fam_nylon', 'pa6', 'PA6', 1, 'reviewed-fixture-v1'),
  ('typ_pa12', 'fam_nylon', 'pa12', 'PA12', 1, 'reviewed-fixture-v1'),
  ('typ_pva', 'fam_pva', 'pva', 'PVA', 1, 'reviewed-fixture-v1'),
  ('typ_hips', 'fam_hips', 'hips', 'HIPS', 1, 'reviewed-fixture-v1'),
  ('typ_other', 'fam_other', 'other', 'other', 1, 'reviewed-fixture-v1');

INSERT INTO brands (brand_id, slug, label, taxonomy_version, provenance) VALUES
  ('brd_closin', 'closin', 'Closin', 1, 'reviewed-fixture-v1'),
  ('brd_3d-fila', '3d-fila', '3D Fila', 1, 'reviewed-fixture-v1'),
  ('brd_voolt3d', 'voolt3d', 'Voolt3D', 1, 'reviewed-fixture-v1'),
  ('brd_printalot', 'printalot', 'PrintaLot', 1, 'reviewed-fixture-v1'),
  ('brd_3d-colors', '3d-colors', '3D Colors', 1, 'reviewed-fixture-v1');

INSERT INTO taxonomy_aliases (alias_slug, kind, target_id, reviewed) VALUES
  ('voolt', 'brand', 'brd_voolt3d', 1),
  ('3dfila', 'brand', 'brd_3d-fila', 1),
  ('3dcolors', 'brand', 'brd_3d-colors', 1),
  ('petghf', 'specific_type', 'typ_petg-hf', 1),
  ('rapidpetg', 'specific_type', 'typ_rapid-petg', 1),
  ('plaplus', 'specific_type', 'typ_pla-plus', 1);

-- Prevent inserting a canonical slug as an alias of the same kind.
CREATE TRIGGER taxonomy_aliases_no_self_family
BEFORE INSERT ON taxonomy_aliases
WHEN NEW.kind = 'family' AND EXISTS (SELECT 1 FROM material_families WHERE slug = NEW.alias_slug)
BEGIN
  SELECT RAISE(ABORT, 'taxonomy_alias_canonical_slug');
END;

CREATE TRIGGER taxonomy_aliases_no_self_type
BEFORE INSERT ON taxonomy_aliases
WHEN NEW.kind = 'specific_type' AND EXISTS (SELECT 1 FROM specific_types WHERE slug = NEW.alias_slug)
BEGIN
  SELECT RAISE(ABORT, 'taxonomy_alias_canonical_slug');
END;

CREATE TRIGGER taxonomy_aliases_no_self_brand
BEFORE INSERT ON taxonomy_aliases
WHEN NEW.kind = 'brand' AND EXISTS (SELECT 1 FROM brands WHERE slug = NEW.alias_slug)
BEGIN
  SELECT RAISE(ABORT, 'taxonomy_alias_canonical_slug');
END;
