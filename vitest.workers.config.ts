import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrationsPath = new URL("./db/migrations", import.meta.url).pathname;
  const migrations = await readD1Migrations(migrationsPath);

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.ingest.jsonc" },
        miniflare: {
          compatibilityFlags: ["nodejs_compat"],
          bindings: {
            RPC_DEADLINE_MS: "2000",
            RECOVERY_EPOCH: "1",
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      name: "workers",
      include: ["tests/workers/**/*.test.ts"],
      setupFiles: ["./tests/workers/apply-migrations.ts"],
    },
  };
});
