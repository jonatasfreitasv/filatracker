use std::process::Command;

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalD1MigrationStatus {
    pub applied: bool,
    pub message: String,
}

fn interpret_migrations_list_output(stdout: &str, stderr: &str, success: bool) -> LocalD1MigrationStatus {
    if stdout.contains("No migrations to apply!") {
        return LocalD1MigrationStatus {
            applied: true,
            message: "All migrations applied.".to_string(),
        };
    }

    if stdout.contains("Migrations to be applied:") {
        let pending = stdout
            .lines()
            .filter(|line| line.contains(".sql"))
            .count();
        let message = if pending > 0 {
            format!("{pending} migration(s) pending.")
        } else {
            "Migrations pending.".to_string()
        };
        return LocalD1MigrationStatus {
            applied: false,
            message,
        };
    }

    if !success {
        let detail = stderr.trim();
        let message = if detail.is_empty() {
            "wrangler d1 migrations list failed.".to_string()
        } else {
            detail.lines().next().unwrap_or(detail).to_string()
        };
        return LocalD1MigrationStatus {
            applied: false,
            message,
        };
    }

    LocalD1MigrationStatus {
        applied: false,
        message: "Could not determine migration status from wrangler output.".to_string(),
    }
}

#[tauri::command]
pub fn runz_check_local_d1_migration(
    monorepo_root: String,
    workspace: String,
    d1_database_name: String,
) -> Result<LocalD1MigrationStatus, String> {
    if workspace != "root" {
        return Err(format!("Invalid workspace: {workspace}"));
    }
    if d1_database_name.is_empty()
        || d1_database_name.contains('/')
        || d1_database_name.contains('\\')
        || d1_database_name.contains("..")
    {
        return Err(format!("Invalid D1 database name: {d1_database_name:?}"));
    }

    let output = Command::new("pnpm")
        .arg("exec")
        .arg("wrangler")
        .arg("d1")
        .arg("migrations")
        .arg("list")
        .arg(&d1_database_name)
        .arg("--local")
        .arg("-c")
        .arg("wrangler.ingest.jsonc")
        .current_dir(&monorepo_root)
        .output()
        .map_err(|e| format!("Failed to run wrangler migrations list: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    Ok(interpret_migrations_list_output(
        &stdout,
        &stderr,
        output.status.success(),
    ))
}

#[cfg(test)]
mod tests {
    use super::interpret_migrations_list_output;

    #[test]
    fn treats_no_migrations_to_apply_as_applied() {
        let status = interpret_migrations_list_output(
            "✅ No migrations to apply!\n",
            "",
            true,
        );
        assert!(status.applied);
    }

    #[test]
    fn treats_pending_table_as_not_applied() {
        let stdout = "Migrations to be applied:\n│ 0001_init.sql │\n│ 0002_more.sql │\n";
        let status = interpret_migrations_list_output(stdout, "", true);
        assert!(!status.applied);
        assert!(status.message.contains("2 migration(s) pending"));
    }
}
