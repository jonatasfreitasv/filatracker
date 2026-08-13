import type { MutableRefObject } from 'react';
import type { EnvSetupStepId } from '../env-setup.manifest';
import { RUNZ_ENV_SETUP_STEPS } from '../env-setup.manifest';
import { isEnvSetupStepDone, type EnvSetupStepStatus } from '../env-setup-status';
import type { EnvSetupItemStatus } from '../env-setup.manifest';
import { TestWorkspaceLayout } from '../TestWorkspaceLayout';

function statusLabel(status: EnvSetupItemStatus): string {
  switch (status) {
    case 'ready':
      return 'Done';
    case 'warn':
      return 'Review';
    case 'block':
      return 'Blocked';
    default:
      return 'Pending';
  }
}

function stepSummary(status: EnvSetupStepStatus | undefined): string {
  if (!status) return 'Not scanned yet.';
  return `${status.readyCount} done · ${status.pendingCount} pending · ${status.warnCount} review · ${status.blockCount} blocked`;
}

type EnvSetupTabProps = {
  monorepoRoot: string;
  scanning: boolean;
  setupBusy: boolean;
  selectedSteps: Record<EnvSetupStepId, boolean>;
  stepStatuses: Partial<Record<EnvSetupStepId, EnvSetupStepStatus>>;
  setupLogs: string[];
  setupLogRef: MutableRefObject<HTMLPreElement | null>;
  onRefresh: () => void;
  onToggleStep: (stepId: EnvSetupStepId, checked: boolean) => void;
  onSetup: () => void;
  onRerunStep: (stepId: EnvSetupStepId) => void;
};

export function EnvSetupTab({
  monorepoRoot,
  scanning,
  setupBusy,
  selectedSteps,
  stepStatuses,
  setupLogs,
  setupLogRef,
  onRefresh,
  onToggleStep,
  onSetup,
  onRerunStep,
}: EnvSetupTabProps) {
  const anyRunnableSelected = RUNZ_ENV_SETUP_STEPS.some(
    (step) => selectedSteps[step.id] && !isEnvSetupStepDone(stepStatuses[step.id])
  );

  return (
    <section className="runz-env-setup-section" aria-label="Environment setup">
      <div className="runz-section-head">
        <div>
          <h2 className="runz-section-title">Env Setup</h2>
          <p className="runz-migrate-blurb">
            Onboarding for a fresh clone: copy local env files, apply local D1 migrations, and
            generate Cloudflare type definitions. Setup Env skips steps already marked Done; use
            Re-run on a step to execute it again after confirmation.
          </p>
        </div>
        <button
          type="button"
          className="runz-btn"
          disabled={scanning || setupBusy || !monorepoRoot}
          onClick={onRefresh}
        >
          {scanning ? 'Refreshing…' : 'Refresh status'}
        </button>
      </div>

      <TestWorkspaceLayout
        listAriaLabel="Env setup steps"
        logAriaLabel="Env setup log"
        logTitle="Setup Log"
        logSub="Clears when you run Setup Env or Re-run"
        logRef={setupLogRef}
        logLines={setupLogs}
        logPlaceholder="— run Setup Env to see output here —"
        toolbar={
          <div className="runz-env-setup-toolbar">
            <fieldset className="runz-env-setup-fieldset">
              <legend>Apply selected steps (Done steps are skipped)</legend>
              {RUNZ_ENV_SETUP_STEPS.map((step) => {
                const status = stepStatuses[step.id];
                const done = isEnvSetupStepDone(status);
                return (
                  <div key={step.id} className="runz-env-setup-step-option">
                    <label className="runz-env-setup-step-label">
                      <input
                        type="checkbox"
                        checked={selectedSteps[step.id]}
                        disabled={setupBusy}
                        onChange={(event) => onToggleStep(step.id, event.target.checked)}
                      />
                      <span className="runz-env-setup-step-copy">
                        <strong>{step.label}</strong>
                        <span>{step.summary}</span>
                        <span className="runz-env-setup-step-meta">
                          {stepSummary(status)}
                          {done ? ' · skipped by Setup Env while Done' : ''}
                        </span>
                      </span>
                    </label>
                    <div className="runz-env-setup-step-actions">
                      {status ? (
                        <span className={`runz-env-pill runz-env-pill-${status.status}`}>
                          {statusLabel(status.status)}
                        </span>
                      ) : null}
                      {done ? (
                        <button
                          type="button"
                          className="runz-btn runz-btn-compact"
                          disabled={!monorepoRoot || setupBusy}
                          onClick={() => onRerunStep(step.id)}
                        >
                          Re-run
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </fieldset>
            <button
              type="button"
              className="runz-btn runz-btn-primary"
              disabled={!monorepoRoot || setupBusy || !anyRunnableSelected}
              onClick={onSetup}
            >
              Setup Env
            </button>
          </div>
        }
        list={
          <div className="runz-env-setup-steps">
            {RUNZ_ENV_SETUP_STEPS.map((step) => {
              const status = stepStatuses[step.id];
              const done = isEnvSetupStepDone(status);
              return (
                <article key={step.id} className="runz-env-setup-step-card">
                  <div className="runz-env-setup-step-head">
                    <div>
                      <h3>{step.label}</h3>
                      <p>{step.summary}</p>
                    </div>
                    <div className="runz-env-setup-step-actions">
                      {status ? (
                        <span className={`runz-env-pill runz-env-pill-${status.status}`}>
                          {statusLabel(status.status)}
                        </span>
                      ) : null}
                      {done ? (
                        <button
                          type="button"
                          className="runz-btn runz-btn-compact"
                          disabled={!monorepoRoot || setupBusy}
                          onClick={() => onRerunStep(step.id)}
                        >
                          Re-run
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {status ? (
                    <div className="runz-env-checklist">
                      {status.rows.map((row) => (
                        <div key={row.id} className={`runz-env-check runz-env-check-${row.status}`}>
                          <strong>{row.label}</strong>
                          <span>{row.detail}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="runz-hint">Refresh status to inspect this step.</p>
                  )}
                </article>
              );
            })}
          </div>
        }
      />
    </section>
  );
}
