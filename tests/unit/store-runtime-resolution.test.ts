import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  peekQueueStoreId,
  resolveStoreRuntime,
} from "../../src/adapters/stores/resolve-runtime";

describe("multi-store runtime resolution", () => {
  it("resolves Closin and Voolt3D maps/adapters by storeId", async () => {
    const closin = await resolveStoreRuntime("closin");
    const voolt = await resolveStoreRuntime("voolt3d");
    expect(closin?.storeId).toBe("closin");
    expect(voolt?.storeId).toBe("voolt3d");
    expect(closin?.loadMap().storeId).toBe("closin");
    expect(voolt?.loadMap().storeId).toBe("voolt3d");
    expect(closin?.createAdapter().storeId).toBe("closin");
    expect(voolt?.createAdapter().storeId).toBe("voolt3d");
    expect(closin?.apexToWww).toEqual({
      apex: "closin.com.br",
      www: "www.closin.com.br",
    });
    expect(voolt?.apexToWww).toEqual({
      apex: "www.voolt3d.com.br",
      www: "voolt3d.com.br",
    });
    expect(await resolveStoreRuntime("unknown")).toBeNull();
  });

  it("peeks storeId from queue envelope bodies", () => {
    expect(
      peekQueueStoreId({ storeId: "voolt3d", kind: "ingest.publish" }),
    ).toBe("voolt3d");
    expect(peekQueueStoreId(null)).toBeNull();
    expect(peekQueueStoreId({ kind: "ingest.publish" })).toBeNull();
  });

  it("schedule/queue handlers resolve Stores by storeId (no Closin-only hardcode)", () => {
    const handlersSrc = readFileSync(
      resolve("src/adapters/queue/handlers.ts"),
      "utf8",
    );
    expect(handlersSrc).toMatch(/support_state IN \('active', 'degraded'\)/);
    expect(handlersSrc).toMatch(/resolveStoreRuntime/);
    expect(handlersSrc).toMatch(/peekQueueStoreId/);
    expect(handlersSrc).toMatch(/ingest_schedule_store_failed/);
    expect(handlersSrc).not.toMatch(/loadClosinMap\(\)/);
    expect(handlersSrc).not.toMatch(/createClosinStoreAdapter\(\)/);
    expect(handlersSrc).toMatch(
      /try\s*\{\s*const runtime = await resolveStoreRuntime\(store\.store_id\);[\s\S]*const map = runtime\.loadMap\(\);[\s\S]*await runDiscoveryAndEnqueue\(/,
    );
  });
});
