import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import type postgres from "postgres";
import { auth } from "./auth";
import { acceptInvitation, deactivateMember, inviteMember, listOrganizationMembers, reactivateMember } from "./members";
import { findCurrentMembership } from "./current-membership";
import { provisionOrganization } from "./register-owner";
import { requireMembership } from "./require-membership";
import { db } from "@/server/db/client";
import { member, organizationSettings } from "@/server/db/schema";
import { organizationClock } from "@/server/shared/organization-clock";
import { getWorkspaceState } from "@/server/workspace/workspace";
import { addMember, migrateTestDatabase, setupOrganization } from "@/server/testing/org-helpers";

const PASSWORD = "correct-horse-battery-staple";

async function freshHeaders(userId: string): Promise<Headers> {
  const row = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.id, userId) });
  const response = await auth.api.signInEmail({ body: { email: row!.email, password: PASSWORD }, asResponse: true });
  return new Headers({ cookie: response.headers.get("set-cookie")!.split(";")[0] });
}

// Someone who worked at organization A (deactivated there) and is invited to B
// with the same account: the situation the partial unique index exists for.
async function moveToOrganizationB(role: "ADMIN" | "SALES") {
  const orgA = await setupOrganization("Moving From A");
  const orgB = await setupOrganization("Moving To B");
  const person = await addMember(orgA, role);
  await deactivateMember({ memberId: person.memberId, headers: orgA.ownerHeaders });

  const email = (await db.query.user.findFirst({ where: (u, { eq }) => eq(u.id, person.userId) }))!.email;
  const invite = await inviteMember({ email, role, organizationId: orgB.organizationId, headers: orgB.ownerHeaders });
  const headers = await freshHeaders(person.userId);
  await acceptInvitation({ invitationId: invite.id, userId: person.userId, headers });
  return { orgA, orgB, person, headers: await freshHeaders(person.userId) };
}

describe("one active membership per user (AUTH-05, partial unique index)", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  it("lets a deactivated member join another organization and then resolves to the new one", async () => {
    const { orgA, orgB, person, headers } = await moveToOrganizationB("SALES");

    const rows = await db.select().from(member).where(eq(member.userId, person.userId));
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.deactivatedAt === null).map((row) => row.organizationId)).toEqual([orgB.organizationId]);

    const membership = await requireMembership({ headers });
    expect(membership.organizationId).toBe(orgB.organizationId);
    expect(membership.role).toBe("SALES");

    const state = await getWorkspaceState(headers);
    expect(state.status).toBe("active");
    if (state.status === "active") expect(state.workspace.organization.id).toBe(orgB.organizationId);

    // The old row is history, not shadowing.
    expect((await findCurrentMembership(person.userId))?.organizationId).toBe(orgB.organizationId);
    void orgA;
  });

  it("still refuses a second ACTIVE membership, in the database as well", async () => {
    const orgA = await setupOrganization("Active A");
    const orgB = await setupOrganization("Active B");
    const person = await addMember(orgA, "SALES");

    const email = (await db.query.user.findFirst({ where: (u, { eq }) => eq(u.id, person.userId) }))!.email;
    const invite = await inviteMember({ email, role: "SALES", organizationId: orgB.organizationId, headers: orgB.ownerHeaders });
    await expect(
      acceptInvitation({ invitationId: invite.id, userId: person.userId, headers: person.headers }),
    ).rejects.toThrow();

    await expect(
      db.insert(member).values({
        id: crypto.randomUUID(),
        organizationId: orgB.organizationId,
        userId: person.userId,
        role: "SALES",
        createdAt: new Date(),
      }),
    ).rejects.toMatchObject({ cause: { code: "23505", constraint_name: "member_userId_active_uidx" } });
  });

  it("reports a deactivated-only person as deactivated, not as having no membership", async () => {
    const org = await setupOrganization("Deactivated Only");
    const person = await addMember(org, "FINANCE");
    await deactivateMember({ memberId: person.memberId, headers: org.ownerHeaders });

    const state = await getWorkspaceState(await freshHeaders(person.userId));
    expect(state.status).toBe("deactivated");
  });

  it("refuses to reactivate someone who is now active in another organization", async () => {
    const { orgA, person } = await moveToOrganizationB("SALES");
    const oldRow = await db.query.member.findFirst({
      where: and(eq(member.userId, person.userId), eq(member.organizationId, orgA.organizationId)),
    });

    await expect(reactivateMember({ memberId: oldRow!.id, headers: orgA.ownerHeaders })).rejects.toThrow(
      /active organization membership/,
    );
    const stillDeactivated = await db.query.member.findFirst({ where: eq(member.id, oldRow!.id) });
    expect(stillDeactivated?.deactivatedAt).not.toBeNull();
  });

  it("stops a deactivated ex-admin of A, now an admin of B, from acting on A", async () => {
    const { orgA, orgB, person, headers } = await moveToOrganizationB("ADMIN");

    // Better Auth still believes this person is an ADMIN of A: the hook must refuse the call.
    await expect(
      inviteMember({ email: `intruder-${Date.now()}@example.test`, role: "SALES", organizationId: orgA.organizationId, headers }),
    ).rejects.toThrow(/not a member of this organization/);
    await expect(listOrganizationMembers({ organizationId: orgA.organizationId, headers })).rejects.toThrow(
      /not a member of this organization/,
    );

    // ...while the same person works normally in B.
    await expect(
      inviteMember({ email: `colleague-${Date.now()}@example.test`, role: "SALES", organizationId: orgB.organizationId, headers }),
    ).resolves.toBeTruthy();
    void person;
  });

  it("starts a new organization for a deactivated person instead of returning the old one", async () => {
    const org = await setupOrganization("Left Behind");
    const person = await addMember(org, "SALES");
    await deactivateMember({ memberId: person.memberId, headers: org.ownerHeaders });

    const newOrganizationId = await provisionOrganization({ userId: person.userId, companyName: `Fresh Start ${Date.now()}` });
    expect(newOrganizationId).not.toBe(org.organizationId);

    const active = await db.query.member.findFirst({
      where: and(eq(member.userId, person.userId), isNull(member.deactivatedAt)),
    });
    expect(active).toMatchObject({ organizationId: newOrganizationId, role: "OWNER" });
  });
});

describe("organization settings repair (G-07)", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  it("recreates default settings when provisioning stopped before writing them", async () => {
    const org = await setupOrganization("Half Provisioned");
    await db.delete(organizationSettings).where(eq(organizationSettings.organizationId, org.organizationId));

    const state = await getWorkspaceState(org.ownerHeaders);
    expect(state.status).toBe("active");

    const settings = await db.query.organizationSettings.findFirst({
      where: eq(organizationSettings.organizationId, org.organizationId),
    });
    expect(settings).toMatchObject({ currency: "IDR", timezone: "Asia/Jakarta" });
    await expect(organizationClock(org.organizationId)).resolves.toMatchObject({ timezone: "Asia/Jakarta" });
  });
});
