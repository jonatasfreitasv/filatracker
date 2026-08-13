import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { arch, cpus, platform, release } from "node:os";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startLiveAppHarness, type LiveAppHarness } from "./live-app-harness";
import {
  SEARCH_INDEX_VERSION,
  SEARCH_PAGE_CONTRACT_VERSION,
  SEARCH_PARSER_VERSION,
} from "../../src/contracts";

const enabled = process.env.SEARCH_BENCHMARK === "1";
const warmups = 5;
const sampleCount = 50;
const provisionalTargetMs = 500;
let harness: LiveAppHarness;

function gitEvidence(): { revision: string | null; dirty: boolean | null } {
  try {
    return {
      revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      dirty: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0,
    };
  } catch {
    return { revision: null, dirty: null };
  }
}

function nearestRank(samples: number[], percentile: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(percentile * sorted.length) - 1]!;
}

async function sample(path: string, degraded: boolean): Promise<{ latencyMs: number; responseBytes: number; offerIds: string[] }> {
  const started = performance.now();
  const response = await fetch(`${harness.baseUrl}${path}`);
  const body = await response.text();
  const latencyMs = Math.round((performance.now() - started) * 1000) / 1000;
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(body.includes("Busca em modo degradado")).toBe(degraded);
  expect(body).toMatch(/134(?:<!-- -->)? resultado\(s\)/);
  const offerIds = [...body.matchAll(/data-result-id="([^"]+)"/g)]
    .map((match) => match[1]!);
  expect(offerIds).toHaveLength(50);
  expect(new Set(offerIds).size).toBe(50);
  return { latencyMs, responseBytes: Buffer.byteLength(body), offerIds };
}

describe.skipIf(!enabled)("134-row live search latency evidence", () => {
  beforeAll(async () => {
    harness = await startLiveAppHarness();
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
  });

  it("records 5 warmups + 50 raw FTS/fallback samples and enforces p95 < 500ms", async () => {
    const paths = {
      fts: "/search?q=filamento",
      fallback: "/search?q=fallback",
    } as const;
    const evidence: Record<string, { latency: number[]; bytes: number[]; offerIds: string[] | null }> = {
      fts: { latency: [], bytes: [], offerIds: null },
      fallback: { latency: [], bytes: [], offerIds: null },
    };

    for (const [name, path] of Object.entries(paths)) {
      for (let index = 0; index < warmups; index += 1) await sample(path, name === "fallback");
    }
    for (const [name, path] of Object.entries(paths)) {
      for (let index = 0; index < sampleCount; index += 1) {
        const measured = await sample(path, name === "fallback");
        evidence[name]!.latency.push(measured.latencyMs);
        evidence[name]!.bytes.push(measured.responseBytes);
        evidence[name]!.offerIds ??= measured.offerIds;
        expect(measured.offerIds).toEqual(evidence[name]!.offerIds);
      }
    }
    expect(evidence.fts.offerIds).toEqual(evidence.fallback.offerIds);

    const summarize = (samples: { latency: number[]; bytes: number[]; offerIds: string[] | null }) => ({
      outcome: samples === evidence.fts ? "ok" : "degraded",
      resultIdentity: { firstPageOfferIds: samples.offerIds },
      rawSamplesMs: samples.latency,
      responseBytes: { rawSamples: samples.bytes, min: Math.min(...samples.bytes), max: Math.max(...samples.bytes) },
      p50Ms: nearestRank(samples.latency, 0.5),
      p95Ms: nearestRank(samples.latency, 0.95),
      maxMs: Math.max(...samples.latency),
      passesProvisionalP95: nearestRank(samples.latency, 0.95) < provisionalTargetMs,
    });
    const artifact = {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      dataset: { publishedOffers: 134, pageLimit: 50 },
      method: {
        chain: "React Router SSR -> Service Binding -> ingest Worker -> D1",
        warmupsDiscardedPerPath: warmups,
        samplesPerPath: sampleCount,
        percentile: "nearest-rank (ceil(p * n))",
        provisionalP95TargetMs: provisionalTargetMs,
      },
      runtime: { node: process.version, platform: platform(), release: release(), arch: arch() },
      device: {
        cpuModel: cpus()[0]?.model ?? null,
        logicalCpuCount: cpus().length,
      },
      git: gitEvidence(),
      versions: {
        searchPageContract: SEARCH_PAGE_CONTRACT_VERSION,
        searchIndex: SEARCH_INDEX_VERSION,
        searchParser: SEARCH_PARSER_VERSION,
      },
      targetTierMeasured: false,
      fts: summarize(evidence.fts),
      fallback: summarize(evidence.fallback),
    };

    expect(artifact.fts.passesProvisionalP95).toBe(true);
    expect(artifact.fallback.passesProvisionalP95).toBe(true);
    const output = resolve("docs/evidence/search-latency-134.json");
    await mkdir(resolve("docs/evidence"), { recursive: true });
    await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  }, 120_000);
});
