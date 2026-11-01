import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type postgres from "postgres";
import { db } from "@/server/db/client";
import { invitation } from "@/server/db/schema";
import { auth } from "@/server/auth/auth";
import { getInvitationPreview } from "@/server/auth/invitation-preview";
import { provisionOrganization } from "@/server/auth/register-owner";
import { cancelInvitation, deactivateMember, inviteMember, updateMemberRole } from "@/server/auth/members";
import { addMember, migrateTestDatabase, setupOrganization } from "@/server/testing/org-helpers";
import { getCompanySettings, getWriteOffLimit, updateCompanySettings, updateWriteOffLimit } from "./company";
import { getTeam } from "./team";

describe("company settings", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  it("reads defaults and saves name, contact and terms together", async () => {
    const org = await setupOrganization("Company Co");
    const before = await getCompanySettings({ headers: org.ownerHeaders });
    expect(before.currency).toBe("IDR");
    expect(before.timezone).toBe("Asia/Jakarta");

    const after = await updateCompanySettings({
      headers: org.ownerHeaders,
      expectedUpdatedAt: before.updatedAt,
      input: { name: "  Nusa Baru  ", contactEmail: "halo@nusa.example", contactPhone: "+62 21-8888-1234", address: "Bekasi", defaultQuotationTerms: "Bayar 50% di muka." },
    });
    expect(after).toMatchObject({ name: "Nusa Baru", contactEmail: "halo@nusa.example", address: "Bekasi", defaultQuotationTerms: "Bayar 50% di muka." });
    expect(after.updatedAt).not.toBe(before.updatedAt);
  });

  it("stores blank optional fields as null", async () => {
    const org = await setupOrganization("Blank Co");
    const before = await getCompanySettings({ headers: org.ownerHeaders });
    const after = await updateCompanySettings({
      headers: org.ownerHeaders,
      expectedUpdatedAt: before.updatedAt,
      input: { name: "Blank Co", contactEmail: "", contactPhone: "", address: "   ", defaultQuotationTerms: "" },
    });
    expect(after.contactEmail).toBeNull();
    expect(after.address).toBeNull();
  });

  it("rejects a stale edit and an invalid email", async () => {
    const org = await setupOrganization("Stale Co");
    const admin = await addMember(org, "ADMIN");
    const loaded = await getCompanySettings({ headers: org.ownerHeaders });
    await updateCompanySettings({ headers: admin.headers, expectedUpdatedAt: loaded.updatedAt, input: { name: "Stale Co 2" } });

    await expect(updateCompanySettings({ headers: org.ownerHeaders, expectedUpdatedAt: loaded.updatedAt, input: { name: "Stale Co 3" } })).rejects.toMatchObject({ status: "CONFLICT" });

    const fresh = await getCompanySettings({ headers: org.ownerHeaders });
    await expect(updateCompanySettings({ headers: org.ownerHeaders, expectedUpdatedAt: fresh.updatedAt, input: { name: "Stale Co 2", contactEmail: "halo@" } })).rejects.toThrow();
    expect((await getCompanySettings({ headers: org.ownerHeaders })).name).toBe("Stale Co 2");
  });

  it("is closed to Sales and Finance", async () => {
    const org = await setupOrganization("Closed Co");
    const sales = await addMember(org, "SALES");
    const finance = await addMember(org, "FINANCE");
    await expect(getCompanySettings({ headers: sales.headers })).rejects.toMatchObject({ status: "FORBIDDEN" });
    await expect(getCompanySettings({ headers: finance.headers })).rejects.toMatchObject({ status: "FORBIDDEN" });
  });

  it("sets the write-off limit, validates it, and keeps it to Owner and Admin", async () => {
    const org = await setupOrganization("Limit Co");
    const finance = await addMember(org, "FINANCE");
    expect(await getWriteOffLimit({ headers: org.ownerHeaders })).toBe("50000");
    expect(await updateWriteOffLimit({ headers: org.ownerHeaders, input: { writeOffLimit: "75000" } })).toBe("75000");
    expect(await getWriteOffLimit({ headers: org.ownerHeaders })).toBe("75000");
    await expect(updateWriteOffLimit({ headers: org.ownerHeaders, input: { writeOffLimit: "-1" } })).rejects.toThrow();
    await expect(updateWriteOffLimit({ headers: finance.headers, input: { writeOffLimit: "1" } })).rejects.toMatchObject({ status: "FORBIDDEN" });
  });
});

describe("team management", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  it("lists members and only pending, unexpired invitations", async () => {
    const org = await setupOrganization("Team Co");
    await addMember(org, "SALES", "Rina");
    const pending = await inviteMember({ email: `pending-${Date.now()}@example.test`, role: "ADMIN", organizationId: org.organizationId, headers: org.ownerHeaders });
    const revoked = await inviteMember({ email: `revoked-${Date.now()}@example.test`, role: "FINANCE", organizationId: org.organizationId, headers: org.ownerHeaders });
    await cancelInvitation({ invitationId: revoked.id, headers: org.ownerHeaders });
    const stale = await inviteMember({ email: `stale-${Date.now()}@example.test`, role: "SALES", organizationId: org.organizationId, headers: org.ownerHeaders });
    await db.update(invitation).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitation.id, stale.id));

    const team = await getTeam({ headers: org.ownerHeaders });
    expect(team.members.map((entry) => entry.role)).toEqual(["OWNER", "SALES"]);
    expect(team.members[0].isSelf).toBe(true);
    expect(team.soleActiveOwner).toBe(true);
    expect(team.invitations.map((entry) => entry.id)).toEqual([pending.id]);
    expect(team.invitations[0]).toMatchObject({ role: "ADMIN", invitedByName: "Owner" });
  });

  it("is scoped to the organization and closed to Sales", async () => {
    const org = await setupOrganization("Scope Co");
    const other = await setupOrganization("Other Co");
    const sales = await addMember(org, "SALES");
    await expect(getTeam({ headers: sales.headers })).rejects.toMatchObject({ status: "FORBIDDEN" });
    const otherTeam = await getTeam({ headers: other.ownerHeaders });
    expect(otherTeam.members).toHaveLength(1);
  });

  it("changes a role, but never an owner's, your own, or to OWNER", async () => {
    const org = await setupOrganization("Role Co");
    const sales = await addMember(org, "SALES");
    const admin = await addMember(org, "ADMIN");

    const changed = await updateMemberRole({ memberId: sales.memberId, role: "FINANCE", headers: org.ownerHeaders });
    expect(changed.role).toBe("FINANCE");
    // The new role takes effect at once: Finance has no follow-up access.
    await expect(updateMemberRole({ memberId: sales.memberId, role: "FINANCE", headers: org.ownerHeaders })).resolves.toMatchObject({ role: "FINANCE" });

    const ownerMember = (await getTeam({ headers: org.ownerHeaders })).members.find((entry) => entry.role === "OWNER")!;
    await expect(updateMemberRole({ memberId: ownerMember.memberId, role: "SALES", headers: admin.headers })).rejects.toMatchObject({ status: "FORBIDDEN" });
    await expect(updateMemberRole({ memberId: admin.memberId, role: "SALES", headers: admin.headers })).rejects.toMatchObject({ status: "FORBIDDEN" });
    await expect(updateMemberRole({ memberId: sales.memberId, role: "OWNER" as never, headers: org.ownerHeaders })).rejects.toMatchObject({ status: "BAD_REQUEST" });
    await expect(updateMemberRole({ memberId: sales.memberId, role: "SALES", headers: sales.headers })).rejects.toMatchObject({ status: "FORBIDDEN" });
  });

  it("will not change the role of a deactivated member, nor of another organization's member", async () => {
    const org = await setupOrganization("Deact Co");
    const other = await setupOrganization("Deact Other");
    const sales = await addMember(org, "SALES");
    const stranger = await addMember(other, "SALES");
    await deactivateMember({ memberId: sales.memberId, headers: org.ownerHeaders });
    await expect(updateMemberRole({ memberId: sales.memberId, role: "ADMIN", headers: org.ownerHeaders })).rejects.toMatchObject({ status: "BAD_REQUEST" });
    await expect(updateMemberRole({ memberId: stranger.memberId, role: "ADMIN", headers: org.ownerHeaders })).rejects.toMatchObject({ status: "NOT_FOUND" });
    const team = await getTeam({ headers: org.ownerHeaders });
    expect(team.members.find((entry) => entry.memberId === sales.memberId)?.active).toBe(false);
  });

  it("rejects a duplicate invitation and an existing member's email", async () => {
    const org = await setupOrganization("Dup Co");
    const email = `dup-${Date.now()}@example.test`;
    await inviteMember({ email, role: "SALES", organizationId: org.organizationId, headers: org.ownerHeaders });
    await expect(inviteMember({ email, role: "SALES", organizationId: org.organizationId, headers: org.ownerHeaders })).rejects.toThrow(/already invited/i);
    const team = await getTeam({ headers: org.ownerHeaders });
    await expect(inviteMember({ email: (await db.query.user.findFirst({ where: (u, { eq: eqOp }) => eqOp(u.id, team.members[0].userId) }))!.email, role: "SALES", organizationId: org.organizationId, headers: org.ownerHeaders })).rejects.toThrow(/already a member/i);
  });
});

describe("invitation preview", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  it("describes a valid invitation, then used, revoked and expired ones", async () => {
    const org = await setupOrganization("Preview Co");
    const email = `invitee-${Date.now()}@example.test`;
    const created = await inviteMember({ email, role: "SALES", organizationId: org.organizationId, headers: org.ownerHeaders });

    const preview = await getInvitationPreview(created.id);
    expect(preview).toMatchObject({ state: "valid", email, role: "SALES", inviterName: "Owner", hasAccount: false });

    await db.update(invitation).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitation.id, created.id));
    expect(await getInvitationPreview(created.id)).toEqual({ state: "expired" });

    const another = await inviteMember({ email: `x-${Date.now()}@example.test`, role: "ADMIN", organizationId: org.organizationId, headers: org.ownerHeaders });
    await cancelInvitation({ invitationId: another.id, headers: org.ownerHeaders });
    expect(await getInvitationPreview(another.id)).toEqual({ state: "revoked" });

    const member = await addMember(org, "FINANCE");
    const accepted = await db.query.invitation.findFirst({ where: (i, { eq: eqOp }) => eqOp(i.status, "accepted") });
    expect(accepted).toBeTruthy();
    expect(member.userId).toBeTruthy();
    expect(await getInvitationPreview(accepted!.id)).toEqual({ state: "used" });

    expect(await getInvitationPreview("does-not-exist-1234")).toEqual({ state: "not-found" });
    expect(await getInvitationPreview("../../etc")).toEqual({ state: "not-found" });
  });
});

describe("onboarding provisioning", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  it("gives an account without an organization one, and is safe to repeat", async () => {
    const email = `onboard-${Date.now()}-${Math.random()}@example.test`;
    const created = await auth.api.signUpEmail({ body: { email, password: "correct-horse-battery-staple", name: "Late Owner" } });

    const first = await provisionOrganization({ userId: created.user.id, companyName: "Late Co" });
    const again = await provisionOrganization({ userId: created.user.id, companyName: "Late Co" });
    expect(again).toBe(first);

    const memberships = await db.query.member.findMany({ where: (m, { eq: eqOp }) => eqOp(m.userId, created.user.id) });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe("OWNER");
    const settings = await db.query.organizationSettings.findFirst({ where: (o, { eq: eqOp }) => eqOp(o.organizationId, first) });
    expect(settings?.timezone).toBe("Asia/Jakarta");
  });
});
