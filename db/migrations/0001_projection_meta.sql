-- Minimal authoritative empty-search schema (Story 1.1).
-- Immutable production database name is used in migration commands, not the binding name.

CREATE TABLE projection_meta (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  projection_epoch INTEGER NOT NULL,
  support_epoch INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO projection_meta (id, projection_epoch, support_epoch, updated_at)
VALUES (1, 1, 1, '1970-01-01T00:00:00.000Z');
