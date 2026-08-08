import type { SearchPage, SearchPageRpcOutcome } from "../contracts";
import type { StoreRunEvidence } from "../contracts/store-run-evidence";
import type { DestinationPolicyConfig } from "./destination-policy";
import type { RobotsEvidence } from "./robots-policy";
import type { SafeFetchResult } from "./safe-fetch";

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

/**
 * Destination-policy port (AD-20): HTTPS, exact hosts/ports, public DNS,
 * Store-scoped path/query, every-hop validation.
 */
export interface DestinationPolicyPort {
  getConfig(): DestinationPolicyConfig;
  validate(url: string): { ok: true; href: string } | { ok: false; code: string; detail: string };
}

/**
 * Store discovery/extraction port — returns discriminated bounded run evidence.
 * Never returns Offers, Merges, publication commands, or an ambiguous bare array.
 */
export interface StoreObservationPort {
  readonly storeId: string;
  /**
   * Run discovery+extraction under robots/destination/budget policies.
   * Must not mutate D1 Offers/FTS, enqueue work, or alter projection epochs.
   */
  observe(input: {
    runId: string;
    probeId?: string | null;
    /** Optional fixture HTML keyed by source URL for offline homologation. */
    fixtureBodies?: ReadonlyMap<string, string>;
    fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  }): Promise<StoreRunEvidence>;
}

export type RobotsEvaluationPort = {
  evaluateForPaths(input: {
    robotsBody: string;
    requestedUrl: string;
    finalUrl: string;
    redirects: string[];
    paths: string[];
    capturedAt: string;
  }): RobotsEvidence;
};

export type SafeFetchPort = {
  fetchText(url: string): Promise<SafeFetchResult>;
};
