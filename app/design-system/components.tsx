import type { FormEvent, ReactNode } from "react";

type ShellProps = {
  children: ReactNode;
  /** When true, shell omits its search — page owns the primary search (Home). */
  hideShellSearch?: boolean;
  searchDefaultValue?: string;
};

export function Shell({
  children,
  hideShellSearch = false,
  searchDefaultValue = "",
}: ShellProps) {
  return (
    <div className="ft-shell">
      <a className="ft-skip-link" href="#conteudo-principal">
        Ir para o conteúdo
      </a>
      <header className="ft-header">
        <div className="ft-header-inner">
          <p className="ft-wordmark">
            <a href="/" className="ft-wordmark-link">
              FilaTracker
            </a>
          </p>
          {!hideShellSearch ? (
            <SearchControl defaultValue={searchDefaultValue} />
          ) : null}
        </div>
      </header>
      <main id="conteudo-principal" className="ft-main">
        {children}
      </main>
      <footer className="ft-footer">
        <p>
          Preços de listagem sem frete. Condições finais na loja de destino.
        </p>
      </footer>
    </div>
  );
}

type SearchControlProps = {
  defaultValue?: string;
  id?: string;
  autoFocus?: boolean;
};

export function SearchControl({
  defaultValue = "",
  id = "busca-filamento",
  autoFocus = false,
}: SearchControlProps) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const data = new FormData(form);
    const q = String(data.get("q") ?? "").trim();
    if (!q) {
      event.preventDefault();
      window.location.assign("/");
    }
  }

  return (
    <form
      className="ft-search"
      method="get"
      action="/search"
      role="search"
      onSubmit={onSubmit}
    >
      <label className="ft-search-label" htmlFor={id}>
        Buscar filamento
      </label>
      <div className="ft-search-row">
        <input
          id={id}
          className="ft-search-input"
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder="Buscar filamento"
          autoComplete="off"
          autoFocus={autoFocus}
          enterKeyHint="search"
        />
        <button type="submit" className="ft-search-submit">
          Buscar
        </button>
      </div>
    </form>
  );
}

type EmptyStateProps = {
  title: string;
  description?: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="ft-empty" role="status" aria-live="polite">
      <p className="ft-empty-title">{title}</p>
      {description ? <p className="ft-empty-desc">{description}</p> : null}
    </div>
  );
}

type ErrorStateProps = {
  message: string;
  retryHref?: string;
};

export function ErrorState({ message, retryHref }: ErrorStateProps) {
  return (
    <div className="ft-error" role="alert" aria-live="assertive">
      <p className="ft-error-message">{message}</p>
      {retryHref ? (
        <p>
          <a className="ft-retry" href={retryHref}>
            Tentar novamente
          </a>
        </p>
      ) : null}
    </div>
  );
}

type LoadingRowsProps = {
  count?: number;
};

export function LoadingRows({ count = 6 }: LoadingRowsProps) {
  return (
    <div
      className="ft-loading"
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <span className="ft-visually-hidden">Carregando resultados…</span>
      <ul className="ft-loading-list">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="ft-loading-row" />
        ))}
      </ul>
    </div>
  );
}
