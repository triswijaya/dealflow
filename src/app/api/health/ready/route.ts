import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { getRequestId, logger } from "@/server/shared/logger";

// OBS-03 readiness: can this instance reach its database. The answer is cached for a
// few seconds per instance so a busy monitor or a hostile caller cannot turn this
// endpoint into a stream of database queries, and failures never say why (SEC-08).
const CACHE_MS = 5_000;
const TIMEOUT_MS = 2_000;

let last: { at: number; ready: boolean } | null = null;

async function checkDatabase(requestId: string): Promise<boolean> {
  const started = Date.now();
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    return true;
  } catch (error) {
    // The response never says why; the cause (name/code only) goes to the log.
    logger.error("health.ready", { requestId, durationMs: Date.now() - started, status: 503, error });
    return false;
  }
}

export async function GET(request: Request) {
  if (!last || Date.now() - last.at > CACHE_MS) {
    last = { at: Date.now(), ready: await checkDatabase(getRequestId(request)) };
  }
  return Response.json(
    { status: last.ready ? "ready" : "unavailable" },
    { status: last.ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
