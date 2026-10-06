import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

// OBS-03 readiness: can this instance reach its database. The answer is cached for a
// few seconds per instance so a busy monitor or a hostile caller cannot turn this
// endpoint into a stream of database queries, and failures never say why (SEC-08).
const CACHE_MS = 5_000;
const TIMEOUT_MS = 2_000;

let last: { at: number; ready: boolean } | null = null;

async function checkDatabase(): Promise<boolean> {
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  if (!last || Date.now() - last.at > CACHE_MS) {
    last = { at: Date.now(), ready: await checkDatabase() };
  }
  return Response.json(
    { status: last.ready ? "ready" : "unavailable" },
    { status: last.ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
