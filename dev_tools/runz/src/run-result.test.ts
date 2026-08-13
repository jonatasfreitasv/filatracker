import { describe, expect, it } from 'vitest';
import { extractExplicitError, summarizeRunOutcome } from './run-result';

describe('extractExplicitError', () => {
  it('prefers explicit error lines', () => {
    expect(
      extractExplicitError([
        '[test-cloud] [stdout] running suite',
        '[test-cloud] [stderr] Error: expected 200 to be 201',
      ])
    ).toBe('Error: expected 200 to be 201');
  });

  it('falls back to the latest stderr line', () => {
    expect(
      extractExplicitError(['[migrate-local-cloud-chat] [stderr] Applying migration 0007.sql'])
    ).toBe('Applying migration 0007.sql');
  });
});

describe('summarizeRunOutcome', () => {
  it('marks successful runs as success', () => {
    expect(summarizeRunOutcome({ appId: 'test-cloud', code: 0, success: true }, [], false)).toEqual(
      {
        status: 'success',
        detail: 'Completed successfully.',
        exitCode: 0,
      }
    );
  });

  it('marks user-requested stops separately', () => {
    expect(
      summarizeRunOutcome(
        { appId: 'test-cloud', code: null, success: false },
        ['[test-cloud] [stderr] interrupted'],
        true
      )
    ).toEqual({
      status: 'stopped',
      detail: 'Stopped manually before completion.',
      exitCode: null,
    });
  });

  it('includes exit code and explicit error for failures', () => {
    expect(
      summarizeRunOutcome(
        { appId: 'test-cloud', code: 1, success: false },
        ['[test-cloud] [stderr] Error: expected 200 to be 201'],
        false
      )
    ).toEqual({
      status: 'error',
      detail: 'Process exited with code 1. Error: expected 200 to be 201',
      exitCode: 1,
    });
  });
});
