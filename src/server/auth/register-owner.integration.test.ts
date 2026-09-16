import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "./auth";
import { registerOwner } from "./register-owner";
import { db } from "@/server/db/client";
import { member, organizationSettings } from "@/server/db/schema";

async function sessionCookieFor(email: string, password: string): Promise<string> {
  // signIn.token (the JSON body) is not the same value the cookie needs; the
  // cookie carries an HMAC signature suffix the JSON response doesn't
  // include. Using signIn.token directly produces a cookie that silently
  // fails to authenticate (getSession returns null), not an error, so this
  // must go through the actual Set-Cookie header.
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("sign-in did not return a session cookie");
  }
  return setCookie.split(";")[0];
}

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

    const cookie = await sessionCookieFor(email, password);

    // Asserting the specific message, not just "throws": a broken session
    // would also throw (generic Unauthorized), which would make this test
    // pass without the AUTH-05 hook ever running.
    await expect(
      auth.api.createOrganization({
        body: { name: "Second Co", slug: `second-co-${Date.now()}` },
        headers: new Headers({ cookie }),
      }),
    ).rejects.toThrow(/already has an active organization membership/);
  });

  // RBAC-02 (last-owner protection) turned out to already be enforced
  // natively by Better Auth once creatorRole is set to our OWNER key, so
  // there is no custom hook for it in auth.ts (see the comment there). These
  // tests prove the actual mechanism DealFlow relies on, rather than a
  // reimplementation of it.
  async function setupOwnerAndAdmin() {
    const password = "correct-horse-battery-staple";
    const ownerEmail = `lastowner-${Date.now()}-${Math.random()}@example.test`;
    const { organizationId } = await registerOwner({
      email: ownerEmail,
      password,
      name: "Sole Owner",
      companyName: `Sole Co ${Date.now()}`,
    });
    const ownerCookie = await sessionCookieFor(ownerEmail, password);

    const adminEmail = `admin-${Date.now()}-${Math.random()}@example.test`;
    const invite = await auth.api.createInvitation({
      body: { email: adminEmail, role: "ADMIN", organizationId },
      headers: new Headers({ cookie: ownerCookie }),
    });
    await auth.api.signUpEmail({ body: { email: adminEmail, password, name: "Admin" } });
    const adminCookie = await sessionCookieFor(adminEmail, password);
    await auth.api.acceptInvitation({
      body: { invitationId: invite.id },
      headers: new Headers({ cookie: adminCookie }),
    });

    const ownerMembership = await db.query.member.findFirst({
      where: and(eq(member.organizationId, organizationId), eq(member.role, "OWNER")),
    });
    return { organizationId, ownerMembership: ownerMembership!, ownerCookie, adminCookie };
  }

  it("rejects the sole owner removing themselves (RBAC-02, Better Auth native)", async () => {
    const { organizationId, ownerMembership, ownerCookie } = await setupOwnerAndAdmin();

    await expect(
      auth.api.removeMember({
        body: { organizationId, memberIdOrEmail: ownerMembership.id },
        headers: new Headers({ cookie: ownerCookie }),
      }),
    ).rejects.toThrow(/only owner|without an owner/);
  });

  it("rejects another admin removing the sole owner (RBAC-02, Better Auth native)", async () => {
    const { organizationId, ownerMembership, adminCookie } = await setupOwnerAndAdmin();

    await expect(
      auth.api.removeMember({
        body: { organizationId, memberIdOrEmail: ownerMembership.id },
        headers: new Headers({ cookie: adminCookie }),
      }),
    ).rejects.toThrow(/only owner|without an owner/);
  });

  it("rejects another admin changing the sole owner's role (RBAC-02, Better Auth native)", async () => {
    const { organizationId, ownerMembership, adminCookie } = await setupOwnerAndAdmin();

    await expect(
      auth.api.updateMemberRole({
        body: { organizationId, memberId: ownerMembership.id, role: "ADMIN" },
        headers: new Headers({ cookie: adminCookie }),
      }),
    ).rejects.toThrow(/not allowed/);
  });

  it("allows removing one of two owners, leaving the organization with an owner", async () => {
    const { organizationId, ownerMembership, ownerCookie } = await setupOwnerAndAdmin();

    // Promote the admin to a co-owner directly (test setup only; inviting
    // someone as OWNER is blocked; see members.integration.test.ts).
    const adminMembership = await db.query.member.findFirst({
      where: and(eq(member.organizationId, organizationId), eq(member.role, "ADMIN")),
    });
    await db.update(member).set({ role: "OWNER" }).where(eq(member.id, adminMembership!.id));

    await auth.api.removeMember({
      body: { organizationId, memberIdOrEmail: ownerMembership.id },
      headers: new Headers({ cookie: ownerCookie }),
    });

    const remainingOwners = await db.query.member.findMany({
      where: and(eq(member.organizationId, organizationId), eq(member.role, "OWNER")),
    });
    expect(remainingOwners).toHaveLength(1);
    expect(remainingOwners[0]?.id).toBe(adminMembership!.id);
  });
});
