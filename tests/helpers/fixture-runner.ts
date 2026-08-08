/**
 * Shared Store fixture runner helpers for offline homologation tests.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type FixtureMeta = {
  id: string;
  sourceUrl: string;
  capturedAt: string;
  contentDigestSha256: string;
  sanitizerMethod: string;
  mapVersion: number;
  parserVersion: number;
  expectedOutcome: Record<string, unknown>;
};

export function loadFixturePair(
  dir: string,
  id: string,
): { html: string; meta: FixtureMeta } {
  const html = readFileSync(join(dir, `${id}.html`), "utf8");
  const meta = JSON.parse(
    readFileSync(join(dir, `${id}.meta.json`), "utf8"),
  ) as FixtureMeta;
  return { html, meta };
}

export function listFixtureIds(dir: string): string[] {
  return readdirSync(dir)
    .filter((f: string) => f.endsWith(".meta.json"))
    .map((f: string) => f.replace(/\.meta\.json$/, ""))
    .sort();
}

export function buildFixtureBodyMap(
  dir: string,
  ids: string[],
  extras?: ReadonlyMap<string, string>,
): Map<string, string> {
  const map = new Map<string, string>(extras);
  for (const id of ids) {
    const { html, meta } = loadFixturePair(dir, id);
    map.set(meta.sourceUrl, html);
  }
  return map;
}
