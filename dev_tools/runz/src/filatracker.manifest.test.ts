import { describe, expect, it } from 'vitest';
import { RUNZ_APPS, RUNZ_APP_GROUPS, allRunzListenPorts, scriptForMode } from './apps.manifest';
import { RUNZ_MIGRATIONS, migrationsForTier } from './migrations.manifest';
import { RUNZ_QUALITY_JOBS, formatQualityCommand } from './quality.manifest';
import { RUNZ_ENV_SETUP_STEPS } from './env-setup.manifest';
import { RUNZ_UNIT_TESTS } from './unit-tests.manifest';
import { SPRINT_STATUS_PATHS } from './sprint-status.parse';
import { appendWipProductFlag } from './sprint-status.resolve';

describe('FilaTracker Runz manifests', () => {
  it('exposes a single web app on Vite ports', () => {
    expect(RUNZ_APPS).toHaveLength(1);
    expect(RUNZ_APPS[0]?.id).toBe('web');
    expect(RUNZ_APPS[0]?.pnpmDir).toBe('.');
    expect(RUNZ_APPS[0]?.ports).toEqual({ dev: 5173, preview: 4173 });
    expect(allRunzListenPorts()).toEqual([4173, 5173]);
    expect(scriptForMode('dev')).toBe('dev');
    expect(RUNZ_APP_GROUPS[0]?.appIds).toEqual(['web']);
  });

  it('lists local D1 migrate only', () => {
    expect(migrationsForTier('local')).toHaveLength(1);
    expect(migrationsForTier('remote')).toHaveLength(0);
    expect(RUNZ_MIGRATIONS[0]?.npmScript).toBe('db:migrate:local');
    expect(RUNZ_MIGRATIONS[0]?.d1DatabaseName).toBe('filatracker-local');
    expect(RUNZ_MIGRATIONS[0]?.workspace).toBe('root');
  });

  it('wires quality and env-setup to root scripts', () => {
    expect(RUNZ_QUALITY_JOBS.map((j) => j.npmScript)).toEqual([
      'typecheck',
      'lint',
      'test',
      'check',
    ]);
    expect(formatQualityCommand(RUNZ_QUALITY_JOBS[0]!)).toBe('pnpm run typecheck');
    expect(RUNZ_ENV_SETUP_STEPS.map((s) => s.id)).toEqual([
      'dev-vars',
      'migrations',
      'cf-typegen',
    ]);
  });

  it('lists project test targets', () => {
    expect(RUNZ_UNIT_TESTS.map((t) => t.script)).toEqual([
      'test',
      'test:homologation',
      'probe:closin',
      'test',
    ]);
  });

  it('uses a single BMAD sprint track', () => {
    expect(SPRINT_STATUS_PATHS.filatracker).toBe(
      '_bmad-output/implementation-artifacts/sprint-status.yaml'
    );
    expect(appendWipProductFlag('bmad-dev-story 1-3', 'filatracker')).toBe('bmad-dev-story 1-3');
  });
});
