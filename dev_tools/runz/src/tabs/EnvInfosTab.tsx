export type EnvInfoStatus = 'ready' | 'warn' | 'block';

export interface EnvInfoCheckRow {
  label: string;
  status: EnvInfoStatus;
  detail: string;
  secondary?: string;
}

export interface EnvInfoAppCard {
  appId: string;
  label: string;
  status: EnvInfoStatus;
  summary: string;
  devScript: string | null;
  previewScript: string | null;
  devPort: number | null;
  previewPort: number | null;
  inspectorPort: number | null;
  envNames: string[];
  typeNames: string[];
  checkRows: EnvInfoCheckRow[];
  notes: string[];
}

export interface EnvInfoOverview {
  status: EnvInfoStatus;
  readyCount: number;
  warningCount: number;
  blockedCount: number;
}

type EnvInfosTabProps = {
  scanning: boolean;
  overview: EnvInfoOverview;
  runtimeChecks: EnvInfoCheckRow[];
  rootChecks: EnvInfoCheckRow[];
  appCards: EnvInfoAppCard[];
  onRefresh: () => void;
};

function statusLabel(status: EnvInfoStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'warn':
      return 'Warnings';
    default:
      return 'Blocked';
  }
}

export function EnvInfosTab({
  scanning,
  overview,
  runtimeChecks,
  rootChecks,
  appCards,
  onRefresh,
}: EnvInfosTabProps) {
  return (
    <section className="runz-env-section" aria-label="Environment infos">
      <div className="runz-section-head">
        <div>
          <h2 className="runz-section-title">Env Infos</h2>
          <p className="runz-migrate-blurb">
            Local environment readiness for `dev`, `preview`, env declarations and companion
            services. Secrets are never shown, only presence and consistency.
          </p>
        </div>
        <button
          type="button"
          className="runz-btn runz-btn-primary"
          disabled={scanning}
          onClick={onRefresh}
        >
          {scanning ? 'Refreshing...' : 'Refresh checks'}
        </button>
      </div>

      <div className="runz-env-overview">
        <div className={`runz-env-pill runz-env-pill-${overview.status}`}>
          {statusLabel(overview.status)}
        </div>
        <span>{overview.readyCount} ready</span>
        <span>{overview.warningCount} warnings</span>
        <span>{overview.blockedCount} blocked</span>
      </div>

      <div className="runz-env-grid runz-env-grid-top">
        <article className="runz-env-card">
          <h3>Runtime</h3>
          <div className="runz-env-checklist">
            {runtimeChecks.map((check) => (
              <div key={check.label} className={`runz-env-check runz-env-check-${check.status}`}>
                <strong>{check.label}</strong>
                <span>{check.detail}</span>
                {check.secondary ? <code>{check.secondary}</code> : null}
              </div>
            ))}
          </div>
        </article>
        <article className="runz-env-card">
          <h3>Workspace</h3>
          <div className="runz-env-checklist">
            {rootChecks.map((check) => (
              <div key={check.label} className={`runz-env-check runz-env-check-${check.status}`}>
                <strong>{check.label}</strong>
                <span>{check.detail}</span>
                {check.secondary ? <code>{check.secondary}</code> : null}
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="runz-env-grid">
        {appCards.map((card) => (
          <article key={card.appId} className={`runz-env-card runz-env-card-${card.status}`}>
            <div className="runz-env-card-head">
              <div>
                <h3>{card.label}</h3>
                <p>{card.summary}</p>
              </div>
              <span className={`runz-env-pill runz-env-pill-${card.status}`}>
                {statusLabel(card.status)}
              </span>
            </div>

            <div className="runz-env-meta">
              <span>
                <strong>dev</strong>
                <code>{card.devScript ?? 'missing'}</code>
              </span>
              <span>
                <strong>preview</strong>
                <code>{card.previewScript ?? 'missing'}</code>
              </span>
              <span>
                <strong>ports</strong>
                <code>
                  {card.devPort ?? '?'} / {card.previewPort ?? '?'}
                </code>
              </span>
              <span>
                <strong>inspector</strong>
                <code>{card.inspectorPort ?? 'n/a'}</code>
              </span>
            </div>

            <div className="runz-env-checklist">
              {card.checkRows.map((check) => (
                <div key={check.label} className={`runz-env-check runz-env-check-${check.status}`}>
                  <strong>{check.label}</strong>
                  <span>{check.detail}</span>
                  {check.secondary ? <code>{check.secondary}</code> : null}
                </div>
              ))}
            </div>

            <div className="runz-env-vars">
              <div>
                <strong>Env names</strong>
                <p>
                  {card.envNames.length > 0
                    ? card.envNames.join(', ')
                    : 'No example env names found.'}
                </p>
              </div>
              <div>
                <strong>Declared types</strong>
                <p>
                  {card.typeNames.length > 0
                    ? card.typeNames.join(', ')
                    : 'No env type names found.'}
                </p>
              </div>
            </div>

            {card.notes.length > 0 ? (
              <ul className="runz-env-notes">
                {card.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
