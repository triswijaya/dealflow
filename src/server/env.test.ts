import { describe, expect, it } from "vitest";
import { parseClientEnv, parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("rejects a missing DATABASE_URL (required starting Commit 5)", () => {
    expect(() => parseServerEnv({ APP_ENV: "local" })).toThrow(/DATABASE_URL/);
  });

  it("accepts a valid DATABASE_URL when present", () => {
    const result = parseServerEnv({
      APP_ENV: "local",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/dealflow",
    });
    expect(result.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/dealflow");
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
