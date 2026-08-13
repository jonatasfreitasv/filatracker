use std::fs;
use std::path::{Path, PathBuf};

#[tauri::command]
pub fn runz_find_story_file(
    monorepo_root: String,
    story_location: String,
    story_key: String,
) -> Result<Option<String>, String> {
    if story_key.is_empty() || story_key.contains("..") || story_key.contains('/') {
        return Err("Invalid story key".to_string());
    }

    let root = PathBuf::from(&monorepo_root);
    let location = root.join(&story_location);
    if !location.starts_with(&root) {
        return Err("story_location escapes monorepo root".to_string());
    }

    let direct = location.join(format!("{story_key}.md"));
    if direct.is_file() {
        return Ok(Some(
            direct
                .strip_prefix(&root)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| direct.to_string_lossy().to_string()),
        ));
    }

    let archive = location.join("archive").join(format!("{story_key}.md"));
    if archive.is_file() {
        return Ok(Some(
            archive
                .strip_prefix(&root)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| archive.to_string_lossy().to_string()),
        ));
    }

    find_by_prefix(&location, &story_key, 2, &root)
}

fn find_by_prefix(
    dir: &Path,
    story_key: &str,
    max_depth: u32,
    repo_root: &Path,
) -> Result<Option<String>, String> {
    if max_depth == 0 || !dir.is_dir() {
        return Ok(None);
    }

    let mut matches: Vec<PathBuf> = Vec::new();
    collect_story_matches(dir, story_key, max_depth, &mut matches)?;

    matches.sort();
    if matches.len() == 1 {
        let path = &matches[0];
        return Ok(Some(
            path.strip_prefix(repo_root)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| path.to_string_lossy().to_string()),
        ));
    }

    Ok(None)
}

fn collect_story_matches(
    dir: &Path,
    story_key: &str,
    depth: u32,
    out: &mut Vec<PathBuf>,
) -> Result<(), String> {
    if depth == 0 {
        return Ok(());
    }
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            collect_story_matches(&path, story_key, depth - 1, out)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !name.ends_with(".md") {
            continue;
        }
        let stem = name.strip_suffix(".md").unwrap_or(name);
        if stem == story_key || stem.starts_with(&format!("{story_key}-")) {
            out.push(path);
        }
    }
    Ok(())
}
