/**
 * D1 migration scripts from the project root `package.json` (`pnpm run …`).
 * Keep `npmScript` values in sync with root scripts.
 */

export type MigrationTier = 'local' | 'remote';
export type MigrationRisk = 'local-safe' | 'remote-sensitive';
export type MigrationWorkspace = 'root';
export type MigrationDatabase = 'filatracker';

export interface RunzMigrationDef {
  /** Stable id for logs / process registry (must not collide with `RUNZ_APPS[].id`). */
  id: string;
  label: string;
  /** Root `package.json` script name */
  npmScript: string;
  tier: MigrationTier;
  risk: MigrationRisk;
  workspace: MigrationWorkspace;
  database: MigrationDatabase;
  /** Wrangler `database_name` for `d1 migrations list/apply`. */
  d1DatabaseName: string;
  wranglerPath: string;
  summary: string;
}

export function migrationsForTier(tier: MigrationTier): RunzMigrationDef[] {
  return RUNZ_MIGRATIONS.filter((m) => m.tier === tier);
}

export function migrationsForTierSortedByDb(tier: MigrationTier): RunzMigrationDef[] {
  return migrationsForTier(tier);
}

export const RUNZ_MIGRATIONS: RunzMigrationDef[] = [
  {
    id: 'migrate-local-filatracker',
    label: 'filatracker-local',
    npmScript: 'db:migrate:local',
    tier: 'local',
    risk: 'local-safe',
    workspace: 'root',
    database: 'filatracker',
    d1DatabaseName: 'filatracker-local',
    wranglerPath: 'wrangler.ingest.jsonc',
    summary: 'Apply local D1 migrations for filatracker-local (ingest Worker).',
  },
];
