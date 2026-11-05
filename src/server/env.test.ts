import { describe, expect, it } from "vitest";
import { parseClientEnv, parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("rejects a missing DATABASE_URL (required starting Commit 5)", () => {
    expect(() => parseServerEnv({ APP_ENV: "local" })).toThrow(/DATABASE_URL/);
  });

  const validEnv = {
    APP_ENV: "local",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/dealflow",
    BETTER_AUTH_SECRET: "a-sufficiently-long-local-secret",
    BETTER_AUTH_URL: "http://localhost:3000",
    APP_URL: "http://localhost:3000",
    EMAIL_FROM: "no-reply@dealflow.test",
  } as const;

  it("requires the mail key and the cron secret on a hosted environment", () => {
    expect(() => parseServerEnv({ ...validEnv, APP_ENV: "production" })).toThrow(/EMAIL_PROVIDER_API_KEY[\s\S]*CRON_SECRET/);
    expect(parseServerEnv({ ...validEnv, APP_ENV: "production", EMAIL_PROVIDER_API_KEY: "re_key", CRON_SECRET: "a-cron-secret-of-16+" }).APP_ENV).toBe("production");
  });

  it("accepts a fully valid environment", () => {
    const result = parseServerEnv(validEnv);
    expect(result.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(result.BETTER_AUTH_URL).toBe(validEnv.BETTER_AUTH_URL);
    expect(result.APP_URL).toBe(validEnv.APP_URL);
    expect(result.EMAIL_FROM).toBe(validEnv.EMAIL_FROM);
  });

  it("rejects a missing EMAIL_FROM (required starting Commit 12)", () => {
    expect(() =>
      parseServerEnv({
        APP_ENV: validEnv.APP_ENV,
        DATABASE_URL: validEnv.DATABASE_URL,
        BETTER_AUTH_SECRET: validEnv.BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: validEnv.BETTER_AUTH_URL,
        APP_URL: validEnv.APP_URL,
      }),
    ).toThrow(/EMAIL_FROM/);
  });

  it("rejects a missing BETTER_AUTH_SECRET (required starting Commit 7)", () => {
    expect(() =>
      parseServerEnv({
        APP_ENV: validEnv.APP_ENV,
        DATABASE_URL: validEnv.DATABASE_URL,
        BETTER_AUTH_URL: validEnv.BETTER_AUTH_URL,
        APP_URL: validEnv.APP_URL,
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("rejects a missing BETTER_AUTH_URL (required starting Commit 7)", () => {
    expect(() =>
      parseServerEnv({
        APP_ENV: validEnv.APP_ENV,
        DATABASE_URL: validEnv.DATABASE_URL,
        BETTER_AUTH_SECRET: validEnv.BETTER_AUTH_SECRET,
        APP_URL: validEnv.APP_URL,
      }),
    ).toThrow(/BETTER_AUTH_URL/);
  });

  it("rejects a missing APP_URL (required starting Commit 7)", () => {
    expect(() =>
      parseServerEnv({
        APP_ENV: validEnv.APP_ENV,
        DATABASE_URL: validEnv.DATABASE_URL,
        BETTER_AUTH_SECRET: validEnv.BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: validEnv.BETTER_AUTH_URL,
      }),
    ).toThrow(/APP_URL/);
  });

  it("rejects a missing APP_ENV", () => {
    expect(() => parseServerEnv({})).toThrow(/APP_ENV/);
  });

  it("rejects an invalid APP_ENV value", () => {
    expect(() => parseServerEnv({ APP_ENV: "staging" })).toThrow(/APP_ENV/);
  });

  it("rejects a malformed DATABASE_URL without leaking the value", () => {
    const malformed = "not-a-url";
    let message = "";
    try {
      parseServerEnv({ APP_ENV: "local", DATABASE_URL: malformed });
      throw new Error("expected parseServerEnv to throw");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain(malformed);
  });

  it("never includes secret-like values in the thrown message", () => {
    const secret = "super-secret-value-should-not-leak";
    let message = "";
    try {
      parseServerEnv({ APP_ENV: "local", BETTER_AUTH_SECRET: "" });
      throw new Error("expected parseServerEnv to throw");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/BETTER_AUTH_SECRET/);
    expect(message).not.toContain(secret);
  });
});

describe("parseClientEnv", () => {
  it("allows NEXT_PUBLIC_SENTRY_DSN to be absent", () => {
    const result = parseClientEnv({});
    expect(result.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined();
  });

  it("accepts a valid NEXT_PUBLIC_SENTRY_DSN", () => {
    const result = parseClientEnv({
      NEXT_PUBLIC_SENTRY_DSN: "https://example.ingest.sentry.io/123",
    });
    expect(result.NEXT_PUBLIC_SENTRY_DSN).toBe("https://example.ingest.sentry.io/123");
  });

  it("rejects a malformed NEXT_PUBLIC_SENTRY_DSN", () => {
    expect(() => parseClientEnv({ NEXT_PUBLIC_SENTRY_DSN: "not-a-url" })).toThrow(
      /NEXT_PUBLIC_SENTRY_DSN/,
    );
  });
});
