/**
 * Bounded read-only Closin probe (operator/CI-gated).
 *
 * Run:
 *   CLOSIN_PROBE=1 pnpm exec vitest run tests/unit/closin-probe.test.ts --project unit
 *
 * Never publishes to D1, never mutates projection epochs, never binds production secrets.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createClosinStoreAdapter } from "../../src/adapters/stores/closin/adapter";
import { CLOSIN_BUDGETS } from "../../src/adapters/stores/closin/budgets";
import { emitStoreTelemetry } from "../../src/application/telemetry-redaction";

const enabled = process.env.CLOSIN_PROBE === "1";

describe.skipIf(!enabled)("Closin production-safe live probe", () => {
  it(
    "fetches a bounded live set and emits run evidence without D1 mutation",
    async () => {
      for (const key of Object.keys(process.env)) {
        if (
          /^(CLOSIN_|D1_|STORE_|DATABASE_)/i.test(key) &&
          key !== "CLOSIN_PROBE"
        ) {
          throw new Error(`Forbidden env present during probe: ${key}`);
        }
      }

      const adapter = createClosinStoreAdapter();
      const result = await adapter.observe({
        runId: `probe-${Date.now()}`,
        probeId: `closin-probe-${CLOSIN_BUDGETS.maxProbePages}`,
      });

      expect(["complete", "partial", "failed", "quarantined", "oversized"]).toContain(
        result.outcome,
      );
      expect(result.observations.length).toBeLessThanOrEqual(
        CLOSIN_BUDGETS.maxProbePages,
      );

      const telemetry = emitStoreTelemetry({
        event: "closin_probe",
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
        resolve("src/adapters/stores/closin/capacity/last-probe-result.json"),
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
