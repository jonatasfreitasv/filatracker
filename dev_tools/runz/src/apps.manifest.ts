/** Canonical list of FilaTracker local servers, ports, and health probes. */

export type RunMode = 'dev' | 'preview';

export interface RunzProbeDef {
  /** Path only, e.g. `/` */
  path: string;
  label: string;
}

export interface RunzAppDef {
  id: string;
  label: string;
  pnpmDir: string;
  ports: { dev: number; preview: number };
  probes: RunzProbeDef[];
}

/** UI grouping — every `appIds` entry must exist in `RUNZ_APPS`. */
export const RUNZ_APP_GROUPS: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly appIds: readonly string[];
}> = [
  {
    id: 'product',
    label: 'FilaTracker',
    appIds: ['web'],
  },
];

export const RUNZ_APPS: RunzAppDef[] = [
  {
    id: 'web',
    label: 'Web + Ingest',
    pnpmDir: '.',
    ports: { dev: 5173, preview: 4173 },
    probes: [{ path: '/', label: 'GET /' }],
  },
];

const BASE = 'http://127.0.0.1';

export function probeTargets(app: RunzAppDef, mode: RunMode): { label: string; url: string }[] {
  const port = app.ports[mode];
  return app.probes.map((p) => ({
    label: p.label,
    url: `${BASE}:${port}${p.path}`,
  }));
}

/** Distinct TCP ports this app may use (dev vs preview). */
export function uniquePortsForApp(app: RunzAppDef): number[] {
  const d = app.ports.dev;
  const p = app.ports.preview;
  return d === p ? [d] : [d, p];
}

/** Union of all known app listen ports — keep in sync with `src-tauri/src/port_sweep.rs` `EXIT_SWEEP_PORTS`. */
export function allRunzListenPorts(): number[] {
  const s = new Set<number>();
  for (const a of RUNZ_APPS) {
    for (const n of uniquePortsForApp(a)) {
      s.add(n);
    }
  }
  return [...s].sort((a, b) => a - b);
}

export function scriptForMode(mode: RunMode): string {
  return mode === 'dev' ? 'dev' : 'preview';
}
