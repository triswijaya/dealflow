import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "./auth";
import {
  acceptInvitation,
  cancelInvitation,
  deactivateMember,
  inviteMember,
  listOrganizationMembers,
  reactivateMember,
} from "./members";
import { requireMembership } from "./require-membership";
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
    return { organizationId, ownerEmail, ownerPassword: password, ownerCookie: cookie };
  }

  async function setupOwnerAndMember(role: "ADMIN" | "SALES" | "FINANCE") {
    const owner = await setupOwner();
    const memberEmail = `${role.toLowerCase()}-${Date.now()}-${Math.random()}@example.test`;
    const memberPassword = "correct-horse-battery-staple";
    const invite = await inviteMember({
      email: memberEmail,
      role,
      organizationId: owner.organizationId,
      headers: new Headers({ cookie: owner.ownerCookie }),
    });
    await auth.api.signUpEmail({ body: { email: memberEmail, password: memberPassword, name: "Invitee" } });
    const memberCookie = await sessionCookieFor(memberEmail, memberPassword);
    await acceptInvitation({
      invitationId: invite.id,
      userId: (await db.query.user.findFirst({ where: (u, { eq: eqOp }) => eqOp(u.email, memberEmail) }))!.id,
      headers: new Headers({ cookie: memberCookie }),
    });
    const membership = await db.query.member.findFirst({
      where: and(eq(member.organizationId, owner.organizationId), eq(member.role, role)),
    });
    return { ...owner, memberEmail, memberPassword, memberCookie, membership: membership! };
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

  it("deactivates and reactivates a member, idempotently", async () => {
    const { ownerCookie, membership } = await setupOwnerAndMember("SALES");

    const deactivated = await deactivateMember({ memberId: membership.id, headers: new Headers({ cookie: ownerCookie }) });
    expect(deactivated.deactivatedAt).not.toBeNull();

    // Retry: idempotent, not an error.
    const deactivatedAgain = await deactivateMember({
      memberId: membership.id,
      headers: new Headers({ cookie: ownerCookie }),
    });
    expect(deactivatedAgain.deactivatedAt).toEqual(deactivated.deactivatedAt);

    const reactivated = await reactivateMember({ memberId: membership.id, headers: new Headers({ cookie: ownerCookie }) });
    expect(reactivated.deactivatedAt).toBeNull();

    const reactivatedAgain = await reactivateMember({
      memberId: membership.id,
      headers: new Headers({ cookie: ownerCookie }),
    });
    expect(reactivatedAgain.deactivatedAt).toBeNull();
  });

  it("rejects a deactivated member's own sign-in (AUTH-06)", async () => {
    const { ownerCookie, memberEmail, memberPassword, membership } = await setupOwnerAndMember("SALES");
    await deactivateMember({ memberId: membership.id, headers: new Headers({ cookie: ownerCookie }) });

    await expect(auth.api.signInEmail({ body: { email: memberEmail, password: memberPassword } })).rejects.toThrow();
  });

  it("rejects a deactivated member's existing session on organization endpoints (AUTH-06)", async () => {
    const { ownerCookie, memberCookie, membership, organizationId } = await setupOwnerAndMember("SALES");
    // Session was issued before deactivation; the guard must still catch it
    // on the next request rather than waiting for the cookie to expire.
    await deactivateMember({ memberId: membership.id, headers: new Headers({ cookie: ownerCookie }) });

    await expect(
      listOrganizationMembers({ organizationId, headers: new Headers({ cookie: memberCookie }) }),
    ).rejects.toThrow(/deactivated/);
  });

  it("rejects requireMembership for a deactivated member", async () => {
    const { ownerCookie, memberCookie, membership } = await setupOwnerAndMember("SALES");
    await deactivateMember({ memberId: membership.id, headers: new Headers({ cookie: ownerCookie }) });

    await expect(requireMembership({ headers: new Headers({ cookie: memberCookie }) })).rejects.toThrow(
      /deactivated/,
    );
  });

  it("rejects deactivating the only active owner, even by themselves", async () => {
    const { ownerCookie, organizationId } = await setupOwner();
    const ownerMembership = await db.query.member.findFirst({
      where: and(eq(member.organizationId, organizationId), eq(member.role, "OWNER")),
    });

    await expect(
      deactivateMember({ memberId: ownerMembership!.id, headers: new Headers({ cookie: ownerCookie }) }),
    ).rejects.toThrow(/only active owner/);
  });

  it("rejects an admin deactivating an owner even when the owner is not the last one", async () => {
    const owner = await setupOwner();
    const adminEmail = `admin-${Date.now()}-${Math.random()}@example.test`;
    const adminPassword = "correct-horse-battery-staple";
    const adminInvite = await inviteMember({
      email: adminEmail,
      role: "ADMIN",
      organizationId: owner.organizationId,
      headers: new Headers({ cookie: owner.ownerCookie }),
    });
    await auth.api.signUpEmail({ body: { email: adminEmail, password: adminPassword, name: "Admin" } });
    const adminCookie = await sessionCookieFor(adminEmail, adminPassword);
    await acceptInvitation({
      invitationId: adminInvite.id,
      userId: (await db.query.user.findFirst({ where: (u, { eq: eqOp }) => eqOp(u.email, adminEmail) }))!.id,
      headers: new Headers({ cookie: adminCookie }),
    });

    const ownerMembership = await db.query.member.findFirst({
      where: and(eq(member.organizationId, owner.organizationId), eq(member.role, "OWNER")),
    });

    await expect(
      deactivateMember({ memberId: ownerMembership!.id, headers: new Headers({ cookie: adminCookie }) }),
    ).rejects.toThrow(/not allowed/);
  });

  it("allows one owner to deactivate a co-owner, leaving the organization with an owner", async () => {
    const owner = await setupOwner();
    const coOwnerEmail = `coowner-${Date.now()}-${Math.random()}@example.test`;
    const coOwnerPassword = "correct-horse-battery-staple";
    const invite = await inviteMember({
      email: coOwnerEmail,
      role: "ADMIN",
      organizationId: owner.organizationId,
      headers: new Headers({ cookie: owner.ownerCookie }),
    });
    await auth.api.signUpEmail({ body: { email: coOwnerEmail, password: coOwnerPassword, name: "Co-owner" } });
    const coOwnerCookie = await sessionCookieFor(coOwnerEmail, coOwnerPassword);
    await acceptInvitation({
      invitationId: invite.id,
      userId: (await db.query.user.findFirst({ where: (u, { eq: eqOp }) => eqOp(u.email, coOwnerEmail) }))!.id,
      headers: new Headers({ cookie: coOwnerCookie }),
    });
    const coOwnerMembership = await db.query.member.findFirst({
      where: and(eq(member.organizationId, owner.organizationId), eq(member.role, "ADMIN")),
    });
    // Promote directly (test setup only; inviting someone as OWNER is
    // blocked, see the RBAC-02 invitation test above).
    await db.update(member).set({ role: "OWNER" }).where(eq(member.id, coOwnerMembership!.id));

    const originalOwnerMembership = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, owner.organizationId),
        eq(member.role, "OWNER"),
        eq(member.userId, (await db.query.user.findFirst({ where: (u, { eq: eqOp }) => eqOp(u.email, owner.ownerEmail) }))!.id,
        ),
      ),
    });

    const deactivated = await deactivateMember({
      memberId: originalOwnerMembership!.id,
      headers: new Headers({ cookie: coOwnerCookie }),
    });
    expect(deactivated.deactivatedAt).not.toBeNull();

    const remainingActiveOwners = await db.query.member.findMany({
      where: and(eq(member.organizationId, owner.organizationId), eq(member.role, "OWNER"), isNull(member.deactivatedAt)),
    });
    expect(remainingActiveOwners).toHaveLength(1);
    expect(remainingActiveOwners[0]?.id).toBe(coOwnerMembership!.id);
  });
});
