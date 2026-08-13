import { describe, expect, it } from "vitest";

import { handlePublishQueueMessage } from "../../src/adapters/queue/publish-consumer";
import { closinMap } from "../../src/adapters/stores/closin/map";
import { runDiscoveryAndEnqueue } from "../../src/application/ingestion-coordinator";
import type { StoreRunEvidenceV2 } from "../../src/contracts/store-run-evidence";

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: 1,
    kind: "ingest.publish",
    messageId: "message-1",
    idempotencyKey: "closin:run-1:publish",
    storeId: "closin",
    runId: "run-1",
    storeGeneration: 0,
    supportGeneration: 1,
    projectionEpoch: 1,
    recoveryEpoch: 1,
    payloadDigestSha256: "digest",
    payloadArtifactId: "artifact-1",
    payloadExpiresAt: "2099-08-09T12:00:00.000Z",
    enqueuedAt: "2026-08-09T12:00:00.000Z",
    probeId: null,
    ...overrides,
  };
}

function failedEvidence(): StoreRunEvidenceV2 {
  return {
    contractVersion: 2,
    storeId: "closin",
    runId: "run-1",
    probeId: null,
    mapVersion: closinMap.mapVersion,
    parserVersion: closinMap.parserVersion,
    startedAt: "2026-08-09T12:00:00.000Z",
    finishedAt: "2026-08-09T12:01:00.000Z",
    outcome: "failed",
    observations: [],
    omissions: [],
    failureCodes: ["fetch_failed"],
    budgetUsage: {
      fetchCount: 1,
      redirectHops: 0,
      encodedBytes: 1,
      decompressedBytes: 1,
      observationCount: 0,
      candidateCount: 1,
      subrequests: 1,
      durationMs: 1,
      stagedByteEstimate: 1,
      logEventBytes: 0,
    },
    catalogWork: { expected: 1, completed: 0 },
  };
}

describe("Story 1.3 queue consumer review patches", () => {
  const unusedDb = {} as D1Database;

  it("rejects non-publish kinds before touching persistence", async () => {
    const result = await handlePublishQueueMessage({
      deps: { db: unusedDb, recoveryEpochAuthority: 1 },
      rawBody: envelope({ kind: "ingest.replay" }),
      map: closinMap,
      allowedHosts: ["www.closin.com.br"],
    });
    expect(result).toEqual({
      action: "dlq",
      reason: "unexpected_envelope_kind",
    });
  });

  it("ACKs old recovery epochs but retries future epochs", async () => {
    const oldResult = await handlePublishQueueMessage({
      deps: { db: unusedDb, recoveryEpochAuthority: 2 },
      rawBody: envelope({ recoveryEpoch: 1 }),
      map: closinMap,
      allowedHosts: ["www.closin.com.br"],
    });
    const futureResult = await handlePublishQueueMessage({
      deps: { db: unusedDb, recoveryEpochAuthority: 1 },
      rawBody: envelope({ recoveryEpoch: 2 }),
      map: closinMap,
      allowedHosts: ["www.closin.com.br"],
    });
    expect(oldResult).toEqual({ action: "ack" });
    expect(futureResult).toEqual({ action: "retry" });
  });

  it("fails closed when retained artifact identity differs from the envelope", async () => {
    const statement = {
      bind() {
        return this;
      },
      async first() {
        return {
          store_id: "another-store",
          run_id: "run-1",
          payload_json: JSON.stringify(failedEvidence()),
          digest_sha256: "digest",
          contract_version: 2,
          map_version: closinMap.mapVersion,
          parser_version: closinMap.parserVersion,
          purged_at: null,
          expires_at: "2099-08-09T12:00:00.000Z",
        };
      },
    };
    const db = { prepare: () => statement } as unknown as D1Database;
    const result = await handlePublishQueueMessage({
      deps: { db, recoveryEpochAuthority: 1 },
      rawBody: envelope(),
      map: closinMap,
      allowedHosts: ["www.closin.com.br"],
    });
    expect(result).toEqual({
      action: "dlq",
      reason: "artifact_identity_mismatch",
    });
  });
});

describe("Story 1.3 coordinator enqueue review patch", () => {
  it("terminalizes a Run when Queue.send fails without exposing the error", async () => {
    class Statement {
      bindings: unknown[] = [];

      constructor(readonly sql: string) {}

      bind(...bindings: unknown[]) {
        this.bindings = bindings;
        return this;
      }

      async run() {
        return { meta: { changes: 1 } };
      }
    }

    const batches: Statement[][] = [];
    const db = {
      prepare(sql: string) {
        return new Statement(sql);
      },
      async batch(statements: Statement[]) {
        batches.push(statements);
        return statements.map(() => ({ meta: { changes: 1 } }));
      },
    } as unknown as D1Database;
    const evidence = failedEvidence();
    const result = await runDiscoveryAndEnqueue({
      deps: {
        db,
        recoveryEpochAuthority: 1,
        now: () => new Date("2026-08-09T12:00:00.000Z"),
        randomId: () => "stable-id",
      },
      adapter: {
        storeId: "closin",
        observe: async () => evidence,
      },
      map: closinMap,
      runId: "run-1",
      queue: {
        send: async () => {
          throw new Error("secret queue detail");
        },
      } as unknown as Queue<unknown>,
      supportGeneration: 1,
      projectionEpoch: 1,
      storeGeneration: 0,
      allowedHosts: ["www.closin.com.br"],
    });

    expect(result).toEqual({ enqueued: false, reason: "queue_send_failed" });
    expect(JSON.stringify(result)).not.toContain("secret queue detail");
    expect(batches.at(-1)?.[0]?.bindings[0]).toBe("failed");
  });
});
