import { RUNZ_APPS, RUNZ_APP_GROUPS, type RunMode, probeTargets } from '../apps.manifest';
import { StickyLogPre } from '../StickyLogPre';

// ── Compact status bar ────────────────────────────────────────────────────────

function AppStatusBar({
  running,
  modes,
}: {
  running: Record<string, boolean>;
  modes: Record<string, RunMode>;
}) {
  return (
    <div className="runz-apps-status-bar">
      {RUNZ_APP_GROUPS.map((group) => (
        <div key={group.id} className="runz-apps-status-group">
          <span className="runz-apps-status-group-label">{group.label}</span>
          <div className="runz-apps-status-chips">
            {group.appIds.map((appId) => {
              const app = RUNZ_APPS.find((a) => a.id === appId);
              if (!app) return null;
              const isOn = running[appId] ?? false;
              const mode = modes[appId] ?? 'preview';
              return (
                <span key={appId} className={`runz-apps-status-chip${isOn ? ' on' : ''}`}>
                  <span className={`runz-status-dot${isOn ? ' on' : ''}`} />
                  <span className="runz-apps-status-chip-label">{app.label}</span>
                  <span className="runz-apps-status-chip-mode">{mode}</span>
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

type ProbeResult = {
  ok: boolean;
  status: number;
  ms: number;
  error: string | null;
};

type AppsTabProps = {
  monorepoRoot: string;
  active?: boolean;
  globalBusy: boolean;
  modes: Record<string, RunMode>;
  running: Record<string, boolean>;
  busy: Record<string, boolean>;
  probeHint: Record<string, Record<string, ProbeResult | undefined>>;
  logs: Record<string, string[]>;
  onStartAll: () => void;
  onKillAll: () => void;
  onSweepAll: () => void;
  onModeChange: (appId: string, mode: RunMode) => void;
  onStart: (appId: string, pnpmDir: string) => void;
  onStop: (appId: string) => void;
  onKill: (appId: string) => void;
  onSweep: (appId: string) => void;
  onRestart: (appId: string, pnpmDir: string) => void;
  onProbe: (appId: string, label: string, url: string) => void;
  onClearLog: (appId: string) => void;
};

export function AppsTab({
  monorepoRoot,
  active = true,
  globalBusy,
  modes,
  running,
  busy,
  probeHint,
  logs,
  onStartAll,
  onKillAll,
  onSweepAll,
  onModeChange,
  onStart,
  onStop,
  onKill,
  onSweep,
  onRestart,
  onProbe,
  onClearLog,
}: AppsTabProps) {
  return (
    <>
      <section className="runz-global-bar" aria-label="All apps">
        <span className="runz-label">All apps</span>
        <button
          type="button"
          className="runz-btn runz-btn-primary"
          disabled={!monorepoRoot || globalBusy}
          onClick={onStartAll}
        >
          Start all + health
        </button>
        <button
          type="button"
          className="runz-btn runz-btn-danger"
          disabled={globalBusy}
          onClick={onKillAll}
        >
          Kill all + sweep ports
        </button>
        <button
          type="button"
          className="runz-btn"
          disabled={globalBusy}
          onClick={onSweepAll}
          title="SIGKILL listeners on known dev/preview ports (macOS/Linux: lsof; Windows: PowerShell)"
        >
          Sweep all ports
        </button>
        <span className="runz-hint" style={{ margin: 0, flex: '1 1 200px' }}>
          Kill uses tracked groups plus <code>lsof</code> (Unix) / PowerShell (Windows) on each app
          port. May kill any listener on those ports, not only Scientia Vis.
        </span>
      </section>

      <AppStatusBar running={running} modes={modes} />

      <div className="runz-grid">
        {RUNZ_APPS.map((app) => {
          const mode = modes[app.id] ?? 'preview';
          const isOn = running[app.id] ?? false;
          const isBusy = busy[app.id] ?? false;
          const targets = probeTargets(app, mode);
          const hints = probeHint[app.id] ?? {};
          return (
            <article key={app.id} className={`runz-card${isOn ? ' running' : ''}`}>
              <div className="runz-card-head">
                <div className="runz-card-title">
                  <span className={`runz-status-dot${isOn ? ' on' : ''}`} />
                  <h2>{app.label}</h2>
                </div>
                <div className="runz-mode">
                  <span>Mode</span>
                  <select
                    value={mode}
                    disabled={isOn || isBusy || globalBusy}
                    onChange={(event) => onModeChange(app.id, event.target.value as RunMode)}
                  >
                    <option value="preview">preview</option>
                    <option value="dev">dev</option>
                  </select>
                </div>
              </div>
              <div className="runz-card-actions">
                <button
                  type="button"
                  className="runz-btn runz-btn-primary"
                  disabled={!monorepoRoot || isOn || isBusy || globalBusy}
                  onClick={() => onStart(app.id, app.pnpmDir)}
                >
                  Start
                </button>
                <button
                  type="button"
                  className="runz-btn runz-btn-danger"
                  disabled={!isOn || isBusy || globalBusy}
                  onClick={() => onStop(app.id)}
                >
                  Stop
                </button>
                <button
                  type="button"
                  className="runz-btn runz-btn-danger"
                  title="Kill Runz-tracked group, then SIGKILL anything listening on this app’s dev/preview ports"
                  disabled={isBusy || globalBusy}
                  onClick={() => onKill(app.id)}
                >
                  Kill + sweep ports
                </button>
                <button
                  type="button"
                  className="runz-btn"
                  title="Only kill listeners on this app’s ports (does not touch Runz registry)"
                  disabled={isBusy || globalBusy}
                  onClick={() => onSweep(app.id)}
                >
                  Sweep ports
                </button>
                <button
                  type="button"
                  className="runz-btn"
                  disabled={!monorepoRoot || isBusy || globalBusy}
                  onClick={() => onRestart(app.id, app.pnpmDir)}
                >
                  Restart
                </button>
              </div>
              <div className="runz-probes">
                <div className="runz-probes-title">Health checks</div>
                {targets.map((target) => {
                  const hint = hints[target.label];
                  const dotClassName =
                    hint === undefined ? 'runz-dot' : hint.ok ? 'runz-dot ok' : 'runz-dot fail';
                  return (
                    <div key={target.label} className="runz-probe-row">
                      <span className={dotClassName} title={hint?.error ?? ''} />
                      <button
                        type="button"
                        className="runz-btn runz-probe-test"
                        onClick={() => onProbe(app.id, target.label, target.url)}
                      >
                        Test
                      </button>
                      <code>{target.url}</code>
                      <span className="runz-probe-result">
                        {hint
                          ? `${hint.ok ? 'OK' : 'FAIL'} · HTTP ${hint.status} · ${hint.ms}ms${
                              hint.error ? ` · ${hint.error}` : ''
                            }`
                          : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="runz-log-bar">
                <span className="runz-log-title">Logs</span>
                <button
                  type="button"
                  className="runz-btn runz-btn-xs"
                  onClick={() => onClearLog(app.id)}
                >
                  Clear
                </button>
              </div>
              <StickyLogPre
                className="runz-log"
                lines={logs[app.id] ?? []}
                active={active}
              />
            </article>
          );
        })}
      </div>
    </>
  );
}
