import {
  SPRINT_STATUS_PATHS,
  parseSprintStatusYaml,
  type ParsedSprintStatus,
  type SprintStatusEntry,
  type SprintStoryStatus,
  type SprintTrack,
} from './sprint-status.parse';
import { runzReadRepoText } from './runz-tauri';

export type ResolvedSprintStory = {
  entry: SprintStatusEntry;
  track: SprintTrack;
};

const DEFAULT_TRACK_ORDER: SprintTrack[] = ['filatracker'];

export function findStoryByStatus(
  parsedList: readonly ParsedSprintStatus[],
  status: SprintStoryStatus,
  trackOrder: readonly SprintTrack[] = DEFAULT_TRACK_ORDER
): ResolvedSprintStory | null {
  for (const track of trackOrder) {
    const parsed = parsedList.find((item) => item.track === track);
    if (!parsed) continue;

    const matches = parsed.entries
      .filter((entry) => entry.kind === 'story' && entry.status === status)
      .sort((a, b) => a.key.localeCompare(b.key));

    if (matches.length > 0) {
      return { entry: matches[0]!, track: parsed.track };
    }
  }

  return null;
}

export async function loadAllSprintStatuses(monorepoRoot: string): Promise<ParsedSprintStatus[]> {
  const tracks = DEFAULT_TRACK_ORDER;
  const results = await Promise.all(
    tracks.map(async (track) => {
      const text = await runzReadRepoText(monorepoRoot, SPRINT_STATUS_PATHS[track]);
      return parseSprintStatusYaml(track, text);
    })
  );
  return results;
}

export type ClaudeCodexBmadSkill = 'bmad-create-story' | 'bmad-code-review';

export type CursorAgentBmadSkill =
  | 'bmad-dev-story'
  | 'bmad-create-story'
  | 'bmad-create-story-revisar';

export function appendWipProductFlag(commandBody: string, _track: SprintTrack = 'filatracker'): string {
  return commandBody;
}

export function buildBmadTerminalCommand(
  terminalId: 'claude-code' | 'codex',
  skill: ClaudeCodexBmadSkill,
  storyKey: string,
  track: SprintTrack = 'filatracker'
): string {
  const prefix = terminalId === 'claude-code' ? '/' : '$';
  const body =
    skill === 'bmad-create-story' ? `${skill} Revise: ${storyKey}` : `${skill} ${storyKey}`;
  return `${prefix}${appendWipProductFlag(body, track)}\r`;
}

export function buildCursorAgentBmadCommand(
  skill: CursorAgentBmadSkill,
  storyKey: string,
  track: SprintTrack = 'filatracker'
): string {
  const body =
    skill === 'bmad-create-story-revisar'
      ? `bmad-create-story Revisar: ${storyKey}`
      : `${skill} ${storyKey}`;
  return `${appendWipProductFlag(body, track)}\r`;
}
