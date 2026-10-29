import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type postgres from "postgres";
import { db } from "@/server/db/client";
import { auditEvents } from "@/server/db/schema";
import { cancelInvitation, deactivateMember, inviteMember, reactivateMember, updateMemberRole } from "@/server/auth/members";
import { updateCompanySettings, getCompanySettings } from "@/server/settings/company";
import { addMember, migrateTestDatabase, setupOrganization } from "@/server/testing/org-helpers";
import { listAuditEvents, recordAudit } from "./audit";

describe("organization audit trail (AUD-04)", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  async function actions(org: { ownerHeaders: Headers }) {
    const page = await listAuditEvents({ headers: org.ownerHeaders, pagination: { pageSize: 100 } });
    return page.items;
  }

  it("records who created the organization", async () => {
    const org = await setupOrganization("Audit Created");
    const events = await actions(org);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "organization.created",
      targetType: "organization",
      targetId: org.organizationId,
      actor: { id: org.ownerUserId, name: "Owner" },
    });
  });

  it("records member changes with the actor, newest first", async () => {
    const org = await setupOrganization("Audit Members");
    const sales = await addMember(org, "SALES");

    await updateMemberRole({ memberId: sales.memberId, role: "FINANCE", headers: org.ownerHeaders });
    await deactivateMember({ memberId: sales.memberId, headers: org.ownerHeaders });
    await reactivateMember({ memberId: sales.memberId, headers: org.ownerHeaders });

    const events = await actions(org);
    expect(events.map((event) => event.action)).toEqual([
      "member.reactivated",
      "member.deactivated",
      "member.role_changed",
      "member.joined",
      "invitation.created",
      "organization.created",
    ]);
    const roleChange = events.find((event) => event.action === "member.role_changed");
    expect(roleChange).toMatchObject({
      targetId: sales.memberId,
      actor: { id: org.ownerUserId },
      metadata: { userId: sales.userId, from: "SALES", to: "FINANCE" },
    });
  });

  it("does not write a second event for an idempotent retry", async () => {
    const org = await setupOrganization("Audit Retry");
    const sales = await addMember(org, "SALES");
    await deactivateMember({ memberId: sales.memberId, headers: org.ownerHeaders });
    await deactivateMember({ memberId: sales.memberId, headers: org.ownerHeaders });

    const deactivations = (await actions(org)).filter((event) => event.action === "member.deactivated");
    expect(deactivations).toHaveLength(1);
  });

  it("records invitations and their cancellation", async () => {
    const org = await setupOrganization("Audit Invites");
    const invitation = await inviteMember({
      email: `invitee-${Date.now()}@example.test`,
      role: "ADMIN",
      organizationId: org.organizationId,
      headers: org.ownerHeaders,
    });
    await cancelInvitation({ invitationId: invitation.id, headers: org.ownerHeaders });

    const events = await actions(org);
    expect(events.slice(0, 2).map((event) => event.action)).toEqual(["invitation.cancelled", "invitation.created"]);
    expect(events[1]).toMatchObject({ targetId: invitation.id, metadata: { role: "ADMIN" } });
  });

  it("records which settings changed, and nothing when nothing changed", async () => {
    const org = await setupOrganization("Audit Settings");
    const before = await getCompanySettings({ headers: org.ownerHeaders });

    const unchanged = await updateCompanySettings({
      headers: org.ownerHeaders,
      expectedUpdatedAt: before.updatedAt,
      input: { name: before.name, contactEmail: "", contactPhone: "", address: "", defaultQuotationTerms: "" },
    });
    expect((await actions(org)).some((event) => event.action === "settings.updated")).toBe(false);

    await updateCompanySettings({
      headers: org.ownerHeaders,
      expectedUpdatedAt: unchanged.updatedAt,
      input: { name: "Nusa Baru", contactEmail: "halo@nusa.example", contactPhone: "", address: "Bekasi", defaultQuotationTerms: "" },
    });
    const updated = (await actions(org)).find((event) => event.action === "settings.updated");
    expect(updated?.metadata).toEqual({
      changedFields: ["name", "contactEmail", "address"],
      name: { from: before.name, to: "Nusa Baru" },
    });
  });

  it("is readable only by Owner/Admin and only for the caller's own organization", async () => {
    const orgA = await setupOrganization("Audit Scope A");
    const orgB = await setupOrganization("Audit Scope B");
    const sales = await addMember(orgA, "SALES");
    const admin = await addMember(orgA, "ADMIN");

    await expect(listAuditEvents({ headers: sales.headers })).rejects.toThrow(/permission/i);
    await expect(listAuditEvents({ headers: new Headers() })).rejects.toThrow();

    const asAdmin = await listAuditEvents({ headers: admin.headers, pagination: { pageSize: 100 } });
    expect(asAdmin.items.length).toBeGreaterThan(0);

    const fromB = await actions(orgB);
    expect(fromB.every((event) => event.actor?.id === orgB.ownerUserId)).toBe(true);
    const idsA = new Set(asAdmin.items.map((event) => event.id));
    expect(fromB.some((event) => idsA.has(event.id))).toBe(false);
  });

  it("paginates", async () => {
    const org = await setupOrganization("Audit Pages");
    await addMember(org, "SALES");
    await addMember(org, "FINANCE");

    const first = await listAuditEvents({ headers: org.ownerHeaders, pagination: { page: 1, pageSize: 2 } });
    const second = await listAuditEvents({ headers: org.ownerHeaders, pagination: { page: 2, pageSize: 2 } });
    expect(first.items).toHaveLength(2);
    expect(first.totalItems).toBeGreaterThan(2);
    expect(second.items.some((event) => first.items.some((other) => other.id === event.id))).toBe(false);
  });

  it("refuses to update or delete a row, whoever asks (append-only trigger)", async () => {
    const org = await setupOrganization("Audit Immutable");
    const [event] = await db.select().from(auditEvents).where(eq(auditEvents.organizationId, org.organizationId));

    await expect(db.update(auditEvents).set({ action: "member.deactivated" }).where(eq(auditEvents.id, event.id))).rejects.toMatchObject({
      cause: { code: "23001", message: "audit_events is append-only" },
    });
    await expect(db.delete(auditEvents).where(eq(auditEvents.id, event.id))).rejects.toMatchObject({
      cause: { code: "23001" },
    });
    const [still] = await db.select().from(auditEvents).where(eq(auditEvents.id, event.id));
    expect(still.action).toBe("organization.created");
  });

  it("redacts secret-looking metadata and rolls back with the surrounding transaction", async () => {
    const org = await setupOrganization("Audit Redact");
    const marker = `rollback-${Date.now()}`;

    await expect(
      db.transaction(async (tx) => {
        await recordAudit(tx, {
          organizationId: org.organizationId,
          actorId: org.ownerUserId,
          action: "settings.updated",
          targetType: "organization_settings",
          targetId: marker,
          metadata: { password: "hunter2", note: "ok" },
        });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(auditEvents).where(eq(auditEvents.targetId, marker));
    expect(count).toBe(0);

    await recordAudit(db, {
      organizationId: org.organizationId,
      actorId: null,
      action: "settings.updated",
      targetType: "organization_settings",
      targetId: marker,
      metadata: { password: "hunter2", note: "ok" },
    });
    const [saved] = await db.select().from(auditEvents).where(eq(auditEvents.targetId, marker));
    expect(saved.metadata).toEqual({ password: "[redacted]", note: "ok" });
    expect(saved.actorId).toBeNull();
  });
});
