import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/adapters/persistence/schema.ts",
  out: "./db/migrations",
  dialect: "sqlite",
  driver: "d1-http",
});
