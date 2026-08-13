import type { MutableRefObject } from 'react';
import type { RunOutcome } from '../run-result';
import { TestTargetRow } from '../TestTargetRow';
import { TestWorkspaceLayout } from '../TestWorkspaceLayout';
import {
  RUNZ_QUALITY_JOBS,
  type RunzQualityJobDef,
  formatQualityCommand,
} from '../quality.manifest';

const IDLE_RUN_OUTCOME: RunOutcome = {
  status: 'idle',
  detail: null,
  exitCode: null,
};

type QualityTabProps = {
  monorepoRoot: string;
  running: Record<string, boolean>;
  busy: Record<string, boolean>;
  outcomes: Record<string, RunOutcome>;
  globalBusy: boolean;
  qualityBatchBusy: boolean;
  qualityRunning: boolean;
  qualityLogs: string[];
  qualityLogRef: MutableRefObject<HTMLPreElement | null>;
  onRunAll: () => void;
  onRunJob: (job: RunzQualityJobDef, scriptArgs?: readonly string[]) => void;
  onStopJob: (jobId: string, label: string) => void;
};

export function QualityTab({
  monorepoRoot,
  running,
  busy,
  outcomes,
  globalBusy,
  qualityBatchBusy,
  qualityRunning,
  qualityLogs,
  qualityLogRef,
  onRunAll,
  onRunJob,
  onStopJob,
}: QualityTabProps) {
  const runAllCount = RUNZ_QUALITY_JOBS.length;
  const rowRunDisabled = (id: string) => {
    const isOn = running[id] ?? false;
    const isBusy = busy[id] ?? false;
    return !monorepoRoot || isOn || isBusy || globalBusy || qualityBatchBusy;
  };

  return (
    <section className="runz-migrate-section" aria-label="Quality">
      <h2 className="runz-section-title">Quality</h2>
      <p className="runz-migrate-blurb">
        Project checks from the repo root (<code>typecheck</code>, <code>lint</code>,{' '}
        <code>test</code>, <code>check</code>).
      </p>

      <TestWorkspaceLayout
        listAriaLabel="Quality jobs"
        logAriaLabel="Quality log"
        logTitle="Quality Log"
        logSub="Clears when you run a quality action"
        logRef={qualityLogRef}
        logLines={qualityLogs}
        logPlaceholder="— run a quality job to see output here —"
        toolbar={
          <div className="runz-migrate-toolbar">
            <button
              type="button"
              className="runz-btn runz-btn-primary"
              disabled={!monorepoRoot || globalBusy || qualityBatchBusy || qualityRunning}
              onClick={onRunAll}
            >
              Run all ({runAllCount})
            </button>
          </div>
        }
        list={
          <div className="runz-test-rows">
            {RUNZ_QUALITY_JOBS.map((job) => {
              const isOn = running[job.id] ?? false;
              const isBusy = busy[job.id] ?? false;
              const outcome = outcomes[job.id] ?? IDLE_RUN_OUTCOME;
              return (
                <TestTargetRow
                  key={job.id}
                  label={job.label}
                  command={formatQualityCommand(job)}
                  title={job.summary}
                  pill={job.heavy ? 'heavy' : undefined}
                  running={isOn}
                  outcome={outcome}
                  runDisabled={rowRunDisabled(job.id)}
                  stopDisabled={!isOn || isBusy || globalBusy}
                  onRun={() => onRunJob(job)}
                  onStop={() => onStopJob(job.id, job.label)}
                />
              );
            })}
          </div>
        }
      />
    </section>
  );
}
