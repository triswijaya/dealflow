import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type postgres from "postgres";
import { db } from "@/server/db/client";
import { rateLimitBuckets } from "@/server/db/schema";
import { toActionError } from "@/server/shared/action";
import { migrateTestDatabase } from "@/server/testing/org-helpers";
import { assertRateLimit, betterAuthRateLimitStorage, clientIp, consumeRateLimit, consumeRateLimits } from "./rate-limit";

const key = (label: string) => `test:${label}:${crypto.randomUUID()}`;

describe("database rate limiter (SEC-02)", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  it("allows up to the limit, then refuses with a retry time inside the window", async () => {
    const k = key("limit");
    const rule = { max: 3, windowSeconds: 60 };
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await consumeRateLimit(k, rule)).toEqual({ allowed: true });
    }
    const refused = await consumeRateLimit(k, rule);
    expect(refused).toMatchObject({ allowed: false });
    if (!refused.allowed) {
      expect(refused.retryAfterSeconds).toBeGreaterThan(0);
      expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it("keeps keys independent of each other", async () => {
    const rule = { max: 1, windowSeconds: 60 };
    const [a, b] = [key("a"), key("b")];
    expect(await consumeRateLimit(a, rule)).toEqual({ allowed: true });
    expect((await consumeRateLimit(a, rule)).allowed).toBe(false);
    expect(await consumeRateLimit(b, rule)).toEqual({ allowed: true });
  });

  it("lets exactly the limit through when attempts arrive in parallel", async () => {
    const k = key("parallel");
    const decisions = await Promise.all(Array.from({ length: 20 }, () => consumeRateLimit(k, { max: 5, windowSeconds: 60 })));
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(5);
  });

  it("starts a fresh window once the old one has passed", async () => {
    const k = key("window");
    const rule = { max: 1, windowSeconds: 1 };
    expect((await consumeRateLimit(k, rule)).allowed).toBe(true);
    expect((await consumeRateLimit(k, rule)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect((await consumeRateLimit(k, rule)).allowed).toBe(true);
  });

  it("never stores the key in the clear", async () => {
    const raw = `register:email:person-${crypto.randomUUID()}@example.test`;
    await consumeRateLimit(raw, { max: 5, windowSeconds: 60 });
    const stored = await db.select().from(rateLimitBuckets).where(eq(rateLimitBuckets.key, raw));
    expect(stored).toHaveLength(0);
  });

  it("stops at the first refusal without spending the later checks", async () => {
    const [first, second] = [key("first"), key("second")];
    expect((await consumeRateLimits([{ key: first, rule: { max: 1, windowSeconds: 60 } }])).allowed).toBe(true);

    const decision = await consumeRateLimits([
      { key: first, rule: { max: 1, windowSeconds: 60 } },
      { key: second, rule: { max: 1, windowSeconds: 60 } },
    ]);
    expect(decision.allowed).toBe(false);
    // second was never touched, so it still has its single attempt.
    expect((await consumeRateLimit(second, { max: 1, windowSeconds: 60 })).allowed).toBe(true);
  });

  it("turns a refusal into the 429 message the action layer shows", async () => {
    const k = key("assert");
    const checks = [{ key: k, rule: { max: 1, windowSeconds: 60 } }];
    await assertRateLimit(checks);
    const error = await assertRateLimit(checks).catch((caught) => caught);
    expect(toActionError(error)).toMatchObject({ code: "TOO_MANY_REQUESTS", message: expect.stringContaining("Terlalu banyak percobaan") });
  });

  it("serves Better Auth's own limiter from the same table", async () => {
    const k = key("better-auth");
    const rule = { window: 60, max: 1 };
    expect(await betterAuthRateLimitStorage.consume(k, rule)).toEqual({ allowed: true, retryAfter: null });
    const refused = await betterAuthRateLimitStorage.consume(k, rule);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfter).toBeGreaterThan(0);
  });
});

describe("clientIp", () => {
  it("prefers the real-ip header, then the first forwarded address, then unknown", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
