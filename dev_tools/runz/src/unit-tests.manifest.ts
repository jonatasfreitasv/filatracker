export interface RunzUnitTestDef {
  id: string;
  label: string;
  /** Empty string = root `pnpm run <script>`; otherwise `pnpm -C <dir> run <script>`. */
  pnpmDir: string;
  script: string;
  heavy?: boolean;
  summary?: string;
  envVars?: ReadonlyArray<{ name: string; value: string }>;
}

export const RUNZ_UNIT_TESTS: RunzUnitTestDef[] = [
  {
    id: 'test-all',
    label: 'All tests',
    pnpmDir: '.',
    script: 'test',
    summary: 'vitest run across unit / workers / e2e projects',
  },
  {
    id: 'test-homologation',
    label: 'Homologation',
    pnpmDir: '.',
    script: 'test:homologation',
    summary: 'Store adapter homologation suite (fixtures + policy)',
  },
  {
    id: 'test-probe-closin',
    label: 'Closin probe (live)',
    pnpmDir: '.',
    script: 'probe:closin',
    heavy: true,
    summary: 'Bounded live Closin probe — requires network',
  },
  {
    id: 'test-runz',
    label: 'Runz',
    pnpmDir: 'dev_tools/runz',
    script: 'test',
    summary: 'Runz Vitest suite',
  },
];

/** Root full test — same script as Quality tab `quality-test`, surfaced on Tests tab. */
export const RUNZ_TURBO_TEST = {
  id: 'test-root',
  label: 'Test (root)',
  npmScript: 'test',
  command: 'pnpm run test',
  summary: 'Full vitest run — can take a minute.',
} as const;

export const RUNZ_UNIT_TEST_JOB_IDS: readonly string[] = [
  ...RUNZ_UNIT_TESTS.map((target) => target.id),
  RUNZ_TURBO_TEST.id,
];
