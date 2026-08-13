use std::process::Command;

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSummary {
    pub branch: String,
    pub short_sha: String,
    pub ahead: i32,
    pub behind: i32,
    pub dirty_count: u32,
    pub merge_conflict: bool,
}

fn git_output(monorepo_root: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(monorepo_root)
        .args(args)
        .output()
        .map_err(|e| format!("git failed to start: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("git {:?} exited with {}", args, output.status)
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub fn runz_git_summary(monorepo_root: String) -> Result<GitSummary, String> {
    let branch = git_output(&monorepo_root, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    let short_sha = git_output(&monorepo_root, &["rev-parse", "--short", "HEAD"])?;

    let base = resolve_base_ref(&monorepo_root).unwrap_or_else(|| "main".to_string());
    let mut ahead = 0i32;
    let mut behind = 0i32;
    if let Ok(counts) = git_output(
        &monorepo_root,
        &["rev-list", "--left-right", "--count", &format!("HEAD...{base}")],
    ) {
        let parts: Vec<&str> = counts.split_whitespace().collect();
        if parts.len() == 2 {
            ahead = parts[0].parse().unwrap_or(0);
            behind = parts[1].parse().unwrap_or(0);
        }
    }

    let porcelain = git_output(&monorepo_root, &["status", "--porcelain"])?;
    let dirty_count = porcelain.lines().filter(|l| !l.trim().is_empty()).count() as u32;
    let merge_conflict = porcelain.lines().any(|line| {
        line.starts_with("UU ")
            || line.starts_with("AA ")
            || line.starts_with("DD ")
            || line.starts_with("AU ")
            || line.starts_with("UA ")
            || line.starts_with("DU ")
            || line.starts_with("UD ")
    });

    Ok(GitSummary {
        branch,
        short_sha,
        ahead,
        behind,
        dirty_count,
        merge_conflict,
    })
}

#[tauri::command]
pub fn runz_git_status_short(monorepo_root: String) -> Result<Vec<String>, String> {
    let output = git_output(&monorepo_root, &["status", "-sb"])?;
    let mut lines: Vec<String> = output.lines().map(String::from).collect();
    if lines.len() < 30 {
        if let Ok(names) = git_output(
            &monorepo_root,
            &["status", "--porcelain", "--untracked-files=no"],
        ) {
            for line in names.lines().map(String::from) {
                if lines.len() >= 30 {
                    break;
                }
                if !lines.contains(&line) {
                    lines.push(line);
                }
            }
        }
    }
    lines.truncate(30);
    Ok(lines)
}

fn resolve_base_ref(monorepo_root: &str) -> Option<String> {
    for candidate in ["origin/main", "main", "master"] {
        let ok = Command::new("git")
            .arg("-C")
            .arg(monorepo_root)
            .arg("rev-parse")
            .arg("--verify")
            .arg(candidate)
            .output()
            .ok()?;
        if ok.status.success() {
            return Some(candidate.to_string());
        }
    }
    None
}

#[tauri::command]
pub fn runz_git_base_ref(monorepo_root: String) -> Result<String, String> {
    resolve_base_ref(&monorepo_root)
        .ok_or_else(|| "No base ref found (origin/main, main, master)".to_string())
}
