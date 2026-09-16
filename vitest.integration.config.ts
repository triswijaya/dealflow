import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests need a real, running Postgres (see compose.yaml).
// CI/production inject env vars directly; local dev keeps them in .env.local.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (e.g. CI); rely on already-exported env vars.
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    env: {
      APP_ENV: "test",
    },
  },
});
