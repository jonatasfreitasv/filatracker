import type { SearchPage, SearchPageRpcOutcome } from "../contracts";

export type ProjectionEpochs = {
  projectionEpoch: number;
  supportEpoch: number;
};

export interface SearchCatalogPort {
  getEpochs(): Promise<ProjectionEpochs>;
  /**
   * Authoritative empty-catalog path for Story 1.1.
   * Returns zero hits when nothing is published.
   */
  searchPublished(query: string | null): Promise<{
    hits: SearchPage["hits"];
    totalCount: number;
    materialFamilySuggestions: SearchPage["materialFamilySuggestions"];
  }>;
}

export type GetSearchPageInput = {
  /** Raw query string from URL, or undefined when absent. */
  q?: string | undefined;
  /** True when request carried unknown/repeated query parameters. */
  hasInvalidParameters?: boolean;
};

export type GetSearchPageResult = SearchPageRpcOutcome;
