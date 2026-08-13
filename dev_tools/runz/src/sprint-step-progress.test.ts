import { describe, expect, it } from 'vitest';

import {
  CS_REVIEW_MARKER_RE,
  deriveStoryStepProgress,
  hasCsReviewMarkerInText,
  storyStatusRank,
} from './sprint-step-progress';

const emptyContext = {
  checkpointKeys: new Set<string>(),
  csReviewMarkers: new Map<string, boolean>(),
};

describe('storyStatusRank', () => {
  it('orders BMAD story statuses', () => {
    expect(storyStatusRank('backlog')).toBe(0);
    expect(storyStatusRank('ready-for-dev')).toBe(1);
    expect(storyStatusRank('in-progress')).toBe(2);
    expect(storyStatusRank('review')).toBe(3);
    expect(storyStatusRank('done')).toBe(4);
    expect(storyStatusRank('optional')).toBe(4);
  });
});

describe('hasCsReviewMarkerInText', () => {
  it('detects create-story revisão comment in header', () => {
    const text = `# Story 3E.3\n\nStatus: ready-for-dev\n\n<!-- Validation: create-story revisão 2026-05-22 — aligned -->\n`;
    expect(hasCsReviewMarkerInText(text)).toBe(true);
    expect(CS_REVIEW_MARKER_RE.test(text)).toBe(true);
  });

  it('returns false without marker', () => {
    const text = `# Story\n\nStatus: ready-for-dev\n\n<!-- Validação opcional: run validate-create-story -->\n`;
    expect(hasCsReviewMarkerInText(text)).toBe(false);
  });
});

describe('deriveStoryStepProgress', () => {
  it('marks nothing executed at backlog', () => {
    expect(deriveStoryStepProgress('3h-1-foo', 'backlog', emptyContext)).toEqual({
      'create-story': false,
      'cs-review': false,
      'dev-story': false,
      'code-review': false,
      preview: false,
    });
  });

  it('marks only create-story at ready-for-dev without cs marker', () => {
    expect(deriveStoryStepProgress('3h-1-foo', 'ready-for-dev', emptyContext)).toEqual({
      'create-story': true,
      'cs-review': false,
      'dev-story': false,
      'code-review': false,
      preview: false,
    });
  });

  it('marks cs-review at ready-for-dev when marker present', () => {
    const context = {
      checkpointKeys: new Set<string>(),
      csReviewMarkers: new Map([['3h-1-foo', true]]),
    };
    expect(deriveStoryStepProgress('3h-1-foo', 'ready-for-dev', context)).toEqual({
      'create-story': true,
      'cs-review': true,
      'dev-story': false,
      'code-review': false,
      preview: false,
    });
  });

  it('marks create-story and cs-review at in-progress', () => {
    expect(deriveStoryStepProgress('3h-1-foo', 'in-progress', emptyContext)).toEqual({
      'create-story': true,
      'cs-review': true,
      'dev-story': false,
      'code-review': false,
      preview: false,
    });
  });

  it('marks steps 1–3 at review', () => {
    expect(deriveStoryStepProgress('3h-1-foo', 'review', emptyContext)).toEqual({
      'create-story': true,
      'cs-review': true,
      'dev-story': true,
      'code-review': false,
      preview: false,
    });
  });

  it('marks steps 1–4 at done', () => {
    expect(deriveStoryStepProgress('3h-1-foo', 'done', emptyContext)).toEqual({
      'create-story': true,
      'cs-review': true,
      'dev-story': true,
      'code-review': true,
      preview: false,
    });
  });

  it('marks preview independently from sprint status', () => {
    const context = {
      checkpointKeys: new Set(['3p-3-arqion-provisioning']),
      csReviewMarkers: new Map<string, boolean>(),
    };
    expect(deriveStoryStepProgress('3p-3-arqion-provisioning', 'backlog', context)).toMatchObject({
      preview: true,
      'create-story': false,
    });
  });
});
