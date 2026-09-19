import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "@/server/auth/auth";
import { inviteMember, acceptInvitation } from "@/server/auth/members";
import { registerOwner } from "@/server/auth/register-owner";
import { createCustomer } from "@/server/customers/customers";
import { createDeal, transitionDeal } from "@/server/deals/deals";
import { db } from "@/server/db/client";
import { activities, deals } from "@/server/db/schema";
import { completeFollowUp, createFollowUp, getFollowUp, listActiveFollowUps, updateFollowUp } from "./follow-ups";

async function sessionCookieFor(email: string, password: string): Promise<string> {
  // signIn.token (the JSON body) is not the same value the cookie needs; see
  // deals.integration.test.ts for the full explanation. Duplicated here
  // deliberately, matching every other integration test file.
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("sign-in did not return a session cookie");
  }
  return setCookie.split(";")[0];
}

// Computed relative to test-run time, not a hardcoded calendar date -- a
// fixed future date eventually becomes the past and turns this test into a
// time bomb. 30 days is a wide enough margin that no timezone/boundary
// edge case can flip the bucket; exact boundary behavior is already
// covered by follow-up-bucket.test.ts's pure-function tests.
function daysFromNowIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

describe("follow-ups", () => {
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
    const { organizationId, userId } = await registerOwner({
      email: ownerEmail,
      password,
      name: "Owner",
      companyName: `Follow Co ${Date.now()}`,
    });
    const cookie = await sessionCookieFor(ownerEmail, password);
    return { organizationId, ownerUserId: userId, ownerCookie: cookie };
  }

  async function setupMember(owner: { organizationId: string; ownerCookie: string }, role: "SALES" | "FINANCE") {
    const memberEmail = `${role.toLowerCase()}-${Date.now()}-${Math.random()}@example.test`;
    const memberPassword = "correct-horse-battery-staple";
    const invite = await inviteMember({
      email: memberEmail,
      role,
      organizationId: owner.organizationId,
      headers: new Headers({ cookie: owner.ownerCookie }),
    });
    await auth.api.signUpEmail({ body: { email: memberEmail, password: memberPassword, name: "Invitee" } });
    const cookie = await sessionCookieFor(memberEmail, memberPassword);
    const memberUser = await db.query.user.findFirst({ where: (u, { eq: eqOp }) => eqOp(u.email, memberEmail) });
    await acceptInvitation({ invitationId: invite.id, userId: memberUser!.id, headers: new Headers({ cookie }) });
    return { memberCookie: cookie, memberUserId: memberUser!.id };
  }

  async function setupOwnerWithDeal() {
    const owner = await setupOwner();
    const customer = await createCustomer({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: { companyName: "PT Maju Jaya", contactPerson: "Budi Santoso", phone: "08123456789" },
    });
    const deal = await createDeal({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: {
        customerId: customer.id,
        title: "CCTV Installation - Bekasi",
        estimatedValue: "30000000",
        assignedToId: owner.ownerUserId,
      },
    });
    return { ...owner, customerId: customer.id, dealId: deal.id };
  }

  async function advanceDealToLost(ownerCookie: string, dealId: string) {
    let deal = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
    await transitionDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId,
      expectedVersion: deal!.version,
      input: { toStatus: "CONTACTED" },
    });
    deal = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
    await transitionDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId,
      expectedVersion: deal!.version,
      input: { toStatus: "LOST", lostReason: "PRICE_TOO_HIGH" },
    });
  }

  const followUpInput = (dealId: string, overrides: Record<string, unknown> = {}) => ({
    dealId,
    type: "CALL",
    followUpAt: daysFromNowIso(30),
    ...overrides,
  });

  it("allows OWNER/SALES to create a follow-up, but rejects FINANCE (§6.2)", async () => {
    const owner = await setupOwnerWithDeal();
    const created = await createFollowUp({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: followUpInput(owner.dealId),
    });
    expect(created.type).toBe("CALL");
    expect(created.dealId).toBe(owner.dealId);
    expect(created.completedAt).toBeNull();
    expect(created.version).toBe(1);

    const { memberCookie } = await setupMember(owner, "SALES");
    const bySales = await createFollowUp({
      headers: new Headers({ cookie: memberCookie }),
      input: followUpInput(owner.dealId),
    });
    expect(bySales.id).not.toBe(created.id);

    const { memberCookie: financeCookie } = await setupMember(owner, "FINANCE");
    await expect(
      createFollowUp({ headers: new Headers({ cookie: financeCookie }), input: followUpInput(owner.dealId) }),
    ).rejects.toThrow();
  });

  it("logs a created activity (AUD-01)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    const created = await createFollowUp({ headers: new Headers({ cookie: ownerCookie }), input: followUpInput(dealId) });

    const log = await db.query.activities.findMany({
      where: and(eq(activities.dealId, dealId), eq(activities.entityType, "follow_up")),
    });
    expect(log).toHaveLength(1);
    expect(log[0].eventType).toBe("created");
    expect((log[0].metadata as { followUpId: string }).followUpId).toBe(created.id);
  });

  it("rejects creating a follow-up on a WON or LOST deal (FUP-04)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    await advanceDealToLost(ownerCookie, dealId);

    await expect(
      createFollowUp({ headers: new Headers({ cookie: ownerCookie }), input: followUpInput(dealId) }),
    ).rejects.toThrow(/WON or LOST/);
  });

  it("still allows updating and completing a follow-up that pre-dates the deal becoming terminal (FUP-04)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    const created = await createFollowUp({ headers: new Headers({ cookie: ownerCookie }), input: followUpInput(dealId) });
    await advanceDealToLost(ownerCookie, dealId);

    const updated = await updateFollowUp({
      headers: new Headers({ cookie: ownerCookie }),
      followUpId: created.id,
      expectedVersion: created.version,
      input: { followUpAt: daysFromNowIso(31) },
    });
    expect(updated.version).toBe(2);

    const completed = await completeFollowUp({
      headers: new Headers({ cookie: ownerCookie }),
      followUpId: created.id,
      expectedVersion: updated.version,
      input: {},
    });
    expect(completed.completedAt).not.toBeNull();
  });

  it("changes note/schedule before completion, and logs 'rescheduled' only when the schedule actually changes (FUP-02/AUD-01)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    const created = await createFollowUp({
      headers: new Headers({ cookie: ownerCookie }),
      input: followUpInput(dealId, { note: "Panggil sebelum jam 10" }),
    });
    const originalFollowUpAt = created.followUpAt.toISOString();

    const noteOnly = await updateFollowUp({
      headers: new Headers({ cookie: ownerCookie }),
      followUpId: created.id,
      expectedVersion: created.version,
      input: { followUpAt: originalFollowUpAt, note: "Panggil setelah jam 10" },
    });
    expect(noteOnly.note).toBe("Panggil setelah jam 10");

    let log = await db.query.activities.findMany({
      where: and(eq(activities.dealId, dealId), eq(activities.eventType, "rescheduled")),
    });
    expect(log).toHaveLength(0);

    const newFollowUpAt = daysFromNowIso(45);
    const rescheduled = await updateFollowUp({
      headers: new Headers({ cookie: ownerCookie }),
      followUpId: created.id,
      expectedVersion: noteOnly.version,
      input: { followUpAt: newFollowUpAt, note: "Panggil setelah jam 10" },
    });
    expect(rescheduled.followUpAt.toISOString()).toBe(new Date(newFollowUpAt).toISOString());

    log = await db.query.activities.findMany({
      where: and(eq(activities.dealId, dealId), eq(activities.eventType, "rescheduled")),
    });
    expect(log).toHaveLength(1);
  });

  it("rejects editing a completed follow-up, and rejects a stale version (FUP-02/DATA-07)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    const created = await createFollowUp({ headers: new Headers({ cookie: ownerCookie }), input: followUpInput(dealId) });
    const completed = await completeFollowUp({
      headers: new Headers({ cookie: ownerCookie }),
      followUpId: created.id,
      expectedVersion: created.version,
      input: {},
    });

    await expect(
      updateFollowUp({
        headers: new Headers({ cookie: ownerCookie }),
        followUpId: created.id,
        expectedVersion: completed.version,
        input: { followUpAt: daysFromNowIso(31) },
      }),
    ).rejects.toThrow(/completed/);

    const second = await createFollowUp({ headers: new Headers({ cookie: ownerCookie }), input: followUpInput(dealId) });
    await updateFollowUp({
      headers: new Headers({ cookie: ownerCookie }),
      followUpId: second.id,
      expectedVersion: second.version,
      input: { followUpAt: daysFromNowIso(32) },
    });
    await expect(
      updateFollowUp({
        headers: new Headers({ cookie: ownerCookie }),
        followUpId: second.id,
        expectedVersion: second.version, // stale: already consumed above
        input: { followUpAt: daysFromNowIso(33) },
      }),
    ).rejects.toThrow(/modified by someone else/);
  });

  it("completing twice is idempotent and does not require a fresh version (FUP-02)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    const created = await createFollowUp({ headers: new Headers({ cookie: ownerCookie }), input: followUpInput(dealId) });
    const first = await completeFollowUp({
      headers: new Headers({ cookie: ownerCookie }),
      followUpId: created.id,
      expectedVersion: created.version,
      input: {},
    });

    const second = await completeFollowUp({
      headers: new Headers({ cookie: ownerCookie }),
      followUpId: created.id,
      expectedVersion: 999, // deliberately wrong -- must not matter on the no-op path
      input: {},
    });
    expect(second.completedAt!.getTime()).toBe(first.completedAt!.getTime());
    expect(second.version).toBe(first.version);

    const log = await db.query.activities.findMany({
      where: and(eq(activities.dealId, dealId), eq(activities.eventType, "completed")),
    });
    expect(log).toHaveLength(1);
  });

  it("bumps deals.lastActivityAt on completion, without rewinding it for an older backdated completedAt (RISK-01/11.2)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    // Backdated directly rather than relying on wall-clock ordering: the
    // whole create-deal-then-complete-follow-up sequence can run fast
    // enough (especially under a loaded test suite) to land within the
    // same millisecond, which would make a plain toBeGreaterThan flaky
    // without this -- not a product bug, just too strict a time budget for
    // a real-clock assertion.
    await db.update(deals).set({ lastActivityAt: new Date("2020-01-01T00:00:00Z") }).where(eq(deals.id, dealId));
    const before = (await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) }))!;

    const created = await createFollowUp({ headers: new Headers({ cookie: ownerCookie }), input: followUpInput(dealId) });
    const completed = await completeFollowUp({
      headers: new Headers({ cookie: ownerCookie }),
      followUpId: created.id,
      expectedVersion: created.version,
      input: {},
    });
    const afterComplete = (await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) }))!;
    expect(afterComplete.lastActivityAt.getTime()).toBeGreaterThan(before.lastActivityAt.getTime());
    expect(completed.completedAt).not.toBeNull();

    // Backdated completion on a second follow-up, older (2020) than the
    // activity already recorded above -- must not rewind lastActivityAt.
    const second = await createFollowUp({
      headers: new Headers({ cookie: ownerCookie }),
      input: followUpInput(dealId, { followUpAt: "2020-01-01T03:00:00Z" }),
    });
    await completeFollowUp({
      headers: new Headers({ cookie: ownerCookie }),
      followUpId: second.id,
      expectedVersion: second.version,
      input: { completedAt: "2020-01-02T03:00:00Z" },
    });
    const afterBackdated = (await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) }))!;
    expect(afterBackdated.lastActivityAt.getTime()).toBe(afterComplete.lastActivityAt.getTime());
  });

  it("returns not-found for a follow-up in a different organization, on read/update/complete (TENANT-04)", async () => {
    const orgA = await setupOwnerWithDeal();
    const orgB = await setupOwnerWithDeal();
    const created = await createFollowUp({
      headers: new Headers({ cookie: orgA.ownerCookie }),
      input: followUpInput(orgA.dealId),
    });

    await expect(
      getFollowUp({ headers: new Headers({ cookie: orgB.ownerCookie }), followUpId: created.id }),
    ).rejects.toThrow(/not found/i);

    await expect(
      updateFollowUp({
        headers: new Headers({ cookie: orgB.ownerCookie }),
        followUpId: created.id,
        expectedVersion: created.version,
        input: { followUpAt: daysFromNowIso(31) },
      }),
    ).rejects.toThrow(/not found/i);

    await expect(
      completeFollowUp({
        headers: new Headers({ cookie: orgB.ownerCookie }),
        followUpId: created.id,
        expectedVersion: created.version,
        input: {},
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("listActiveFollowUps excludes completed follow-ups and follow-ups on WON/LOST deals, and annotates bucket (FUP-03/FUP-04)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    const active = await createFollowUp({ headers: new Headers({ cookie: ownerCookie }), input: followUpInput(dealId) });
    const completed = await createFollowUp({ headers: new Headers({ cookie: ownerCookie }), input: followUpInput(dealId) });
    await completeFollowUp({
      headers: new Headers({ cookie: ownerCookie }),
      followUpId: completed.id,
      expectedVersion: completed.version,
      input: {},
    });

    const lostDeal = await setupOwnerWithDeal();
    const onLostDeal = await createFollowUp({
      headers: new Headers({ cookie: lostDeal.ownerCookie }),
      input: followUpInput(lostDeal.dealId),
    });
    await advanceDealToLost(lostDeal.ownerCookie, lostDeal.dealId);

    const activeRows = await listActiveFollowUps({ headers: new Headers({ cookie: ownerCookie }), dealId });
    const activeIds = activeRows.map((row) => row.id);
    expect(activeIds).toContain(active.id);
    expect(activeIds).not.toContain(completed.id);
    expect(activeRows.find((row) => row.id === active.id)!.bucket).toBe("UPCOMING");

    const lostOrgRows = await listActiveFollowUps({
      headers: new Headers({ cookie: lostDeal.ownerCookie }),
      dealId: lostDeal.dealId,
    });
    expect(lostOrgRows.map((row) => row.id)).not.toContain(onLostDeal.id);
  });
});
