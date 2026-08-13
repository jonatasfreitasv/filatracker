use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

use command_group::{CommandGroup, GroupChild};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

mod data_browser;
mod d1_migration_check;
mod git_info;
mod port_sweep;
mod checkpoint_finder;
mod md_finder;
mod story_finder;
mod wrangler_jsonc;

use port_sweep::{sweep_listen_ports, EXIT_SWEEP_PORTS};

#[derive(Default, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RunzSettings {
    /// Accept legacy `monorepo_root` key in on-disk JSON.
    #[serde(alias = "monorepo_root")]
    monorepo_root: Option<String>,
}

#[derive(Clone, Default)]
struct ProcRegistry {
    inner: Arc<Mutex<HashMap<String, Arc<Mutex<GroupChild>>>>>,
}

#[derive(Clone)]
struct TerminalSession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
}

#[derive(Clone, Default)]
struct TerminalRegistry {
    inner: Arc<Mutex<HashMap<String, TerminalSession>>>,
}

/// Remove and SIGKILL the process group for `app_id`, if Runz still tracks it.
fn stop_tracked_app(registry: &ProcRegistry, app_id: &str) -> Result<bool, String> {
    let mut map = registry.inner.lock().map_err(|e| e.to_string())?;
    let Some(entry) = map.remove(app_id) else {
        return Ok(false);
    };
    drop(map);
    let mut child = entry.lock().map_err(|e| e.to_string())?;
    child.kill().map_err(|e| format!("kill failed: {e}"))?;
    Ok(true)
}

fn kill_all_tracked(registry: &ProcRegistry) -> usize {
    let entries: Vec<Arc<Mutex<GroupChild>>> = {
        let Ok(mut map) = registry.inner.lock() else {
            return 0;
        };
        let keys: Vec<String> = map.keys().cloned().collect();
        let mut out = Vec::new();
        for k in keys {
            if let Some(c) = map.remove(&k) {
                out.push(c);
            }
        }
        out
    };
    let mut n = 0;
    for entry in entries {
        if let Ok(mut ch) = entry.lock() {
            if ch.kill().is_ok() {
                n += 1;
            }
        }
    }
    n
}

fn stop_tracked_terminal(registry: &TerminalRegistry, terminal_id: &str) -> Result<bool, String> {
    let mut map = registry.inner.lock().map_err(|e| e.to_string())?;
    let Some(entry) = map.remove(terminal_id) else {
        return Ok(false);
    };
    drop(map);
    let mut child = entry.child.lock().map_err(|e| e.to_string())?;
    child.kill().map_err(|e| format!("terminal kill failed: {e}"))?;
    Ok(true)
}

fn kill_all_terminals(registry: &TerminalRegistry) -> usize {
    let entries: Vec<TerminalSession> = {
        let Ok(mut map) = registry.inner.lock() else {
            return 0;
        };
        map.drain().map(|(_, session)| session).collect()
    };

    let mut n = 0;
    for entry in entries {
        if let Ok(mut child) = entry.child.lock() {
            if child.kill().is_ok() {
                n += 1;
            }
        }
    }
    n
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct KillAppOutcome {
    tracked_killed: bool,
    sweep: port_sweep::SweepOutcome,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StopAllOutcome {
    tracked_killed: usize,
    sweep: port_sweep::SweepOutcome,
}

#[derive(Serialize)]
struct ProbeResult {
    ok: bool,
    status: u16,
    ms: u128,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepoPathStat {
    exists: bool,
    is_file: bool,
    is_dir: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CopyRepoFileOutcome {
    copied: bool,
    skipped: bool,
    reason: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeVersions {
    node_version: Option<String>,
    pnpm_version: Option<String>,
    node_error: Option<String>,
    pnpm_error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MkdocsCheck {
    available: bool,
    version: Option<String>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationPrecheck {
    ok: bool,
    script_exists: bool,
    script_command: Option<String>,
    placeholder_check_passed: bool,
    blocking_reasons: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct HttpHeader {
    name: String,
    value: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HttpRequest {
    method: String,
    url: String,
    headers: Vec<HttpHeader>,
    body: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HttpSseRequest {
    request_id: String,
    method: String,
    url: String,
    headers: Vec<HttpHeader>,
    body: Option<String>,
    /// Defaults to 130s (Cloud public chat SSE budget).
    timeout_secs: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HttpResponse {
    ok: bool,
    status: u16,
    status_text: String,
    ms: u128,
    headers: Vec<HttpHeader>,
    body: String,
    error: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HttpSseChunkPayload {
    request_id: String,
    line: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HttpSseResult {
    request_id: String,
    ok: bool,
    status: u16,
    status_text: String,
    ms: u128,
    headers: Vec<HttpHeader>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalStartPayload {
    cwd: String,
    shell: String,
}

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> Result<RunzSettings, String> {
    let p = settings_path(app)?;
    if !p.exists() {
        return Ok(RunzSettings::default());
    }
    let s = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

fn save_settings(app: &AppHandle, settings: &RunzSettings) -> Result<(), String> {
    let p = settings_path(app)?;
    let s = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&p, s).map_err(|e| e.to_string())
}

fn validate_monorepo_root(root: &str) -> Result<(), String> {
    let p = std::path::Path::new(root);
    if !p.is_dir() {
        return Err("Path is not a directory".into());
    }
    if !p.join("pnpm-workspace.yaml").is_file() {
        return Err("pnpm-workspace.yaml not found at this path".into());
    }
    if !p.join("wrangler.web.jsonc").is_file() {
        return Err("wrangler.web.jsonc not found — is this the FilaTracker project root?".into());
    }
    if !p.join("workers").is_dir() {
        return Err("workers/ not found — is this the FilaTracker project root?".into());
    }
    Ok(())
}

fn validate_terminal_cwd(cwd: &str) -> Result<(), String> {
    let path = Path::new(cwd);
    if !path.is_dir() {
        return Err("Terminal cwd is not a directory".into());
    }
    Ok(())
}

fn validate_relative_repo_path(relative_path: &str) -> Result<(), String> {
    let path = Path::new(relative_path);
    if path.is_absolute() {
        return Err("Repo paths must be relative to the monorepo root".into());
    }
    if path.as_os_str().is_empty() {
        return Err("Repo path cannot be empty".into());
    }
    for component in path.components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            Component::ParentDir => {
                return Err("Repo paths cannot escape the monorepo root".into())
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err("Repo paths must be relative to the monorepo root".into())
            }
        }
    }
    Ok(())
}

fn repo_path(monorepo_root: &str, relative_path: &str) -> Result<PathBuf, String> {
    validate_monorepo_root(monorepo_root)?;
    validate_relative_repo_path(relative_path)?;
    Ok(Path::new(monorepo_root).join(relative_path))
}

fn normalize_command_output(output: std::process::Output) -> Result<String, String> {
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            Ok(String::from_utf8_lossy(&output.stderr).trim().to_string())
        } else {
            Ok(stdout)
        }
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            Err(format!("command exited with {:?}", output.status.code()))
        } else {
            Err(stderr)
        }
    }
}

fn placeholder_check_reasons(content: &str) -> Vec<String> {
    let mut reasons = Vec::new();
    // Aligned with `scripts/check-d1-placeholders.mjs` (local D1 ids under 00000000-…0000…).
    if content.contains("00000000-0000-4000-8000-0000000000") {
        reasons.push("D1 database_id placeholder".to_string());
    }
    if content.contains("PLACEHOLDER_REPLACE_WITH_") {
        reasons.push("operational binding placeholder".to_string());
    }
    reasons
}

fn preferred_shell() -> String {
    #[cfg(windows)]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string())
    }

    #[cfg(not(windows))]
    {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        if Path::new(&shell).exists() {
            shell
        } else {
            "/bin/zsh".to_string()
        }
    }
}

fn display_shell_name(shell_path: &str) -> String {
    Path::new(shell_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(shell_path)
        .to_string()
}

fn terminal_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        cols: cols.max(1),
        rows: rows.max(1),
        pixel_width: 0,
        pixel_height: 0,
    }
}

#[tauri::command]
fn runz_get_settings(app: AppHandle) -> Result<RunzSettings, String> {
    load_settings(&app)
}

#[tauri::command]
fn runz_set_monorepo_root(app: AppHandle, path: String) -> Result<RunzSettings, String> {
    validate_monorepo_root(&path)?;
    let mut s = load_settings(&app)?;
    s.monorepo_root = Some(path);
    save_settings(&app, &s)?;
    Ok(s)
}

#[tauri::command]
fn runz_detect_monorepo_root() -> Option<String> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        if dir.join("pnpm-workspace.yaml").is_file()
            && dir.join("wrangler.web.jsonc").is_file()
            && dir.join("workers").is_dir()
        {
            return Some(dir.to_string_lossy().to_string());
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

#[tauri::command]
fn runz_read_repo_text(monorepo_root: String, relative_path: String) -> Result<String, String> {
    let path = repo_path(&monorepo_root, &relative_path)?;
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {e}", path.display()))
}

#[tauri::command]
fn runz_write_repo_text(
    monorepo_root: String,
    relative_path: String,
    content: String,
) -> Result<(), String> {
    let path = repo_path(&monorepo_root, &relative_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create parent directory for {}: {error}",
                relative_path
            )
        })?;
    }
    fs::write(&path, content).map_err(|error| {
        format!("Failed to write {}: {error}", path.display())
    })
}

#[tauri::command]
fn runz_repo_path_stat(monorepo_root: String, relative_path: String) -> Result<RepoPathStat, String> {
    let path = repo_path(&monorepo_root, &relative_path)?;
    match fs::metadata(&path) {
        Ok(metadata) => Ok(RepoPathStat {
            exists: true,
            is_file: metadata.is_file(),
            is_dir: metadata.is_dir(),
        }),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(RepoPathStat {
            exists: false,
            is_file: false,
            is_dir: false,
        }),
        Err(error) => Err(format!("Failed to stat {}: {error}", path.display())),
    }
}

/// Copy a file inside the monorepo (e.g. `.dev.vars.example` → `.dev.vars`).
#[tauri::command]
fn runz_copy_repo_file(
    monorepo_root: String,
    source_relative_path: String,
    dest_relative_path: String,
    overwrite: bool,
) -> Result<CopyRepoFileOutcome, String> {
    let source = repo_path(&monorepo_root, &source_relative_path)?;
    let dest = repo_path(&monorepo_root, &dest_relative_path)?;

    if !source.is_file() {
        return Err(format!(
            "Source file not found: {}",
            source_relative_path
        ));
    }

    if dest.exists() && !overwrite {
        return Ok(CopyRepoFileOutcome {
            copied: false,
            skipped: true,
            reason: Some(format!("{} already exists", dest_relative_path)),
        });
    }

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create parent directory for {}: {error}",
                dest_relative_path
            )
        })?;
    }

    fs::copy(&source, &dest).map_err(|error| {
        format!(
            "Failed to copy {} → {}: {error}",
            source_relative_path, dest_relative_path
        )
    })?;

    Ok(CopyRepoFileOutcome {
        copied: true,
        skipped: false,
        reason: None,
    })
}

#[tauri::command]
fn runz_get_runtime_versions() -> RuntimeVersions {
    let node = Command::new("node").arg("--version").output();
    let pnpm = Command::new("pnpm").arg("--version").output();

    let (node_version, node_error) = match node {
        Ok(output) => match normalize_command_output(output) {
            Ok(version) => (Some(version), None),
            Err(error) => (None, Some(error)),
        },
        Err(error) => (None, Some(error.to_string())),
    };

    let (pnpm_version, pnpm_error) = match pnpm {
        Ok(output) => match normalize_command_output(output) {
            Ok(version) => (Some(version), None),
            Err(error) => (None, Some(error)),
        },
        Err(error) => (None, Some(error.to_string())),
    };

    RuntimeVersions {
        node_version,
        pnpm_version,
        node_error,
        pnpm_error,
    }
}

#[tauri::command]
fn runz_check_mkdocs() -> MkdocsCheck {
    let try_python = Command::new("python3")
        .args(["-m", "mkdocs", "--version"])
        .output();
    match try_python {
        Ok(output) => match normalize_command_output(output) {
            Ok(version) => MkdocsCheck {
                available: true,
                version: Some(version),
                error: None,
            },
            Err(error) => MkdocsCheck {
                available: false,
                version: None,
                error: Some(error),
            },
        },
        Err(error) => MkdocsCheck {
            available: false,
            version: None,
            error: Some(error.to_string()),
        },
    }
}

#[tauri::command]
fn runz_check_migration_target(
    monorepo_root: String,
    npm_script: String,
    wrangler_path: Option<String>,
) -> Result<MigrationPrecheck, String> {
    let package_json_path = repo_path(&monorepo_root, "package.json")?;
    let package_json = fs::read_to_string(&package_json_path)
        .map_err(|e| format!("Failed to read {}: {e}", package_json_path.display()))?;
    let parsed: serde_json::Value =
        serde_json::from_str(&package_json).map_err(|e| format!("Invalid package.json: {e}"))?;

    let script_command = parsed
        .get("scripts")
        .and_then(|scripts| scripts.get(&npm_script))
        .and_then(|value| value.as_str())
        .map(str::to_string);

    let mut blocking_reasons = Vec::new();
    let mut warnings = Vec::new();

    if script_command.is_none() {
        blocking_reasons.push(format!("Root script `{npm_script}` was not found in package.json."));
    }

    let mut placeholder_check_passed = true;
    if let Some(relative_wrangler_path) = wrangler_path {
        let wrangler_absolute = repo_path(&monorepo_root, &relative_wrangler_path)?;
        let wrangler_content = fs::read_to_string(&wrangler_absolute).map_err(|e| {
            format!(
                "Failed to read migration config {}: {e}",
                wrangler_absolute.display()
            )
        })?;
        let reasons = placeholder_check_reasons(&wrangler_content);
        if !reasons.is_empty() {
            placeholder_check_passed = false;
            blocking_reasons.extend(
                reasons
                    .into_iter()
                    .map(|reason| format!("{relative_wrangler_path}: {reason}")),
            );
        }
    } else {
        warnings.push("No wrangler path was provided for placeholder checks.".to_string());
    }

    Ok(MigrationPrecheck {
        ok: blocking_reasons.is_empty(),
        script_exists: script_command.is_some(),
        script_command,
        placeholder_check_passed,
        blocking_reasons,
        warnings,
    })
}

/// Spawn `pnpm …` at `monorepo_root`, register as `job_id`, stream stdout/stderr to `runz-log-line`.
fn spawn_tracked_pnpm(
    app: AppHandle,
    registry: &ProcRegistry,
    monorepo_root: &str,
    job_id: String,
    pnpm_args: &[&str],
    env_vars: Option<Vec<(String, String)>>,
) -> Result<(), String> {
    validate_monorepo_root(monorepo_root)?;

    {
        let map = registry.inner.lock().map_err(|e| e.to_string())?;
        if map.contains_key(&job_id) {
            return Err(format!("{job_id} is already running"));
        }
    }

    let mut child = Command::new("pnpm");
    child
        .current_dir(monorepo_root)
        .args(pnpm_args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(vars) = env_vars {
        for (key, value) in vars {
            child.env(key, value);
        }
    }
    let mut child = child
        .group_spawn()
        .map_err(|e| format!("Failed to spawn pnpm: {e}"))?;

    let stdout = child
        .inner()
        .stdout
        .take()
        .ok_or("missing stdout pipe")?;
    let stderr = child
        .inner()
        .stderr
        .take()
        .ok_or("missing stderr pipe")?;

    let arc = Arc::new(Mutex::new(child));
    {
        let mut map = registry.inner.lock().map_err(|e| e.to_string())?;
        map.insert(job_id.clone(), arc.clone());
    }

    spawn_log_pipe(app.clone(), job_id.clone(), "stdout", stdout);
    spawn_log_pipe(app.clone(), job_id.clone(), "stderr", stderr);

    let reg = registry.inner.clone();
    let aid = job_id.clone();
    let ah = app.clone();
    thread::spawn(move || {
        loop {
            thread::sleep(std::time::Duration::from_millis(200));
            let finished = {
                let mut ch = match arc.lock() {
                    Ok(g) => g,
                    Err(_) => break,
                };
                match ch.try_wait() {
                    Ok(Some(_)) => true,
                    Ok(None) => false,
                    Err(_) => true,
                }
            };
            if finished {
                break;
            }
        }
        let (code, success) = {
            let mut ch = match arc.lock() {
                Ok(g) => g,
                Err(_) => {
                    let payload = serde_json::json!({
                        "appId": aid,
                        "code": None::<i32>,
                        "success": false
                    });
                    let _ = ah.emit("runz-process-exit", payload);
                    return;
                }
            };
            match ch.try_wait() {
                Ok(Some(status)) => (status.code(), status.success()),
                Ok(None) => (None, false),
                Err(_) => (None, false),
            }
        };
        if let Ok(mut map) = reg.lock() {
            map.remove(&aid);
        }
        let payload = serde_json::json!({
            "appId": aid,
            "code": code,
            "success": success
        });
        let _ = ah.emit("runz-process-exit", payload);
    });

    Ok(())
}

fn spawn_terminal_output_pipe(
    app: AppHandle,
    terminal_id: String,
    mut reader: Box<dyn Read + Send>,
) {
    thread::spawn(move || {
        let mut buf = [0_u8; 4096];
        let mut pending = Vec::<u8>::new();

        let emit_text = |app: &AppHandle, terminal_id: &str, data: String| {
            if data.is_empty() {
                return;
            }
            let payload = serde_json::json!({
                "terminalId": terminal_id,
                "data": data,
            });
            let _ = app.emit("runz-terminal-output", payload);
        };

        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    pending.extend_from_slice(&buf[..n]);

                    loop {
                        match std::str::from_utf8(&pending) {
                            Ok(text) => {
                                emit_text(&app, &terminal_id, text.to_string());
                                pending.clear();
                                break;
                            }
                            Err(error) => {
                                let valid_up_to = error.valid_up_to();

                                if valid_up_to > 0 {
                                    let text = String::from_utf8_lossy(&pending[..valid_up_to]).into_owned();
                                    emit_text(&app, &terminal_id, text);
                                }

                                if let Some(error_len) = error.error_len() {
                                    emit_text(&app, &terminal_id, String::from("\u{fffd}"));
                                    pending.drain(..valid_up_to + error_len);
                                    continue;
                                }

                                pending.drain(..valid_up_to);
                                break;
                            }
                        }
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }

        if !pending.is_empty() {
            emit_text(
                &app,
                &terminal_id,
                String::from_utf8_lossy(&pending).into_owned(),
            );
        }
    });
}

fn spawn_terminal_exit_watcher(
    app: AppHandle,
    registry: &TerminalRegistry,
    terminal_id: String,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
) {
    let registry = registry.inner.clone();
    thread::spawn(move || {
        loop {
            thread::sleep(std::time::Duration::from_millis(200));
            let exit_state = {
                let mut child = match child.lock() {
                    Ok(guard) => guard,
                    Err(_) => break,
                };
                match child.try_wait() {
                    Ok(Some(status)) => Some((Some(status.exit_code() as i32), status.success())),
                    Ok(None) => None,
                    Err(_) => Some((None, false)),
                }
            };

            let Some((code, success)) = exit_state else {
                continue;
            };

            if let Ok(mut map) = registry.lock() {
                map.remove(&terminal_id);
            }
            let payload = serde_json::json!({
                "terminalId": terminal_id,
                "code": code,
                "success": success,
            });
            let _ = app.emit("runz-terminal-exit", payload);
            break;
        }
    });
}

fn spawn_terminal_session(
    app: AppHandle,
    registry: &TerminalRegistry,
    terminal_id: String,
    cwd: String,
    cols: u16,
    rows: u16,
    exec_command: Option<String>,
) -> Result<TerminalStartPayload, String> {
    validate_terminal_cwd(&cwd)?;

    {
        let map = registry.inner.lock().map_err(|e| e.to_string())?;
        if map.contains_key(&terminal_id) {
            return Err(format!("{terminal_id} terminal is already running"));
        }
    }

    let shell_path = preferred_shell();
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(terminal_size(cols, rows))
        .map_err(|e| format!("Failed to create PTY: {e}"))?;

    let mut command = CommandBuilder::new(&shell_path);
    command.cwd(&cwd);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    command.env("TERM_PROGRAM", "Runz");
    command.env_remove("npm_config_prefix");
    command.env_remove("NPM_CONFIG_PREFIX");
    #[cfg(not(windows))]
    {
        command.arg("-il");
        if let Some(ref cmd) = exec_command {
            command.arg("-c");
            command.arg(format!("exec {cmd}"));
        }
    }

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|e| format!("Failed to spawn shell: {e}"))?;
    drop(pair.slave);

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to open PTY reader: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to open PTY writer: {e}"))?;

    let child = Arc::new(Mutex::new(child));
    let session = TerminalSession {
        writer: Arc::new(Mutex::new(writer)),
        master: Arc::new(Mutex::new(pair.master)),
        child: child.clone(),
    };

    {
        let mut map = registry.inner.lock().map_err(|e| e.to_string())?;
        map.insert(terminal_id.clone(), session);
    }

    spawn_terminal_output_pipe(app.clone(), terminal_id.clone(), reader);
    spawn_terminal_exit_watcher(app, registry, terminal_id, child);

    Ok(TerminalStartPayload {
        cwd,
        shell: display_shell_name(&shell_path),
    })
}

#[tauri::command]
fn runz_spawn(
    app: AppHandle,
    registry: State<'_, ProcRegistry>,
    monorepo_root: String,
    app_id: String,
    pnpm_dir: String,
    script: String,
) -> Result<(), String> {
    spawn_tracked_pnpm(
        app,
        &registry,
        &monorepo_root,
        app_id,
        &["-C", &pnpm_dir, "run", &script],
        None,
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunzEnvVar {
    name: String,
    value: String,
}

/// Run a root `package.json` script (e.g. `pnpm run db:migrate:local:mc:clients`).
#[tauri::command]
fn runz_spawn_root_script(
    app: AppHandle,
    registry: State<'_, ProcRegistry>,
    monorepo_root: String,
    job_id: String,
    npm_script: String,
    script_args: Option<Vec<String>>,
    env_vars: Option<Vec<RunzEnvVar>>,
) -> Result<(), String> {
    let mut args: Vec<String> = vec!["run".into(), npm_script];
    if let Some(extra) = script_args {
        if !extra.is_empty() {
            args.push("--".into());
            args.extend(extra);
        }
    }
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let env_pairs = env_vars.map(|vars| {
        vars.into_iter()
            .map(|entry| (entry.name, entry.value))
            .collect()
    });
    spawn_tracked_pnpm(
        app,
        &registry,
        &monorepo_root,
        job_id,
        &arg_refs,
        env_pairs,
    )
}

fn spawn_log_pipe(app: AppHandle, app_id: String, stream: &'static str, pipe: impl std::io::Read + Send + 'static) {
    thread::spawn(move || {
        let reader = BufReader::new(pipe);
        for line in reader.lines().map_while(Result::ok) {
            let payload = serde_json::json!({
                "appId": app_id,
                "stream": stream,
                "line": line,
            });
            let _ = app.emit("runz-log-line", payload);
        }
    });
}

#[tauri::command]
fn runz_stop(registry: State<'_, ProcRegistry>, app_id: String) -> Result<(), String> {
    let _ = stop_tracked_app(&registry, &app_id)?;
    Ok(())
}

/// Kill tracked group (if any), then SIGKILL anything still **listening** on `sweep_ports` (orphan wrangler/node).
#[tauri::command]
fn runz_kill_app(
    registry: State<'_, ProcRegistry>,
    app_id: String,
    sweep_ports: Vec<u16>,
) -> Result<KillAppOutcome, String> {
    let tracked_killed = stop_tracked_app(&registry, &app_id)?;
    thread::sleep(std::time::Duration::from_millis(150));
    let sweep = if sweep_ports.is_empty() {
        port_sweep::SweepOutcome::default()
    } else {
        sweep_listen_ports(&sweep_ports)
    };
    Ok(KillAppOutcome {
        tracked_killed,
        sweep,
    })
}

/// Kill all tracked groups, then sweep listen PIDs on `sweep_ports`.
#[tauri::command]
fn runz_stop_all(
    registry: State<'_, ProcRegistry>,
    sweep_ports: Vec<u16>,
) -> Result<StopAllOutcome, String> {
    let tracked_killed = kill_all_tracked(&registry);
    thread::sleep(std::time::Duration::from_millis(200));
    let sweep = if sweep_ports.is_empty() {
        port_sweep::SweepOutcome::default()
    } else {
        sweep_listen_ports(&sweep_ports)
    };
    Ok(StopAllOutcome {
        tracked_killed,
        sweep,
    })
}

/// Only sweep listeners on the given ports (no registry changes).
#[tauri::command]
fn runz_sweep_ports(ports: Vec<u16>) -> Result<port_sweep::SweepOutcome, String> {
    if ports.is_empty() {
        return Ok(port_sweep::SweepOutcome::default());
    }
    Ok(sweep_listen_ports(&ports))
}

#[tauri::command]
fn runz_is_running(registry: State<'_, ProcRegistry>, app_id: String) -> Result<bool, String> {
    let map = registry.inner.lock().map_err(|e| e.to_string())?;
    Ok(map.contains_key(&app_id))
}

#[tauri::command]
fn runz_terminal_start(
    app: AppHandle,
    registry: State<'_, TerminalRegistry>,
    terminal_id: String,
    cwd: String,
    cols: u16,
    rows: u16,
    exec_command: Option<String>,
) -> Result<TerminalStartPayload, String> {
    spawn_terminal_session(app, &registry, terminal_id, cwd, cols, rows, exec_command)
}

#[tauri::command]
fn runz_terminal_write(
    registry: State<'_, TerminalRegistry>,
    terminal_id: String,
    data: String,
) -> Result<(), String> {
    let session = {
        let map = registry.inner.lock().map_err(|e| e.to_string())?;
        map.get(&terminal_id)
            .cloned()
            .ok_or_else(|| format!("{terminal_id} terminal is not running"))?
    };
    let mut writer = session.writer.lock().map_err(|e| e.to_string())?;
    writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("terminal write failed: {e}"))?;
    writer
        .flush()
        .map_err(|e| format!("terminal flush failed: {e}"))?;
    Ok(())
}

#[tauri::command]
fn runz_terminal_resize(
    registry: State<'_, TerminalRegistry>,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = {
        let map = registry.inner.lock().map_err(|e| e.to_string())?;
        map.get(&terminal_id)
            .cloned()
            .ok_or_else(|| format!("{terminal_id} terminal is not running"))?
    };
    let master = session.master.lock().map_err(|e| e.to_string())?;
    master
        .resize(terminal_size(cols, rows))
        .map_err(|e| format!("terminal resize failed: {e}"))?;
    Ok(())
}

#[tauri::command]
fn runz_terminal_stop(
    registry: State<'_, TerminalRegistry>,
    terminal_id: String,
) -> Result<(), String> {
    let _ = stop_tracked_terminal(&registry, &terminal_id)?;
    Ok(())
}

#[tauri::command]
async fn runz_probe(url: String) -> Result<ProbeResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let start = std::time::Instant::now();
    match client.get(&url).send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let ms = start.elapsed().as_millis();
            Ok(ProbeResult {
                ok: status < 400,
                status,
                ms,
                error: None,
            })
        }
        Err(e) => {
            let ms = start.elapsed().as_millis();
            Ok(ProbeResult {
                ok: false,
                status: 0,
                ms,
                error: Some(e.to_string()),
            })
        }
    }
}

#[tauri::command]
async fn runz_http_request(request: HttpRequest) -> Result<HttpResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let method = reqwest::Method::from_bytes(request.method.as_bytes())
        .map_err(|e| format!("Invalid HTTP method: {e}"))?;

    let mut builder = client.request(method, &request.url);
    for header in request.headers {
        if header.name.trim().is_empty() {
            continue;
        }
        builder = builder.header(header.name, header.value);
    }
    if let Some(body) = request.body {
        if !body.is_empty() {
            builder = builder.body(body);
        }
    }

    let start = std::time::Instant::now();
    match builder.send().await {
        Ok(response) => {
            let status = response.status();
            let status_text = status
                .canonical_reason()
                .unwrap_or("Unknown")
                .to_string();
            let headers = response
                .headers()
                .iter()
                .map(|(name, value)| HttpHeader {
                    name: name.to_string(),
                    value: value
                        .to_str()
                        .map(str::to_string)
                        .unwrap_or_else(|_| "<non-utf8>".to_string()),
                })
                .collect::<Vec<_>>();
            let body = response.text().await.unwrap_or_default();
            let ms = start.elapsed().as_millis();
            Ok(HttpResponse {
                ok: status.is_success(),
                status: status.as_u16(),
                status_text,
                ms,
                headers,
                body,
                error: None,
            })
        }
        Err(error) => Ok(HttpResponse {
            ok: false,
            status: 0,
            status_text: "Request failed".to_string(),
            ms: start.elapsed().as_millis(),
            headers: Vec::new(),
            body: String::new(),
            error: Some(error.to_string()),
        }),
    }
}

/// Stream an SSE (or line-delimited) HTTP response, emitting `runz-sse-chunk` per line.
#[tauri::command]
async fn runz_http_sse(app: AppHandle, request: HttpSseRequest) -> Result<HttpSseResult, String> {
    use futures_util::StreamExt;

    let timeout_secs = request.timeout_secs.unwrap_or(130).clamp(5, 300);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| e.to_string())?;

    let method = reqwest::Method::from_bytes(request.method.as_bytes())
        .map_err(|e| format!("Invalid HTTP method: {e}"))?;

    let mut builder = client.request(method, &request.url);
    for header in request.headers {
        if header.name.trim().is_empty() {
            continue;
        }
        builder = builder.header(header.name, header.value);
    }
    if let Some(body) = request.body {
        if !body.is_empty() {
            builder = builder.body(body);
        }
    }

    let start = std::time::Instant::now();
    let response = match builder.send().await {
        Ok(resp) => resp,
        Err(error) => {
            return Ok(HttpSseResult {
                request_id: request.request_id,
                ok: false,
                status: 0,
                status_text: "Request failed".to_string(),
                ms: start.elapsed().as_millis(),
                headers: Vec::new(),
                error: Some(error.to_string()),
            });
        }
    };

    let status = response.status();
    let status_text = status
        .canonical_reason()
        .unwrap_or("Unknown")
        .to_string();
    let headers = response
        .headers()
        .iter()
        .map(|(name, value)| HttpHeader {
            name: name.to_string(),
            value: value
                .to_str()
                .map(str::to_string)
                .unwrap_or_else(|_| "<non-utf8>".to_string()),
        })
        .collect::<Vec<_>>();

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut stream_error: Option<String> = None;

    while let Some(item) = stream.next().await {
        match item {
            Ok(bytes) => {
                buffer.push_str(&String::from_utf8_lossy(&bytes));
                while let Some(idx) = buffer.find('\n') {
                    let mut line = buffer[..idx].to_string();
                    if line.ends_with('\r') {
                        line.pop();
                    }
                    buffer.drain(..=idx);
                    let _ = app.emit(
                        "runz-sse-chunk",
                        HttpSseChunkPayload {
                            request_id: request.request_id.clone(),
                            line,
                        },
                    );
                }
            }
            Err(error) => {
                stream_error = Some(error.to_string());
                break;
            }
        }
    }

    if !buffer.is_empty() {
        let _ = app.emit(
            "runz-sse-chunk",
            HttpSseChunkPayload {
                request_id: request.request_id.clone(),
                line: buffer,
            },
        );
    }

    Ok(HttpSseResult {
        request_id: request.request_id,
        ok: status.is_success() && stream_error.is_none(),
        status: status.as_u16(),
        status_text,
        ms: start.elapsed().as_millis(),
        headers,
        error: stream_error,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ProcRegistry::default())
        .manage(TerminalRegistry::default())
        .invoke_handler(tauri::generate_handler![
            runz_get_settings,
            runz_set_monorepo_root,
            runz_detect_monorepo_root,
            runz_read_repo_text,
            runz_write_repo_text,
            runz_repo_path_stat,
            runz_copy_repo_file,
            runz_get_runtime_versions,
            runz_check_mkdocs,
            runz_check_migration_target,
            runz_spawn,
            runz_spawn_root_script,
            runz_stop,
            runz_kill_app,
            runz_stop_all,
            runz_sweep_ports,
            runz_is_running,
            runz_probe,
            runz_http_request,
            runz_http_sse,
            runz_terminal_start,
            runz_terminal_write,
            runz_terminal_resize,
            runz_terminal_stop,
            data_browser::runz_data_d1_scan,
            data_browser::runz_data_d1_tables,
            data_browser::runz_data_d1_query,
            data_browser::runz_data_kv_scan,
            data_browser::runz_data_kv_entries,
            data_browser::runz_data_kv_blob,
            data_browser::runz_data_r2_scan,
            data_browser::runz_data_r2_objects,
            git_info::runz_git_summary,
            git_info::runz_git_status_short,
            git_info::runz_git_base_ref,
            story_finder::runz_find_story_file,
            md_finder::runz_list_repo_md_files,
            checkpoint_finder::runz_list_checkpoint_story_keys,
            d1_migration_check::runz_check_local_d1_migration,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                let n = app_handle
                    .try_state::<ProcRegistry>()
                    .map(|reg| kill_all_tracked(&reg))
                    .unwrap_or(0);
                let terminal_count = app_handle
                    .try_state::<TerminalRegistry>()
                    .map(|reg| kill_all_terminals(&reg))
                    .unwrap_or(0);
                let sweep = sweep_listen_ports(EXIT_SWEEP_PORTS);
                if n > 0 || terminal_count > 0 || !sweep.killed_pids.is_empty() {
                    eprintln!(
                        "[runz] Exit: tracked groups killed={n}, terminals killed={terminal_count}, port-sweep PIDs={:?} errors={:?}",
                        sweep.killed_pids, sweep.errors
                    );
                }
            }
        });
}
