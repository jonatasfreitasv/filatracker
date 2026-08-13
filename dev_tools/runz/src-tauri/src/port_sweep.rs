//! Find listeners on known dev/preview ports and SIGKILL them (orphan `pnpm` / `wrangler` / `node`).
//! Keep port list in sync with `dev_tools/runz/src/apps.manifest.ts` (RUNZ_APPS dev + preview).

use serde::Serialize;
use std::collections::HashSet;
use std::process::Command;

/// All TCP listen ports used by Runz-managed apps (dev and preview). Duplicated from the TS manifest.
/// Keep in sync with `dev_tools/runz/src/apps.manifest.ts` (`allRunzListenPorts`).
pub const EXIT_SWEEP_PORTS: &[u16] = &[5173, 4173];

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SweepOutcome {
    pub killed_pids: Vec<u32>,
    pub errors: Vec<String>,
}

pub fn sweep_listen_ports(ports: &[u16]) -> SweepOutcome {
    let my_pid = std::process::id();
    let mut seen = HashSet::<u32>::new();
    let mut errors = Vec::new();

    for &port in ports {
        match list_listen_pids(port) {
            Ok(pids) => {
                for pid in pids {
                    if pid == 1 || u64::from(pid) == u64::from(my_pid) {
                        continue;
                    }
                    seen.insert(pid);
                }
            }
            Err(e) => errors.push(format!("port {port}: {e}")),
        }
    }

    let mut killed = Vec::new();
    for pid in seen {
        match kill_pid_force(pid) {
            Ok(()) => killed.push(pid),
            Err(e) => errors.push(format!("pid {pid}: {e}")),
        }
    }
    killed.sort_unstable();
    SweepOutcome {
        killed_pids: killed,
        errors,
    }
}

#[cfg(unix)]
fn list_listen_pids(port: u16) -> Result<Vec<u32>, String> {
    let output = Command::new("lsof")
        .args([
            "-nP",
            &format!("-iTCP:{port}"),
            "-sTCP:LISTEN",
            "-t",
        ])
        .output()
        .map_err(|e| format!("lsof: {e} (is `lsof` installed?)"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }

    let mut pids = Vec::new();
    for line in trimmed.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let pid: u32 = line
            .parse()
            .map_err(|_| format!("lsof parse pid: {line:?}"))?;
        pids.push(pid);
    }
    Ok(pids)
}

#[cfg(windows)]
fn list_listen_pids(port: u16) -> Result<Vec<u32>, String> {
    let script = format!(
        "(Get-NetTCPConnection -LocalPort {} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)",
        port
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .map_err(|e| format!("powershell: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut pids = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(pid) = line.parse::<u32>() {
            if pid > 0 {
                pids.push(pid);
            }
        }
    }
    Ok(pids)
}

#[cfg(all(not(unix), not(windows)))]
fn list_listen_pids(_port: u16) -> Result<Vec<u32>, String> {
    Err("port sweep is only implemented on macOS, Linux, and Windows".into())
}

#[cfg(unix)]
fn kill_pid_force(pid: u32) -> Result<(), String> {
    let status = Command::new("kill")
        .args(["-9", &pid.to_string()])
        .status()
        .map_err(|e| format!("kill: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("kill exit {:?}", status.code()))
    }
}

#[cfg(windows)]
fn kill_pid_force(pid: u32) -> Result<(), String> {
    let status = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/F"])
        .status()
        .map_err(|e| format!("taskkill: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("taskkill exit {:?}", status.code()))
    }
}

#[cfg(all(not(unix), not(windows)))]
fn kill_pid_force(_pid: u32) -> Result<(), String> {
    Err("unsupported OS".into())
}
