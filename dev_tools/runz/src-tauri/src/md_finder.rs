use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

const ALLOWED_SCAN_ROOTS: &[&str] = &[".", "docs", "_bmad-output"];

const SKIP_DIR_NAMES: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    ".next",
    ".turbo",
    ".wrangler",
    ".cursor",
    "coverage",
];

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoMdFileEntry {
    relative_path: String,
    modified_at_ms: i64,
}

#[tauri::command]
pub fn runz_list_repo_md_files(
    monorepo_root: String,
    scan_root: String,
) -> Result<Vec<RepoMdFileEntry>, String> {
    if !ALLOWED_SCAN_ROOTS.contains(&scan_root.as_str()) {
        return Err(format!("Invalid scan root: {scan_root}"));
    }

    let root = Path::new(&monorepo_root);
    let target = if scan_root == "." {
        root.to_path_buf()
    } else {
        root.join(&scan_root)
    };
    if !target.starts_with(root) {
        return Err("scan root escapes monorepo root".to_string());
    }
    if !target.is_dir() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    if scan_root == "." {
        collect_md_files_shallow(&target, root, &mut files)?;
    } else {
        collect_md_files(&target, root, &mut files)?;
    }
    files.sort_by(|a, b| {
        b.modified_at_ms
            .cmp(&a.modified_at_ms)
            .then_with(|| a.relative_path.cmp(&b.relative_path))
    });
    Ok(files)
}

fn should_skip_dir(name: &str) -> bool {
    SKIP_DIR_NAMES.contains(&name)
}

fn file_modified_at_ms(path: &Path) -> Result<i64, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = metadata
        .modified()
        .or_else(|_| metadata.created())
        .unwrap_or(SystemTime::UNIX_EPOCH);
    modified
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .map_err(|e| e.to_string())
}

fn collect_md_files_shallow(
    dir: &Path,
    repo_root: &Path,
    out: &mut Vec<RepoMdFileEntry>,
) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if !file_type.is_file() {
            continue;
        }
        if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }
        let relative = path
            .strip_prefix(repo_root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| path.to_string_lossy().to_string());
        let modified_at_ms = file_modified_at_ms(&path)?;
        out.push(RepoMdFileEntry {
            relative_path: relative,
            modified_at_ms,
        });
    }
    Ok(())
}

fn collect_md_files(
    dir: &Path,
    repo_root: &Path,
    out: &mut Vec<RepoMdFileEntry>,
) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            let dir_name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default();
            if should_skip_dir(dir_name) {
                continue;
            }
            collect_md_files(&path, repo_root, out)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }
        let relative = path
            .strip_prefix(repo_root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| path.to_string_lossy().to_string());
        let modified_at_ms = file_modified_at_ms(&path)?;
        out.push(RepoMdFileEntry {
            relative_path: relative,
            modified_at_ms,
        });
    }
    Ok(())
}
