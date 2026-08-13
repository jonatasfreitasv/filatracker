/**
 * Minimal parser for BMAD sprint-status.yaml files (no YAML dependency).
 */

export type SprintStoryStatus =
  | 'backlog'
  | 'ready-for-dev'
  | 'in-progress'
  | 'review'
  | 'done'
  | 'optional'
  | string;

export type SprintTrack = 'filatracker';

export interface SprintStatusEntry {
  key: string;
  status: SprintStoryStatus;
  kind: 'epic' | 'story' | 'retrospective';
}

export interface SprintEpicGroup {
  epicKey: string;
  epicStatus: SprintStoryStatus | null;
  retrospectiveStatus: SprintStoryStatus | null;
  stories: SprintStatusEntry[];
  totalStories: number;
}

function epicStatusMap(entries: SprintStatusEntry[]): Map<string, SprintStoryStatus> {
  const map = new Map<string, SprintStoryStatus>();
  for (const entry of entries) {
    if (entry.kind !== 'epic') continue;
    map.set(entry.key, entry.status);
  }
  return map;
}

export function listEpicKeys(entries: SprintStatusEntry[]): string[] {
  return entries.filter((entry) => entry.kind === 'epic').map((entry) => entry.key);
}

/** Map a story key to the exact epic key declared in sprint-status.yaml. */
export function resolveCanonicalEpicKey(
  storyKey: string,
  epicKeys: readonly string[]
): string | null {
  if (storyKey.startsWith('epic-')) {
    return epicKeys.includes(storyKey) ? storyKey : null;
  }

  const match = storyKey.match(/^(\d+[a-z]*)-/);
  if (!match) return null;
  const prefix = match[1]!;

  const candidates = epicKeys.filter(
    (key) => key === `epic-${prefix}` || key.startsWith(`epic-${prefix}-`)
  );
  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => b.length - a.length)[0]!;
}

function resolveRetrospectiveEpicKey(
  retrospectiveKey: string,
  epicKeys: readonly string[]
): string {
  const base = retrospectiveKey.replace(/-retrospective$/, '');
  if (epicKeys.includes(base)) return base;

  const shortMatch = base.match(/^epic-(\d+[a-z]*)$/);
  if (shortMatch) {
    const resolved = resolveCanonicalEpicKey(`${shortMatch[1]}-x`, epicKeys);
    if (resolved) return resolved;
  }

  return base;
}

export interface ParsedSprintStatus {
  track: SprintTrack;
  relativePath: string;
  storyLocation: string | null;
  product: string | null;
  lastUpdated: string | null;
  executionPolicySummary: string | null;
  entries: SprintStatusEntry[];
  parseErrors: string[];
}

const STATUS_LINE = /^  ([\w][\w.-]*):\s+([a-z][\w-]*)\s*(?:#.*)?$/;

export const SPRINT_STATUS_PATHS: Record<SprintTrack, string> = {
  filatracker: '_bmad-output/implementation-artifacts/sprint-status.yaml',
};

export function inferEntryKind(key: string): SprintStatusEntry['kind'] {
  if (key.endsWith('-retrospective')) return 'retrospective';
  if (key.startsWith('epic-')) return 'epic';
  return 'story';
}

export function groupSprintStoriesByEpic(
  allEntries: SprintStatusEntry[],
  visibleEntries: SprintStatusEntry[]
): SprintEpicGroup[] {
  const epicKeys = listEpicKeys(allEntries);
  const epicStatusByKey = epicStatusMap(allEntries);
  const retroStatusByKey = retrospectiveStatusByEpic(allEntries);
  const allStoriesByEpic = new Map<string, SprintStatusEntry[]>();
  const visibleStoriesByEpic = new Map<string, SprintStatusEntry[]>();

  for (const entry of allEntries) {
    if (entry.kind !== 'story') continue;
    const epicKey = resolveCanonicalEpicKey(entry.key, epicKeys) ?? 'epic-unknown';
    const allStories = allStoriesByEpic.get(epicKey) ?? [];
    allStories.push(entry);
    allStoriesByEpic.set(epicKey, allStories);
  }

  for (const entry of visibleEntries) {
    if (entry.kind !== 'story') continue;
    const epicKey = resolveCanonicalEpicKey(entry.key, epicKeys) ?? 'epic-unknown';
    const visibleStories = visibleStoriesByEpic.get(epicKey) ?? [];
    visibleStories.push(entry);
    visibleStoriesByEpic.set(epicKey, visibleStories);
  }

  return Array.from(visibleStoriesByEpic.entries()).map(([epicKey, stories]) => ({
    epicKey,
    epicStatus: epicStatusByKey.get(epicKey) ?? null,
    retrospectiveStatus: retroStatusByKey.get(epicKey) ?? null,
    stories,
    totalStories: allStoriesByEpic.get(epicKey)?.length ?? stories.length,
  }));
}

export function retrospectiveStatusByEpic(
  entries: SprintStatusEntry[]
): Map<string, SprintStoryStatus | null> {
  const epicKeys = listEpicKeys(entries);
  const map = new Map<string, SprintStoryStatus | null>();
  for (const entry of entries) {
    if (entry.kind !== 'retrospective') continue;
    const epicKey = resolveRetrospectiveEpicKey(entry.key, epicKeys);
    map.set(epicKey, entry.status);
  }
  return map;
}

/** All stories under epics whose retrospective is missing or not `done`. */
export function filterStoriesByRetrospectiveNotDone(
  entries: SprintStatusEntry[]
): SprintStatusEntry[] {
  const epicKeys = listEpicKeys(entries);
  const retroByEpic = retrospectiveStatusByEpic(entries);
  return entries.filter((entry) => {
    if (entry.kind !== 'story') return false;
    const epicKey = resolveCanonicalEpicKey(entry.key, epicKeys);
    if (!epicKey) return false;
    const retroStatus = retroByEpic.get(epicKey);
    return retroStatus !== 'done';
  });
}

/** All stories under epics whose epic or retrospective is missing or not `done`. */
export function filterStoriesByEpicOrRetrospectiveNotDone(
  entries: SprintStatusEntry[]
): SprintStatusEntry[] {
  const epicKeys = listEpicKeys(entries);
  const statusByEpic = epicStatusMap(entries);
  const retroByEpic = retrospectiveStatusByEpic(entries);
  return entries.filter((entry) => {
    if (entry.kind !== 'story') return false;
    const epicKey = resolveCanonicalEpicKey(entry.key, epicKeys);
    if (!epicKey) return false;
    const epicStatus = statusByEpic.get(epicKey);
    const retroStatus = retroByEpic.get(epicKey);
    return epicStatus !== 'done' || retroStatus !== 'done';
  });
}

export function filterStoriesByEpicStatus(
  entries: SprintStatusEntry[],
  epicStatus: SprintStoryStatus
): SprintStatusEntry[] {
  return filterStoriesByEpicStatuses(entries, [epicStatus]);
}

export function filterStoriesByEpicStatuses(
  entries: SprintStatusEntry[],
  epicStatuses: readonly SprintStoryStatus[]
): SprintStatusEntry[] {
  const epicKeys = listEpicKeys(entries);
  const statusByEpic = epicStatusMap(entries);
  const allowed = new Set(epicStatuses);
  return entries.filter((entry) => {
    if (entry.kind !== 'story') return false;
    const epicKey = resolveCanonicalEpicKey(entry.key, epicKeys);
    if (!epicKey) return false;
    const epicStatus = statusByEpic.get(epicKey);
    return epicStatus !== undefined && allowed.has(epicStatus);
  });
}

function parseHeaderValue(text: string, field: string): string | null {
  const re = new RegExp(`^${field}:\\s*['"]?([^'"\n]+)['"]?\\s*$`, 'm');
  const match = text.match(re);
  return match?.[1]?.trim() ?? null;
}

/** BMAD YAML uses `{project-root}/…` — strip for paths under monorepo root. */
export function normalizeStoryLocation(storyLocation: string | null): string | null {
  if (!storyLocation) return null;
  return storyLocation
    .replace(/^\{project-root\}\/?/, '')
    .replace(/^\.\//, '')
    .trim();
}

export function parseSprintStatusYaml(track: SprintTrack, yamlText: string): ParsedSprintStatus {
  const parseErrors: string[] = [];
  const lines = yamlText.split('\n');
  let inDevelopmentStatus = false;
  const entries: SprintStatusEntry[] = [];

  for (const line of lines) {
    if (line.trim() === 'development_status:') {
      inDevelopmentStatus = true;
      continue;
    }
    if (!inDevelopmentStatus) continue;
    if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
      break;
    }
    const match = line.match(STATUS_LINE);
    if (!match) continue;
    const key = match[1]!;
    const status = match[2]! as SprintStoryStatus;
    entries.push({
      key,
      status,
      kind: inferEntryKind(key),
    });
  }

  if (entries.length === 0) {
    parseErrors.push('No development_status entries parsed.');
  }

  return {
    track,
    relativePath: SPRINT_STATUS_PATHS[track],
    storyLocation: normalizeStoryLocation(parseHeaderValue(yamlText, 'story_location')),
    product: parseHeaderValue(yamlText, 'product'),
    lastUpdated: parseHeaderValue(yamlText, 'last_updated'),
    executionPolicySummary: null,
    entries,
    parseErrors,
  };
}

export function filterSprintEntries(
  entries: SprintStatusEntry[],
  filter: 'active' | 'ready' | 'backlog' | 'done' | 'all'
): SprintStatusEntry[] {
  const stories = entries.filter((e) => e.kind === 'story');
  switch (filter) {
    case 'active':
      return stories.filter((e) => e.status === 'in-progress' || e.status === 'review');
    case 'ready':
      return stories.filter((e) => e.status === 'ready-for-dev');
    case 'backlog':
      return stories.filter((e) => e.status === 'backlog');
    case 'done':
      return stories.filter((e) => e.status === 'done' || e.status === 'optional');
    default:
      return stories;
  }
}
