import { invoke } from '@tauri-apps/api/core';

export interface RunzPathStat {
  exists: boolean;
  isFile: boolean;
  isDir: boolean;
}

export interface RunzCopyRepoFileOutcome {
  copied: boolean;
  skipped: boolean;
  reason: string | null;
}

export interface RunzRuntimeVersions {
  nodeVersion: string | null;
  pnpmVersion: string | null;
  nodeError: string | null;
  pnpmError: string | null;
}

export interface RunzMigrationPrecheck {
  ok: boolean;
  scriptExists: boolean;
  scriptCommand: string | null;
  placeholderCheckPassed: boolean;
  blockingReasons: string[];
  warnings: string[];
}

export interface RunzHttpHeader {
  name: string;
  value: string;
}

export interface RunzHttpRequest {
  method: string;
  url: string;
  headers: RunzHttpHeader[];
  body: string | null;
}

export interface RunzHttpResponse {
  ok: boolean;
  status: number;
  statusText: string;
  ms: number;
  headers: RunzHttpHeader[];
  body: string;
  error: string | null;
}

export async function runzReadRepoText(
  monorepoRoot: string,
  relativePath: string
): Promise<string> {
  return invoke<string>('runz_read_repo_text', {
    monorepoRoot,
    relativePath,
  });
}

export async function runzWriteRepoText(
  monorepoRoot: string,
  relativePath: string,
  content: string
): Promise<void> {
  await invoke('runz_write_repo_text', {
    monorepoRoot,
    relativePath,
    content,
  });
}

export async function runzRepoPathStat(
  monorepoRoot: string,
  relativePath: string
): Promise<RunzPathStat> {
  return invoke<RunzPathStat>('runz_repo_path_stat', {
    monorepoRoot,
    relativePath,
  });
}

export async function runzCopyRepoFile(
  monorepoRoot: string,
  sourceRelativePath: string,
  destRelativePath: string,
  overwrite = false
): Promise<RunzCopyRepoFileOutcome> {
  return invoke<RunzCopyRepoFileOutcome>('runz_copy_repo_file', {
    monorepoRoot,
    sourceRelativePath,
    destRelativePath,
    overwrite,
  });
}

export async function runzGetRuntimeVersions(): Promise<RunzRuntimeVersions> {
  return invoke<RunzRuntimeVersions>('runz_get_runtime_versions');
}

export interface RunzMkdocsCheck {
  available: boolean;
  version: string | null;
  error: string | null;
}

export async function runzCheckMkdocs(): Promise<RunzMkdocsCheck> {
  return invoke<RunzMkdocsCheck>('runz_check_mkdocs');
}

export async function runzCheckMigrationTarget(
  monorepoRoot: string,
  npmScript: string,
  wranglerPath: string | null
): Promise<RunzMigrationPrecheck> {
  return invoke<RunzMigrationPrecheck>('runz_check_migration_target', {
    monorepoRoot,
    npmScript,
    wranglerPath,
  });
}

export interface RunzD1DbEntry {
  hash: string;
  databaseName: string;
  binding: string;
  sizeBytes: number;
}

export interface RunzD1TableInfo {
  name: string;
  rowCount: number;
}

export interface RunzD1QueryResult {
  columns: string[];
  rows: Array<Array<string | number | boolean | null>>;
  truncated: boolean;
}

export interface RunzKvNsEntry {
  id: string;
  binding: string;
  entryCount: number;
}

export interface RunzKvEntry {
  key: string;
  blobId: string;
  expiration: number | null;
  metadataJson: string | null;
}

export interface RunzKvBlobResult {
  content: string;
  isUtf8: boolean;
}

export interface RunzR2BucketEntry {
  name: string;
  binding: string;
  objectCount: number;
}

export interface RunzR2ObjectEntry {
  key: string;
  blobId: string | null;
  size: number;
  etag: string;
  uploaded: number;
  httpMetadata: string | null;
}

export async function runzDataD1Scan(monorepoRoot: string): Promise<RunzD1DbEntry[]> {
  return invoke<RunzD1DbEntry[]>('runz_data_d1_scan', { monorepoRoot });
}

export async function runzDataD1Tables(
  monorepoRoot: string,
  dbHash: string
): Promise<RunzD1TableInfo[]> {
  return invoke<RunzD1TableInfo[]>('runz_data_d1_tables', {
    monorepoRoot,
    dbHash,
  });
}

export async function runzDataD1Query(
  monorepoRoot: string,
  dbHash: string,
  sql: string,
  limit?: number
): Promise<RunzD1QueryResult> {
  return invoke<RunzD1QueryResult>('runz_data_d1_query', {
    monorepoRoot,
    dbHash,
    sql,
    limit,
  });
}

export async function runzDataKvScan(monorepoRoot: string): Promise<RunzKvNsEntry[]> {
  return invoke<RunzKvNsEntry[]>('runz_data_kv_scan', { monorepoRoot });
}

export async function runzDataKvEntries(
  monorepoRoot: string,
  nsId: string,
  limit?: number,
  offset?: number
): Promise<RunzKvEntry[]> {
  return invoke<RunzKvEntry[]>('runz_data_kv_entries', {
    monorepoRoot,
    nsId,
    limit,
    offset,
  });
}

export async function runzDataKvBlob(
  monorepoRoot: string,
  nsId: string,
  blobId: string
): Promise<RunzKvBlobResult> {
  return invoke<RunzKvBlobResult>('runz_data_kv_blob', {
    monorepoRoot,
    nsId,
    blobId,
  });
}

export async function runzDataR2Scan(monorepoRoot: string): Promise<RunzR2BucketEntry[]> {
  return invoke<RunzR2BucketEntry[]>('runz_data_r2_scan', { monorepoRoot });
}

export async function runzDataR2Objects(
  monorepoRoot: string,
  bucketName: string,
  limit?: number,
  offset?: number
): Promise<RunzR2ObjectEntry[]> {
  return invoke<RunzR2ObjectEntry[]>('runz_data_r2_objects', {
    monorepoRoot,
    bucketName,
    limit,
    offset,
  });
}

export interface RunzGitSummary {
  branch: string;
  shortSha: string;
  ahead: number;
  behind: number;
  dirtyCount: number;
  mergeConflict: boolean;
}

export async function runzGitSummary(monorepoRoot: string): Promise<RunzGitSummary> {
  return invoke<RunzGitSummary>('runz_git_summary', { monorepoRoot });
}

export async function runzGitStatusShort(monorepoRoot: string): Promise<string[]> {
  return invoke<string[]>('runz_git_status_short', { monorepoRoot });
}

export async function runzGitBaseRef(monorepoRoot: string): Promise<string> {
  return invoke<string>('runz_git_base_ref', { monorepoRoot });
}

export interface RunzMdFileEntry {
  relativePath: string;
  modifiedAtMs: number;
}

export async function runzListRepoMdFiles(
  monorepoRoot: string,
  scanRoot: string
): Promise<RunzMdFileEntry[]> {
  return invoke<RunzMdFileEntry[]>('runz_list_repo_md_files', { monorepoRoot, scanRoot });
}

export async function runzFindStoryFile(
  monorepoRoot: string,
  storyLocation: string,
  storyKey: string
): Promise<string | null> {
  return invoke<string | null>('runz_find_story_file', {
    monorepoRoot,
    storyLocation,
    storyKey,
  });
}

export async function runzListCheckpointStoryKeys(monorepoRoot: string): Promise<string[]> {
  return invoke<string[]>('runz_list_checkpoint_story_keys', { monorepoRoot });
}

export async function runzTerminalWrite(terminalId: string, data: string): Promise<void> {
  await invoke('runz_terminal_write', { terminalId, data });
}

export interface RunzLocalD1MigrationStatus {
  applied: boolean;
  message: string;
}

export async function runzCheckLocalD1Migration(
  monorepoRoot: string,
  workspace: 'root',
  d1DatabaseName: string
): Promise<RunzLocalD1MigrationStatus> {
  return invoke<RunzLocalD1MigrationStatus>('runz_check_local_d1_migration', {
    monorepoRoot,
    workspace,
    d1DatabaseName,
  });
}
