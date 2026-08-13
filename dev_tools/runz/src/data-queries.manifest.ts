/**
 * Saved read-only D1 queries for local `.wrangler/state`.
 */

export interface RunzDataQueryDef {
  id: string;
  label: string;
  /** Wrangler D1 binding name (matched to scanned DB binding). */
  binding: string;
  sql: string;
  description: string;
}

export const RUNZ_DATA_QUERIES: RunzDataQueryDef[] = [
  {
    id: 'projection-meta',
    label: 'projection_meta',
    binding: 'DB',
    sql: 'SELECT id, projection_epoch, support_epoch, updated_at FROM projection_meta;',
    description: 'Authoritative empty-search projection epochs',
  },
  {
    id: 'sqlite-tables',
    label: 'sqlite_master tables',
    binding: 'DB',
    sql: "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name;",
    description: 'List local D1 tables/views',
  },
];
