import {
  CorrelationIdSchema,
  DEFAULT_RETRY_AFTER_SECONDS,
  SEARCH_PAGE_CONTRACT_VERSION,
  type SearchPageRpcOutcome,
} from "../contracts";
import type {
  GetSearchPageInput,
  SearchCatalogPort,
  SearchPageSnapshot,
} from "./ports";

function newCorrelationId(): string {
  return crypto.randomUUID();
}

function logAllowlisted(code: string, correlationId: string): void {
  console.error("get_search_page", { code, correlationId });
}

export async function getSearchPage(
  catalog: SearchCatalogPort,
  input: GetSearchPageInput,
): Promise<SearchPageRpcOutcome> {
  const suppliedCorrelationId = CorrelationIdSchema.safeParse(input.correlationId);
  const correlationId = suppliedCorrelationId.success
    ? suppliedCorrelationId.data
    : newCorrelationId();
  const evaluatedAt = new Date();

  if (input.hasInvalidParameters) {
    return {
      outcome: "invalid",
      contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
      projectionEpoch: 0,
      supportEpoch: 0,
      correlationId,
      errors: ["Parâmetros de busca inválidos."],
    };
  }

  let snapshot: SearchPageSnapshot;
  try {
    snapshot = await catalog.getSearchPageSnapshot({
      q: input.q,
      cursor: input.cursor,
      limit: input.limit,
      correlationId,
      evaluatedAt,
    });
  } catch (error) {
    const overloaded =
      error instanceof Error &&
      (error.name === "OverloadedError" ||
        /overloaded|capacity|429/i.test(error.message));
    logAllowlisted(
      overloaded ? "catalog_overloaded" : "catalog_unavailable",
      correlationId,
    );
    return {
      outcome: overloaded ? "overloaded" : "unavailable",
      contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
      projectionEpoch: 0,
      supportEpoch: 0,
      correlationId,
      retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
    };
  }

  const meta = {
    contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
    projectionEpoch: snapshot.projectionEpoch,
    supportEpoch: snapshot.supportEpoch,
    correlationId,
  } as const;

  switch (snapshot.outcome) {
    case "invalid":
      return {
        ...meta,
        outcome: "invalid",
        errors: snapshot.errors,
      };
    case "overloaded":
    case "unavailable":
      return {
        ...meta,
        outcome: snapshot.outcome,
        retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
      };
    case "degraded":
      return {
        ...meta,
        outcome: "degraded",
        data: snapshot.page,
        qualification:
          snapshot.qualification ??
          "Busca em modo degradado — alguns dados podem estar indisponíveis.",
      };
    case "ok":
      return {
        ...meta,
        outcome: "ok",
        data: snapshot.page,
      };
  }
}
