import { RUNZ_APPS } from './apps.manifest';

export type EnvSetupStepId = 'dev-vars' | 'migrations' | 'cf-typegen';

export type EnvSetupItemStatus = 'ready' | 'warn' | 'pending' | 'block';

export interface RunzEnvSetupFileCopyTarget {
  id: string;
  label: string;
  examplePath: string;
  targetPath: string;
}

export interface RunzEnvSetupDevVarsTarget extends RunzEnvSetupFileCopyTarget {
  appId: string;
}

export interface RunzEnvSetupCfTypegenTarget {
  id: string;
  appId: string;
  label: string;
  pnpmDir: string;
  /** Generated locally by `pnpm run cf-typegen`. */
  outputPath: string;
}

export interface RunzEnvSetupStepDef {
  id: EnvSetupStepId;
  label: string;
  summary: string;
}

function appLabel(appId: string): string {
  const app = RUNZ_APPS.find((candidate) => candidate.id === appId);
  if (!app) {
    throw new Error(`Unknown Runz app id: ${appId}`);
  }
  return app.label;
}

/** Project root `.dev.vars` from `.dev.vars.example`. */
export const RUNZ_ENV_SETUP_DEV_VARS: ReadonlyArray<RunzEnvSetupDevVarsTarget> = [
  {
    id: 'env-setup-dev-vars-web',
    appId: 'web',
    label: appLabel('web'),
    examplePath: '.dev.vars.example',
    targetPath: '.dev.vars',
  },
];

/** Cloudflare types generated at the project root. */
export const RUNZ_ENV_SETUP_CF_TYPEGEN: ReadonlyArray<RunzEnvSetupCfTypegenTarget> = [
  {
    id: 'env-setup-cf-typegen-web',
    appId: 'web',
    label: appLabel('web'),
    pnpmDir: '.',
    outputPath: 'worker-configuration.d.ts',
  },
];

export const RUNZ_ENV_SETUP_STEPS: ReadonlyArray<RunzEnvSetupStepDef> = [
  {
    id: 'dev-vars',
    label: 'Copy .dev.vars',
    summary: 'Copy .dev.vars.example → .dev.vars (RPC capability secret for local web).',
  },
  {
    id: 'migrations',
    label: 'Local D1 migrations',
    summary: 'pnpm run db:migrate:local — apply migrations to filatracker-local.',
  },
  {
    id: 'cf-typegen',
    label: 'Cloudflare typegen',
    summary: 'pnpm run cf-typegen — regenerate worker-configuration.d.ts.',
  },
];

export const RUNZ_ENV_SETUP_JOB_IDS = {
  migrations: 'env-setup-migrations',
  cfTypegen: 'env-setup-cf-typegen',
} as const;
