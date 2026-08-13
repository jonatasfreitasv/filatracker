/**
 * Observation/map resolution only — not a second coordinator or publish path.
 * Lazy-imported by queue/schedule handlers; never imported from workers/ingest.ts.
 */

import type { StoreObservationPort } from "../../application/ports";
import type { StoreMap } from "../../contracts/store-map";

export type StoreHostRewrite = { apex: string; www: string };

export type StoreRuntime = {
  storeId: string;
  loadMap: () => StoreMap;
  createAdapter: () => StoreObservationPort;
  apexToWww: StoreHostRewrite;
};

const KNOWN_STORE_IDS = ["closin", "voolt3d"] as const;
export type KnownStoreId = (typeof KNOWN_STORE_IDS)[number];

export function isKnownStoreId(storeId: string): storeId is KnownStoreId {
  return (KNOWN_STORE_IDS as readonly string[]).includes(storeId);
}

export async function resolveStoreRuntime(
  storeId: string,
): Promise<StoreRuntime | null> {
  if (storeId === "closin") {
    const { createClosinStoreAdapter } = await import("./closin/adapter");
    const { loadClosinMap, CLOSIN_STORE_ID } = await import("./closin/map");
    return {
      storeId: CLOSIN_STORE_ID,
      loadMap: loadClosinMap,
      createAdapter: createClosinStoreAdapter,
      apexToWww: { apex: "closin.com.br", www: "www.closin.com.br" },
    };
  }
  if (storeId === "voolt3d") {
    const { createVoolt3dStoreAdapter } = await import("./voolt3d/adapter");
    const { loadVoolt3dMap, VOOLT3D_HOST_REWRITE, VOOLT3D_STORE_ID } =
      await import("./voolt3d/map");
    return {
      storeId: VOOLT3D_STORE_ID,
      loadMap: loadVoolt3dMap,
      createAdapter: createVoolt3dStoreAdapter,
      apexToWww: { ...VOOLT3D_HOST_REWRITE },
    };
  }
  return null;
}

/** Best-effort storeId peek for queue routing before full envelope decode. */
export function peekQueueStoreId(rawBody: unknown): string | null {
  if (!rawBody || typeof rawBody !== "object") return null;
  const storeId = (rawBody as { storeId?: unknown }).storeId;
  return typeof storeId === "string" && storeId.length > 0 ? storeId : null;
}
