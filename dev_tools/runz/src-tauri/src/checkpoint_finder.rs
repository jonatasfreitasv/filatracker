use std::fs;
use std::path::{Path, PathBuf};

const CHECKPOINT_REVIEW_DIR: &str = "_bmad-output/checkpoint-review";
const CHECKPOINT_SUFFIX: &str = "-checkpoint.md";

#[tauri::command]
pub fn runz_list_checkpoint_story_keys(monorepo_root: String) -> Result<Vec<String>, String> {
    let root = PathBuf::from(&monorepo_root);
    let checkpoint_dir = root.join(CHECKPOINT_REVIEW_DIR);
    if !checkpoint_dir.starts_with(&root) {
        return Err("checkpoint-review path escapes monorepo root".to_string());
    }
    if !checkpoint_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut keys = Vec::new();
    collect_checkpoint_keys(&checkpoint_dir, &mut keys)?;
    keys.sort();
    keys.dedup();
    Ok(keys)
}

fn collect_checkpoint_keys(dir: &Path, out: &mut Vec<String>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            collect_checkpoint_keys(&path, out)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !name.ends_with(CHECKPOINT_SUFFIX) {
            continue;
        }
        let stem = name.strip_suffix(CHECKPOINT_SUFFIX).unwrap_or(name);
        if !stem.is_empty() {
            out.push(stem.to_string());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checkpoint_suffix_strips_story_key() {
        let name = "3p-3-arqion-provisioning-contrato-canonico-mc-para-produto-checkpoint.md";
        let stem = name.strip_suffix(CHECKPOINT_SUFFIX).unwrap();
        assert_eq!(stem, "3p-3-arqion-provisioning-contrato-canonico-mc-para-produto");
    }
}
