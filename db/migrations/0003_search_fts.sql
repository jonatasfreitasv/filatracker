-- Story 1.4: FTS5 search projection + listing title + Store display name.
-- Never use FTS triggers — coordinator/persistence writes with reviewed SQL only.
-- D1 export does not support virtual tables: drop FTS before export; recreate+rebuild after import.

-- Bounded listing title on published + staged Offers (plain text, never HTML).
ALTER TABLE offers ADD COLUMN listing_title TEXT
  CHECK (listing_title IS NULL OR (length(listing_title) >= 1 AND length(listing_title) <= 512));
ALTER TABLE offers ADD COLUMN search_text TEXT NOT NULL DEFAULT ''
  CHECK (length(search_text) <= 2048);

ALTER TABLE staged_offers ADD COLUMN listing_title TEXT
  CHECK (listing_title IS NULL OR (length(listing_title) >= 1 AND length(listing_title) <= 512));
ALTER TABLE staged_offers ADD COLUMN search_text TEXT NOT NULL DEFAULT ''
  CHECK (length(search_text) <= 2048);

-- Canonical Store display name for search hydration (never adapter import/hardcode).
ALTER TABLE store_state ADD COLUMN display_name TEXT
  CHECK (display_name IS NULL OR (length(display_name) >= 1 AND length(display_name) <= 512));
ALTER TABLE store_state ADD COLUMN search_transition_token TEXT;

-- Search projection metadata: active slot + fencing generations.
CREATE TABLE search_projection_meta (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  active_slot TEXT NOT NULL CHECK (active_slot IN ('a', 'b')),
  index_version INTEGER NOT NULL CHECK (index_version > 0),
  parser_version INTEGER NOT NULL CHECK (parser_version > 0),
  projection_epoch INTEGER NOT NULL CHECK (projection_epoch >= 0),
  search_write_generation INTEGER NOT NULL CHECK (search_write_generation >= 0),
  rebuild_owner TEXT,
  rebuild_lease_expires_at TEXT,
  updated_at TEXT NOT NULL
);

INSERT INTO search_projection_meta (
  id, active_slot, index_version, parser_version,
  projection_epoch, search_write_generation, rebuild_owner,
  rebuild_lease_expires_at, updated_at
)
SELECT 1, 'a', 1, 1, projection_epoch, 0, NULL, NULL, '1970-01-01T00:00:00.000Z'
FROM projection_meta WHERE id = 1;

-- Seed canonical display names for known Stores (generic metadata).
UPDATE store_state
SET display_name = 'Closin'
WHERE store_id = 'closin' AND display_name IS NULL;

-- Two fixed FTS5 slots (active/shadow). Content owned by sole writer — no triggers.
-- tokenize unicode61 remove_diacritics 2 for pt-BR diacritic/case folding.
CREATE VIRTUAL TABLE search_fts_a USING fts5(
  offer_id UNINDEXED,
  search_text,
  tokenize = "unicode61 remove_diacritics 2 tokenchars '+-'"
);

CREATE VIRTUAL TABLE search_fts_b USING fts5(
  offer_id UNINDEXED,
  search_text,
  tokenize = "unicode61 remove_diacritics 2 tokenchars '+-'"
);
