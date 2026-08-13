import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Terminal } from '@xterm/xterm';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@xterm/xterm/css/xterm.css';
import type { RunzTerminalTarget } from './runz-terminals';
import {
  SPRINT_STATUS_PATHS,
  filterSprintEntries,
  filterStoriesByEpicOrRetrospectiveNotDone,
  groupSprintStoriesByEpic,
  parseSprintStatusYaml,
  type ParsedSprintStatus,
  type SprintTrack,
} from './sprint-status.parse';
import {
  deriveStoryStepProgress,
  hasCsReviewMarkerInText,
  type StoryStepContext,
} from './sprint-step-progress';
import { appendWipProductFlag } from './sprint-status.resolve';
import {
  runzFindStoryFile,
  runzListCheckpointStoryKeys,
  runzReadRepoText,
  runzTerminalWrite,
} from './runz-tauri';

type TerminalWorkspaceProps = {
  terminal: RunzTerminalTarget;
  monorepoRoot: string;
  active: boolean;
  onError: (message: string | null) => void;
};

type TerminalOutputPayload = {
  terminalId: string;
  data: string;
};

type TerminalExitPayload = {
  terminalId: string;
  code: number | null;
  success: boolean;
};

type TerminalStatus = 'starting' | 'ready' | 'stopped' | 'error';

const MIN_TERMINAL_COLS = 2;
const MIN_TERMINAL_ROWS = 1;
const WIP_REFRESH_MS = 2_000;

const TERMINAL_THEME = {
  background: '#05070b',
  foreground: '#e6edf7',
  cursor: '#78a6ff',
  cursorAccent: '#05070b',
  selectionBackground: 'rgba(120, 166, 255, 0.28)',
  black: '#0c0f14',
  red: '#ff7b72',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#79c0ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#d2d8e3',
  brightBlack: '#6e7681',
  brightRed: '#ffa198',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#a5d6ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc',
};

function formatExitSummary(payload: TerminalExitPayload): string {
  if (payload.success) {
    return payload.code === null
      ? 'Shell session exited successfully.'
      : `Shell session exited successfully with code ${payload.code}.`;
  }
  if (payload.code === null) {
    return 'Shell session exited.';
  }
  return `Shell session exited with code ${payload.code}.`;
}

function statusClass(status: string): string {
  return `runz-sprint-status runz-sprint-status-${status.replace(/[^a-z0-9-]/g, '')}`;
}

function wipCmdBtnClass(
  btnKey: string,
  pendingKey: string | undefined,
  executed?: boolean
): string {
  let cls = 'runz-wip-cmd-btn';
  if (pendingKey === btnKey) cls += ' is-pending';
  if (executed) cls += ' is-executed';
  return cls;
}

function wipCmdTitle(base: string, executed: boolean): string {
  return executed ? `${base} (Executado)` : base;
}

export function TerminalWorkspace({
  terminal,
  monorepoRoot,
  active,
  onError,
}: TerminalWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeDebounceRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const [isMounted, setIsMounted] = useState(false);
  const [restartSeed, setRestartSeed] = useState(0);
  const [status, setStatus] = useState<TerminalStatus>('starting');
  const [statusMessage, setStatusMessage] = useState('Preparing shell...');

  // WIP sprint panel state
  const [wipTrack, setWipTrack] = useState<SprintTrack>('filatracker');
  const [wipParsed, setWipParsed] = useState<ParsedSprintStatus | null>(null);
  const [wipStepContext, setWipStepContext] = useState<StoryStepContext>({
    checkpointKeys: new Set(),
    csReviewMarkers: new Map(),
  });
  const [wipError, setWipError] = useState<string | null>(null);
  const [pendingAutoSend, setPendingAutoSend] = useState<{
    key: string;
    timerId: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [copiedStoryKey, setCopiedStoryKey] = useState<string | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  const runtimeTerminalId = useMemo(
    () => `${terminal.id}:session:${restartSeed}`,
    [restartSeed, terminal.id]
  );
  const isClaudeCodexTerminal = terminal.id === 'claude-code' || terminal.id === 'codex';
  const isCursorAgentTerminal = terminal.id === 'cursor-agent';
  const isAgentTerminal = isClaudeCodexTerminal || isCursorAgentTerminal;
  const cmdPrefix = terminal.id === 'codex' ? '$' : '/';
  const wipCmd = useCallback((body: string) => appendWipProductFlag(body, wipTrack), [wipTrack]);

  const injectWipCommandStage = useCallback(
    async (body: string) => {
      if (!startedRef.current) return;
      const fullCmd = `${cmdPrefix}${body}`;
      const xterm = xtermRef.current;
      if (!xterm) return;

      // Codex TUI uses Ctrl+C to quit the session, so prefer its own line-kill binding.
      // Claude/Cursor CLIs have been more reliable with Ctrl+C as a prompt reset signal.
      await runzTerminalWrite(runtimeTerminalId, terminal.id === 'codex' ? '\x15' : '\x03');
      xterm.paste(fullCmd);
      xterm.focus();
    },
    [cmdPrefix, runtimeTerminalId, terminal.id]
  );

  const injectWipCommandExecute = useCallback(async () => {
    if (!startedRef.current) return;
    await runzTerminalWrite(runtimeTerminalId, '\r');
    xtermRef.current?.focus();
  }, [runtimeTerminalId]);

  const handleWipBtnClick = useCallback(
    (btnKey: string, body: string) => {
      if (pendingAutoSend?.key === btnKey) {
        clearTimeout(pendingAutoSend.timerId);
        setPendingAutoSend(null);
        void injectWipCommandExecute();
      } else {
        if (pendingAutoSend) clearTimeout(pendingAutoSend.timerId);
        void injectWipCommandStage(body);
        const timerId = setTimeout(() => setPendingAutoSend(null), 3000);
        setPendingAutoSend({ key: btnKey, timerId });
      }
    },
    [pendingAutoSend, injectWipCommandStage, injectWipCommandExecute]
  );

  const copyStoryTitle = useCallback(async (storyKey: string) => {
    await navigator.clipboard.writeText(storyKey);
    setCopiedStoryKey(storyKey);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = window.setTimeout(() => {
      setCopiedStoryKey((current) => (current === storyKey ? null : current));
      copiedTimerRef.current = null;
    }, 1600);
  }, []);

  const statusLabel = useMemo(() => {
    switch (status) {
      case 'ready':
        return 'Live';
      case 'error':
        return 'Error';
      case 'stopped':
        return 'Stopped';
      default:
        return 'Starting';
    }
  }, [status]);

  // WIP panel derived data
  const wipGrouped = useMemo(() => {
    if (!wipParsed) return [];
    const wip = filterStoriesByEpicOrRetrospectiveNotDone(wipParsed.entries);
    return groupSprintStoriesByEpic(wipParsed.entries, wip);
  }, [wipParsed]);

  const wipProgress = useMemo(() => {
    if (!wipParsed) return { done: 0, total: 0, pct: 0 };
    const done = filterSprintEntries(wipParsed.entries, 'done').length;
    const total = filterSprintEntries(wipParsed.entries, 'all').length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { done, total, pct };
  }, [wipParsed]);

  const syncTerminalSize = useCallback(async () => {
    const xterm = xtermRef.current;
    const fitAddon = fitAddonRef.current;
    const host = containerRef.current;
    if (!xterm || !fitAddon || !host) {
      return;
    }
    if (host.offsetWidth === 0 || host.offsetHeight === 0) {
      return;
    }

    try {
      fitAddon.fit();
      const cols = Math.max(xterm.cols, MIN_TERMINAL_COLS);
      const rows = Math.max(xterm.rows, MIN_TERMINAL_ROWS);
      if (startedRef.current) {
        await invoke('runz_terminal_resize', {
          terminalId: runtimeTerminalId,
          cols,
          rows,
        });
      }
    } catch (error) {
      onError(String(error));
    }
  }, [onError, runtimeTerminalId]);

  const queueTerminalResize = useCallback(
    (immediate = false) => {
      if (resizeDebounceRef.current !== null) {
        window.clearTimeout(resizeDebounceRef.current);
        resizeDebounceRef.current = null;
      }
      if (immediate) {
        void syncTerminalSize();
        return;
      }
      resizeDebounceRef.current = window.setTimeout(() => {
        resizeDebounceRef.current = null;
        void syncTerminalSize();
      }, 80);
    },
    [syncTerminalSize]
  );

  // 2s WIP panel refresh
  useEffect(() => {
    if (!isAgentTerminal || !monorepoRoot) return;

    const refresh = async () => {
      try {
        const text = await runzReadRepoText(monorepoRoot, SPRINT_STATUS_PATHS[wipTrack]);
        const parsed = parseSprintStatusYaml(wipTrack, text);
        setWipParsed(parsed);
        setWipError(null);

        const checkpointKeysList = await runzListCheckpointStoryKeys(monorepoRoot);
        const checkpointKeys = new Set(checkpointKeysList);
        const csReviewMarkers = new Map<string, boolean>();

        const storyLocation = parsed.storyLocation;
        if (storyLocation) {
          const readyStories = filterStoriesByEpicOrRetrospectiveNotDone(parsed.entries).filter(
            (entry) => entry.kind === 'story' && entry.status === 'ready-for-dev'
          );
          await Promise.all(
            readyStories.map(async (entry) => {
              try {
                const storyPath = await runzFindStoryFile(monorepoRoot, storyLocation, entry.key);
                if (!storyPath) return;
                const content = await runzReadRepoText(monorepoRoot, storyPath);
                csReviewMarkers.set(entry.key, hasCsReviewMarkerInText(content));
              } catch {
                // Story file unreadable — treat as no cs-review marker.
              }
            })
          );
        }

        setWipStepContext({ checkpointKeys, csReviewMarkers });
      } catch (e) {
        setWipError(String(e));
      }
    };

    void refresh();
    const id = window.setInterval(refresh, WIP_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [isAgentTerminal, monorepoRoot, wipTrack]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) {
      return;
    }

    const xterm = new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      fontFamily:
        '"SFMono-Regular", "JetBrains Mono", "Fira Code", ui-monospace, Menlo, Consolas, monospace',
      fontSize: 13,
      fontWeight: '500',
      lineHeight: 1.25,
      letterSpacing: 0.2,
      scrollback: 10000,
      theme: TERMINAL_THEME,
    });
    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(host);
    xterm.focus();
    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;
    setIsMounted(true);

    const dataDisposable = xterm.onData((data) => {
      if (!startedRef.current) {
        return;
      }
      void invoke('runz_terminal_write', {
        terminalId: runtimeTerminalId,
        data,
      }).catch((error) => {
        onError(String(error));
      });
    });

    const resizeObserver = new ResizeObserver(() => {
      queueTerminalResize();
    });
    resizeObserver.observe(host);
    resizeObserverRef.current = resizeObserver;

    return () => {
      dataDisposable.dispose();
      resizeObserver.disconnect();
      resizeObserverRef.current = null;
      if (resizeDebounceRef.current !== null) {
        window.clearTimeout(resizeDebounceRef.current);
        resizeDebounceRef.current = null;
      }
      startedRef.current = false;
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [onError, queueTerminalResize, syncTerminalSize, terminal.id]);

  useEffect(() => {
    let cancelled = false;
    let unlistenOutput: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;

    void (async () => {
      const nextUnlistenOutput = await listen<TerminalOutputPayload>(
        'runz-terminal-output',
        (event) => {
          if (event.payload.terminalId !== runtimeTerminalId) {
            return;
          }
          xtermRef.current?.write(event.payload.data);
        }
      );
      if (cancelled) {
        nextUnlistenOutput();
        return;
      }
      unlistenOutput = nextUnlistenOutput;

      const nextUnlistenExit = await listen<TerminalExitPayload>('runz-terminal-exit', (event) => {
        if (event.payload.terminalId !== runtimeTerminalId) {
          return;
        }
        startedRef.current = false;
        setStatus('stopped');
        setStatusMessage(formatExitSummary(event.payload));
      });
      if (cancelled) {
        nextUnlistenExit();
        return;
      }
      unlistenExit = nextUnlistenExit;
    })().catch((error) => {
      if (!cancelled) {
        onError(String(error));
      }
    });

    return () => {
      cancelled = true;
      if (unlistenOutput) {
        unlistenOutput();
      }
      if (unlistenExit) {
        unlistenExit();
      }
    };
  }, [onError, runtimeTerminalId]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const xterm = xtermRef.current;
    const frame = window.requestAnimationFrame(() => {
      queueTerminalResize(true);
      xterm?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [active, queueTerminalResize]);

  useEffect(() => {
    if (!isMounted || !monorepoRoot) {
      return;
    }

    let cancelled = false;

    const bootTerminal = async () => {
      const xterm = xtermRef.current;
      const fitAddon = fitAddonRef.current;
      if (!xterm || !fitAddon) {
        return;
      }

      startedRef.current = false;
      setStatus('starting');
      setStatusMessage(`Opening ${terminal.label}...`);
      onError(null);
      xterm.reset();
      fitAddon.fit();
      xterm.focus();

      const cols = Math.max(xterm.cols, MIN_TERMINAL_COLS);
      const rows = Math.max(xterm.rows, MIN_TERMINAL_ROWS);

      try {
        await invoke('runz_terminal_start', {
          terminalId: runtimeTerminalId,
          cwd: monorepoRoot,
          cols,
          rows,
          execCommand: terminal.launchCommand ?? null,
        });

        if (cancelled) {
          await invoke('runz_terminal_stop', { terminalId: runtimeTerminalId }).catch(
            () => undefined
          );
          return;
        }

        startedRef.current = true;
        setStatus('ready');
        setStatusMessage(`${terminal.label} session live.`);
        queueTerminalResize(true);
      } catch (error) {
        if (cancelled) {
          return;
        }
        startedRef.current = false;
        setStatus('error');
        setStatusMessage(String(error));
        onError(String(error));
      }
    };

    void bootTerminal();

    return () => {
      cancelled = true;
      startedRef.current = false;
      void invoke('runz_terminal_stop', { terminalId: runtimeTerminalId }).catch(() => undefined);
    };
  }, [
    isMounted,
    monorepoRoot,
    onError,
    restartSeed,
    runtimeTerminalId,
    syncTerminalSize,
    queueTerminalResize,
    terminal.label,
    terminal.launchCommand,
  ]);

  return (
    <section className={`runz-terminal-section${active ? '' : ' runz-terminal-hidden'}`}>
      <div className="runz-terminal-toolbar">
        <div className="runz-terminal-title-block">
          <div className="runz-terminal-title-row">
            <h2>{terminal.label}</h2>
            <span className={`runz-terminal-pill runz-terminal-pill-${status}`}>{statusLabel}</span>
          </div>
          <p>{terminal.description}</p>
        </div>
        <div className="runz-terminal-toolbar-actions">
          <button type="button" className="runz-btn" onClick={() => xtermRef.current?.clear()}>
            Clear
          </button>
          <button
            type="button"
            className="runz-btn runz-btn-primary"
            onClick={() => setRestartSeed((value) => value + 1)}
          >
            Restart shell
          </button>
        </div>
      </div>

      <div className="runz-terminal-body">
        {isAgentTerminal ? (
          <aside className="runz-wip-panel">
            <div className="runz-wip-panel-head">
              <div className="runz-wip-track-tabs">
                <button
                  type="button"
                  className={`runz-wip-track-tab${wipTrack === 'filatracker' ? ' is-active' : ''}`}
                  onClick={() => setWipTrack('filatracker')}
                >
                  FilaTracker
                </button>
              </div>
              <div className="runz-wip-progress">
                <div
                  className="runz-wip-progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={wipProgress.pct}
                >
                  <div
                    className="runz-wip-progress-fill"
                    style={{ width: `${wipProgress.pct}%` }}
                  />
                </div>
                <p className="runz-wip-progress-label">
                  {wipProgress.pct}% · {wipProgress.done}/{wipProgress.total} done
                </p>
              </div>
            </div>
            <div className="runz-wip-panel-list">
              {wipError ? (
                <p className="runz-hint" style={{ fontSize: '0.64rem' }}>
                  {wipError}
                </p>
              ) : wipGrouped.length === 0 ? (
                <p className="runz-hint" style={{ fontSize: '0.64rem' }}>
                  No WIP items.
                </p>
              ) : (
                wipGrouped.map((group) => (
                  <div key={group.epicKey} className="runz-wip-epic">
                    <div className="runz-wip-epic-head">
                      <div className="runz-wip-epic-head-copy">
                        <div className="runz-wip-epic-title-row">
                          <span className="runz-wip-epic-label">{group.epicKey}</span>
                          {group.epicStatus ? (
                            <span className={statusClass(group.epicStatus)}>
                              {group.epicStatus}
                            </span>
                          ) : null}
                        </div>
                        <span className="runz-wip-retro-indicator" title="Retrospective status">
                          <span className="runz-wip-retro-label">retro</span>
                          {group.retrospectiveStatus ? (
                            <span className={statusClass(group.retrospectiveStatus)}>
                              {group.retrospectiveStatus}
                            </span>
                          ) : (
                            <span className="runz-wip-retro-missing">missing</span>
                          )}
                        </span>
                      </div>
                      <div className="runz-wip-epic-btns runz-wip-cmd-group runz-wip-cmd-group--epic">
                        <button
                          type="button"
                          className={wipCmdBtnClass(
                            `${group.epicKey}:epic-finish`,
                            pendingAutoSend?.key
                          )}
                          disabled={status !== 'ready'}
                          title={`${cmdPrefix}${wipCmd(`filatracker-epic-finish ${group.epicKey}`)}`}
                          onClick={() =>
                            handleWipBtnClick(
                              `${group.epicKey}:epic-finish`,
                              wipCmd(`filatracker-epic-finish ${group.epicKey}`)
                            )
                          }
                        >
                          1. epic-finish
                        </button>
                        <button
                          type="button"
                          className={wipCmdBtnClass(`${group.epicKey}:retro`, pendingAutoSend?.key)}
                          disabled={status !== 'ready'}
                          title={`${cmdPrefix}${wipCmd(`bmad-retrospective ${group.epicKey}`)}`}
                          onClick={() =>
                            handleWipBtnClick(
                              `${group.epicKey}:retro`,
                              wipCmd(`bmad-retrospective ${group.epicKey}`)
                            )
                          }
                        >
                          2. retro
                        </button>
                      </div>
                    </div>
                    {group.stories.map((entry) => {
                      const steps = deriveStoryStepProgress(
                        entry.key,
                        entry.status,
                        wipStepContext
                      );
                      return (
                        <div key={entry.key} className="runz-wip-story-block">
                          <div className="runz-wip-story">
                            <button
                              type="button"
                              className={`runz-wip-story-title${copiedStoryKey === entry.key ? ' is-copied' : ''}`}
                              title="Copy story name"
                              onClick={() => void copyStoryTitle(entry.key)}
                            >
                              <code>{entry.key}</code>
                              {copiedStoryKey === entry.key ? (
                                <span className="runz-wip-story-copied">Copied!</span>
                              ) : null}
                            </button>
                            <span className={statusClass(entry.status)}>{entry.status}</span>
                          </div>
                          <div className="runz-wip-story-cmds">
                            <div className="runz-wip-story-cmd-row runz-wip-cmd-group runz-wip-cmd-group--plan">
                              <button
                                type="button"
                                className={wipCmdBtnClass(
                                  `${entry.key}:create-story`,
                                  pendingAutoSend?.key,
                                  steps['create-story']
                                )}
                                disabled={status !== 'ready'}
                                title={wipCmdTitle(
                                  `${cmdPrefix}${wipCmd(`bmad-create-story ${entry.key}`)}`,
                                  steps['create-story']
                                )}
                                onClick={() =>
                                  handleWipBtnClick(
                                    `${entry.key}:create-story`,
                                    wipCmd(`bmad-create-story ${entry.key}`)
                                  )
                                }
                              >
                                1. create-story
                              </button>
                              <button
                                type="button"
                                className={wipCmdBtnClass(
                                  `${entry.key}:cs-review`,
                                  pendingAutoSend?.key,
                                  steps['cs-review']
                                )}
                                disabled={status !== 'ready'}
                                title={wipCmdTitle(
                                  `${cmdPrefix}${wipCmd(`bmad-create-story Revisar: ${entry.key}`)}`,
                                  steps['cs-review']
                                )}
                                onClick={() =>
                                  handleWipBtnClick(
                                    `${entry.key}:cs-review`,
                                    wipCmd(`bmad-create-story Revisar: ${entry.key}`)
                                  )
                                }
                              >
                                2. cs review
                              </button>
                            </div>
                            <div className="runz-wip-story-cmd-row runz-wip-cmd-group runz-wip-cmd-group--build">
                              <button
                                type="button"
                                className={wipCmdBtnClass(
                                  `${entry.key}:dev-story`,
                                  pendingAutoSend?.key,
                                  steps['dev-story']
                                )}
                                disabled={status !== 'ready'}
                                title={wipCmdTitle(
                                  `${cmdPrefix}${wipCmd(`bmad-dev-story ${entry.key}`)}`,
                                  steps['dev-story']
                                )}
                                onClick={() =>
                                  handleWipBtnClick(
                                    `${entry.key}:dev-story`,
                                    wipCmd(`bmad-dev-story ${entry.key}`)
                                  )
                                }
                              >
                                3. dev-story
                              </button>
                              <button
                                type="button"
                                className={wipCmdBtnClass(
                                  `${entry.key}:code-review`,
                                  pendingAutoSend?.key,
                                  steps['code-review']
                                )}
                                disabled={status !== 'ready'}
                                title={wipCmdTitle(
                                  `${cmdPrefix}${wipCmd(`bmad-code-review ${entry.key} (Agentes em paralelo estão permitidos de acordo com a instrução do skill)`)}`,
                                  steps['code-review']
                                )}
                                onClick={() =>
                                  handleWipBtnClick(
                                    `${entry.key}:code-review`,
                                    wipCmd(
                                      `bmad-code-review ${entry.key} (Agentes em paralelo estão permitidos de acordo com a instrução do skill)`
                                    )
                                  )
                                }
                              >
                                4. code-review
                              </button>
                            </div>
                            <div className="runz-wip-story-cmd-row runz-wip-cmd-group runz-wip-cmd-group--checkpoint">
                              <button
                                type="button"
                                className={wipCmdBtnClass(
                                  `${entry.key}:checkpoint`,
                                  pendingAutoSend?.key,
                                  steps.preview
                                )}
                                disabled={status !== 'ready'}
                                title={wipCmdTitle(
                                  `${cmdPrefix}${wipCmd(`bmad-checkpoint-preview-story-report ${entry.key}`)}`,
                                  steps.preview
                                )}
                                onClick={() =>
                                  handleWipBtnClick(
                                    `${entry.key}:checkpoint`,
                                    wipCmd(`bmad-checkpoint-preview-story-report ${entry.key}`)
                                  )
                                }
                              >
                                5. preview
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </aside>
        ) : null}

        <div className="runz-terminal-frame">
          <div ref={containerRef} className="runz-terminal-host" />
        </div>
      </div>

      <p className="runz-terminal-status-line">{statusMessage}</p>
    </section>
  );
}
