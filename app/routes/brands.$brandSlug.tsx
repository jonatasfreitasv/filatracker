import type { Route } from "./+types/brands.$brandSlug";
import {
  ContextChips,
  EmptyState,
  ErrorState,
  LoadingRows,
  QualificationBanner,
  ResultsTable,
  Shell,
  TypeFacetChips,
} from "../design-system";
import { loadBrowsePage, type BrowseLoaderError } from "../lib/browse-loader";
import { buildBrowseRetryPath } from "../lib/search-url";
import {
  isRouteErrorResponse,
  useNavigation,
  useRouteError,
} from "react-router";

export function meta({ loaderData, params }: Route.MetaArgs) {
  const label =
    loaderData &&
    "outcome" in loaderData &&
    (loaderData.outcome.outcome === "ok" || loaderData.outcome.outcome === "degraded")
      ? loaderData.outcome.data.entity.label
      : params.brandSlug;
  return [{ title: `${label} — FilaTracker` }];
}

export function headers({ loaderHeaders, errorHeaders }: Route.HeadersArgs) {
  const headers = new Headers(errorHeaders ?? loaderHeaders);
  headers.set("Cache-Control", "no-store");
  return headers;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  return loadBrowsePage(request, "brand", params.brandSlug);
}

export default function BrandBrowsePage({ loaderData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";
  const outcome =
    loaderData.kind === "ok" ||
    loaderData.kind === "degraded" ||
    loaderData.kind === "no-match"
      ? loaderData.outcome
      : null;
  const pageData =
    outcome && (outcome.outcome === "ok" || outcome.outcome === "degraded")
      ? outcome.data
      : null;
  const hits = pageData?.hits ?? [];
  const type = loaderData.type;
  const nextPageHref =
    pageData?.hasNextPage && pageData.nextCursor
      ? buildBrowseRetryPath("brand", loaderData.slug, type, pageData.nextCursor)
      : null;
  const contextChips = [
    {
      key: "brand",
      facet: "Marca",
      value: pageData?.entity.label ?? loaderData.slug,
      removeHref: "/",
    },
    ...(type
      ? [{
          key: "type",
          facet: "Tipo específico",
          value:
            pageData?.specificTypeFacet.find((facet) => facet.slug === type)?.label ??
            type,
          removeHref: `/brands/${loaderData.slug}`,
        }]
      : []),
  ];

  return (
    <Shell
      materialFamilies={pageData?.materialFamilySuggestions}
      brands={pageData?.brandSuggestions}
      currentBrandSlug={pageData?.entity.slug}
    >
      <h1>{pageData?.entity.label ?? loaderData.slug}</h1>
      {isLoading ? (
        <LoadingRows />
      ) : (
        <>
          {loaderData.kind === "degraded" ? (
            <QualificationBanner>
              {outcome && outcome.outcome === "degraded"
                ? outcome.qualification
                : "Alguns dados podem estar indisponíveis no momento."}
            </QualificationBanner>
          ) : null}
          <ContextChips chips={contextChips} />
          {pageData ? (
            <TypeFacetChips
              facets={pageData.specificTypeFacet}
              activeSlug={type}
              hrefFor={(slug) =>
                slug
                  ? `/brands/${loaderData.slug}?type=${encodeURIComponent(slug)}`
                  : `/brands/${loaderData.slug}`
              }
            />
          ) : null}
          {loaderData.kind === "no-match" ? (
            <EmptyState title="Não encontramos esse filamento." />
          ) : null}
          {loaderData.kind === "degraded" && hits.length === 0 ? (
            <EmptyState title="Não foi possível confirmar resultados agora." />
          ) : null}
          {hits.length > 0 ? (
            <>
              <p className="ft-results-count" role="status" aria-live="polite">
                {pageData?.totalCount ?? hits.length} resultado(s)
              </p>
              <ResultsTable
                hits={hits}
                caption={`Ofertas de ${pageData?.entity.label ?? loaderData.slug}`}
              />
              {nextPageHref ? (
                <nav className="ft-results-pagination" aria-label="Paginação dos resultados">
                  <a href={nextPageHref} rel="next">Próxima página</a>
                </nav>
              ) : null}
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
    const payload = error.data as BrowseLoaderError | undefined;
    if (error.status === 400) {
      return (
        <Shell>
          <ErrorState message="Revise sua busca e tente novamente." />
        </Shell>
      );
    }
    if (error.status === 404) {
      return (
        <Shell>
          <ErrorState message="Não encontramos essa página." />
        </Shell>
      );
    }
    if (error.status === 410) {
      return (
        <Shell>
          <ErrorState message="Essa página não está mais disponível." />
        </Shell>
      );
    }
    if (error.status === 503) {
      const retryPath = payload
        ? buildBrowseRetryPath(payload.browseKind, payload.slug, payload.type, payload.cursor)
        : "/";
      return (
        <Shell>
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
      <ErrorState message="Não foi possível carregar a busca agora. Tente novamente em instantes." />
    </Shell>
  );
}
