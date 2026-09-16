import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "./auth";

describe("Better Auth foundation", () => {
  let migrationClient: ReturnType<typeof postgres>;
  const email = `test-${Date.now()}@example.test`;
  const password = "correct-horse-battery-staple";

  beforeAll(async () => {
    const migrationUrl = process.env.DATABASE_MIGRATION_URL;
    if (!migrationUrl) {
      throw new Error("DATABASE_MIGRATION_URL must be set to run integration tests");
    }
    migrationClient = postgres(migrationUrl, { max: 1 });
    await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });
  });

  afterAll(async () => {
    await migrationClient.end();
  });

  it("registers a user, issues a session, and rejects the session after logout", async () => {
    const signUpResponse = await auth.api.signUpEmail({
      body: { email, password, name: "Test User" },
      asResponse: true,
    });
    expect(signUpResponse.status).toBe(200);

    const setCookie = signUpResponse.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    // AUTH-06: session cookie must be HttpOnly and SameSite-restricted.
    expect(setCookie!.toLowerCase()).toContain("httponly");
    expect(setCookie!.toLowerCase()).toContain("samesite=lax");
    const sessionCookie = setCookie!.split(";")[0];

    const session = await auth.api.getSession({
      headers: new Headers({ cookie: sessionCookie }),
    });
    expect(session?.user.email).toBe(email);

    await auth.api.signOut({
      headers: new Headers({ cookie: sessionCookie }),
    });

    const sessionAfterLogout = await auth.api.getSession({
      headers: new Headers({ cookie: sessionCookie }),
    });
    expect(sessionAfterLogout).toBeNull();
  });

  it("rejects a password shorter than 12 characters", async () => {
    await expect(
      auth.api.signUpEmail({
        body: {
          email: `short-${Date.now()}@example.test`,
          password: "short1",
          name: "Test User",
        },
      }),
    ).rejects.toThrow();
  });
});
