import { defineConfig } from "@playwright/test";

// E2E runs against a production build (TEST-02): `pnpm build` first, then this starts
// `pnpm start`, or reuses a server that is already listening. The database must be
// seeded (`pnpm db:seed --reset`) so the demo accounts exist.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (e.g. CI); rely on exported variables.
}

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    // Locally use the installed Google Chrome so no browser has to be downloaded;
    // CI installs Chromium with `playwright install --with-deps chromium`.
    channel: process.env.CI ? undefined : "chrome",
  },
  webServer: {
    command: "pnpm start",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
