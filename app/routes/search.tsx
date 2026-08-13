import type { Route } from "./+types/search";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  QualificationBanner,
  ResultsTable,
  Shell,
  SuggestionChips,
} from "../design-system";
import {
  loadSearchPage,
  type SearchLoaderError,
} from "../lib/search-loader";
import { buildSearchRetryPath } from "../lib/search-url";
import {
  isRouteErrorResponse,
  useNavigation,
  useRouteError,
} from "react-router";

export function meta({ loaderData }: Route.MetaArgs) {
  const q =
    loaderData && "query" in loaderData && loaderData.query
      ? String(loaderData.query)
      : undefined;
  return [
    {
      title: q
        ? `Busca: ${q} — FilaTracker`
        : "Busca — FilaTracker",
    },
  ];
}

export function headers({ loaderHeaders, errorHeaders }: Route.HeadersArgs) {
  const headers = new Headers(errorHeaders ?? loaderHeaders);
  headers.set("Cache-Control", "no-store");
  return headers;
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadSearchPage(request, { canonicalizeEmptyToHome: true });
}

export default function SearchPage({ loaderData }: Route.ComponentProps) {
  const query = loaderData.query ?? "";
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  const outcome =
    loaderData.kind === "ok" ||
    loaderData.kind === "degraded" ||
    loaderData.kind === "no-match" ||
    loaderData.kind === "empty-home"
      ? loaderData.outcome
      : null;

  const pageData =
    outcome &&
    (outcome.outcome === "ok" || outcome.outcome === "degraded")
      ? outcome.data
      : null;

  const hits = pageData?.hits ?? [];
  const suggestions = pageData?.materialFamilySuggestions ?? [];
  const isDegraded = loaderData.kind === "degraded";
  const isNoMatch = loaderData.kind === "no-match";
  const hasHits = hits.length > 0;
  const degradedStores = pageData?.storeSupport.filter(
    (store) => store.supportState === "degraded",
  ) ?? [];
  const nextPageHref =
    pageData?.hasNextPage && pageData.nextCursor
      ? `/search?${new URLSearchParams({ q: query, cursor: pageData.nextCursor })}`
      : null;

  return (
    <Shell searchDefaultValue={query}>
      <h1 className="ft-visually-hidden">Busca de filamentos</h1>
      {isLoading ? (
        <LoadingRows />
      ) : (
        <>
          {isDegraded ? (
            <QualificationBanner>
              {outcome && outcome.outcome === "degraded"
                ? outcome.qualification
                : "Alguns dados podem estar indisponíveis no momento."}
            </QualificationBanner>
          ) : null}

          {degradedStores.length > 0 ? (
            <QualificationBanner>
              {`Resultados incluem ${degradedStores.length === 1 ? "a loja" : "as lojas"} ${degradedStores.map((store) => store.displayName).join(", ")}, ${degradedStores.length === 1 ? "que está" : "que estão"} com suporte degradado.`}
            </QualificationBanner>
          ) : null}

          {isNoMatch ? (
            <>
              <EmptyState title="Não encontramos esse filamento." />
              <SuggestionChips suggestions={suggestions} />
            </>
          ) : null}

          {isDegraded && !hasHits ? (
            <EmptyState title="Não foi possível confirmar resultados agora." />
          ) : null}

          {hasHits ? (
            <>
              <p className="ft-results-count" role="status" aria-live="polite">
                {pageData?.totalCount ?? hits.length} resultado(s)
              </p>
              <ResultsTable hits={hits} caption={`Resultados para ${query}`} />
              {nextPageHref ? (
                <nav className="ft-results-pagination" aria-label="Paginação dos resultados">
                  <a href={nextPageHref} rel="next">Próxima página</a>
                </nav>
              ) : null}
            </>
          ) : null}

          {loaderData.kind === "ok" &&
          pageData &&
          pageData.totalCount > 0 &&
          !hasHits ? (
            <>
              <p role="status" aria-live="polite">
                {pageData.totalCount} resultado(s)
              </p>
              <EmptyState title="Não há mais resultados nesta página." />
            </>
          ) : null}
        </>
      )}
    </Shell>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    const payload = error.data as SearchLoaderError | undefined;
    const preservedQuery = payload?.query ?? "";

    if (error.status === 400) {
      return (
        <Shell searchDefaultValue={preservedQuery}>
          <h1 className="ft-visually-hidden">Busca de filamentos</h1>
          <ErrorState message="Revise sua busca e tente novamente." />
        </Shell>
      );
    }

    if (error.status === 503) {
      const retryPath = buildSearchRetryPath(payload?.query, payload?.cursor);
      return (
        <Shell searchDefaultValue={preservedQuery}>
          <h1 className="ft-visually-hidden">Busca de filamentos</h1>
          <ErrorState
            message="Não foi possível carregar a busca agora. Tente novamente em instantes."
            retryHref={retryPath}
          />
        </Shell>
      );
    }
  }

  return (
    <Shell>
      <h1 className="ft-visually-hidden">Busca de filamentos</h1>
      <ErrorState message="Não foi possível carregar a busca agora. Tente novamente em instantes." />
    </Shell>
  );
}
