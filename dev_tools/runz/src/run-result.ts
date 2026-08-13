export type RunOutcomeStatus = 'idle' | 'running' | 'success' | 'error' | 'stopped';

export interface ProcessExitPayload {
  appId: string;
  code: number | null;
  success: boolean;
}

export interface RunOutcome {
  status: RunOutcomeStatus;
  detail: string | null;
  exitCode: number | null;
}

const ERROR_PATTERN =
  /\b(error|failed|failure|exception|panic|fatal|ERR!|command failed|non-zero exit|assertion)\b/i;

function stripRunzPrefix(line: string): string {
  return line
    .replace(/^\[[^\]]+\]\s+\[(stdout|stderr)\]\s*/i, '')
    .replace(/^\[(stdout|stderr)\]\s*/i, '')
    .trim();
}

function isNoiseLine(line: string): boolean {
  const normalized = stripRunzPrefix(line).toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.startsWith('[runz]') ||
    normalized === 'undefined' ||
    normalized === 'null'
  );
}

export function extractExplicitError(lines: string[]): string | null {
  const trimmed = lines.map((line) => line.trim()).filter((line) => line.length > 0);

  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const line = trimmed[index];
    const clean = stripRunzPrefix(line);
    if (!isNoiseLine(clean) && ERROR_PATTERN.test(clean)) {
      return clean;
    }
  }

  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const line = trimmed[index];
    if (/\[stderr\]/i.test(line)) {
      const clean = stripRunzPrefix(line);
      if (!isNoiseLine(clean)) {
        return clean;
      }
    }
  }

  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const clean = stripRunzPrefix(trimmed[index]);
    if (!isNoiseLine(clean)) {
      return clean;
    }
  }

  return null;
}

export function summarizeRunOutcome(
  payload: ProcessExitPayload,
  lines: string[],
  stopRequested: boolean
): RunOutcome {
  if (stopRequested) {
    return {
      status: 'stopped',
      detail: 'Stopped manually before completion.',
      exitCode: payload.code,
    };
  }

  if (payload.success) {
    return {
      status: 'success',
      detail: payload.code === 0 ? 'Completed successfully.' : 'Completed successfully.',
      exitCode: payload.code,
    };
  }

  const explicitError = extractExplicitError(lines);
  const exitDetail =
    payload.code === null
      ? 'Process ended without an exit code.'
      : `Process exited with code ${payload.code}.`;

  return {
    status: 'error',
    detail: explicitError ? `${exitDetail} ${explicitError}` : exitDetail,
    exitCode: payload.code,
  };
}
