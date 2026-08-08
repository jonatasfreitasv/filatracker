import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "unit",
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    // Ensure extensionless TS imports resolve under Vite/Vitest (not Node native ESM).
    extensions: [".ts", ".tsx", ".js", ".mjs", ".json"],
  },
  ssr: {
    noExternal: true,
  },
});
