import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural allowlist for wrangler.web.jsonc — replaces broad regex-only denial.
 * No CLOSING_*, Store, probe, D1, queue, schedule, or migration bindings may appear.
 */
function parseJsonc(raw: string): unknown {
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(stripped);
}

const WEB_ALLOWED_TOP_KEYS = new Set([
  "$schema",
  "name",
  "compatibility_date",
  "compatibility_flags",
  "main",
  "assets",
  "services",
  "observability",
  "vars",
  "upload_source_maps",
]);

const FORBIDDEN_TOP_KEYS = [
  "d1_databases",
  "queues",
  "kv_namespaces",
  "r2_buckets",
  "triggers",
  "crons",
  "workflows",
  "migrations",
  "durable_objects",
];

describe("wrangler.web structural allowlist", () => {
  it("parses web config and allows only reviewed bindings", () => {
    const raw = readFileSync(resolve("wrangler.web.jsonc"), "utf8");
    const json = parseJsonc(raw) as Record<string, unknown>;

    for (const key of Object.keys(json)) {
      expect(WEB_ALLOWED_TOP_KEYS.has(key)).toBe(true);
    }
    for (const forbidden of FORBIDDEN_TOP_KEYS) {
      expect(json).not.toHaveProperty(forbidden);
    }

    const blob = JSON.stringify(json);
    expect(blob).not.toMatch(/closin/i);
    expect(blob).not.toMatch(/\bstore\b/i);
    expect(blob).not.toMatch(/probe/i);
    expect(blob).not.toMatch(/d1_databases/i);
    expect(blob).not.toMatch(/queues/i);
    expect(blob).not.toMatch(/migrations/i);

    const services = json.services as Array<Record<string, string>>;
    expect(services).toEqual([
      expect.objectContaining({
        binding: "INGEST",
        service: "filatracker-ingest",
      }),
    ]);
  });

  it("ingest keeps D1 but does not add Store/probe secrets", () => {
    const raw = readFileSync(resolve("wrangler.ingest.jsonc"), "utf8");
    const json = parseJsonc(raw) as Record<string, unknown>;
    expect(json).toHaveProperty("d1_databases");
    const blob = JSON.stringify(json);
    expect(blob).not.toMatch(/closin/i);
    expect(blob).not.toMatch(/probe/i);
  });
});

describe("ingest import-graph / startup surface", () => {
  it("workers/ingest.ts does not eagerly import Store/probe modules", () => {
    const src = readFileSync(resolve("workers/ingest.ts"), "utf8");
    expect(src).not.toMatch(/adapters\/stores/);
    expect(src).not.toMatch(/closin/i);
    expect(src).not.toMatch(/safe-fetch/);
    expect(src).not.toMatch(/robots-policy/);
    expect(src).toMatch(/getSearchPage/);
    expect(src).not.toMatch(/async\s+(fetchStore|probe|enqueue|schedule)/);
  });

  it("preserves two-worker topology names", () => {
    const web = readFileSync(resolve("wrangler.web.jsonc"), "utf8");
    const ingest = readFileSync(resolve("wrangler.ingest.jsonc"), "utf8");
    expect(web).toMatch(/"name":\s*"filatracker-web"/);
    expect(ingest).toMatch(/"name":\s*"filatracker-ingest"/);
  });
});
