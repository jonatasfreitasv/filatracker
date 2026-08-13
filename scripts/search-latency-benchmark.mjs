import { spawnSync } from "node:child_process";
import process from "node:process";

const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "--project", "e2e", "tests/e2e/search-latency-benchmark.e2e.test.ts"],
  {
    stdio: "inherit",
    env: { ...process.env, SEARCH_BENCHMARK: "1" },
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
