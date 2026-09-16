import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "./auth";
import { acceptInvitation, cancelInvitation, inviteMember, listOrganizationMembers } from "./members";
import { registerOwner } from "./register-owner";
import { db } from "@/server/db/client";
import { invitation, member } from "@/server/db/schema";

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

describe("member invitations", () => {
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

  async function setupOwner() {
    const ownerEmail = `owner-${Date.now()}-${Math.random()}@example.test`;
    const password = "correct-horse-battery-staple";
    const { organizationId } = await registerOwner({
      email: ownerEmail,
      password,
      name: "Owner",
      companyName: `Invite Co ${Date.now()}`,
    });
    const cookie = await sessionCookieFor(ownerEmail, password);
    return { organizationId, ownerCookie: cookie };
  }

  it("invites, lists as pending, accepts idempotently, and assigns the invited role", async () => {
    const { organizationId, ownerCookie } = await setupOwner();
    const inviteeEmail = `sales-${Date.now()}@example.test`;
    const inviteePassword = "correct-horse-battery-staple";

    const created = await inviteMember({
      email: inviteeEmail,
      role: "SALES",
      organizationId,
      headers: new Headers({ cookie: ownerCookie }),
    });
    expect(created.status).toBe("pending");

    const membersBefore = await listOrganizationMembers({
      organizationId,
      headers: new Headers({ cookie: ownerCookie }),
    });
    expect(membersBefore.total).toBe(1); // just the owner so far

    // Invitee signs up, then accepts.
    await auth.api.signUpEmail({
      body: { email: inviteeEmail, password: inviteePassword, name: "Sales Person" },
    });
    const inviteeCookie = await sessionCookieFor(inviteeEmail, inviteePassword);

    const accepted = await acceptInvitation({
      invitationId: created.id,
      userId: (await db.query.user.findFirst({ where: (u, { eq: eqOp }) => eqOp(u.email, inviteeEmail) }))!.id,
      headers: new Headers({ cookie: inviteeCookie }),
    });
    expect(accepted).toBeTruthy();

    const newMember = await db.query.member.findFirst({
      where: eq(member.organizationId, organizationId),
      orderBy: (m, { desc }) => desc(m.createdAt),
    });
    expect(newMember?.role).toBe("SALES");

    // Retry accept: must be idempotent, not throw, not duplicate membership.
    const acceptedAgain = await acceptInvitation({
      invitationId: created.id,
      userId: newMember!.userId,
      headers: new Headers({ cookie: inviteeCookie }),
    });
    expect(acceptedAgain).toBeTruthy();

    const memberships = await db.query.member.findMany({ where: eq(member.userId, newMember!.userId) });
    expect(memberships).toHaveLength(1);
  });

  it("rejects inviting someone directly as OWNER (RBAC-02)", async () => {
    const { organizationId, ownerCookie } = await setupOwner();
    await expect(
      inviteMember({
        email: `wouldbeowner-${Date.now()}@example.test`,
        // @ts-expect-error deliberately invalid for this test
        role: "OWNER",
        organizationId,
        headers: new Headers({ cookie: ownerCookie }),
      }),
    ).rejects.toThrow(/Cannot invite a member directly as OWNER/);
  });

  it("cancels a pending invitation", async () => {
    const { organizationId, ownerCookie } = await setupOwner();
    const created = await inviteMember({
      email: `cancelme-${Date.now()}@example.test`,
      role: "FINANCE",
      organizationId,
      headers: new Headers({ cookie: ownerCookie }),
    });

    await cancelInvitation({ invitationId: created.id, headers: new Headers({ cookie: ownerCookie }) });

    const cancelled = await db.query.invitation.findFirst({ where: eq(invitation.id, created.id) });
    expect(cancelled?.status).toBe("canceled");
  });
});
