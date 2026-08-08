import {
  DEFAULT_RETRY_AFTER_SECONDS,
  SEARCH_PAGE_CONTRACT_VERSION,
  type SearchPage,
  type SearchPageRpcOutcome,
} from "../contracts";
import { normalizeSearchQuery } from "../domain/search-query";
import type { GetSearchPageInput, SearchCatalogPort } from "./ports";

function newCorrelationId(): string {
  return crypto.randomUUID();
}

function emptyPage(query: string | null): SearchPage {
  return {
    query,
    hits: [],
    totalCount: 0,
    materialFamilySuggestions: [],
    limits: {
      maxHits: 50,
      maxQueryScalars: 120,
      maxQueryUtf8Bytes: 512,
    },
  };
}

export async function getSearchPage(
  catalog: SearchCatalogPort,
  input: GetSearchPageInput,
): Promise<SearchPageRpcOutcome> {
  const correlationId = newCorrelationId();

  let epochs = { projectionEpoch: 0, supportEpoch: 0 };
  try {
    epochs = await catalog.getEpochs();
  } catch (error) {
    console.error("getEpochs failed", { correlationId, error });
    return {
      outcome: "unavailable",
      contractVersion: SEARCH_PAGE_CONTRACT_VERSION,
      projectionEpoch: 0,
      supportEpoch: 0,
      correlationId,
      retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
    };
  }

  const meta = {
    contractVersion: SEARCH_PAGE_CONTRACT_VERSION as typeof SEARCH_PAGE_CONTRACT_VERSION,
    projectionEpoch: epochs.projectionEpoch,
    supportEpoch: epochs.supportEpoch,
    correlationId,
  };

  if (input.hasInvalidParameters) {
    return {
      ...meta,
      outcome: "invalid",
      errors: ["Parâmetros de busca inválidos."],
    };
  }

  const normalized = normalizeSearchQuery(input.q);
  if (!normalized.ok) {
    return {
      ...meta,
      outcome: "invalid",
      errors: ["Revise sua busca e tente novamente."],
    };
  }

  try {
    const result = await catalog.searchPublished(normalized.canonical);
    return {
      ...meta,
      outcome: "ok",
      data: {
        ...emptyPage(normalized.canonical),
        hits: result.hits,
        totalCount: result.totalCount,
        materialFamilySuggestions: result.materialFamilySuggestions,
      },
    };
  } catch (error) {
    const overloaded =
      error instanceof Error &&
      (error.name === "OverloadedError" ||
        /overloaded|capacity|429/i.test(error.message));

    console.error("searchPublished failed", { correlationId, error });

    if (overloaded) {
      return {
        ...meta,
        outcome: "overloaded",
        retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
      };
    }

    return {
      ...meta,
      outcome: "unavailable",
      retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
    };
  }
}
