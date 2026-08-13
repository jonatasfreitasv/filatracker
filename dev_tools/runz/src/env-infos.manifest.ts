import { RUNZ_APPS, type RunzAppDef } from './apps.manifest';

export type RunzEnvFileKind =
  | 'workspace'
  | 'env'
  | 'env-example'
  | 'types'
  | 'wrangler'
  | 'directory';

export interface RunzEnvFileSpec {
  path: string;
  label: string;
  kind: RunzEnvFileKind;
  required: boolean;
}

export interface RunzEnvCompanionAppSpec {
  appId: string;
  label: string;
  reason: string;
}

export interface RunzEnvInfoAppSpec {
  appId: string;
  label: string;
  packageJsonPath: string;
  wranglerPath?: string;
  previewRequiresPlaceholderCheck?: boolean;
  fileChecks: RunzEnvFileSpec[];
  companions?: RunzEnvCompanionAppSpec[];
  notes?: string[];
  manualWarnings?: string[];
}

export const RUNZ_ENV_INFO_ROOT_FILES: ReadonlyArray<RunzEnvFileSpec> = [
  {
    path: 'pnpm-workspace.yaml',
    label: 'Workspace manifest',
    kind: 'workspace',
    required: true,
  },
  {
    path: '.wrangler',
    label: 'Local wrangler state',
    kind: 'directory',
    required: false,
  },
];

function appById(appId: string): RunzAppDef {
  const app = RUNZ_APPS.find((candidate) => candidate.id === appId);
  if (!app) {
    throw new Error(`Unknown Runz app id: ${appId}`);
  }
  return app;
}

export const RUNZ_ENV_INFO_APPS: ReadonlyArray<RunzEnvInfoAppSpec> = [
  {
    appId: 'web',
    label: appById('web').label,
    packageJsonPath: 'package.json',
    wranglerPath: 'wrangler.web.jsonc',
    previewRequiresPlaceholderCheck: false,
    fileChecks: [
      {
        path: '.dev.vars',
        label: '.dev.vars',
        kind: 'env',
        required: false,
      },
      {
        path: '.dev.vars.example',
        label: '.dev.vars.example',
        kind: 'env-example',
        required: true,
      },
      {
        path: 'worker-configuration.d.ts',
        label: 'worker-configuration.d.ts',
        kind: 'types',
        required: true,
      },
      {
        path: 'wrangler.web.jsonc',
        label: 'wrangler.web.jsonc',
        kind: 'wrangler',
        required: true,
      },
      {
        path: 'wrangler.ingest.jsonc',
        label: 'wrangler.ingest.jsonc',
        kind: 'wrangler',
        required: true,
      },
    ],
    notes: [
      'pnpm run dev starts web + ingest together via @cloudflare/vite-plugin auxiliaryWorkers.',
      'D1 lives only on ingest (wrangler.ingest.jsonc → filatracker-local).',
    ],
  },
];

export function evaluatePlaceholderText(_content: string): string[] {
  return [];
}

export function extractEnvNamesFromExample(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('=')[0]?.trim() ?? '')
    .filter(Boolean);
}

export function extractEnvNamesFromTypes(_content: string): string[] {
  return [];
}

export function extractInspectorPort(_content: string): number | null {
  return null;
}

export function extractPackageScript(packageJson: string, scriptName: string): string | null {
  try {
    const parsed = JSON.parse(packageJson) as { scripts?: Record<string, string> };
    return parsed.scripts?.[scriptName] ?? null;
  } catch {
    return null;
  }
}

export function extractScriptPort(script: string | null): number | null {
  if (!script) return null;
  const match = script.match(/--port[=\s]+(\d+)/);
  return match ? Number(match[1]) : null;
}

export function scriptUsesPersistedState(script: string | null): boolean {
  if (!script) return false;
  return script.includes('persist') || script.includes('wrangler');
}
