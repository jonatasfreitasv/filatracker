import { useCallback, useEffect, useState } from 'react';
import { RUNZ_DATA_QUERIES } from '../data-queries.manifest';
import { d1ResultToCsv, downloadCsv } from '../data-export';
import {
  runzDataD1Query,
  runzDataD1Scan,
  runzDataD1Tables,
  runzDataKvBlob,
  runzDataKvEntries,
  runzDataKvScan,
  runzDataR2Objects,
  runzDataR2Scan,
  type RunzD1DbEntry,
  type RunzD1QueryResult,
  type RunzD1TableInfo,
  type RunzKvBlobResult,
  type RunzKvEntry,
  type RunzKvNsEntry,
  type RunzR2BucketEntry,
  type RunzR2ObjectEntry,
} from '../runz-tauri';

type DataSubTab = 'd1' | 'kv' | 'r2';

type DataTabProps = {
  monorepoRoot: string;
};

// ── Helpers ──────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtTimestamp(ms: number): string {
  return new Date(ms).toLocaleString();
}

function labelFor(binding: string, fallback: string): string {
  return binding || fallback;
}

// ── D1 Panel ─────────────────────────────────────────────

function D1Panel({ monorepoRoot }: { monorepoRoot: string }) {
  const [databases, setDatabases] = useState<RunzD1DbEntry[]>([]);
  const [selectedDb, setSelectedDb] = useState<RunzD1DbEntry | null>(null);
  const [tables, setTables] = useState<RunzD1TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<RunzD1QueryResult | null>(null);
  const [sqlInput, setSqlInput] = useState('');
  const [savedQueryId, setSavedQueryId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matchingSavedQueries = RUNZ_DATA_QUERIES.filter(
    (q) => !selectedDb || q.binding === selectedDb.binding
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    runzDataD1Scan(monorepoRoot)
      .then(setDatabases)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [monorepoRoot]);

  const selectDb = useCallback(
    async (db: RunzD1DbEntry) => {
      setSelectedDb(db);
      setSelectedTable(null);
      setQueryResult(null);
      setSqlInput('');
      setError(null);
      try {
        const t = await runzDataD1Tables(monorepoRoot, db.hash);
        setTables(t);
      } catch (e: unknown) {
        setError(String(e));
        setTables([]);
      }
    },
    [monorepoRoot]
  );

  const selectTable = useCallback(
    async (name: string) => {
      if (!selectedDb) return;
      setSelectedTable(name);
      setSqlInput(`SELECT * FROM "${name}" LIMIT 50`);
      setError(null);
      try {
        const r = await runzDataD1Query(
          monorepoRoot,
          selectedDb.hash,
          `SELECT * FROM "${name}" LIMIT 50`
        );
        setQueryResult(r);
      } catch (e: unknown) {
        setError(String(e));
        setQueryResult(null);
      }
    },
    [monorepoRoot, selectedDb]
  );

  const runQuery = useCallback(async () => {
    if (!selectedDb || !sqlInput.trim()) return;
    setError(null);
    try {
      const r = await runzDataD1Query(monorepoRoot, selectedDb.hash, sqlInput);
      setQueryResult(r);
    } catch (e: unknown) {
      setError(String(e));
      setQueryResult(null);
    }
  }, [monorepoRoot, selectedDb, sqlInput]);

  const applySavedQuery = useCallback(
    async (queryId: string) => {
      const def = RUNZ_DATA_QUERIES.find((q) => q.id === queryId);
      if (!def) return;
      setSavedQueryId(queryId);
      setSqlInput(def.sql);
      const db =
        selectedDb?.binding === def.binding
          ? selectedDb
          : databases.find((candidate) => candidate.binding === def.binding);
      if (!db) {
        setError(`No local D1 database with binding ${def.binding}.`);
        return;
      }
      if (selectedDb?.hash !== db.hash) {
        await selectDb(db);
      }
      setError(null);
      try {
        const r = await runzDataD1Query(monorepoRoot, db.hash, def.sql);
        setQueryResult(r);
      } catch (e: unknown) {
        setError(String(e));
        setQueryResult(null);
      }
    },
    [databases, monorepoRoot, selectDb, selectedDb]
  );

  return (
    <div className="runz-data-layout">
      <aside className="runz-data-sidebar">
        <div className="runz-data-sidebar-header">Databases</div>
        {loading && <div className="runz-data-empty">Loading…</div>}
        {!loading && databases.length === 0 && (
          <div className="runz-data-empty">No D1 databases found</div>
        )}
        {databases.map((db) => (
          <button
            key={db.hash}
            type="button"
            className={`runz-data-sidebar-item${selectedDb?.hash === db.hash ? ' active' : ''}`}
            onClick={() => void selectDb(db)}
          >
            <span className="runz-data-item-label">
              {labelFor(db.binding, db.databaseName || db.hash.slice(0, 12))}
            </span>
            {db.databaseName && <span className="runz-data-item-sub">{db.databaseName}</span>}
            <span className="runz-data-badge">{fmtBytes(db.sizeBytes)}</span>
          </button>
        ))}
      </aside>

      <main className="runz-data-main">
        {error && <div className="runz-data-error">{error}</div>}
        {!selectedDb && !loading && <div className="runz-data-empty">Select a database</div>}
        {selectedDb && (
          <>
            <div className="runz-data-saved-queries">
              <label>
                Saved query
                <select value={savedQueryId} onChange={(e) => void applySavedQuery(e.target.value)}>
                  <option value="">— pick —</option>
                  {matchingSavedQueries.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.label} ({q.binding})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="runz-data-sql-bar">
              <textarea
                className="runz-data-sql-input"
                value={sqlInput}
                onChange={(e) => setSqlInput(e.target.value)}
                placeholder="SELECT * FROM table LIMIT 50"
                rows={2}
                spellCheck={false}
              />
              <button
                type="button"
                className="runz-btn runz-btn-primary runz-btn-sm"
                onClick={() => void runQuery()}
                disabled={!sqlInput.trim()}
              >
                Run
              </button>
              <button
                type="button"
                className="runz-btn runz-btn-sm"
                disabled={!queryResult}
                onClick={() => {
                  if (!queryResult || !selectedTable) return;
                  downloadCsv(`${selectedTable}-export.csv`, d1ResultToCsv(queryResult));
                }}
              >
                Export CSV
              </button>
            </div>

            <div className="runz-data-d1-body">
              <div className="runz-data-table-list">
                <div className="runz-data-sidebar-header">Tables</div>
                {tables.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    className={`runz-data-sidebar-item${selectedTable === t.name ? ' active' : ''}`}
                    onClick={() => void selectTable(t.name)}
                  >
                    <span className="runz-data-item-label">{t.name}</span>
                    <span className="runz-data-badge">{t.rowCount}</span>
                  </button>
                ))}
              </div>

              <div className="runz-data-result">
                {queryResult && (
                  <>
                    {queryResult.truncated && (
                      <div className="runz-data-notice">
                        Results truncated to {queryResult.rows.length} rows
                      </div>
                    )}
                    <div className="runz-data-table-wrap">
                      <table className="runz-data-table">
                        <thead>
                          <tr>
                            {queryResult.columns.map((col) => (
                              <th key={col}>{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queryResult.rows.map((row, ri) => (
                            <tr key={ri}>
                              {row.map((cell, ci) => (
                                <td key={ci}>
                                  {cell === null ? (
                                    <span className="runz-data-null">null</span>
                                  ) : (
                                    String(cell)
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {queryResult.rows.length === 0 && (
                      <div className="runz-data-empty">No rows returned</div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ── KV Panel ─────────────────────────────────────────────

function KvPanel({ monorepoRoot }: { monorepoRoot: string }) {
  const [namespaces, setNamespaces] = useState<RunzKvNsEntry[]>([]);
  const [selectedNs, setSelectedNs] = useState<RunzKvNsEntry | null>(null);
  const [entries, setEntries] = useState<RunzKvEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<RunzKvEntry | null>(null);
  const [blob, setBlob] = useState<RunzKvBlobResult | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [blobLoading, setBlobLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const PAGE = 50;

  useEffect(() => {
    setLoading(true);
    setError(null);
    runzDataKvScan(monorepoRoot)
      .then(setNamespaces)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [monorepoRoot]);

  const selectNs = useCallback(
    async (ns: RunzKvNsEntry, off = 0) => {
      setSelectedNs(ns);
      setSelectedEntry(null);
      setBlob(null);
      setOffset(off);
      setError(null);
      try {
        const e = await runzDataKvEntries(monorepoRoot, ns.id, PAGE, off);
        setEntries(e);
      } catch (e: unknown) {
        setError(String(e));
        setEntries([]);
      }
    },
    [monorepoRoot]
  );

  const selectEntry = useCallback(
    async (entry: RunzKvEntry) => {
      setSelectedEntry(entry);
      setBlob(null);
      setBlobLoading(true);
      setError(null);
      try {
        const b = await runzDataKvBlob(monorepoRoot, selectedNs!.id, entry.blobId);
        setBlob(b);
      } catch (e: unknown) {
        setError(String(e));
      } finally {
        setBlobLoading(false);
      }
    },
    [monorepoRoot, selectedNs]
  );

  const prevPage = () => {
    if (!selectedNs || offset === 0) return;
    void selectNs(selectedNs, Math.max(0, offset - PAGE));
  };
  const nextPage = () => {
    if (!selectedNs || entries.length < PAGE) return;
    void selectNs(selectedNs, offset + PAGE);
  };

  return (
    <div className="runz-data-layout">
      <aside className="runz-data-sidebar">
        <div className="runz-data-sidebar-header">Namespaces</div>
        {loading && <div className="runz-data-empty">Loading…</div>}
        {!loading && namespaces.length === 0 && (
          <div className="runz-data-empty">No KV namespaces found</div>
        )}
        {namespaces.map((ns) => (
          <button
            key={ns.id}
            type="button"
            className={`runz-data-sidebar-item${selectedNs?.id === ns.id ? ' active' : ''}`}
            onClick={() => void selectNs(ns)}
          >
            <span className="runz-data-item-label">{labelFor(ns.binding, ns.id.slice(0, 12))}</span>
            <span className="runz-data-item-sub runz-data-item-mono">{ns.id.slice(0, 16)}…</span>
            <span className="runz-data-badge">{ns.entryCount}</span>
          </button>
        ))}
      </aside>

      <main className="runz-data-main">
        {error && <div className="runz-data-error">{error}</div>}
        {!selectedNs && !loading && <div className="runz-data-empty">Select a namespace</div>}
        {selectedNs && (
          <div className="runz-data-kv-body">
            <div className="runz-data-entry-list">
              <div className="runz-data-list-toolbar">
                <span className="runz-data-list-info">
                  {selectedNs.binding || selectedNs.id.slice(0, 16)} — rows {offset + 1}–
                  {offset + entries.length}
                </span>
                <div className="runz-data-pager">
                  <button
                    type="button"
                    className="runz-btn runz-btn-xs"
                    onClick={prevPage}
                    disabled={offset === 0}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="runz-btn runz-btn-xs"
                    onClick={nextPage}
                    disabled={entries.length < PAGE}
                  >
                    ›
                  </button>
                </div>
              </div>
              <div className="runz-data-table-wrap">
                <table className="runz-data-table">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Expiration</th>
                      <th>Metadata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr
                        key={entry.key}
                        className={`runz-data-clickable-row${selectedEntry?.key === entry.key ? ' selected' : ''}`}
                        onClick={() => void selectEntry(entry)}
                      >
                        <td className="runz-data-cell-key">{entry.key}</td>
                        <td>
                          {entry.expiration ? (
                            fmtTimestamp(entry.expiration)
                          ) : (
                            <span className="runz-data-null">no expiry</span>
                          )}
                        </td>
                        <td>
                          {entry.metadataJson ? (
                            <code className="runz-data-meta">{entry.metadataJson}</code>
                          ) : (
                            <span className="runz-data-null">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedEntry && (
              <div className="runz-data-blob-panel">
                <div className="runz-data-sidebar-header">
                  Value — <code>{selectedEntry.key}</code>
                </div>
                {blobLoading && <div className="runz-data-empty">Loading blob…</div>}
                {blob && <pre className="runz-data-blob-preview">{blob.content}</pre>}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ── R2 Panel ─────────────────────────────────────────────

function R2Panel({ monorepoRoot }: { monorepoRoot: string }) {
  const [buckets, setBuckets] = useState<RunzR2BucketEntry[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<RunzR2BucketEntry | null>(null);
  const [objects, setObjects] = useState<RunzR2ObjectEntry[]>([]);
  const [selectedObject, setSelectedObject] = useState<RunzR2ObjectEntry | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const PAGE = 50;

  useEffect(() => {
    setLoading(true);
    setError(null);
    runzDataR2Scan(monorepoRoot)
      .then(setBuckets)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [monorepoRoot]);

  const selectBucket = useCallback(
    async (bucket: RunzR2BucketEntry, off = 0) => {
      setSelectedBucket(bucket);
      setSelectedObject(null);
      setOffset(off);
      setError(null);
      try {
        const o = await runzDataR2Objects(monorepoRoot, bucket.name, PAGE, off);
        setObjects(o);
      } catch (e: unknown) {
        setError(String(e));
        setObjects([]);
      }
    },
    [monorepoRoot]
  );

  const prevPage = () => {
    if (!selectedBucket || offset === 0) return;
    void selectBucket(selectedBucket, Math.max(0, offset - PAGE));
  };
  const nextPage = () => {
    if (!selectedBucket || objects.length < PAGE) return;
    void selectBucket(selectedBucket, offset + PAGE);
  };

  const httpMeta = selectedObject?.httpMetadata
    ? (() => {
        try {
          return JSON.parse(selectedObject.httpMetadata) as Record<string, unknown>;
        } catch {
          return null;
        }
      })()
    : null;

  return (
    <div className="runz-data-layout">
      <aside className="runz-data-sidebar">
        <div className="runz-data-sidebar-header">Buckets</div>
        {loading && <div className="runz-data-empty">Loading…</div>}
        {!loading && buckets.length === 0 && (
          <div className="runz-data-empty">No R2 buckets found</div>
        )}
        {buckets.map((b) => (
          <button
            key={b.name}
            type="button"
            className={`runz-data-sidebar-item${selectedBucket?.name === b.name ? ' active' : ''}`}
            onClick={() => void selectBucket(b)}
          >
            <span className="runz-data-item-label">{labelFor(b.binding, b.name)}</span>
            {b.binding && <span className="runz-data-item-sub">{b.name}</span>}
            <span className="runz-data-badge">{b.objectCount} obj</span>
          </button>
        ))}
      </aside>

      <main className="runz-data-main">
        {error && <div className="runz-data-error">{error}</div>}
        {!selectedBucket && !loading && <div className="runz-data-empty">Select a bucket</div>}
        {selectedBucket && (
          <div className="runz-data-r2-body">
            <div className="runz-data-object-list">
              <div className="runz-data-list-toolbar">
                <span className="runz-data-list-info">
                  {selectedBucket.name} — rows {offset + 1}–{offset + objects.length}
                </span>
                <div className="runz-data-pager">
                  <button
                    type="button"
                    className="runz-btn runz-btn-xs"
                    onClick={prevPage}
                    disabled={offset === 0}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="runz-btn runz-btn-xs"
                    onClick={nextPage}
                    disabled={objects.length < PAGE}
                  >
                    ›
                  </button>
                </div>
              </div>
              <div className="runz-data-table-wrap">
                <table className="runz-data-table">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Size</th>
                      <th>ETag</th>
                      <th>Uploaded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {objects.map((obj) => (
                      <tr
                        key={obj.key}
                        className={`runz-data-clickable-row${selectedObject?.key === obj.key ? ' selected' : ''}`}
                        onClick={() => setSelectedObject(obj)}
                      >
                        <td className="runz-data-cell-key">{obj.key}</td>
                        <td>{fmtBytes(obj.size)}</td>
                        <td>
                          <code className="runz-data-meta">{obj.etag}</code>
                        </td>
                        <td>{fmtTimestamp(obj.uploaded)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedObject && (
              <div className="runz-data-blob-panel">
                <div className="runz-data-sidebar-header">Object details</div>
                <table className="runz-data-table runz-data-table-detail">
                  <tbody>
                    <tr>
                      <th>Key</th>
                      <td>{selectedObject.key}</td>
                    </tr>
                    <tr>
                      <th>Size</th>
                      <td>{fmtBytes(selectedObject.size)}</td>
                    </tr>
                    <tr>
                      <th>ETag</th>
                      <td>
                        <code>{selectedObject.etag}</code>
                      </td>
                    </tr>
                    <tr>
                      <th>Uploaded</th>
                      <td>{fmtTimestamp(selectedObject.uploaded)}</td>
                    </tr>
                    {httpMeta &&
                      Object.entries(httpMeta).map(([k, v]) =>
                        v ? (
                          <tr key={k}>
                            <th>{k}</th>
                            <td>{String(v)}</td>
                          </tr>
                        ) : null
                      )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Main DataTab ─────────────────────────────────────────

export function DataTab({ monorepoRoot }: DataTabProps) {
  const [subTab, setSubTab] = useState<DataSubTab>('d1');

  return (
    <section className="runz-data-shell" aria-label="Data Browser">
      <div className="runz-data-local-banner" role="note">
        Local only: reads <code>.wrangler/state</code> on disk. Does not query remote
        Cloudflare D1, KV, or R2.
      </div>
      <div className="runz-data-subtabs" role="tablist" aria-label="Data services">
        {(['d1', 'kv', 'r2'] as DataSubTab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={subTab === t}
            className={`runz-data-subtab${subTab === t ? ' active' : ''}`}
            onClick={() => setSubTab(t)}
          >
            {t === 'd1' ? 'D1 / SQL' : t.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="runz-data-content">
        {subTab === 'd1' && <D1Panel monorepoRoot={monorepoRoot} />}
        {subTab === 'kv' && <KvPanel monorepoRoot={monorepoRoot} />}
        {subTab === 'r2' && <R2Panel monorepoRoot={monorepoRoot} />}
      </div>
    </section>
  );
}
