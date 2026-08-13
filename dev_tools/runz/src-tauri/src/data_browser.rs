use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use hmac::{Hmac, Mac};
use rusqlite::{params, Connection, OpenFlags};
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::wrangler_jsonc::parse_wrangler_jsonc_file;

type HmacSha256 = Hmac<Sha256>;

// ──────────────────────────────────────────────────────────────────────────────
//  Wrangler binding resolution
// ──────────────────────────────────────────────────────────────────────────────

#[derive(Default)]
struct WranglerBindings {
    /// Miniflare DO idFromName(database_id) -> (binding, database_name)
    d1: HashMap<String, (String, String)>,
    /// namespace_id -> binding
    kv: HashMap<String, String>,
    /// bucket_name -> binding
    r2: HashMap<String, String>,
}

/// Miniflare / workerd Durable Object `idFromName` used for local persist filenames.
///
/// Matches `durableObjectNamespaceIdFromName` in miniflare:
/// `HMAC-SHA256(SHA256(uniqueKey), name)` truncated + signed → 32-byte hex.
fn durable_object_id_from_name(unique_key: &str, name: &str) -> String {
    let key = Sha256::digest(unique_key.as_bytes());
    let mut name_hmac = HmacSha256::new_from_slice(&key).expect("HMAC accepts any key length");
    name_hmac.update(name.as_bytes());
    let name_hmac = name_hmac.finalize().into_bytes();
    let name_hmac = &name_hmac[..16];

    let mut mac = HmacSha256::new_from_slice(&key).expect("HMAC accepts any key length");
    mac.update(name_hmac);
    let mac = mac.finalize().into_bytes();
    let mac = &mac[..16];

    let mut out = String::with_capacity(64);
    for byte in name_hmac.iter().chain(mac.iter()) {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

const D1_UNIQUE_KEY: &str = "miniflare-D1DatabaseObject";
const KV_UNIQUE_KEY: &str = "miniflare-KVNamespaceObject";
const R2_UNIQUE_KEY: &str = "miniflare-R2BucketObject";

fn load_wrangler_bindings(monorepo_root: &str) -> WranglerBindings {
    let mut b = WranglerBindings::default();
    let root = PathBuf::from(monorepo_root);
    for config_name in ["wrangler.ingest.jsonc", "wrangler.web.jsonc"] {
        let wrangler_path = root.join(config_name);
        let Some(val) = parse_wrangler_jsonc_file(&wrangler_path) else {
            continue;
        };
        if let Some(d1s) = val.get("d1_databases").and_then(|v| v.as_array()) {
            for db in d1s {
                let Some(id) = db.get("database_id").and_then(|v| v.as_str()) else {
                    continue;
                };
                let binding = db
                    .get("binding")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let name = db
                    .get("database_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let object_id = durable_object_id_from_name(D1_UNIQUE_KEY, id);
                match b.d1.get(&object_id) {
                    Some((existing, _)) if !existing.is_empty() && binding.is_empty() => {}
                    _ => {
                        b.d1.insert(object_id, (binding, name));
                    }
                }
            }
        }
        if let Some(kvs) = val.get("kv_namespaces").and_then(|v| v.as_array()) {
            for ns in kvs {
                let Some(id) = ns.get("id").and_then(|v| v.as_str()) else {
                    continue;
                };
                let binding = ns
                    .get("binding")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                b.kv.insert(id.to_string(), binding);
            }
        }
        if let Some(r2s) = val.get("r2_buckets").and_then(|v| v.as_array()) {
            for bucket in r2s {
                let Some(name) = bucket.get("bucket_name").and_then(|v| v.as_str()) else {
                    continue;
                };
                let binding = bucket
                    .get("binding")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                b.r2.insert(name.to_string(), binding);
            }
        }
    }
    b
}

// ──────────────────────────────────────────────────────────────────────────────
//  SQLite helpers
// ──────────────────────────────────────────────────────────────────────────────

fn open_ro(path: &PathBuf) -> Result<Connection, String> {
    Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("Cannot open {}: {e}", path.display()))
}

fn value_ref_to_json(v: rusqlite::types::ValueRef<'_>) -> serde_json::Value {
    use rusqlite::types::ValueRef;
    match v {
        ValueRef::Null => serde_json::Value::Null,
        ValueRef::Integer(i) => serde_json::Value::Number(i.into()),
        ValueRef::Real(f) => serde_json::Number::from_f64(f)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        ValueRef::Text(b) => {
            serde_json::Value::String(String::from_utf8_lossy(b).into_owned())
        }
        ValueRef::Blob(b) => match std::str::from_utf8(b) {
            Ok(s) => serde_json::Value::String(s.to_owned()),
            Err(_) => serde_json::Value::String(format!("<blob {} B>", b.len())),
        },
    }
}

fn wrangler_state(monorepo_root: &str) -> PathBuf {
    PathBuf::from(monorepo_root)
        .join(".wrangler")
        .join("state")
        .join("v3")
}

// ──────────────────────────────────────────────────────────────────────────────
//  Validation
// ──────────────────────────────────────────────────────────────────────────────

fn validate_component(s: &str) -> Result<(), String> {
    if s.is_empty() || s.contains('/') || s.contains('\\') || s.contains("..") {
        Err(format!("Invalid path component: {s:?}"))
    } else {
        Ok(())
    }
}

fn validate_hash(s: &str) -> Result<(), String> {
    if s.len() != 64 || !s.chars().all(|c| c.is_ascii_hexdigit()) {
        Err(format!("Invalid hash: {s:?}"))
    } else {
        Ok(())
    }
}

// ──────────────────────────────────────────────────────────────────────────────
//  D1
// ──────────────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct D1DbEntry {
    pub hash: String,
    pub database_name: String,
    pub binding: String,
    pub size_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct D1TableInfo {
    pub name: String,
    pub row_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct D1QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub truncated: bool,
}

#[tauri::command]
pub fn runz_data_d1_scan(monorepo_root: String) -> Result<Vec<D1DbEntry>, String> {
    let d1_dir = wrangler_state(&monorepo_root)
        .join("d1")
        .join("miniflare-D1DatabaseObject");
    let bindings = load_wrangler_bindings(&monorepo_root);

    let mut result = Vec::new();
    let Ok(dir) = fs::read_dir(&d1_dir) else {
        return Ok(result);
    };
    for entry in dir.flatten() {
        let path = entry.path();
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if !name.ends_with(".sqlite") || name.starts_with("metadata") {
            continue;
        }
        let hash = name.trim_end_matches(".sqlite").to_string();
        let size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        let (binding, database_name) = bindings.d1.get(&hash).cloned().unwrap_or_default();
        result.push(D1DbEntry {
            hash,
            database_name,
            binding,
            size_bytes,
        });
    }
    result.sort_by(|a, b| {
        a.database_name
            .cmp(&b.database_name)
            .then(a.hash.cmp(&b.hash))
    });
    Ok(result)
}

#[tauri::command]
pub fn runz_data_d1_tables(
    monorepo_root: String,
    db_hash: String,
) -> Result<Vec<D1TableInfo>, String> {
    validate_hash(&db_hash)?;
    let path = wrangler_state(&monorepo_root)
        .join("d1")
        .join("miniflare-D1DatabaseObject")
        .join(format!("{db_hash}.sqlite"));
    let conn = open_ro(&path)?;

    let mut stmt = conn
        .prepare(
            "SELECT name FROM sqlite_master \
             WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' \
             ORDER BY name",
        )
        .map_err(|e| e.to_string())?;

    let names: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();

    let mut tables = Vec::new();
    for name in names {
        let row_count: i64 = conn
            .query_row(
                &format!("SELECT COUNT(*) FROM \"{}\"", name.replace('"', "")),
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        tables.push(D1TableInfo { name, row_count });
    }
    Ok(tables)
}

const ROW_CAP: usize = 500;

#[tauri::command]
pub fn runz_data_d1_query(
    monorepo_root: String,
    db_hash: String,
    sql: String,
    limit: Option<u32>,
) -> Result<D1QueryResult, String> {
    validate_hash(&db_hash)?;
    let sql_up = sql.trim().to_uppercase();
    if !sql_up.starts_with("SELECT") && !sql_up.starts_with("WITH") {
        return Err("Only SELECT queries are allowed".to_string());
    }

    let cap = limit.unwrap_or(100).min(500) as usize;
    let sql_trimmed = sql.trim();
    let effective_sql = if sql_up.contains(" LIMIT ") {
        sql_trimmed.to_string()
    } else {
        format!("{sql_trimmed} LIMIT {}", cap + 1)
    };

    let path = wrangler_state(&monorepo_root)
        .join("d1")
        .join("miniflare-D1DatabaseObject")
        .join(format!("{db_hash}.sqlite"));
    let conn = open_ro(&path)?;

    let mut stmt = conn.prepare(&effective_sql).map_err(|e| e.to_string())?;
    let col_count = stmt.column_count();
    let columns: Vec<String> = (0..col_count)
        .map(|i| stmt.column_name(i).unwrap_or("?").to_string())
        .collect();

    let mut rows = Vec::new();
    let mut raw = stmt.query([]).map_err(|e| e.to_string())?;
    while let Ok(Some(row)) = raw.next() {
        let vals: Vec<serde_json::Value> = (0..col_count)
            .map(|i| {
                row.get_ref(i)
                    .map(value_ref_to_json)
                    .unwrap_or(serde_json::Value::Null)
            })
            .collect();
        rows.push(vals);
        if rows.len() > cap.min(ROW_CAP) {
            break;
        }
    }

    let truncated = rows.len() > cap;
    if truncated {
        rows.truncate(cap);
    }
    Ok(D1QueryResult {
        columns,
        rows,
        truncated,
    })
}

// ──────────────────────────────────────────────────────────────────────────────
//  KV
// ──────────────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KvNsEntry {
    pub id: String,
    pub binding: String,
    pub entry_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KvEntry {
    pub key: String,
    pub blob_id: String,
    pub expiration: Option<i64>,
    pub metadata_json: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KvBlobResult {
    pub content: String,
    pub is_utf8: bool,
}

#[tauri::command]
pub fn runz_data_kv_scan(monorepo_root: String) -> Result<Vec<KvNsEntry>, String> {
    let kv_dir = wrangler_state(&monorepo_root).join("kv");
    let meta_dir = kv_dir.join("miniflare-KVNamespaceObject");
    let bindings = load_wrangler_bindings(&monorepo_root);

    let mut result = Vec::new();
    let Ok(dir) = fs::read_dir(&kv_dir) else {
        return Ok(result);
    };
    for entry in dir.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let ns_id = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) if n != "miniflare-KVNamespaceObject" => n.to_string(),
            _ => continue,
        };
        let binding = bindings.kv.get(&ns_id).cloned().unwrap_or_default();

        let hash = durable_object_id_from_name(KV_UNIQUE_KEY, &ns_id);
        let sqlite = meta_dir.join(format!("{hash}.sqlite"));
        let entry_count = if sqlite.exists() {
            open_ro(&sqlite)
                .ok()
                .and_then(|c| {
                    c.query_row("SELECT COUNT(*) FROM _mf_entries", [], |r| {
                        r.get::<_, i64>(0)
                    })
                    .ok()
                })
                .unwrap_or(0)
        } else {
            0
        };
        result.push(KvNsEntry {
            id: ns_id,
            binding,
            entry_count,
        });
    }
    result.sort_by(|a, b| a.binding.cmp(&b.binding).then(a.id.cmp(&b.id)));
    Ok(result)
}

#[tauri::command]
pub fn runz_data_kv_entries(
    monorepo_root: String,
    ns_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<KvEntry>, String> {
    validate_component(&ns_id)?;
    let hash = durable_object_id_from_name(KV_UNIQUE_KEY, &ns_id);
    let sqlite = wrangler_state(&monorepo_root)
        .join("kv")
        .join("miniflare-KVNamespaceObject")
        .join(format!("{hash}.sqlite"));
    let conn = open_ro(&sqlite)?;

    let lim = limit.unwrap_or(50).min(200);
    let off = offset.unwrap_or(0).max(0);
    let mut stmt = conn
        .prepare(
            "SELECT key, blob_id, expiration, metadata FROM _mf_entries \
             ORDER BY key LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| e.to_string())?;

    let entries = stmt
        .query_map(params![lim, off], |row| {
            Ok(KvEntry {
                key: row.get(0)?,
                blob_id: row.get(1)?,
                expiration: row.get(2)?,
                metadata_json: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(entries)
}

#[tauri::command]
pub fn runz_data_kv_blob(
    monorepo_root: String,
    ns_id: String,
    blob_id: String,
) -> Result<KvBlobResult, String> {
    validate_component(&ns_id)?;
    validate_component(&blob_id)?;
    let blob_path = wrangler_state(&monorepo_root)
        .join("kv")
        .join(&ns_id)
        .join("blobs")
        .join(&blob_id);
    let bytes = fs::read(&blob_path).map_err(|e| format!("Cannot read blob: {e}"))?;
    match String::from_utf8(bytes.clone()) {
        Ok(s) => Ok(KvBlobResult {
            content: s,
            is_utf8: true,
        }),
        Err(_) => Ok(KvBlobResult {
            content: format!("<binary {} bytes>", bytes.len()),
            is_utf8: false,
        }),
    }
}

// ──────────────────────────────────────────────────────────────────────────────
//  R2
// ──────────────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct R2BucketEntry {
    pub name: String,
    pub binding: String,
    pub object_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct R2ObjectEntry {
    pub key: String,
    pub blob_id: Option<String>,
    pub size: i64,
    pub etag: String,
    pub uploaded: i64,
    pub http_metadata: Option<String>,
}

#[tauri::command]
pub fn runz_data_r2_scan(monorepo_root: String) -> Result<Vec<R2BucketEntry>, String> {
    let r2_dir = wrangler_state(&monorepo_root).join("r2");
    let meta_dir = r2_dir.join("miniflare-R2BucketObject");
    let bindings = load_wrangler_bindings(&monorepo_root);

    let mut result = Vec::new();
    let Ok(dir) = fs::read_dir(&r2_dir) else {
        return Ok(result);
    };
    for entry in dir.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) if n != "miniflare-R2BucketObject" => n.to_string(),
            _ => continue,
        };
        let binding = bindings.r2.get(&name).cloned().unwrap_or_default();

        let hash = durable_object_id_from_name(R2_UNIQUE_KEY, &name);
        let sqlite = meta_dir.join(format!("{hash}.sqlite"));
        let object_count = if sqlite.exists() {
            open_ro(&sqlite)
                .ok()
                .and_then(|c| {
                    c.query_row("SELECT COUNT(*) FROM _mf_objects", [], |r| {
                        r.get::<_, i64>(0)
                    })
                    .ok()
                })
                .unwrap_or(0)
        } else {
            0
        };
        result.push(R2BucketEntry {
            name,
            binding,
            object_count,
        });
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

#[tauri::command]
pub fn runz_data_r2_objects(
    monorepo_root: String,
    bucket_name: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<R2ObjectEntry>, String> {
    validate_component(&bucket_name)?;
    let hash = durable_object_id_from_name(R2_UNIQUE_KEY, &bucket_name);
    let sqlite = wrangler_state(&monorepo_root)
        .join("r2")
        .join("miniflare-R2BucketObject")
        .join(format!("{hash}.sqlite"));
    let conn = open_ro(&sqlite)?;

    let lim = limit.unwrap_or(50).min(200);
    let off = offset.unwrap_or(0).max(0);
    let mut stmt = conn
        .prepare(
            "SELECT key, blob_id, size, etag, uploaded, http_metadata FROM _mf_objects \
             ORDER BY key LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| e.to_string())?;

    let objects = stmt
        .query_map(params![lim, off], |row| {
            Ok(R2ObjectEntry {
                key: row.get(0)?,
                blob_id: row.get(1)?,
                size: row.get(2)?,
                etag: row.get(3)?,
                uploaded: row.get(4)?,
                http_metadata: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(objects)
}

#[cfg(test)]
mod tests {
    use super::{durable_object_id_from_name, D1_UNIQUE_KEY, KV_UNIQUE_KEY, R2_UNIQUE_KEY};

    #[test]
    fn d1_object_id_matches_miniflare_id_from_name() {
        // Scientia Vis local D1_CHAT database_id → known persist filename stem.
        let id = durable_object_id_from_name(D1_UNIQUE_KEY, "b066b0cb-7378-45de-8bf0-48a31739f578");
        assert_eq!(
            id,
            "995e56b5b92467bb8783933b10a6958f60f058b446342843eea7f7b6b0c27aab"
        );
    }

    #[test]
    fn kv_and_r2_object_ids_use_their_unique_keys() {
        let kv = durable_object_id_from_name(KV_UNIQUE_KEY, "98fb67e23f0948dfa4592f6eeec1656d");
        assert_eq!(
            kv,
            "4dc735f5811ceb24bbf2a356e112750aacf93e22a21521c0b1fe3f5b49ee355e"
        );
        let r2 = durable_object_id_from_name(R2_UNIQUE_KEY, "scientia-vis-cloud-opennext-cache");
        assert_eq!(
            r2,
            "d62f6061cb458b62318466484c17c921d4153dffc430ea07d5743cb3cc3ef18b"
        );
    }
}
