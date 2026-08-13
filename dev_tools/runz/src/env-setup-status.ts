import type {
  EnvSetupItemStatus,
  RunzEnvSetupCfTypegenTarget,
  RunzEnvSetupDevVarsTarget,
  RunzEnvSetupFileCopyTarget,
} from './env-setup.manifest';
import { migrationsForTier, type RunzMigrationDef } from './migrations.manifest';
import { runzCheckMigrationTarget, runzReadRepoText, runzRepoPathStat } from './runz-tauri';

export type EnvSetupStatusRow = {
  id: string;
  label: string;
  status: EnvSetupItemStatus;
  detail: string;
};

export type EnvSetupStepStatus = {
  status: EnvSetupItemStatus;
  readyCount: number;
  pendingCount: number;
  warnCount: number;
  blockCount: number;
  rows: EnvSetupStatusRow[];
};

function summarizeRows(rows: EnvSetupStatusRow[]): Omit<EnvSetupStepStatus, 'rows'> {
  const readyCount = rows.filter((row) => row.status === 'ready').length;
  const pendingCount = rows.filter((row) => row.status === 'pending').length;
  const warnCount = rows.filter((row) => row.status === 'warn').length;
  const blockCount = rows.filter((row) => row.status === 'block').length;
  const status: EnvSetupItemStatus =
    blockCount > 0 ? 'block' : pendingCount > 0 ? 'pending' : warnCount > 0 ? 'warn' : 'ready';
  return { status, readyCount, pendingCount, warnCount, blockCount };
}

export async function evaluateFileCopySetupStatus(
  monorepoRoot: string,
  targets: readonly RunzEnvSetupFileCopyTarget[]
): Promise<EnvSetupStepStatus> {
  const rows = await Promise.all(
    targets.map(async (target) => {
      const exampleStat = await runzRepoPathStat(monorepoRoot, target.examplePath);
      if (!exampleStat.exists || !exampleStat.isFile) {
        return {
          id: target.id,
          label: target.label,
          status: 'block' as const,
          detail: `${target.examplePath} is missing in the repo.`,
        };
      }

      const targetStat = await runzRepoPathStat(monorepoRoot, target.targetPath);
      if (!targetStat.exists || !targetStat.isFile) {
        return {
          id: target.id,
          label: target.label,
          status: 'pending' as const,
          detail: `${target.targetPath} not created yet.`,
        };
      }

      const [exampleContent, targetContent] = await Promise.all([
        runzReadRepoText(monorepoRoot, target.examplePath),
        runzReadRepoText(monorepoRoot, target.targetPath),
      ]);

      if (exampleContent === targetContent) {
        return {
          id: target.id,
          label: target.label,
          status: 'ready' as const,
          detail: `${target.targetPath} matches ${target.examplePath}.`,
        };
      }

      return {
        id: target.id,
        label: target.label,
        status: 'warn' as const,
        detail: `${target.targetPath} exists but differs from ${target.examplePath}.`,
      };
    })
  );

  return { rows, ...summarizeRows(rows) };
}

export async function evaluateDevVarsSetupStatus(
  monorepoRoot: string,
  targets: readonly RunzEnvSetupDevVarsTarget[]
): Promise<EnvSetupStepStatus> {
  return evaluateFileCopySetupStatus(monorepoRoot, targets);
}

export async function evaluateMigrationsSetupStatus(
  monorepoRoot: string,
  migrations: readonly RunzMigrationDef[] = migrationsForTier('local')
): Promise<EnvSetupStepStatus> {
  const rows = await Promise.all(
    migrations.map(async (migration) => {
      const precheck = await runzCheckMigrationTarget(
        monorepoRoot,
        migration.npmScript,
        migration.wranglerPath
      );
      if (!precheck.scriptExists) {
        return {
          id: migration.id,
          label: migration.label,
          status: 'block' as const,
          detail: `Script ${migration.npmScript} missing from package.json.`,
        };
      }
      if (!precheck.ok) {
        return {
          id: migration.id,
          label: migration.label,
          status: 'block' as const,
          detail: precheck.blockingReasons.join('; ') || 'Migration precheck failed.',
        };
      }
      return {
        id: migration.id,
        label: migration.label,
        status: 'ready' as const,
        detail: precheck.scriptCommand ?? migration.npmScript,
      };
    })
  );
  return { rows, ...summarizeRows(rows) };
}

export async function evaluateCfTypegenSetupStatus(
  monorepoRoot: string,
  targets: readonly RunzEnvSetupCfTypegenTarget[]
): Promise<EnvSetupStepStatus> {
  const rows = await Promise.all(
    targets.map(async (target) => {
      const stat = await runzRepoPathStat(monorepoRoot, target.outputPath);
      if (stat.exists && stat.isFile) {
        return {
          id: target.id,
          label: target.label,
          status: 'ready' as const,
          detail: `${target.outputPath} is present.`,
        };
      }
      return {
        id: target.id,
        label: target.label,
        status: 'pending' as const,
        detail: `${target.outputPath} not generated yet — run cf-typegen.`,
      };
    })
  );
  return { rows, ...summarizeRows(rows) };
}

export function worstEnvSetupStatus(...statuses: EnvSetupItemStatus[]): EnvSetupItemStatus {
  if (statuses.includes('block')) return 'block';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.includes('warn')) return 'warn';
  return 'ready';
}

export function isEnvSetupStepDone(status: EnvSetupStepStatus | undefined): boolean {
  return status?.status === 'ready';
}
