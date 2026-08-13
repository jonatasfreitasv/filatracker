import type { SprintStoryStatus } from './sprint-status.parse';

export type StoryWorkflowStep =
  | 'create-story'
  | 'cs-review'
  | 'dev-story'
  | 'code-review'
  | 'preview';

export type StoryStepProgress = Record<StoryWorkflowStep, boolean>;

export type StoryStepContext = {
  checkpointKeys: ReadonlySet<string>;
  csReviewMarkers: ReadonlyMap<string, boolean>;
};

const STATUS_RANK: Record<string, number> = {
  backlog: 0,
  'ready-for-dev': 1,
  'in-progress': 2,
  review: 3,
  done: 4,
  optional: 4,
};

/** Marker written by `bmad-create-story Revisar:` in story file header. */
export const CS_REVIEW_MARKER_RE = /<!--\s*Validation:\s*create-story\s+revis/i;

export function storyStatusRank(status: SprintStoryStatus): number {
  return STATUS_RANK[status] ?? -1;
}

export function hasCsReviewMarkerInText(text: string, maxLines = 30): boolean {
  const snippet = text.split('\n').slice(0, maxLines).join('\n');
  return CS_REVIEW_MARKER_RE.test(snippet);
}

export function deriveStoryStepProgress(
  storyKey: string,
  status: SprintStoryStatus,
  context: StoryStepContext
): StoryStepProgress {
  const rank = storyStatusRank(status);
  const hasCsReviewMarker = context.csReviewMarkers.get(storyKey) === true;
  const hasCheckpointFile = context.checkpointKeys.has(storyKey);

  return {
    'create-story': rank >= STATUS_RANK['ready-for-dev']!,
    'cs-review': rank >= STATUS_RANK['in-progress']! || hasCsReviewMarker,
    'dev-story': rank >= STATUS_RANK.review!,
    'code-review': rank >= STATUS_RANK.done!,
    preview: hasCheckpointFile,
  };
}
