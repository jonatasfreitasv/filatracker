import type { Route } from "./+types/home";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  SearchControl,
  Shell,
} from "../design-system";
import {
  loadSearchPage,
  type SearchLoaderError,
} from "../lib/search-loader";
import {
  isRouteErrorResponse,
  redirect,
  useNavigation,
  useRouteError,
} from "react-router";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "FilaTracker — comparação de filamentos" },
    {
      name: "description",
      content:
        "Compare preços de listagem de filamentos 3D no Brasil. Sem vitrine, sem imagens — só dados.",
    },
  ];
}

export function headers({ loaderHeaders, errorHeaders }: Route.HeadersArgs) {
  const headers = new Headers(errorHeaders ?? loaderHeaders);
  headers.set("Cache-Control", "no-store");
  return headers;
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  if (url.searchParams.has("q")) {
    const raw = url.searchParams.get("q") ?? "";
    // Home's own SearchControl always posts to /search; a non-empty q
    // reaching Home only happens via a direct/shared URL. Forward it to
    // /search rather than rendering the wrong (catalog-empty) copy for
    // what is really a no-match state. Whitespace-only q falls through
    // below and is treated as absent, avoiding a redirect loop with
    // /search's own empty-to-Home canonicalization.
    if (raw.trim() !== "") {
      throw redirect(`/search${url.search}`, 302);
    }
  }
  return loadSearchPage(request, { canonicalizeEmptyToHome: false });
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const query =
    loaderData && "query" in loaderData ? (loaderData.query ?? "") : "";
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  return (
    <Shell hideShellSearch>
      <section className="ft-home-hero" aria-labelledby="home-title">
        <h1 id="home-title" className="ft-home-title">
          FilaTracker
        </h1>
        <p className="ft-home-lead">
          Busque filamentos e compare preços de listagem entre lojas. Frete e
          condições finais ficam na loja de destino.
        </p>
        <SearchControl defaultValue={query} id="busca-home" autoFocus />
        {isLoading ? (
          <LoadingRows />
        ) : (
          <>
            {loaderData?.kind === "empty-home" ||
            loaderData?.kind === "no-match" ? (
              <EmptyState
                title="Nenhum filamento publicado ainda."
                description="Quando houver ofertas publicadas, os resultados aparecerão aqui."
              />
            ) : null}
            {loaderData?.kind === "degraded" ? (
              <EmptyState title="Alguns dados podem estar indisponíveis no momento." />
            ) : null}
          </>
        )}
      </section>
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
        <Shell hideShellSearch>
          <section className="ft-home-hero">
            <SearchControl defaultValue={preservedQuery} id="busca-home" />
            <ErrorState message="Revise sua busca e tente novamente." />
          </section>
        </Shell>
      );
    }

    if (error.status === 503) {
      return (
        <Shell hideShellSearch>
          <section className="ft-home-hero">
            <SearchControl defaultValue={preservedQuery} id="busca-home" />
            <ErrorState
              message="Não foi possível carregar a busca agora. Tente novamente em instantes."
              retryHref="/"
            />
          </section>
        </Shell>
      );
    }
  }

  return (
    <Shell hideShellSearch>
      <ErrorState
        message="Não foi possível carregar a busca agora. Tente novamente em instantes."
        retryHref="/"
      />
    </Shell>
  );
}
