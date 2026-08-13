import { describe, expect, it } from 'vitest';

import { resolveMdPath, splitMdPath } from './md-viewer-utils';

describe('splitMdPath', () => {
  it('splits directory and filename', () => {
    expect(splitMdPath('_bmad-output/foo/bar.md')).toEqual({
      dirPath: '_bmad-output/foo',
      fileName: 'bar.md',
    });
  });
});

describe('resolveMdPath', () => {
  const known = new Set([
    '_bmad-output/implementation-artifacts/3e-1.md',
    'docs/guide.md',
    'AGENTS.md',
  ]);

  it('resolves absolute repo paths', () => {
    expect(resolveMdPath('docs/guide.md', '_bmad-output/x.md', known)).toBe('docs/guide.md');
  });

  it('resolves sibling relative paths', () => {
    expect(
      resolveMdPath('./3e-1.md', '_bmad-output/implementation-artifacts/other.md', known)
    ).toBe('_bmad-output/implementation-artifacts/3e-1.md');
  });

  it('resolves bare filenames in the same directory', () => {
    expect(resolveMdPath('guide.md', 'docs/index.md', known)).toBe('docs/guide.md');
  });
});
