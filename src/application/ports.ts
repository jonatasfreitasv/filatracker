import type { SearchPage, SearchPageRpcOutcome } from "../contracts";
import type { StoreRunEvidence } from "../contracts/store-run-evidence";
import type { StoreHealth } from "../contracts/store-health";
import type { DestinationPolicyConfig } from "./destination-policy";
import type { RobotsEvidence } from "./robots-policy";
import type { SafeFetchResult } from "./safe-fetch";

export type ProjectionEpochs = {
  projectionEpoch: number;
  supportEpoch: number;
};

export type SearchPageSnapshotInput = {
  q?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
  correlationId: string;
  /** Single evaluation instant for stale/freshness across the page. */
  evaluatedAt: Date;
};

export type SearchPageSnapshot =
  | {
      outcome: "ok" | "degraded";
      projectionEpoch: number;
      supportEpoch: number;
      searchWriteGeneration: number;
      page: SearchPage;
      qualification: string | null;
    }
  | {
      outcome: "invalid";
      projectionEpoch: number;
      supportEpoch: number;
      searchWriteGeneration: number;
      errors: string[];
    }
  | {
      outcome: "overloaded" | "unavailable";
      projectionEpoch: number;
      supportEpoch: number;
      searchWriteGeneration: number;
    };

export interface SearchCatalogPort {
  /**
   * One D1 snapshot aggregate — epochs, Store support, hits, suggestions,
   * pagination, and qualification from a single read generation (AD-25).
   */
  getSearchPageSnapshot(
    input: SearchPageSnapshotInput,
  ): Promise<SearchPageSnapshot>;
}

export type GetSearchPageInput = {
  /** Request correlation propagated across Service Binding and deadline paths. */
  correlationId?: string | undefined;
  /** Raw query string from URL, or undefined when absent. */
  q?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
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
 * Producers emit v2 evidence after v1+v2 consumers are deployed.
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

/**
 * Persistence port for publication / Store health — domain types only (AD-10).
 */
export interface PublicationPersistencePort {
  getStoreHealth(storeId: string): Promise<StoreHealth | null>;
  getProjectionEpochs(): Promise<ProjectionEpochs>;
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
