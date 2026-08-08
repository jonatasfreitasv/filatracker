import type { Route } from "./+types/search";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  Shell,
} from "../design-system";
import {
  loadSearchPage,
  type SearchLoaderError,
} from "../lib/search-loader";
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

  return (
    <Shell searchDefaultValue={query}>
      <h1 className="ft-visually-hidden">Busca de filamentos</h1>
      {isLoading ? (
        <LoadingRows />
      ) : (
        <>
          {loaderData.kind === "no-match" ||
          (loaderData.kind === "ok" &&
            loaderData.outcome.outcome === "ok" &&
            loaderData.outcome.data.totalCount === 0) ? (
            <EmptyState title="Não encontramos esse filamento." />
          ) : null}

          {loaderData.kind === "degraded" ? (
            <EmptyState title="Alguns dados podem estar indisponíveis no momento." />
          ) : null}

          {loaderData.kind === "ok" &&
          loaderData.outcome.outcome === "ok" &&
          loaderData.outcome.data.totalCount > 0 ? (
            <p role="status" aria-live="polite">
              {loaderData.outcome.data.totalCount} resultado(s)
            </p>
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
      const retryPath =
        typeof payload?.query === "string" && payload.query.length > 0
          ? `/search?q=${encodeURIComponent(payload.query)}`
          : "/search";
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
