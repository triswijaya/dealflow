// Imported first by index.ts so the environment is in place before any server
// module (which validates env on import) is evaluated. Variables that are
// already exported win, so `DATABASE_URL=... pnpm db:seed` can retarget the
// seed without editing .env.local.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (e.g. CI); rely on exported variables.
}
