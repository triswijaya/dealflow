import { defineConfig } from "drizzle-kit";

// CI/production inject env vars directly; local dev keeps them in .env.local.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (e.g. CI); rely on already-exported env vars.
}

const migrationUrl = process.env.DATABASE_MIGRATION_URL;
if (!migrationUrl) {
  throw new Error(
    "Invalid environment configuration:\n- DATABASE_MIGRATION_URL: required for drizzle-kit (migration job only, not runtime)",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: migrationUrl,
  },
});
