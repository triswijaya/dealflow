import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Integration tests need a live Postgres; run them separately via
    // `pnpm test:integration` (vitest.integration.config.ts) so `pnpm
    // test:unit` never depends on Docker being up.
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
    env: {
      APP_ENV: "test",
      // Placeholders only: satisfy the required-field checks so importing
      // env.ts during unit test collection doesn't throw. No unit test ever
      // opens a real connection or session with these values.
      DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder",
      BETTER_AUTH_SECRET: "placeholder-secret-not-used-by-unit-tests",
      BETTER_AUTH_URL: "http://localhost:3000",
      APP_URL: "http://localhost:3000",
    },
  },
});
