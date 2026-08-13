import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const e2ePersistStatePath = process.env.FILATRACKER_E2E_PERSIST_PATH;

export default defineConfig({
  plugins: [
    cloudflare({
      configPath: "./wrangler.web.jsonc",
      viteEnvironment: { name: "ssr" },
      persistState: e2ePersistStatePath
        ? { path: e2ePersistStatePath }
        : true,
      auxiliaryWorkers: [{ configPath: "./wrangler.ingest.jsonc" }],
    }),
    tailwindcss(),
    reactRouter(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
