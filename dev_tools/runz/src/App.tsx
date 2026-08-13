import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { openPath } from '@tauri-apps/plugin-opener';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import {
  allRunzListenPorts,
  probeTargets,
  RUNZ_APPS,
  scriptForMode,
  uniquePortsForApp,
  type RunMode,
} from './apps.manifest';
import {
  evaluatePlaceholderText,
  extractEnvNamesFromExample,
  extractEnvNamesFromTypes,
  extractInspectorPort,
  extractPackageScript,
  extractScriptPort,
  RUNZ_ENV_INFO_APPS,
  RUNZ_ENV_INFO_ROOT_FILES,
} from './env-infos.manifest';
import {
  RUNZ_ENV_SETUP_CF_TYPEGEN,
  RUNZ_ENV_SETUP_DEV_VARS,
  RUNZ_ENV_SETUP_JOB_IDS,
  RUNZ_ENV_SETUP_STEPS,
  type EnvSetupStepId,
} from './env-setup.manifest';
import {
  evaluateCfTypegenSetupStatus,
  evaluateDevVarsSetupStatus,
  evaluateMigrationsSetupStatus,
  isEnvSetupStepDone,
  type EnvSetupStepStatus,
} from './env-setup-status';
import { migrationsForTier, RUNZ_MIGRATIONS, type MigrationTier, type RunzMigrationDef } from './migrations.manifest';
import { summarizeRunOutcome, type ProcessExitPayload, type RunOutcome } from './run-result';
import {
  runzCheckMigrationTarget,
  runzCopyRepoFile,
  runzGetRuntimeVersions,
  runzReadRepoText,
  runzRepoPathStat,
  type RunzMigrationPrecheck,
} from './runz-tauri';
import { sanitizeTerminalLogLine } from './terminal-log';
import { RUNZ_TERMINALS, type RunzTerminalId } from './runz-terminals';
import { RUNZ_TURBO_TEST, RUNZ_UNIT_TESTS, type RunzUnitTestDef } from './unit-tests.manifest';
import { RUNZ_QUALITY_JOBS, type RunzQualityJobDef } from './quality.manifest';
import { TerminalWorkspace } from './TerminalWorkspace';
import { AppsTab } from './tabs/AppsTab';
import { DataTab } from './tabs/DataTab';
import {
  EnvInfosTab,
  type EnvInfoAppCard,
  type EnvInfoCheckRow,
  type EnvInfoOverview,
  type EnvInfoStatus,
} from './tabs/EnvInfosTab';
import { EnvSetupTab } from './tabs/EnvSetupTab';
import { MdViewerTab } from './tabs/MdViewerTab';
import { MigrationsTab } from './tabs/MigrationsTab';
import { QualityTab } from './tabs/QualityTab';
import { SprintTab } from './tabs/SprintTab';
import { TestsTab } from './tabs/TestsTab';

const MAX_LOG_LINES = 2500;
const IDLE_OUTCOME: RunOutcome = { status: 'idle', detail: null, exitCode: null };
const EMPTY_OVERVIEW: EnvInfoOverview = {
  status: 'warn',
  readyCount: 0,
  warningCount: 0,
  blockedCount: 0,
};

type RunzSettings = { monorepoRoot: string | null };
type RunzTab =
  | 'settings'
  | 'env-setup'
  | 'env-infos'
  | 'apps'
  | 'migrations'
  | 'tests'
  | 'quality'
  | 'sprint'
  | 'md-viewer'
  | 'data'
  | RunzTerminalId;
type ProbeResult = { ok: boolean; status: number; ms: number; error: string | null };
type SweepOutcome = { killedPids: number[]; errors: string[] };
type KillAppOutcome = { trackedKilled: boolean; sweep: SweepOutcome };
type StopAllOutcome = { trackedKilled: number; sweep: SweepOutcome };

function trimLines(lines: string[]): string[] {
  return lines.length > MAX_LOG_LINES ? lines.slice(-MAX_LOG_LINES) : lines;
}

function appendLog(
  previous: Record<string, string[]>,
  id: string,
  line: string
): Record<string, string[]> {
  return { ...previous, [id]: trimLines([...(previous[id] ?? []), line]) };
}

function statusFor(rows: EnvInfoCheckRow[]): EnvInfoStatus {
  if (rows.some((row) => row.status === 'block')) return 'block';
  if (rows.some((row) => row.status === 'warn')) return 'warn';
  return 'ready';
}

function overviewFor(cards: EnvInfoAppCard[]): EnvInfoOverview {
  const readyCount = cards.filter((card) => card.status === 'ready').length;
  const warningCount = cards.filter((card) => card.status === 'warn').length;
  const blockedCount = cards.filter((card) => card.status === 'block').length;
  return {
    status: blockedCount ? 'block' : warningCount ? 'warn' : 'ready',
    readyCount,
    warningCount,
    blockedCount,
  };
}

function exitMessage(payload: ProcessExitPayload): string {
  if (payload.success) return `[runz] process finished${payload.code === null ? '' : ` (code ${payload.code})`}`;
  return `[runz] process failed${payload.code === null ? '' : ` (code ${payload.code})`}`;
}

export default function App() {
  const [settings, setSettings] = useState<RunzSettings | null>(null);
  const [rootInput, setRootInput] = useState('');
  const [activeTab, setActiveTab] = useState<RunzTab>('settings');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [globalBusy, setGlobalBusy] = useState(false);
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [modes, setModes] = useState<Record<string, RunMode>>(() =>
    Object.fromEntries(RUNZ_APPS.map((app) => [app.id, 'dev' as RunMode]))
  );
  const [probeHint, setProbeHint] = useState<Record<string, Record<string, ProbeResult | undefined>>>({});
  const [migrationTier, setMigrationTier] = useState<MigrationTier>('local');
  const [migrationBatchBusy, setMigrationBatchBusy] = useState(false);
  const [migrationLogs, setMigrationLogs] = useState<string[]>([]);
  const [migrationOutcomes, setMigrationOutcomes] = useState<Record<string, RunOutcome>>({});
  const [migrationPrechecks, setMigrationPrechecks] = useState<Record<string, RunzMigrationPrecheck | undefined>>({});
  const [unitTestBatchBusy, setUnitTestBatchBusy] = useState(false);
  const [unitTestLogs, setUnitTestLogs] = useState<string[]>([]);
  const [unitTestOutcomes, setUnitTestOutcomes] = useState<Record<string, RunOutcome>>({});
  const [qualityBatchBusy, setQualityBatchBusy] = useState(false);
  const [qualityLogs, setQualityLogs] = useState<string[]>([]);
  const [qualityOutcomes, setQualityOutcomes] = useState<Record<string, RunOutcome>>({});
  const [envScanning, setEnvScanning] = useState(false);
  const [envRuntimeChecks, setEnvRuntimeChecks] = useState<EnvInfoCheckRow[]>([]);
  const [envRootChecks, setEnvRootChecks] = useState<EnvInfoCheckRow[]>([]);
  const [envAppCards, setEnvAppCards] = useState<EnvInfoAppCard[]>([]);
  const [envOverview, setEnvOverview] = useState<EnvInfoOverview>(EMPTY_OVERVIEW);
  const [setupScanning, setSetupScanning] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [selectedSteps, setSelectedSteps] = useState<Record<EnvSetupStepId, boolean>>(() =>
    Object.fromEntries(RUNZ_ENV_SETUP_STEPS.map((step) => [step.id, true])) as Record<EnvSetupStepId, boolean>
  );
  const [stepStatuses, setStepStatuses] = useState<Partial<Record<EnvSetupStepId, EnvSetupStepStatus>>>({});
  const [setupLogs, setSetupLogs] = useState<string[]>([]);
  const [visitedTerminals, setVisitedTerminals] = useState<RunzTerminalId[]>([]);

  const migrationLogRef = useRef<HTMLPreElement | null>(null);
  const unitTestLogRef = useRef<HTMLPreElement | null>(null);
  const qualityLogRef = useRef<HTMLPreElement | null>(null);
  const setupLogRef = useRef<HTMLPreElement | null>(null);
  const stopRequestedRef = useRef<Record<string, boolean>>({});
  const targetLogsRef = useRef<Record<string, string[]>>({});

  const monorepoRoot = settings?.monorepoRoot ?? '';
  const terminalTabActive = RUNZ_TERMINALS.some((terminal) => terminal.id === activeTab);
  const tierTargets = useMemo(() => migrationsForTier(migrationTier), [migrationTier]);
  const jobIds = useMemo(
    () => new Set([...RUNZ_MIGRATIONS.map((job) => job.id), ...RUNZ_UNIT_TESTS.map((job) => job.id), RUNZ_TURBO_TEST.id, ...RUNZ_QUALITY_JOBS.map((job) => job.id), ...Object.values(RUNZ_ENV_SETUP_JOB_IDS)]),
    []
  );

  const loadSettings = useCallback(async () => {
    const next = await invoke<RunzSettings>('runz_get_settings');
    setSettings(next);
    setRootInput(next.monorepoRoot ?? '');
    setActiveTab(next.monorepoRoot ? 'apps' : 'settings');
  }, []);

  const refreshRunning = useCallback(async () => {
    const ids = [...RUNZ_APPS.map((app) => app.id), ...jobIds];
    const checks = await Promise.all(ids.map(async (id) => [id, await invoke<boolean>('runz_is_running', { appId: id })] as const));
    setRunning(Object.fromEntries(checks));
  }, [jobIds]);

  const refreshPrechecks = useCallback(async () => {
    if (!monorepoRoot) return setMigrationPrechecks({});
    const checks = await Promise.all(
      tierTargets.map(async (target) => {
        try {
          return [target.id, await runzCheckMigrationTarget(monorepoRoot, target.npmScript, target.wranglerPath)] as const;
        } catch (reason) {
          return [target.id, { ok: false, scriptExists: false, scriptCommand: null, placeholderCheckPassed: false, blockingReasons: [String(reason)], warnings: [] }] as const;
        }
      })
    );
    setMigrationPrechecks(Object.fromEntries(checks));
  }, [monorepoRoot, tierTargets]);

  const refreshEnvInfos = useCallback(async () => {
    if (!monorepoRoot) {
      setEnvRuntimeChecks([]); setEnvRootChecks([]); setEnvAppCards([]); setEnvOverview(EMPTY_OVERVIEW);
      return;
    }
    setEnvScanning(true);
    try {
      const versions = await runzGetRuntimeVersions();
      const runtime: EnvInfoCheckRow[] = [
        { label: 'Node runtime', status: versions.nodeVersion ? 'ready' : 'block', detail: versions.nodeVersion ? `Installed ${versions.nodeVersion}` : 'Could not resolve node --version.', secondary: versions.nodeError ?? undefined },
        { label: 'pnpm runtime', status: versions.pnpmVersion ? 'ready' : 'block', detail: versions.pnpmVersion ? `Installed ${versions.pnpmVersion}` : 'Could not resolve pnpm --version.', secondary: versions.pnpmError ?? undefined },
      ];
      const rootChecks = await Promise.all(RUNZ_ENV_INFO_ROOT_FILES.map(async (file) => {
        const stat = await runzRepoPathStat(monorepoRoot, file.path);
        return { label: file.label, status: stat.exists ? 'ready' : file.required ? 'block' : 'warn', detail: stat.exists ? `${file.path} is present.` : `${file.path} is missing.` } satisfies EnvInfoCheckRow;
      }));
      const cards = await Promise.all(RUNZ_ENV_INFO_APPS.map(async (spec) => {
        const packageJson = await runzReadRepoText(monorepoRoot, spec.packageJsonPath);
        const devScript = extractPackageScript(packageJson, 'dev');
        const previewScript = extractPackageScript(packageJson, 'preview');
        const rows: EnvInfoCheckRow[] = [{ label: 'Scripts', status: devScript && previewScript ? 'ready' : 'block', detail: devScript && previewScript ? 'Both dev and preview scripts are declared.' : 'Missing dev or preview script.' }];
        let envNames: string[] = [];
        let typeNames: string[] = [];
        for (const file of spec.fileChecks) {
          const stat = await runzRepoPathStat(monorepoRoot, file.path);
          rows.push({ label: file.label, status: stat.exists ? 'ready' : file.required ? 'block' : 'warn', detail: stat.exists ? `${file.path} is present.` : `${file.path} is missing.` });
          if (!stat.exists || !stat.isFile) continue;
          const text = await runzReadRepoText(monorepoRoot, file.path);
          if (file.kind === 'env-example') envNames = extractEnvNamesFromExample(text);
          if (file.kind === 'types') typeNames = extractEnvNamesFromTypes(text);
          if (file.kind === 'wrangler' && spec.previewRequiresPlaceholderCheck) {
            const reasons = evaluatePlaceholderText(text);
            rows.push({ label: 'Preview placeholder gate', status: reasons.length === 0 ? 'ready' : 'block', detail: reasons.length === 0 ? 'No placeholder bindings were found.' : reasons.join(', ') });
          }
        }
        const status = statusFor(rows);
        return { appId: spec.appId, label: spec.label, status, summary: status === 'ready' ? 'Ready for local validation.' : status === 'warn' ? 'Usable with warnings.' : 'Blocked until highlighted issues are resolved.', devScript, previewScript, devPort: extractScriptPort(devScript ?? ''), previewPort: extractScriptPort(previewScript ?? ''), inspectorPort: extractInspectorPort(previewScript ?? devScript ?? ''), envNames, typeNames, checkRows: rows, notes: [...(spec.notes ?? []), ...(spec.manualWarnings ?? [])] } satisfies EnvInfoAppCard;
      }));
      setEnvRuntimeChecks(runtime); setEnvRootChecks(rootChecks); setEnvAppCards(cards); setEnvOverview(overviewFor(cards));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setEnvScanning(false);
    }
  }, [monorepoRoot]);

  const refreshSetupStatus = useCallback(async () => {
    if (!monorepoRoot) return setStepStatuses({});
    setSetupScanning(true);
    try {
      const [devVars, migrations, cfTypegen] = await Promise.all([
        evaluateDevVarsSetupStatus(monorepoRoot, RUNZ_ENV_SETUP_DEV_VARS),
        evaluateMigrationsSetupStatus(monorepoRoot, migrationsForTier('local')),
        evaluateCfTypegenSetupStatus(monorepoRoot, RUNZ_ENV_SETUP_CF_TYPEGEN),
      ]);
      setStepStatuses({ 'dev-vars': devVars, migrations, 'cf-typegen': cfTypegen });
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSetupScanning(false);
    }
  }, [monorepoRoot]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { void refreshRunning(); }, [refreshRunning]);
  useEffect(() => { void refreshPrechecks(); }, [refreshPrechecks]);
  useEffect(() => { void refreshEnvInfos(); void refreshSetupStatus(); }, [refreshEnvInfos, refreshSetupStatus]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const terminal = RUNZ_TERMINALS.find((entry) => entry.id === activeTab);
    if (terminal) setVisitedTerminals((current) => current.includes(terminal.id) ? current : [...current, terminal.id]);
  }, [activeTab]);
  useEffect(() => {
    document.body.classList.toggle('runz-body-terminal-mode', terminalTabActive);
    return () => document.body.classList.remove('runz-body-terminal-mode');
  }, [terminalTabActive]);

  useEffect(() => {
    const unsubs: UnlistenFn[] = [];
    let cancelled = false;
    void (async () => {
      const onLog = await listen<{ appId: string; stream: string; line: string }>('runz-log-line', ({ payload }) => {
        if (cancelled) return;
        const line = `[${payload.stream}] ${sanitizeTerminalLogLine(payload.line)}`;
        targetLogsRef.current[payload.appId] = trimLines([...(targetLogsRef.current[payload.appId] ?? []), line]);
        if (RUNZ_APPS.some((app) => app.id === payload.appId)) setLogs((current) => appendLog(current, payload.appId, line));
        else if (RUNZ_MIGRATIONS.some((job) => job.id === payload.appId)) setMigrationLogs((current) => trimLines([...current, `[${payload.appId}] ${line}`]));
        else if (RUNZ_UNIT_TESTS.some((job) => job.id === payload.appId) || payload.appId === RUNZ_TURBO_TEST.id) setUnitTestLogs((current) => trimLines([...current, `[${payload.appId}] ${line}`]));
        else if (RUNZ_QUALITY_JOBS.some((job) => job.id === payload.appId)) setQualityLogs((current) => trimLines([...current, `[${payload.appId}] ${line}`]));
        else if (Object.values(RUNZ_ENV_SETUP_JOB_IDS).includes(payload.appId as never)) setSetupLogs((current) => trimLines([...current, `[${payload.appId}] ${line}`]));
      });
      const onExit = await listen<ProcessExitPayload>('runz-process-exit', ({ payload }) => {
        if (cancelled) return;
        const outcome = summarizeRunOutcome(payload, targetLogsRef.current[payload.appId] ?? [], stopRequestedRef.current[payload.appId] ?? false);
        stopRequestedRef.current[payload.appId] = false;
        setRunning((current) => ({ ...current, [payload.appId]: false }));
        if (RUNZ_APPS.some((app) => app.id === payload.appId)) setLogs((current) => appendLog(current, payload.appId, exitMessage(payload)));
        else if (RUNZ_MIGRATIONS.some((job) => job.id === payload.appId)) { setMigrationOutcomes((current) => ({ ...current, [payload.appId]: outcome })); setMigrationLogs((current) => trimLines([...current, `[${payload.appId}] ${exitMessage(payload)}`])); }
        else if (RUNZ_UNIT_TESTS.some((job) => job.id === payload.appId) || payload.appId === RUNZ_TURBO_TEST.id) { setUnitTestOutcomes((current) => ({ ...current, [payload.appId]: outcome })); setUnitTestLogs((current) => trimLines([...current, `[${payload.appId}] ${exitMessage(payload)}`])); }
        else if (RUNZ_QUALITY_JOBS.some((job) => job.id === payload.appId)) { setQualityOutcomes((current) => ({ ...current, [payload.appId]: outcome })); setQualityLogs((current) => trimLines([...current, `[${payload.appId}] ${exitMessage(payload)}`])); }
      });
      unsubs.push(onLog, onExit);
    })();
    return () => { cancelled = true; unsubs.forEach((unlisten) => unlisten()); };
  }, []);

  const saveRoot = async () => {
    try {
      const next = await invoke<RunzSettings>('runz_set_monorepo_root', { path: rootInput.trim() });
      setSettings(next);
      setActiveTab(next.monorepoRoot ? 'apps' : 'settings');
    } catch (reason) { setError(String(reason)); }
  };
  const detectRoot = async () => {
    try {
      const path = await invoke<string | null>('runz_detect_monorepo_root');
      if (!path) throw new Error('Could not find project root from the current working directory.');
      setRootInput(path);
      const next = await invoke<RunzSettings>('runz_set_monorepo_root', { path });
      setSettings(next); setActiveTab('apps');
    } catch (reason) { setError(String(reason)); }
  };

  const spawnApp = async (appId: string, pnpmDir: string) => {
    if (!monorepoRoot) return;
    const script = scriptForMode(modes[appId] ?? 'dev');
    await invoke('runz_spawn', { monorepoRoot, appId, pnpmDir, script });
    setRunning((current) => ({ ...current, [appId]: true }));
    setLogs((current) => appendLog(current, appId, `[runz] started: pnpm -C ${pnpmDir} run ${script}`));
  };
  const startApp = async (appId: string, pnpmDir: string) => {
    setBusy((current) => ({ ...current, [appId]: true }));
    try { await spawnApp(appId, pnpmDir); } catch (reason) { setError(String(reason)); }
    finally { setBusy((current) => ({ ...current, [appId]: false })); }
  };
  const stopJob = async (id: string) => {
    stopRequestedRef.current[id] = true;
    await invoke('runz_stop', { appId: id });
    setRunning((current) => ({ ...current, [id]: false }));
  };
  const stopApp = async (id: string) => {
    setBusy((current) => ({ ...current, [id]: true }));
    try { await stopJob(id); setLogs((current) => appendLog(current, id, '[runz] stop requested')); } catch (reason) { setError(String(reason)); }
    finally { setBusy((current) => ({ ...current, [id]: false })); }
  };
  const sweep = async (ports: number[]) => invoke<SweepOutcome>('runz_sweep_ports', { ports });
  const killApp = async (id: string) => {
    const app = RUNZ_APPS.find((entry) => entry.id === id);
    if (!app) return;
    setBusy((current) => ({ ...current, [id]: true }));
    try {
      const result = await invoke<KillAppOutcome>('runz_kill_app', { appId: id, sweepPorts: uniquePortsForApp(app) });
      setRunning((current) => ({ ...current, [id]: false }));
      setLogs((current) => appendLog(current, id, `[runz] killed=${result.trackedKilled}; swept ${result.sweep.killedPids.length} listener(s)`));
    } catch (reason) { setError(String(reason)); }
    finally { setBusy((current) => ({ ...current, [id]: false })); }
  };
  const sweepApp = async (id: string) => {
    const app = RUNZ_APPS.find((entry) => entry.id === id);
    if (!app) return;
    setBusy((current) => ({ ...current, [id]: true }));
    try { const result = await sweep(uniquePortsForApp(app)); setLogs((current) => appendLog(current, id, `[runz] swept ${result.killedPids.length} listener(s)`)); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy((current) => ({ ...current, [id]: false })); }
  };
  const probe = async (appId: string, label: string, url: string) => {
    try {
      const result = await invoke<ProbeResult>('runz_probe', { url });
      setProbeHint((current) => ({ ...current, [appId]: { ...current[appId], [label]: result } }));
    } catch (reason) {
      setProbeHint((current) => ({ ...current, [appId]: { ...current[appId], [label]: { ok: false, status: 0, ms: 0, error: String(reason) } } }));
    }
  };
  const startAll = async () => {
    if (!monorepoRoot) return;
    setGlobalBusy(true);
    try {
      for (const app of RUNZ_APPS) if (!(running[app.id] ?? false)) await spawnApp(app.id, app.pnpmDir);
      await Promise.all(RUNZ_APPS.flatMap((app) => probeTargets(app, modes[app.id] ?? 'dev').map((target) => probe(app.id, target.label, target.url))));
      setNotice('Apps started and health probes updated.');
    } catch (reason) { setError(String(reason)); }
    finally { setGlobalBusy(false); }
  };
  const killAll = async () => {
    setGlobalBusy(true);
    try {
      const result = await invoke<StopAllOutcome>('runz_stop_all', { sweepPorts: allRunzListenPorts() });
      setRunning({});
      setNotice(`Stopped ${result.trackedKilled} tracked process group(s); swept ${result.sweep.killedPids.length} listener(s).`);
    } catch (reason) { setError(String(reason)); }
    finally { setGlobalBusy(false); }
  };
  const sweepAll = async () => {
    setGlobalBusy(true);
    try { const result = await sweep(allRunzListenPorts()); setNotice(`Swept ${result.killedPids.length} listener(s).`); }
    catch (reason) { setError(String(reason)); }
    finally { setGlobalBusy(false); }
  };

  const spawnRoot = async (jobId: string, npmScript: string, scriptArgs?: readonly string[], envVars?: readonly { name: string; value: string }[]) => {
    if (!monorepoRoot) throw new Error('Set a project root first.');
    targetLogsRef.current[jobId] = [];
    await invoke('runz_spawn_root_script', { monorepoRoot, jobId, npmScript, scriptArgs, envVars });
    setRunning((current) => ({ ...current, [jobId]: true }));
  };
  const runMigration = async (target: RunzMigrationDef) => {
    setBusy((current) => ({ ...current, [target.id]: true })); setMigrationLogs([]);
    try { await spawnRoot(target.id, target.npmScript); } catch (reason) { setError(String(reason)); }
    finally { setBusy((current) => ({ ...current, [target.id]: false })); }
  };
  const runAllMigrations = async () => {
    setMigrationBatchBusy(true);
    try { for (const target of tierTargets) await runMigration(target); }
    finally { setMigrationBatchBusy(false); }
  };
  const runTest = async (target: RunzUnitTestDef) => {
    setBusy((current) => ({ ...current, [target.id]: true })); setUnitTestLogs([]);
    try {
      if (target.pnpmDir === '.') await spawnRoot(target.id, target.script, undefined, target.envVars);
      else { await invoke('runz_spawn', { monorepoRoot, appId: target.id, pnpmDir: target.pnpmDir, script: target.script }); setRunning((current) => ({ ...current, [target.id]: true })); }
    } catch (reason) { setError(String(reason)); }
    finally { setBusy((current) => ({ ...current, [target.id]: false })); }
  };
  const runAllTests = async () => {
    setUnitTestBatchBusy(true);
    try { await runTest({ id: RUNZ_TURBO_TEST.id, label: RUNZ_TURBO_TEST.label, pnpmDir: '.', script: RUNZ_TURBO_TEST.npmScript }); for (const target of RUNZ_UNIT_TESTS) await runTest(target); }
    finally { setUnitTestBatchBusy(false); }
  };
  const runQuality = async (job: RunzQualityJobDef, args?: readonly string[]) => {
    setBusy((current) => ({ ...current, [job.id]: true })); setQualityLogs([]);
    try { await spawnRoot(job.id, job.npmScript, args ?? job.scriptArgs); } catch (reason) { setError(String(reason)); }
    finally { setBusy((current) => ({ ...current, [job.id]: false })); }
  };
  const runAllQuality = async () => {
    setQualityBatchBusy(true);
    try { for (const job of RUNZ_QUALITY_JOBS) await runQuality(job); }
    finally { setQualityBatchBusy(false); }
  };
  const runSetupStep = async (stepId: EnvSetupStepId, force = false) => {
    if (!monorepoRoot) return;
    if (!force && isEnvSetupStepDone(stepStatuses[stepId])) return;
    if (stepId === 'dev-vars') {
      for (const target of RUNZ_ENV_SETUP_DEV_VARS) {
        const result = await runzCopyRepoFile(monorepoRoot, target.examplePath, target.targetPath);
        setSetupLogs((current) => trimLines([...current, `[dev-vars] ${target.label}: ${result.copied ? 'copied' : result.skipped ? 'skipped' : result.reason ?? 'unchanged'}`]));
      }
    } else if (stepId === 'migrations') {
      const migration = migrationsForTier('local')[0];
      if (migration) await spawnRoot(RUNZ_ENV_SETUP_JOB_IDS.migrations, migration.npmScript);
    } else {
      const target = RUNZ_ENV_SETUP_CF_TYPEGEN[0];
      if (target) {
        await invoke('runz_spawn', { monorepoRoot, appId: RUNZ_ENV_SETUP_JOB_IDS.cfTypegen, pnpmDir: target.pnpmDir, script: 'cf-typegen' });
        setRunning((current) => ({ ...current, [RUNZ_ENV_SETUP_JOB_IDS.cfTypegen]: true }));
      }
    }
  };
  const runSetup = async () => {
    setSetupBusy(true); setSetupLogs([]);
    try { for (const step of RUNZ_ENV_SETUP_STEPS) if (selectedSteps[step.id]) await runSetupStep(step.id); await refreshSetupStatus(); }
    catch (reason) { setError(String(reason)); }
    finally { setSetupBusy(false); }
  };

  const navTabs: Array<{ id: RunzTab; label: string; className: string }> = [
    { id: 'apps', label: 'Apps', className: 'runz-tab-apps' },
    { id: 'migrations', label: 'Migrations', className: 'runz-tab-apps' },
    { id: 'tests', label: 'Tests', className: 'runz-tab-quality' },
    { id: 'quality', label: 'Quality', className: 'runz-tab-quality' },
    { id: 'env-setup', label: 'Env Setup', className: 'runz-tab-tooling' },
    { id: 'env-infos', label: 'Env Infos', className: 'runz-tab-tooling' },
    { id: 'sprint', label: 'Sprint', className: 'runz-tab-planning' },
    { id: 'md-viewer', label: 'MD Viewer', className: 'runz-tab-planning' },
    { id: 'data', label: 'Data', className: 'runz-tab-tooling' },
  ];

  return (
    <div className={`runz-shell${terminalTabActive ? ' runz-shell-terminal-mode' : ''}`}>
      <div className="runz-topbar">
        <div className="runz-tabs" role="tablist" aria-label="Runz sections">
          {monorepoRoot && navTabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} className={`runz-tab ${tab.className}${activeTab === tab.id ? ' active' : ''}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
          {monorepoRoot && RUNZ_TERMINALS.map((terminal) => <button key={terminal.id} type="button" role="tab" aria-selected={activeTab === terminal.id} className={`runz-tab ${terminal.colorClass}${activeTab === terminal.id ? ' active' : ''}`} onClick={() => { setVisitedTerminals((current) => current.includes(terminal.id) ? current : [...current, terminal.id]); setActiveTab(terminal.id); }}>{terminal.label}</button>)}
          <button type="button" role="tab" aria-selected={activeTab === 'settings'} className={`runz-tab runz-tab-utility${activeTab === 'settings' ? ' active' : ''}`} onClick={() => setActiveTab('settings')}>Settings</button>
        </div>
      </div>
      {notice && <div className="runz-notice">{notice}</div>}
      {error && <div className="runz-toast"><span>{error}</span><button type="button" className="runz-toast-dismiss" onClick={() => setError(null)} aria-label="Dismiss">×</button></div>}
      {activeTab === 'settings' && <section className="runz-settings-shell"><h2 className="runz-settings-title">Settings</h2><section className="runz-root-bar"><label>Project root<input type="text" value={rootInput} onChange={(event) => setRootInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveRoot(); }} placeholder="/path/to/filatracker" spellCheck={false} /></label><div className="runz-actions"><button type="button" className="runz-btn runz-btn-primary" onClick={() => void saveRoot()}>Save</button><button type="button" className="runz-btn" onClick={() => void detectRoot()}>Auto-detect</button><button type="button" className="runz-btn" disabled={!monorepoRoot} onClick={() => monorepoRoot && void openPath(monorepoRoot)}>Open in Finder</button></div></section><p className="runz-hint">{monorepoRoot ? <>Active project root: <code>{monorepoRoot}</code></> : 'Save the project root to enable the workspace tabs.'}</p></section>}
      {monorepoRoot && activeTab === 'apps' && <AppsTab monorepoRoot={monorepoRoot} active globalBusy={globalBusy} modes={modes} running={running} busy={busy} probeHint={probeHint} logs={logs} onStartAll={() => void startAll()} onKillAll={() => void killAll()} onSweepAll={() => void sweepAll()} onModeChange={(id, mode) => setModes((current) => ({ ...current, [id]: mode }))} onStart={(id, dir) => void startApp(id, dir)} onStop={(id) => void stopApp(id)} onKill={(id) => void killApp(id)} onSweep={(id) => void sweepApp(id)} onRestart={async (id, dir) => { await stopApp(id); await startApp(id, dir); }} onProbe={(id, label, url) => void probe(id, label, url)} onClearLog={(id) => setLogs((current) => ({ ...current, [id]: [] }))} />}
      {monorepoRoot && activeTab === 'migrations' && <MigrationsTab monorepoRoot={monorepoRoot} migrationTier={migrationTier} targets={tierTargets} running={running} busy={busy} outcomes={migrationOutcomes} prechecks={migrationPrechecks} globalBusy={globalBusy} migrationBatchBusy={migrationBatchBusy} tierMigrationRunning={tierTargets.some((job) => running[job.id])} migrationLogs={migrationLogs} migrationLogRef={migrationLogRef} onTierChange={setMigrationTier} onRunAll={() => void runAllMigrations()} onRunOne={(job) => void runMigration(job)} onStopOne={(job) => void stopJob(job.id)} />}
      {monorepoRoot && activeTab === 'tests' && <TestsTab monorepoRoot={monorepoRoot} targets={RUNZ_UNIT_TESTS} running={running} busy={busy} outcomes={unitTestOutcomes} globalBusy={globalBusy} unitTestBatchBusy={unitTestBatchBusy} unitTestRunning={RUNZ_UNIT_TESTS.some((job) => running[job.id])} unitTestLogs={unitTestLogs} unitTestLogRef={unitTestLogRef} turboTestRunning={running[RUNZ_TURBO_TEST.id] ?? false} turboTestBusy={busy[RUNZ_TURBO_TEST.id] ?? false} turboTestOutcome={unitTestOutcomes[RUNZ_TURBO_TEST.id] ?? IDLE_OUTCOME} onRunTurboTest={() => void runTest({ id: RUNZ_TURBO_TEST.id, label: RUNZ_TURBO_TEST.label, pnpmDir: '.', script: RUNZ_TURBO_TEST.npmScript })} onStopTurboTest={() => void stopJob(RUNZ_TURBO_TEST.id)} onRunAll={() => void runAllTests()} onRunOne={(job) => void runTest(job)} onStopOne={(job) => void stopJob(job.id)} />}
      {monorepoRoot && activeTab === 'quality' && <QualityTab monorepoRoot={monorepoRoot} running={running} busy={busy} outcomes={qualityOutcomes} globalBusy={globalBusy} qualityBatchBusy={qualityBatchBusy} qualityRunning={RUNZ_QUALITY_JOBS.some((job) => running[job.id])} qualityLogs={qualityLogs} qualityLogRef={qualityLogRef} onRunAll={() => void runAllQuality()} onRunJob={(job, args) => void runQuality(job, args)} onStopJob={(id) => void stopJob(id)} />}
      {monorepoRoot && activeTab === 'env-setup' && <EnvSetupTab monorepoRoot={monorepoRoot} scanning={setupScanning} setupBusy={setupBusy} selectedSteps={selectedSteps} stepStatuses={stepStatuses} setupLogs={setupLogs} setupLogRef={setupLogRef} onRefresh={() => void refreshSetupStatus()} onToggleStep={(id, checked) => setSelectedSteps((current) => ({ ...current, [id]: checked }))} onSetup={() => void runSetup()} onRerunStep={(id) => { setSetupBusy(true); setSetupLogs([]); void runSetupStep(id, true).then(refreshSetupStatus).catch((reason: unknown) => setError(String(reason))).finally(() => setSetupBusy(false)); }} />}
      {monorepoRoot && activeTab === 'env-infos' && <EnvInfosTab scanning={envScanning} overview={envOverview} runtimeChecks={envRuntimeChecks} rootChecks={envRootChecks} appCards={envAppCards} onRefresh={() => void refreshEnvInfos()} />}
      {monorepoRoot && activeTab === 'sprint' && <SprintTab monorepoRoot={monorepoRoot} active onNavigateQuality={() => setActiveTab('quality')} onNavigateE2e={() => setActiveTab('tests')} />}
      {monorepoRoot && activeTab === 'md-viewer' && <MdViewerTab monorepoRoot={monorepoRoot} active />}
      {monorepoRoot && activeTab === 'data' && <DataTab monorepoRoot={monorepoRoot} />}
      {monorepoRoot && RUNZ_TERMINALS.filter((terminal) => visitedTerminals.includes(terminal.id)).map((terminal) => <section key={terminal.id} className={`runz-terminal-tab-panel${activeTab === terminal.id ? ' is-active' : ''}`} aria-hidden={activeTab !== terminal.id} aria-label={terminal.label}><TerminalWorkspace terminal={terminal} monorepoRoot={monorepoRoot} active={activeTab === terminal.id} onError={setError} /></section>)}
    </div>
  );
}
