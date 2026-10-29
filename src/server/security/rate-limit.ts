import { createHash } from "node:crypto";
import { APIError } from "better-auth/api";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { logger } from "@/server/shared/logger";

// SEC-02: a database-backed limiter, so it holds across Vercel instances
// (an in-memory counter would reset on every cold start and differ per
// instance). Fixed window per key, one atomic upsert per attempt, so two
// parallel requests cannot both slip under the limit.

export type RateLimitRule = { max: number; windowSeconds: number };
export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };
export type RateLimitCheck = { key: string; rule: RateLimitRule };

// Stored keys are hashes: the table never holds an IP address or an email in the clear.
function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Rows older than this are dead weight whatever their window was.
const STALE_AFTER = "1 day";
const CLEANUP_PROBABILITY = 0.01;

export async function consumeRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
  const expired = sql`bucket.window_started_at <= now() - make_interval(secs => ${rule.windowSeconds})`;
  const rows = await db.execute<{ count: number; retry_after: number }>(sql`
    INSERT INTO rate_limit_buckets AS bucket (key, count, window_started_at)
    VALUES (${hashKey(key)}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      -- LEAST keeps the counter from growing without bound while someone hammers a closed window.
      count = CASE WHEN ${expired} THEN 1 ELSE LEAST(bucket.count + 1, ${rule.max + 1}) END,
      window_started_at = CASE WHEN ${expired} THEN now() ELSE bucket.window_started_at END
    RETURNING
      count,
      EXTRACT(EPOCH FROM (window_started_at + make_interval(secs => ${rule.windowSeconds}) - now()))::float8 AS retry_after
  `);
  const [row] = rows;

  if (Math.random() < CLEANUP_PROBABILITY) {
    // Best effort: a failed or cut-off cleanup only leaves rows for the next one.
    void db
      .execute(sql`DELETE FROM rate_limit_buckets WHERE window_started_at < now() - ${STALE_AFTER}::interval`)
      .catch((error) => logger.warn("rate_limit.cleanup_failed", { error }));
  }

  return row.count <= rule.max ? { allowed: true } : { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(row.retry_after)) };
}

/** Every check is consumed in order; the first denial stops the rest. */
export async function consumeRateLimits(checks: RateLimitCheck[]): Promise<RateLimitDecision> {
  for (const { key, rule } of checks) {
    const decision = await consumeRateLimit(key, rule);
    if (!decision.allowed) return decision;
  }
  return { allowed: true };
}

/** Same as consumeRateLimits, as an error the action layer already turns into a 429 message. */
export async function assertRateLimit(checks: RateLimitCheck[]): Promise<void> {
  const decision = await consumeRateLimits(checks);
  if (!decision.allowed) {
    throw new APIError("TOO_MANY_REQUESTS", { message: "Too many requests" });
  }
}

// shortcut: trusts the proxy's client-IP headers, which is right behind Vercel (it
// overwrites them) and spoofable on a host that appends; revisit when moving host.
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return headers.get("x-real-ip")?.trim() || forwarded || "unknown";
}

/** Better Auth's own limiter (sign-in, password reset, ...) stored in the same table. */
export const betterAuthRateLimitStorage = {
  async consume(key: string, rule: { window: number; max: number }) {
    const decision = await consumeRateLimit(`better-auth:${key}`, { max: rule.max, windowSeconds: rule.window });
    return decision.allowed ? { allowed: true, retryAfter: null } : { allowed: false, retryAfter: decision.retryAfterSeconds };
  },
};
