import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "./auth";
import { registerOwner } from "./register-owner";
import { db } from "@/server/db/client";
import { member, organizationSettings } from "@/server/db/schema";

describe("registerOwner", () => {
  let migrationClient: ReturnType<typeof postgres>;

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

  it("creates user, organization, settings, and an OWNER membership atomically enough to be idempotent", async () => {
    const input = {
      email: `owner-${Date.now()}@example.test`,
      password: "correct-horse-battery-staple",
      name: "Test Owner",
      companyName: `Test Co ${Date.now()}`,
    };

    const first = await registerOwner(input);
    expect(first.userId).toBeTruthy();
    expect(first.organizationId).toBeTruthy();

    const membership = await db.query.member.findFirst({
      where: and(eq(member.userId, first.userId), eq(member.organizationId, first.organizationId)),
    });
    expect(membership?.role).toBe("OWNER");

    const settings = await db.query.organizationSettings.findFirst({
      where: eq(organizationSettings.organizationId, first.organizationId),
    });
    expect(settings?.currency).toBe("IDR");
    expect(settings?.timezone).toBe("Asia/Jakarta");

    // Retry with the same input: resumable/idempotent, not a duplicate.
    const second = await registerOwner(input);
    expect(second.userId).toBe(first.userId);
    expect(second.organizationId).toBe(first.organizationId);

    const memberships = await db.query.member.findMany({
      where: eq(member.userId, first.userId),
    });
    expect(memberships).toHaveLength(1);
  });

  it("rejects resuming registration for an existing email with the wrong password", async () => {
    const email = `hijack-target-${Date.now()}@example.test`;
    await registerOwner({
      email,
      password: "correct-horse-battery-staple",
      name: "Real Owner",
      companyName: `Real Co ${Date.now()}`,
    });

    await expect(
      registerOwner({
        email,
        password: "wrong-password-guess",
        name: "Attacker",
        companyName: "Attacker Co",
      }),
    ).rejects.toThrow();
  });

  it("rejects a user who already has an organization from getting a second one (AUTH-05)", async () => {
    const email = `two-orgs-${Date.now()}@example.test`;
    const password = "correct-horse-battery-staple";
    await registerOwner({
      email,
      password,
      name: "Owner",
      companyName: `First Co ${Date.now()}`,
    });

    const signIn = await auth.api.signInEmail({ body: { email, password } });
    const cookie = signIn.token ? `better-auth.session_token=${signIn.token}` : "";

    await expect(
      auth.api.createOrganization({
        body: { name: "Second Co", slug: `second-co-${Date.now()}` },
        headers: new Headers({ cookie }),
      }),
    ).rejects.toThrow();
  });

  it("rejects removing the last owner of an organization (RBAC-02)", async () => {
    const email = `lastowner-${Date.now()}@example.test`;
    const password = "correct-horse-battery-staple";
    const { organizationId } = await registerOwner({
      email,
      password,
      name: "Sole Owner",
      companyName: `Sole Co ${Date.now()}`,
    });

    const ownerMembership = await db.query.member.findFirst({
      where: eq(member.organizationId, organizationId),
    });
    expect(ownerMembership).toBeTruthy();

    const signIn = await auth.api.signInEmail({ body: { email, password } });
    const cookie = signIn.token ? `better-auth.session_token=${signIn.token}` : "";

    await expect(
      auth.api.removeMember({
        body: { organizationId, memberIdOrEmail: ownerMembership!.id },
        headers: new Headers({ cookie }),
      }),
    ).rejects.toThrow();
  });

  it("rejects demoting the last owner of an organization (RBAC-02)", async () => {
    const email = `demoteowner-${Date.now()}@example.test`;
    const password = "correct-horse-battery-staple";
    const { organizationId } = await registerOwner({
      email,
      password,
      name: "Sole Owner",
      companyName: `Demote Co ${Date.now()}`,
    });

    const ownerMembership = await db.query.member.findFirst({
      where: eq(member.organizationId, organizationId),
    });
    expect(ownerMembership).toBeTruthy();

    const signIn = await auth.api.signInEmail({ body: { email, password } });
    const cookie = signIn.token ? `better-auth.session_token=${signIn.token}` : "";

    await expect(
      auth.api.updateMemberRole({
        body: { organizationId, memberId: ownerMembership!.id, role: "ADMIN" },
        headers: new Headers({ cookie }),
      }),
    ).rejects.toThrow();
  });
});
