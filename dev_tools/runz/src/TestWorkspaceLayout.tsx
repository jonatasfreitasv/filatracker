import type { MutableRefObject, ReactNode } from 'react';

export type TestWorkspaceLayoutProps = {
  listAriaLabel: string;
  logAriaLabel: string;
  logTitle: string;
  logSub: string;
  logRef: MutableRefObject<HTMLPreElement | null>;
  logLines: string[];
  logPlaceholder: string;
  toolbar: ReactNode;
  list: ReactNode;
};

export function TestWorkspaceLayout({
  listAriaLabel,
  logAriaLabel,
  logTitle,
  logSub,
  logRef,
  logLines,
  logPlaceholder,
  toolbar,
  list,
}: TestWorkspaceLayoutProps) {
  return (
    <div className="runz-test-workspace">
      <div className="runz-test-workspace-list" aria-label={listAriaLabel}>
        {toolbar}
        {list}
      </div>
      <div
        className="runz-test-workspace-terminal runz-migrate-log-shell"
        aria-label={logAriaLabel}
      >
        <div className="runz-log-bar">
          <div className="runz-log-bar-titles">
            <span className="runz-log-title">{logTitle}</span>
            <span className="runz-log-sub">{logSub}</span>
          </div>
        </div>
        <pre ref={logRef} className="runz-log runz-log-unified">
          {logLines.join('\n') || logPlaceholder}
        </pre>
      </div>
    </div>
  );
}
