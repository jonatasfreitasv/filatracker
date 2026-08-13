/**
 * Project quality / CI jobs from root `package.json` (`pnpm run …`).
 * Keep `npmScript` values in sync with root scripts.
 */

export type QualityJobGroup = 'project' | 'ci';

export type QualitySpawnKind = 'root';

export interface RunzQualityJobDef {
  id: string;
  label: string;
  group: QualityJobGroup;
  spawnKind: QualitySpawnKind;
  npmScript: string;
  scriptArgs?: readonly string[];
  heavy?: boolean;
  summary?: string;
}

export const RUNZ_QUALITY_GROUPS: ReadonlyArray<{
  id: QualityJobGroup;
  label: string;
}> = [
  { id: 'project', label: 'Project' },
  { id: 'ci', label: 'CI mirror' },
];

export const RUNZ_QUALITY_JOBS: RunzQualityJobDef[] = [
  {
    id: 'quality-typecheck',
    label: 'Typecheck',
    group: 'project',
    spawnKind: 'root',
    npmScript: 'typecheck',
    summary: 'wrangler types + react-router typegen + tsc -b',
  },
  {
    id: 'quality-lint',
    label: 'Lint',
    group: 'project',
    spawnKind: 'root',
    npmScript: 'lint',
    summary: 'eslint . --max-warnings=0',
  },
  {
    id: 'quality-test',
    label: 'Test',
    group: 'project',
    spawnKind: 'root',
    npmScript: 'test',
    heavy: true,
    summary: 'vitest run (unit + workers + e2e projects)',
  },
  {
    id: 'quality-check',
    label: 'Check (CI gate)',
    group: 'ci',
    spawnKind: 'root',
    npmScript: 'check',
    heavy: true,
    summary: 'typecheck + lint + test — mirrors local CI gate',
  },
];

export function qualityJobsForGroup(group: QualityJobGroup): RunzQualityJobDef[] {
  return RUNZ_QUALITY_JOBS.filter((job) => job.group === group);
}

export function formatQualityCommand(
  job: RunzQualityJobDef,
  scriptArgs?: readonly string[]
): string {
  const args = scriptArgs ?? job.scriptArgs;
  if (args && args.length > 0) {
    return `pnpm run ${job.npmScript} -- ${args.join(' ')}`;
  }
  return `pnpm run ${job.npmScript}`;
}
