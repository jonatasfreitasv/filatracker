import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { createMdMarkdownComponents } from '../md-viewer-markdown';
import {
  MD_VIEWER_SCAN_ROOTS,
  mdViewerScanRootLabel,
  type MdViewerScanRoot,
} from '../md-viewer.manifest';
import { resolveMdPath, splitMdPath } from '../md-viewer-utils';
import {
  runzListRepoMdFiles,
  runzReadRepoText,
  runzRepoPathStat,
  type RunzMdFileEntry,
} from '../runz-tauri';

type MdViewerTabProps = {
  monorepoRoot: string;
  active: boolean;
};

type MdDocTab = {
  id: string;
  relativePath: string;
  content: string;
  modifiedAtMs: number | null;
  loading: boolean;
  error: string | null;
};

const AUTO_REFRESH_MS = 1_000;

function tabIdForPath(relativePath: string): string {
  return relativePath;
}

export function MdViewerTab({ monorepoRoot, active }: MdViewerTabProps) {
  const [scanRoot, setScanRoot] = useState<MdViewerScanRoot>('_bmad-output');
  const [files, setFiles] = useState<RunzMdFileEntry[]>([]);
  const [docTabs, setDocTabs] = useState<MdDocTab[]>([]);
  const [activeDocTabId, setActiveDocTabId] = useState<string | null>(null);
  const [knownMdPaths, setKnownMdPaths] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastListedAt, setLastListedAt] = useState<string | null>(null);
  const loadInFlightRef = useRef(false);
  const scanRootRef = useRef<MdViewerScanRoot>(scanRoot);
  const docTabsRef = useRef<MdDocTab[]>(docTabs);
  const activeDocTabIdRef = useRef<string | null>(activeDocTabId);
  const knownMdPathsRef = useRef<Set<string>>(knownMdPaths);

  useEffect(() => {
    scanRootRef.current = scanRoot;
  }, [scanRoot]);

  useEffect(() => {
    docTabsRef.current = docTabs;
  }, [docTabs]);

  useEffect(() => {
    activeDocTabIdRef.current = activeDocTabId;
  }, [activeDocTabId]);

  useEffect(() => {
    knownMdPathsRef.current = knownMdPaths;
  }, [knownMdPaths]);

  const loadDocContent = useCallback(
    async (relativePath: string, modifiedAtMs: number | null = null) => {
      const text = await runzReadRepoText(monorepoRoot, relativePath);
      setDocTabs((prev) =>
        prev.map((tab) =>
          tab.relativePath === relativePath
            ? {
                ...tab,
                content: text,
                modifiedAtMs,
                loading: false,
                error: null,
              }
            : tab
        )
      );
    },
    [monorepoRoot]
  );

  const refreshKnownMdPaths = useCallback(async (): Promise<Map<string, number>> => {
    if (!monorepoRoot) {
      setKnownMdPaths(new Set());
      return new Map();
    }
    try {
      const lists = await Promise.all(
        MD_VIEWER_SCAN_ROOTS.map((root) => runzListRepoMdFiles(monorepoRoot, root.id))
      );
      const byPath = new Map<string, number>();
      for (const list of lists) {
        for (const entry of list) {
          byPath.set(entry.relativePath, entry.modifiedAtMs);
        }
      }
      setKnownMdPaths(new Set(byPath.keys()));

      for (const tab of docTabsRef.current) {
        const modifiedAtMs = byPath.get(tab.relativePath);
        if (
          modifiedAtMs !== undefined &&
          tab.modifiedAtMs !== null &&
          modifiedAtMs !== tab.modifiedAtMs &&
          !tab.loading
        ) {
          void loadDocContent(tab.relativePath, modifiedAtMs);
        }
      }

      return byPath;
    } catch {
      return new Map();
    }
  }, [loadDocContent, monorepoRoot]);

  const openMdPath = useCallback(
    async (rawPath: string, options?: { modifiedAtMs?: number | null; activate?: boolean }) => {
      const basePath =
        docTabsRef.current.find((tab) => tab.id === activeDocTabIdRef.current)?.relativePath ?? '';
      let resolved =
        resolveMdPath(rawPath, basePath, knownMdPathsRef.current) ??
        resolveMdPath(rawPath, basePath, new Set());

      if (!resolved) {
        return;
      }

      if (!knownMdPathsRef.current.has(resolved)) {
        const stat = await runzRepoPathStat(monorepoRoot, resolved);
        if (!stat.exists || !stat.isFile) {
          setError(`Markdown file not found: ${resolved}`);
          return;
        }
        setKnownMdPaths((prev) => new Set([...prev, resolved!]));
      }

      const tabId = tabIdForPath(resolved);
      const existing = docTabsRef.current.find((tab) => tab.id === tabId);
      if (existing) {
        if (options?.activate !== false) {
          setActiveDocTabId(tabId);
        }
        if (existing.loading) {
          return;
        }
        if (
          options?.modifiedAtMs !== undefined &&
          options.modifiedAtMs !== null &&
          existing.modifiedAtMs !== options.modifiedAtMs
        ) {
          setDocTabs((prev) =>
            prev.map((tab) => (tab.id === tabId ? { ...tab, loading: true, error: null } : tab))
          );
          try {
            await loadDocContent(resolved, options.modifiedAtMs);
          } catch (e) {
            setDocTabs((prev) =>
              prev.map((tab) =>
                tab.id === tabId ? { ...tab, loading: false, error: String(e) } : tab
              )
            );
          }
        }
        return;
      }

      const modifiedAtMs = options?.modifiedAtMs ?? null;
      setDocTabs((prev) => [
        ...prev,
        {
          id: tabId,
          relativePath: resolved!,
          content: '',
          modifiedAtMs,
          loading: true,
          error: null,
        },
      ]);
      if (options?.activate !== false) {
        setActiveDocTabId(tabId);
      }
      setError(null);

      try {
        await loadDocContent(resolved, modifiedAtMs);
      } catch (e) {
        setDocTabs((prev) =>
          prev.map((tab) => (tab.id === tabId ? { ...tab, loading: false, error: String(e) } : tab))
        );
      }
    },
    [loadDocContent, monorepoRoot]
  );

  const closeDocTab = useCallback((tabId: string) => {
    setDocTabs((prev) => {
      const index = prev.findIndex((tab) => tab.id === tabId);
      if (index === -1) {
        return prev;
      }
      const next = prev.filter((tab) => tab.id !== tabId);
      if (activeDocTabIdRef.current === tabId) {
        const fallback = next[index] ?? next[index - 1] ?? null;
        setActiveDocTabId(fallback?.id ?? null);
      }
      return next;
    });
  }, []);

  const loadFiles = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!monorepoRoot) {
        setFiles([]);
        return;
      }
      if (loadInFlightRef.current) {
        return;
      }
      loadInFlightRef.current = true;
      if (!options?.silent) {
        setLoadingList(true);
      }
      setError(null);
      try {
        const next = await runzListRepoMdFiles(monorepoRoot, scanRootRef.current);
        setFiles(next);
        setLastListedAt(new Date().toLocaleTimeString());

        if (options?.silent) {
          void refreshKnownMdPaths();
        }
      } catch (e) {
        setError(String(e));
        if (!options?.silent) {
          setFiles([]);
        }
      } finally {
        loadInFlightRef.current = false;
        if (!options?.silent) {
          setLoadingList(false);
        }
      }
    },
    [loadDocContent, monorepoRoot, refreshKnownMdPaths]
  );

  useEffect(() => {
    if (!active) {
      return;
    }
    void refreshKnownMdPaths();
    void loadFiles();
    const timer = window.setInterval(() => {
      void loadFiles({ silent: true });
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [active, loadFiles, refreshKnownMdPaths]);

  useEffect(() => {
    if (active) {
      void loadFiles();
    }
  }, [scanRoot]); // eslint-disable-line react-hooks/exhaustive-deps -- reload list when root changes

  const filteredFiles = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      return files;
    }
    return files.filter((entry) => {
      const { dirPath, fileName } = splitMdPath(entry.relativePath);
      return (
        entry.relativePath.toLowerCase().includes(q) ||
        dirPath.toLowerCase().includes(q) ||
        fileName.toLowerCase().includes(q)
      );
    });
  }, [files, filter]);

  const activeDocTab = docTabs.find((tab) => tab.id === activeDocTabId) ?? null;
  const openDocPaths = useMemo(() => new Set(docTabs.map((tab) => tab.relativePath)), [docTabs]);

  const markdownComponents = useMemo(() => {
    if (!activeDocTab) {
      return undefined;
    }
    return createMdMarkdownComponents({
      baseRelativePath: activeDocTab.relativePath,
      knownPaths: knownMdPaths,
      onOpenPath: (path) => {
        void openMdPath(path);
      },
    });
  }, [activeDocTab, knownMdPaths, openMdPath]);

  const activeScanRoot = MD_VIEWER_SCAN_ROOTS.find((option) => option.id === scanRoot);

  return (
    <section className="runz-md-viewer-shell" aria-label="MD Viewer">
      <div className="runz-md-viewer-hero">
        <div>
          <h2 className="runz-section-title">MD Viewer</h2>
          <p className="runz-hint">
            Browse and preview Markdown files from <code>{mdViewerScanRootLabel(scanRoot)}</code>.
          </p>
        </div>
        <div className="runz-md-viewer-hero-actions">
          <span className="runz-md-viewer-live-pill">Live 1s</span>
          {lastListedAt ? (
            <span className="runz-md-viewer-count">Updated {lastListedAt}</span>
          ) : null}
          <span className="runz-md-viewer-count">
            {files.length} file{files.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            className="runz-btn runz-btn-ghost"
            onClick={() => void loadFiles()}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="runz-md-viewer-layout">
        <aside className="runz-md-viewer-sidebar">
          <div className="runz-md-viewer-sidebar-header">Files</div>
          <label className="runz-md-viewer-root-picker">
            <span>Root path</span>
            <select
              value={scanRoot}
              onChange={(e) => setScanRoot(e.target.value as MdViewerScanRoot)}
              aria-label="Select markdown root path"
            >
              {MD_VIEWER_SCAN_ROOTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {activeScanRoot ? (
            <p className="runz-md-viewer-root-hint">{activeScanRoot.description}</p>
          ) : null}
          <input
            type="search"
            className="runz-md-viewer-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by path or name…"
            aria-label="Filter markdown files"
          />
          {loadingList ? <div className="runz-md-viewer-empty">Loading…</div> : null}
          {!loadingList && filteredFiles.length === 0 ? (
            <div className="runz-md-viewer-empty">No markdown files found</div>
          ) : null}
          <div className="runz-md-viewer-file-list">
            {filteredFiles.map((entry) => {
              const { dirPath, fileName } = splitMdPath(entry.relativePath);
              const isOpen = openDocPaths.has(entry.relativePath);
              const isActive = activeDocTab?.relativePath === entry.relativePath;
              return (
                <button
                  key={entry.relativePath}
                  type="button"
                  className={`runz-md-viewer-file-item${isOpen ? ' is-open' : ''}${isActive ? ' active' : ''}`}
                  onClick={() =>
                    void openMdPath(entry.relativePath, { modifiedAtMs: entry.modifiedAtMs })
                  }
                  title={entry.relativePath}
                >
                  {dirPath ? <span className="runz-md-viewer-file-dir">{dirPath}</span> : null}
                  <span className="runz-md-viewer-file-name">{fileName}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="runz-md-viewer-main">
          {error ? <div className="runz-md-viewer-error">{error}</div> : null}

          {docTabs.length > 0 ? (
            <div
              className="runz-md-viewer-doc-tabs"
              role="tablist"
              aria-label="Open markdown files"
            >
              {docTabs.map((tab) => {
                const { fileName } = splitMdPath(tab.relativePath);
                return (
                  <div
                    key={tab.id}
                    className={`runz-md-viewer-doc-tab${tab.id === activeDocTabId ? ' active' : ''}`}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab.id === activeDocTabId}
                      className="runz-md-viewer-doc-tab-label"
                      onClick={() => setActiveDocTabId(tab.id)}
                      title={tab.relativePath}
                    >
                      {fileName}
                      {tab.loading ? ' …' : null}
                    </button>
                    <button
                      type="button"
                      className="runz-md-viewer-doc-tab-close"
                      aria-label={`Close ${fileName}`}
                      onClick={() => closeDocTab(tab.id)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}

          {!activeDocTab ? (
            <div className="runz-md-viewer-empty">Select a file to preview</div>
          ) : null}

          {activeDocTab ? (
            <header className="runz-md-viewer-main-head">
              <code className="runz-md-viewer-path">{activeDocTab.relativePath}</code>
            </header>
          ) : null}

          {activeDocTab?.loading ? <div className="runz-md-viewer-empty">Loading file…</div> : null}

          {activeDocTab?.error ? (
            <div className="runz-md-viewer-error">{activeDocTab.error}</div>
          ) : null}

          {activeDocTab && !activeDocTab.loading && activeDocTab.content && markdownComponents ? (
            <article className="runz-md-viewer-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {activeDocTab.content}
              </ReactMarkdown>
            </article>
          ) : null}
        </main>
      </div>
    </section>
  );
}
