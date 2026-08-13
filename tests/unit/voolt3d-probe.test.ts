/**
 * Bounded read-only Voolt3D probe (operator/CI-gated).
 *
 * Run:
 *   VOOLT3D_PROBE=1 pnpm exec vitest run tests/unit/voolt3d-probe.test.ts --project unit
 *
 * Never publishes to D1, never mutates projection epochs, never binds production secrets.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createVoolt3dStoreAdapter } from "../../src/adapters/stores/voolt3d/adapter";
import { VOOLT3D_BUDGETS } from "../../src/adapters/stores/voolt3d/budgets";
import { emitStoreTelemetry } from "../../src/application/telemetry-redaction";

const enabled = process.env.VOOLT3D_PROBE === "1";

describe.skipIf(!enabled)("Voolt3D production-safe live probe", () => {
  it(
    "fetches a bounded live set and emits run evidence without D1 mutation",
    async () => {
      for (const key of Object.keys(process.env)) {
        if (
          /^(VOOLT3D_|D1_|STORE_|DATABASE_)/i.test(key) &&
          key !== "VOOLT3D_PROBE"
        ) {
          throw new Error(`Forbidden env present during probe: ${key}`);
        }
      }

      const adapter = createVoolt3dStoreAdapter();
      const result = await adapter.observe({
        runId: `probe-${Date.now()}`,
        probeId: `voolt3d-probe-${VOOLT3D_BUDGETS.maxProbePages}`,
      });

      expect([
        "complete",
        "partial",
        "failed",
        "quarantined",
        "oversized",
      ]).toContain(result.outcome);
      expect(result.observations.length).toBeLessThanOrEqual(
        VOOLT3D_BUDGETS.maxProbePages,
      );

      const telemetry = emitStoreTelemetry({
        event: "voolt3d_probe",
        storeId: result.storeId,
        runId: result.runId,
        probeId: result.probeId,
        outcome: result.outcome,
        observationCount: result.observations.length,
        candidateCount: result.budgetUsage.candidateCount,
        omissionCount: result.omissions.length,
        budgetUsage: result.budgetUsage,
        mapVersion: result.mapVersion,
        parserVersion: result.parserVersion,
        durationMs: result.budgetUsage.durationMs,
      });

      expect(telemetry).not.toHaveProperty("sourceUrl");
      expect(JSON.stringify(telemetry)).not.toMatch(/User-Agent/i);

      writeFileSync(
        resolve("src/adapters/stores/voolt3d/capacity/last-probe-result.json"),
        JSON.stringify(
          {
            recordedAt: new Date().toISOString(),
            telemetry,
            outcome: result.outcome,
            catalogWork: result.catalogWork,
            observationCount: result.observations.length,
            budgetUsage: result.budgetUsage,
          },
          null,
          2,
        ) + "\n",
      );
    },
    60_000,
  );
});
