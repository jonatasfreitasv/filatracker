import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({
      configPath: "./wrangler.web.jsonc",
      viteEnvironment: { name: "ssr" },
      auxiliaryWorkers: [{ configPath: "./wrangler.ingest.jsonc" }],
    }),
    tailwindcss(),
    reactRouter(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
