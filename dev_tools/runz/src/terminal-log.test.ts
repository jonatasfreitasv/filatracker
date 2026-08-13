import { describe, expect, it } from 'vitest';
import { sanitizeTerminalLogLine } from './terminal-log';

describe('sanitizeTerminalLogLine', () => {
  it('removes ANSI sequences and keeps unicode icons', () => {
    expect(sanitizeTerminalLogLine('\u001b[32m✓\u001b[39m passed')).toBe('✓ passed');
  });

  it('removes visible CSI control sequences from logs', () => {
    expect(sanitizeTerminalLogLine('\u001b[33mwarn\u001b[39m')).toBe('warn');
  });

  it('removes literalized ANSI sequences and keeps unicode icons', () => {
    expect(sanitizeTerminalLogLine('\\x1B[32m✓\\x1B[39m passed')).toBe('✓ passed');
  });

  it('removes leftover control characters', () => {
    expect(sanitizeTerminalLogLine('ok\u0007\u001b[2m done')).toBe('ok done');
  });
});
