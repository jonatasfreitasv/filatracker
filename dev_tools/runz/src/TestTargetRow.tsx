import type { ReactNode } from 'react';
import type { RunOutcome } from './run-result';

export function runOutcomeLabel(outcome: RunOutcome | undefined): string {
  switch (outcome?.status ?? 'idle') {
    case 'running':
      return 'Running';
    case 'success':
      return 'OK';
    case 'error':
      return 'Error';
    case 'stopped':
      return 'Stopped';
    default:
      return 'Idle';
  }
}

function testOutcomeClassName(outcome: RunOutcome | undefined): string {
  const suffix = outcome?.status ?? 'idle';
  return `runz-test-outcome runz-test-outcome-${suffix}`;
}

export type PreflightCheckStatus = 'ready' | 'warn' | 'block' | 'pending';

function preflightOutcomeDisplay(
  status: PreflightCheckStatus,
  detail: string
): { suffix: string; label: string } {
  if (detail === 'Checking…') {
    return { suffix: 'running', label: 'Running' };
  }
  switch (status) {
    case 'ready':
      return { suffix: 'success', label: 'OK' };
    case 'warn':
      return { suffix: 'warn', label: 'Warn' };
    case 'block':
      return { suffix: 'error', label: 'Block' };
    default:
      return { suffix: 'idle', label: 'Pending' };
  }
}

export type TestRowLayout = 'default' | 'three-col';

export type PreflightCheckRowProps = {
  label: string;
  detail: string;
  status: PreflightCheckStatus;
  layout?: TestRowLayout;
};

export function PreflightCheckRow({
  label,
  detail,
  status,
  layout = 'default',
}: PreflightCheckRowProps) {
  const outcome = preflightOutcomeDisplay(status, detail);
  const dotOn = status === 'ready' || detail === 'Checking…';
  const rowClass =
    layout === 'three-col'
      ? 'runz-test-row runz-test-row-preflight runz-test-row-3col'
      : 'runz-test-row runz-test-row-preflight';
  return (
    <div className={rowClass} title={detail}>
      <span className="runz-test-row-label">
        <span className={`runz-status-dot runz-status-dot-sm${dotOn ? ' on' : ''}`} />
        {label}
      </span>
      <code className="runz-test-row-cmd">{detail}</code>
      <span className={`runz-test-outcome runz-test-outcome-${outcome.suffix}`}>
        {outcome.label}
      </span>
    </div>
  );
}

export type TestTargetRowProps = {
  label: string;
  command: string;
  title?: string;
  pill?: string;
  running: boolean;
  outcome: RunOutcome;
  runDisabled: boolean;
  stopDisabled: boolean;
  onRun: () => void;
  onStop: () => void;
  extraActions?: ReactNode;
  layout?: TestRowLayout;
};

export function TestTargetRow({
  label,
  command,
  title,
  pill,
  running,
  outcome,
  runDisabled,
  stopDisabled,
  onRun,
  onStop,
  extraActions,
  layout = 'default',
}: TestTargetRowProps) {
  const outcomeTitle = outcome.detail ?? undefined;
  const outcomeEl = (
    <span className={testOutcomeClassName(outcome)} title={outcomeTitle}>
      {runOutcomeLabel(outcome)}
    </span>
  );
  const actionsEl = (
    <div className="runz-migrate-row-actions">
      <button
        type="button"
        className="runz-btn runz-btn-primary runz-btn-sm"
        disabled={runDisabled}
        onClick={onRun}
      >
        Run
      </button>
      {extraActions}
      <button
        type="button"
        className="runz-btn runz-btn-danger runz-btn-sm"
        disabled={stopDisabled}
        onClick={onStop}
      >
        Stop
      </button>
    </div>
  );
  const labelEl = (
    <span className="runz-test-row-label">
      <span className={`runz-status-dot runz-status-dot-sm${running ? ' on' : ''}`} />
      {label}
      {pill ? <span className="runz-api-pill">{pill}</span> : null}
    </span>
  );

  if (layout === 'three-col') {
    return (
      <div className="runz-test-row runz-test-row-3col" title={title}>
        {labelEl}
        <div className="runz-test-row-info">
          <code className="runz-test-row-cmd">{command}</code>
          {outcomeEl}
        </div>
        {actionsEl}
      </div>
    );
  }

  return (
    <div className="runz-test-row" title={title}>
      {labelEl}
      <code className="runz-test-row-cmd">{command}</code>
      {outcomeEl}
      {actionsEl}
    </div>
  );
}
