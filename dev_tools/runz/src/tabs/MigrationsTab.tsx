import type { MutableRefObject } from 'react';
import type { MigrationTier, RunzMigrationDef } from '../migrations.manifest';
import type { RunOutcome } from '../run-result';
import type { RunzMigrationPrecheck } from '../runz-tauri';
import { TestTargetRow } from '../TestTargetRow';
import { TestWorkspaceLayout } from '../TestWorkspaceLayout';

const IDLE_RUN_OUTCOME: RunOutcome = {
  status: 'idle',
  detail: null,
  exitCode: null,
};

function migrationTitle(
  migration: RunzMigrationDef,
  precheck: RunzMigrationPrecheck | undefined
): string {
  const parts = [migration.summary, `D1: ${migration.d1DatabaseName}`];
  if (migration.tier === 'remote' && precheck) {
    if (precheck.blockingReasons?.length) {
      parts.push(precheck.blockingReasons.join(' · '));
    }
    if (precheck.warnings.length) {
      parts.push(precheck.warnings.join(' · '));
    }
    if (precheck.scriptCommand) {
      parts.push(precheck.scriptCommand);
    }
  }
  return parts.join('\n\n');
}

type MigrationsTabProps = {
  monorepoRoot: string;
  migrationTier: MigrationTier;
  targets: readonly RunzMigrationDef[];
  running: Record<string, boolean>;
  busy: Record<string, boolean>;
  outcomes: Record<string, RunOutcome>;
  prechecks: Record<string, RunzMigrationPrecheck | undefined>;
  globalBusy: boolean;
  migrationBatchBusy: boolean;
  tierMigrationRunning: boolean;
  migrationLogs: string[];
  migrationLogRef: MutableRefObject<HTMLPreElement | null>;
  onTierChange: (tier: MigrationTier) => void;
  onRunAll: () => void;
  onRunOne: (target: RunzMigrationDef) => void;
  onStopOne: (target: RunzMigrationDef) => void;
};

export function MigrationsTab({
  monorepoRoot,
  migrationTier,
  targets,
  running,
  busy,
  outcomes,
  prechecks,
  globalBusy,
  migrationBatchBusy,
  tierMigrationRunning,
  migrationLogs,
  migrationLogRef,
  onTierChange,
  onRunAll,
  onRunOne,
  onStopOne,
}: MigrationsTabProps) {
  const remoteBlockedCount =
    migrationTier === 'remote'
      ? targets.filter((target) => {
          const precheck = prechecks[target.id];
          return precheck ? !precheck.ok : false;
        }).length
      : 0;

  return (
    <section className="runz-migrate-section" aria-label="D1 migrations">
      <h2 className="runz-section-title">D1 migrations</h2>
      <p className="runz-migrate-blurb">
        Root <code>pnpm run db:migrate:…</code>. Local uses Wrangler persist under{' '}
        <code>.wrangler/state</code>.
        Remote targets Cloudflare D1 and surfaces preflight checks before you run anything
        sensitive.
      </p>

      <TestWorkspaceLayout
        listAriaLabel="Migration targets"
        logAriaLabel="Migration log"
        logTitle="Migration Log"
        logSub="Clears when you run a migration action"
        logRef={migrationLogRef}
        logLines={migrationLogs}
        logPlaceholder="— run a migration to see output here —"
        toolbar={
          <div className="runz-migrate-toolbar">
            <label className="runz-tier-field">
              <span>Target</span>
              <select
                value={migrationTier}
                disabled={globalBusy || migrationBatchBusy}
                onChange={(event) => onTierChange(event.target.value as MigrationTier)}
              >
                <option value="local">Local</option>
                <option value="remote">Remote</option>
              </select>
            </label>
            <button
              type="button"
              className="runz-btn runz-btn-primary"
              disabled={!monorepoRoot || globalBusy || migrationBatchBusy || tierMigrationRunning}
              onClick={onRunAll}
            >
              Run all ({targets.length})
            </button>
          </div>
        }
        list={
          <>
            {migrationTier === 'remote' && remoteBlockedCount > 0 ? (
              <p className="runz-hint runz-migrate-remote-hint">
                {remoteBlockedCount} remote migration
                {remoteBlockedCount === 1 ? '' : 's'} blocked by pre-checks — hover a row for
                details.
              </p>
            ) : null}
            <div className="runz-test-rows">
              {targets.map((migration) => {
                const isOn = running[migration.id] ?? false;
                const isBusy = busy[migration.id] ?? false;
                const outcome = outcomes[migration.id] ?? IDLE_RUN_OUTCOME;
                const precheck = prechecks[migration.id];
                const isBlocked = migration.tier === 'remote' && precheck ? !precheck.ok : false;
                return (
                  <TestTargetRow
                    key={migration.id}
                    label={migration.label}
                    command={`pnpm run ${migration.npmScript}`}
                    title={migrationTitle(migration, precheck)}
                    pill={migration.tier === 'remote' ? 'remote' : undefined}
                    running={isOn}
                    outcome={outcome}
                    runDisabled={
                      !monorepoRoot ||
                      isOn ||
                      isBusy ||
                      globalBusy ||
                      migrationBatchBusy ||
                      isBlocked
                    }
                    stopDisabled={!isOn || isBusy || globalBusy}
                    onRun={() => onRunOne(migration)}
                    onStop={() => onStopOne(migration)}
                  />
                );
              })}
            </div>
          </>
        }
      />
    </section>
  );
}
