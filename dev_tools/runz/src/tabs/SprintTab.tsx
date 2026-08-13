import { openPath } from '@tauri-apps/plugin-opener';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SPRINT_STATUS_PATHS,
  filterSprintEntries,
  filterStoriesByEpicStatus,
  filterStoriesByEpicStatuses,
  groupSprintStoriesByEpic,
  parseSprintStatusYaml,
  type ParsedSprintStatus,
  type SprintStatusEntry,
  type SprintTrack,
} from '../sprint-status.parse';
import { runzFindStoryFile, runzReadRepoText } from '../runz-tauri';

type SprintFilter = 'active' | 'ready' | 'backlog' | 'backlog-epics' | 'wip-epics' | 'done' | 'all';

type SprintTabProps = {
  monorepoRoot: string;
  active: boolean;
  onNavigateQuality: () => void;
  onNavigateE2e: () => void;
};

const AUTO_REFRESH_MS = 15_000;

function statusClass(status: string): string {
  return `runz-sprint-status runz-sprint-status-${status.replace(/[^a-z0-9-]/g, '')}`;
}

export function SprintTab({
  monorepoRoot,
  active,
  onNavigateQuality,
  onNavigateE2e,
}: SprintTabProps) {
  const [track, setTrack] = useState<SprintTrack>('filatracker');
  const [filter, setFilter] = useState<SprintFilter>('active');
  const [parsed, setParsed] = useState<ParsedSprintStatus | null>(null);
  const [storyPaths, setStoryPaths] = useState<Record<string, string | null>>({});
  const [copiedStoryKey, setCopiedStoryKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const loadInFlightRef = useRef(false);
  const copiedTimerRef = useRef<number | null>(null);
  const scrollSnapshotRef = useRef(0);
  const wasActiveRef = useRef(active);

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!monorepoRoot) {
        setParsed(null);
        setLastCheckedAt(null);
        return;
      }
      if (loadInFlightRef.current) {
        return;
      }
      loadInFlightRef.current = true;
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const text = await runzReadRepoText(monorepoRoot, SPRINT_STATUS_PATHS[track]);
        const next = parseSprintStatusYaml(track, text);
        setParsed(next);
        setLastCheckedAt(new Date().toLocaleTimeString());
        if (next.parseErrors.length > 0) {
          setError(next.parseErrors.join(' · '));
        }
      } catch (e) {
        setError(String(e));
        setParsed(null);
      } finally {
        loadInFlightRef.current = false;
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [monorepoRoot, track]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!monorepoRoot) return;

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') {
        void load({ silent: true });
      }
    };

    const intervalId = window.setInterval(refreshIfVisible, AUTO_REFRESH_MS);
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [load, monorepoRoot]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollSnapshotRef.current);
      });
    } else if (wasActiveRef.current) {
      scrollSnapshotRef.current = window.scrollY;
    }
    wasActiveRef.current = active;
  }, [active]);

  const visibleEntries = useMemo(() => {
    if (!parsed) return [];
    if (filter === 'backlog-epics') {
      return filterStoriesByEpicStatus(parsed.entries, 'backlog');
    }
    if (filter === 'wip-epics') {
      return filterStoriesByEpicStatuses(parsed.entries, ['backlog', 'in-progress']);
    }
    return filterSprintEntries(parsed.entries, filter);
  }, [parsed, filter]);

  const groupedEntries = useMemo(() => {
    if (!parsed) return [];
    return groupSprintStoriesByEpic(parsed.entries, visibleEntries);
  }, [parsed, visibleEntries]);

  const summary = useMemo(() => {
    if (!parsed) {
      return { active: 0, ready: 0, backlog: 0, done: 0, total: 0, epics: 0 };
    }
    return {
      active: filterSprintEntries(parsed.entries, 'active').length,
      ready: filterSprintEntries(parsed.entries, 'ready').length,
      backlog: filterSprintEntries(parsed.entries, 'backlog').length,
      done: filterSprintEntries(parsed.entries, 'done').length,
      total: filterSprintEntries(parsed.entries, 'all').length,
      epics: parsed.entries.filter((entry) => entry.kind === 'epic').length,
    };
  }, [parsed]);

  const progressPercent = useMemo(() => {
    if (summary.total === 0) return 0;
    return Math.round((summary.done / summary.total) * 100);
  }, [summary.done, summary.total]);

  const resolveStory = useCallback(
    async (entry: SprintStatusEntry) => {
      if (!parsed?.storyLocation || !monorepoRoot) return;
      const path = await runzFindStoryFile(monorepoRoot, parsed.storyLocation, entry.key);
      setStoryPaths((prev) => ({ ...prev, [entry.key]: path }));
      if (path) {
        await openPath(`${monorepoRoot}/${path}`);
      }
    },
    [monorepoRoot, parsed?.storyLocation]
  );

  const copyStoryName = useCallback(async (entry: SprintStatusEntry) => {
    await navigator.clipboard.writeText(entry.key);
    setCopiedStoryKey(entry.key);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = window.setTimeout(() => {
      setCopiedStoryKey((current) => (current === entry.key ? null : current));
      copiedTimerRef.current = null;
    }, 1600);
  }, []);

  return (
    <section className="runz-migrate-section" aria-label="Sprint">
      <div className="runz-sprint-hero">
        <div className="runz-sprint-hero-copy">
          <h2 className="runz-section-title">Sprint</h2>
          <p className="runz-migrate-blurb">
            Read-only view of BMAD <code>sprint-status.yaml</code> with epic grouping and live
            refresh.
          </p>
        </div>

        <div className="runz-sprint-dod">
          <span>DoD shortcuts:</span>
          <button type="button" className="runz-btn runz-btn-sm" onClick={onNavigateQuality}>
            Quality tab
          </button>
          <button type="button" className="runz-btn runz-btn-sm" onClick={onNavigateE2e}>
            Tests tab
          </button>
        </div>
      </div>

      <div className="runz-sprint-toolbar">
        <div className="runz-api-app-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={track === 'filatracker'}
            className="runz-api-app-tab is-active"
            onClick={() => setTrack('filatracker')}
          >
            FilaTracker
          </button>
        </div>

        <div className="runz-sprint-toolbar-actions">
          <span className="runz-sprint-live-pill">Auto-refresh 15s</span>
          <button
            type="button"
            className="runz-btn runz-btn-sm"
            disabled={!monorepoRoot || loading}
            onClick={() => void load()}
          >
            Refresh now
          </button>
        </div>
      </div>

      {parsed ? (
        <div className="runz-sprint-meta-grid">
          <div className="runz-sprint-meta-card">
            <strong>Source</strong>
            <span>
              <code>{parsed.relativePath}</code>
            </span>
          </div>
          <div className="runz-sprint-meta-card">
            <strong>Updated in file</strong>
            <span>{parsed.lastUpdated ?? 'unknown'}</span>
          </div>
          <div className="runz-sprint-meta-card">
            <strong>Last checked</strong>
            <span>{lastCheckedAt ?? 'just now'}</span>
          </div>
          {parsed.product ? (
            <div className="runz-sprint-meta-card">
              <strong>Product</strong>
              <span>{parsed.product}</span>
            </div>
          ) : null}
          {parsed.storyLocation ? (
            <div className="runz-sprint-meta-card">
              <strong>Stories</strong>
              <span>
                <code>{parsed.storyLocation}</code>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {parsed?.executionPolicySummary ? (
        <p className="runz-hint runz-sprint-policy">{parsed.executionPolicySummary}</p>
      ) : null}

      <div className="runz-sprint-summary-grid">
        <div className="runz-sprint-summary-card">
          <strong>{summary.active}</strong>
          <span>Active</span>
        </div>
        <div className="runz-sprint-summary-card">
          <strong>{summary.ready}</strong>
          <span>Ready</span>
        </div>
        <div className="runz-sprint-summary-card">
          <strong>{summary.backlog}</strong>
          <span>Backlog</span>
        </div>
        <div className="runz-sprint-summary-card">
          <strong>{summary.done}</strong>
          <span>Done / optional</span>
        </div>
        <div className="runz-sprint-summary-card">
          <strong>{summary.epics}</strong>
          <span>Epics</span>
        </div>
        <div className="runz-sprint-summary-card">
          <strong>{summary.total}</strong>
          <span>Total stories</span>
        </div>
      </div>

      <div className="runz-sprint-progress-card" aria-label="Sprint progress">
        <div className="runz-sprint-progress-head">
          <strong>Overall progress</strong>
          <span>{progressPercent}%</span>
        </div>
        <div
          className="runz-sprint-progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
        >
          <div className="runz-sprint-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <p className="runz-sprint-progress-copy">
          {summary.done} of {summary.total} stories completed or optional
        </p>
      </div>

      <div className="runz-sprint-filters">
        {(
          [
            ['active', 'Active'],
            ['ready', 'Ready'],
            ['backlog', 'Backlog'],
            ['backlog-epics', 'Backlog epics'],
            ['wip-epics', 'Work in Progress'],
            ['done', 'Done'],
            ['all', 'All stories'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`runz-btn runz-btn-sm${filter === id ? ' runz-btn-primary' : ''}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="runz-data-error">{error}</p> : null}
      {loading ? <p className="runz-hint">Loading sprint status…</p> : null}

      <div className="runz-sprint-list">
        {groupedEntries.map((group) => (
          <section key={group.epicKey} className="runz-sprint-epic-card">
            <div className="runz-sprint-epic-head">
              <div className="runz-sprint-epic-title">
                <h3>{group.epicKey}</h3>
                {group.epicStatus ? (
                  <span className={statusClass(group.epicStatus)}>{group.epicStatus}</span>
                ) : null}
              </div>
              <div className="runz-sprint-epic-meta">
                <span className="runz-api-pill">{group.stories.length} shown</span>
                <span className="runz-api-pill">{group.totalStories} total</span>
              </div>
            </div>

            <div className="runz-sprint-epic-stories">
              {group.stories.map((entry) => {
                const pathHint = storyPaths[entry.key];
                return (
                  <div key={entry.key} className="runz-sprint-row">
                    <div className="runz-sprint-row-main">
                      <code>{entry.key}</code>
                      <span className={statusClass(entry.status)}>{entry.status}</span>
                    </div>
                    {pathHint !== undefined ? (
                      <span className="runz-hint">
                        {pathHint ? <code>{pathHint}</code> : 'Story file not found'}
                      </span>
                    ) : null}
                    <div className="runz-migrate-row-actions">
                      <button
                        type="button"
                        className="runz-btn runz-btn-sm"
                        disabled={!monorepoRoot}
                        onClick={() => void resolveStory(entry)}
                      >
                        Open story
                      </button>
                      <button
                        type="button"
                        className="runz-btn runz-btn-sm"
                        disabled={!monorepoRoot}
                        onClick={() => void copyStoryName(entry)}
                      >
                        {copiedStoryKey === entry.key ? 'Copied!' : 'Copy story name'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {!loading && groupedEntries.length === 0 ? (
          <p className="runz-hint">No stories for this filter.</p>
        ) : null}
      </div>
    </section>
  );
}
