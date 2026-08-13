import type { MutableRefObject } from 'react';
import type { RunOutcome } from '../run-result';
import { TestTargetRow } from '../TestTargetRow';
import { TestWorkspaceLayout } from '../TestWorkspaceLayout';
import {
  RUNZ_TURBO_TEST,
  RUNZ_UNIT_TEST_JOB_IDS,
  type RunzUnitTestDef,
} from '../unit-tests.manifest';

const IDLE_RUN_OUTCOME: RunOutcome = {
  status: 'idle',
  detail: null,
  exitCode: null,
};

type TestsTabProps = {
  monorepoRoot: string;
  targets: readonly RunzUnitTestDef[];
  running: Record<string, boolean>;
  busy: Record<string, boolean>;
  outcomes: Record<string, RunOutcome>;
  globalBusy: boolean;
  unitTestBatchBusy: boolean;
  unitTestRunning: boolean;
  unitTestLogs: string[];
  unitTestLogRef: MutableRefObject<HTMLPreElement | null>;
  turboTestRunning: boolean;
  turboTestBusy: boolean;
  turboTestOutcome: RunOutcome;
  onRunTurboTest: () => void;
  onStopTurboTest: () => void;
  onRunAll: () => void;
  onRunOne: (target: RunzUnitTestDef) => void;
  onStopOne: (target: RunzUnitTestDef) => void;
};

export function TestsTab({
  monorepoRoot,
  targets,
  running,
  busy,
  outcomes,
  globalBusy,
  unitTestBatchBusy,
  unitTestRunning,
  unitTestLogs,
  unitTestLogRef,
  turboTestRunning,
  turboTestBusy,
  turboTestOutcome,
  onRunTurboTest,
  onStopTurboTest,
  onRunAll,
  onRunOne,
  onStopOne,
}: TestsTabProps) {
  return (
    <section className="runz-migrate-section" aria-label="Tests">
      <h2 className="runz-section-title">Tests</h2>
      <p className="runz-migrate-blurb">
        Root <code>pnpm run test</code>, homologation suite, optional live Closin probe, and Runz
        unit tests.
      </p>

      <TestWorkspaceLayout
        listAriaLabel="Unit test targets"
        logAriaLabel="Tests log"
        logTitle="Tests Log"
        logSub="Clears when you run a test action"
        logRef={unitTestLogRef}
        logLines={unitTestLogs}
        logPlaceholder="— run a unit test to see output here —"
        toolbar={
          <div className="runz-migrate-toolbar">
            <button
              type="button"
              className="runz-btn runz-btn-primary"
              disabled={!monorepoRoot || globalBusy || unitTestBatchBusy || unitTestRunning}
              onClick={onRunAll}
            >
              Run all ({RUNZ_UNIT_TEST_JOB_IDS.length})
            </button>
          </div>
        }
        list={
          <div className="runz-test-rows">
            <TestTargetRow
              label={RUNZ_TURBO_TEST.label}
              command={RUNZ_TURBO_TEST.command}
              title={RUNZ_TURBO_TEST.summary}
              pill="heavy"
              running={turboTestRunning}
              outcome={turboTestOutcome}
              runDisabled={
                !monorepoRoot ||
                turboTestRunning ||
                turboTestBusy ||
                globalBusy ||
                unitTestBatchBusy ||
                unitTestRunning
              }
              stopDisabled={!turboTestRunning || turboTestBusy || globalBusy}
              onRun={onRunTurboTest}
              onStop={onStopTurboTest}
            />

            {targets.map((target) => {
              const isOn = running[target.id] ?? false;
              const isBusy = busy[target.id] ?? false;
              const outcome = outcomes[target.id] ?? IDLE_RUN_OUTCOME;
              return (
                <TestTargetRow
                  key={target.id}
                  label={target.label}
                  command={`pnpm -C ${target.pnpmDir} run ${target.script}`}
                  title={target.summary}
                  pill={target.heavy ? 'heavy' : undefined}
                  running={isOn}
                  outcome={outcome}
                  runDisabled={
                    !monorepoRoot ||
                    isOn ||
                    isBusy ||
                    globalBusy ||
                    unitTestBatchBusy ||
                    unitTestRunning
                  }
                  stopDisabled={!isOn || isBusy || globalBusy}
                  onRun={() => onRunOne(target)}
                  onStop={() => onStopOne(target)}
                />
              );
            })}
          </div>
        }
      />
    </section>
  );
}
