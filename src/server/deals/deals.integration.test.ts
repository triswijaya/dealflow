import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "@/server/auth/auth";
import { inviteMember, acceptInvitation } from "@/server/auth/members";
import { registerOwner } from "@/server/auth/register-owner";
import { createCustomer } from "@/server/customers/customers";
import { createDeal, getDeal, listDeals, transitionDeal, updateDeal } from "./deals";
import { db } from "@/server/db/client";
import { activities, deals } from "@/server/db/schema";

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

describe("deals", () => {
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
      companyName: `Deal Co ${Date.now()}`,
    });
    const cookie = await sessionCookieFor(ownerEmail, password);
    return { organizationId, ownerUserId: userId, ownerCookie: cookie };
  }

  async function setupOwnerAndMember(role: "SALES" | "ADMIN" | "FINANCE") {
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
    const memberUser = await db.query.user.findFirst({ where: (u, { eq: eqOp }) => eqOp(u.email, memberEmail) });
    await acceptInvitation({
      invitationId: invite.id,
      userId: memberUser!.id,
      headers: new Headers({ cookie: memberCookie }),
    });
    return { ...owner, memberCookie, memberUserId: memberUser!.id };
  }

  async function setupOwnerWithCustomer() {
    const owner = await setupOwner();
    const customer = await createCustomer({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: {
        companyName: "PT Maju Jaya",
        contactPerson: "Budi Santoso",
        phone: "08123456789",
      },
    });
    return { ...owner, customerId: customer.id };
  }

  const dealInput = (customerId: string, overrides: Record<string, unknown> = {}) => ({
    customerId,
    title: "CCTV Installation - Bekasi",
    estimatedValue: "30000000",
    ...overrides,
  });

  it("creates a deal defaulting to NEW status and version 1", async () => {
    const { ownerCookie, customerId, ownerUserId } = await setupOwnerWithCustomer();
    const created = await createDeal({
      headers: new Headers({ cookie: ownerCookie }),
      input: dealInput(customerId, { assignedToId: ownerUserId }),
    });

    expect(created.status).toBe("NEW");
    expect(created.version).toBe(1);
    expect(created.estimatedValue).toBe("30000000");
    expect(created.description).toBe("");
  });

  it("defaults assignedToId to the actor when a SALES rep omits it", async () => {
    const owner = await setupOwnerWithCustomer();
    const { memberCookie, memberUserId } = await (async () => {
      const memberEmail = `sales-${Date.now()}-${Math.random()}@example.test`;
      const memberPassword = "correct-horse-battery-staple";
      const invite = await inviteMember({
        email: memberEmail,
        role: "SALES",
        organizationId: owner.organizationId,
        headers: new Headers({ cookie: owner.ownerCookie }),
      });
      await auth.api.signUpEmail({ body: { email: memberEmail, password: memberPassword, name: "Sales" } });
      const cookie = await sessionCookieFor(memberEmail, memberPassword);
      const memberUser = await db.query.user.findFirst({ where: (u, { eq: eqOp }) => eqOp(u.email, memberEmail) });
      await acceptInvitation({ invitationId: invite.id, userId: memberUser!.id, headers: new Headers({ cookie }) });
      return { memberCookie: cookie, memberUserId: memberUser!.id };
    })();

    const created = await createDeal({
      headers: new Headers({ cookie: memberCookie }),
      input: dealInput(owner.customerId),
    });
    expect(created.assignedToId).toBe(memberUserId);
  });

  it("requires an explicit assignedToId when an Owner creates a deal", async () => {
    const { ownerCookie, customerId } = await setupOwnerWithCustomer();
    await expect(
      createDeal({ headers: new Headers({ cookie: ownerCookie }), input: dealInput(customerId) }),
    ).rejects.toThrow(/assignedToId/);
  });

  it("rejects a SALES rep explicitly assigning a new deal to someone else (§6.2: creation defaults to self only)", async () => {
    const owner = await setupOwnerAndMember("SALES");
    const customer = await createCustomer({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: { companyName: "PT Maju Jaya", contactPerson: "Budi", phone: "08123456789" },
    });

    await expect(
      createDeal({
        headers: new Headers({ cookie: owner.memberCookie }),
        input: dealInput(customer.id, { assignedToId: owner.ownerUserId }),
      }),
    ).rejects.toThrow(/only assign a new deal to themselves/);
  });

  it("rejects a negative or decimal estimatedValue", async () => {
    const { ownerCookie, customerId, ownerUserId } = await setupOwnerWithCustomer();
    await expect(
      createDeal({
        headers: new Headers({ cookie: ownerCookie }),
        input: dealInput(customerId, { assignedToId: ownerUserId, estimatedValue: "-1" }),
      }),
    ).rejects.toThrow();
    await expect(
      createDeal({
        headers: new Headers({ cookie: ownerCookie }),
        input: dealInput(customerId, { assignedToId: ownerUserId, estimatedValue: "100.50" }),
      }),
    ).rejects.toThrow();
  });

  it("rejects assigning a deal to someone who isn't an active Sales/Owner/Admin member", async () => {
    const { ownerCookie, customerId } = await setupOwnerWithCustomer();
    await expect(
      createDeal({
        headers: new Headers({ cookie: ownerCookie }),
        input: dealInput(customerId, { assignedToId: "not-a-real-user-id" }),
      }),
    ).rejects.toThrow();
  });

  it("rejects FINANCE creating a deal", async () => {
    const owner = await setupOwnerWithCustomer();
    const financeCookie = await (async () => {
      const email = `finance-${Date.now()}-${Math.random()}@example.test`;
      const password = "correct-horse-battery-staple";
      const invite = await inviteMember({
        email,
        role: "FINANCE",
        organizationId: owner.organizationId,
        headers: new Headers({ cookie: owner.ownerCookie }),
      });
      await auth.api.signUpEmail({ body: { email, password, name: "Finance" } });
      const cookie = await sessionCookieFor(email, password);
      const user = await db.query.user.findFirst({ where: (u, { eq: eqOp }) => eqOp(u.email, email) });
      await acceptInvitation({ invitationId: invite.id, userId: user!.id, headers: new Headers({ cookie }) });
      return cookie;
    })();

    await expect(
      createDeal({ headers: new Headers({ cookie: financeCookie }), input: dealInput(owner.customerId) }),
    ).rejects.toThrow();
  });

  it("updates a deal and increments version", async () => {
    const { ownerCookie, customerId, ownerUserId } = await setupOwnerWithCustomer();
    const created = await createDeal({
      headers: new Headers({ cookie: ownerCookie }),
      input: dealInput(customerId, { assignedToId: ownerUserId }),
    });

    const updated = await updateDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId: created.id,
      expectedVersion: created.version,
      input: dealInput(customerId, { assignedToId: ownerUserId, title: "CCTV Installation - Bekasi (revised)" }),
    });

    expect(updated.title).toBe("CCTV Installation - Bekasi (revised)");
    expect(updated.version).toBe(2);

    // AUD-01: "deal updated" is a required minimum event.
    const log = await db.query.activities.findMany({ where: eq(activities.dealId, created.id) });
    expect(log.map((a) => a.eventType).sort()).toEqual(["created", "updated"]);
    const updateEvent = log.find((a) => a.eventType === "updated");
    const metadata = updateEvent?.metadata as { before: { title: string }; after: { title: string } };
    expect(metadata.before.title).toBe("CCTV Installation - Bekasi");
    expect(metadata.after.title).toBe("CCTV Installation - Bekasi (revised)");
  });

  it("actually clears notes and expectedCloseDate when the update omits them, not silently keeping the old value", async () => {
    const { ownerCookie, customerId, ownerUserId } = await setupOwnerWithCustomer();
    const created = await createDeal({
      headers: new Headers({ cookie: ownerCookie }),
      input: dealInput(customerId, {
        assignedToId: ownerUserId,
        notes: "Prospek besar",
        expectedCloseDate: "2026-12-31",
      }),
    });
    expect(created.notes).toBe("Prospek besar");
    expect(created.expectedCloseDate).toBe("2026-12-31");

    const cleared = await updateDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId: created.id,
      expectedVersion: created.version,
      input: dealInput(customerId, { assignedToId: ownerUserId }), // notes/expectedCloseDate omitted
    });

    expect(cleared.notes).toBeNull();
    expect(cleared.expectedCloseDate).toBeNull();
  });

  it("rejects an update with a stale version (DATA-07)", async () => {
    const { ownerCookie, customerId, ownerUserId } = await setupOwnerWithCustomer();
    const created = await createDeal({
      headers: new Headers({ cookie: ownerCookie }),
      input: dealInput(customerId, { assignedToId: ownerUserId }),
    });

    await updateDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId: created.id,
      expectedVersion: created.version,
      input: dealInput(customerId, { assignedToId: ownerUserId, title: "First edit" }),
    });

    // Retry with the original (now stale) version.
    await expect(
      updateDeal({
        headers: new Headers({ cookie: ownerCookie }),
        dealId: created.id,
        expectedVersion: created.version,
        input: dealInput(customerId, { assignedToId: ownerUserId, title: "Conflicting edit" }),
      }),
    ).rejects.toThrow(/modified by someone else/);
  });

  it("rejects a SALES rep reassigning a deal, but allows an owner to", async () => {
    const owner = await setupOwnerAndMember("SALES");
    const customer = await createCustomer({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: { companyName: "PT Maju Jaya", contactPerson: "Budi", phone: "08123456789" },
    });
    const created = await createDeal({
      headers: new Headers({ cookie: owner.memberCookie }),
      input: dealInput(customer.id),
    });
    expect(created.assignedToId).toBe(owner.memberUserId);

    await expect(
      updateDeal({
        headers: new Headers({ cookie: owner.memberCookie }),
        dealId: created.id,
        expectedVersion: created.version,
        input: dealInput(customer.id, { assignedToId: owner.ownerUserId }),
      }),
    ).rejects.toThrow(/owner or admin/);

    const reassigned = await updateDeal({
      headers: new Headers({ cookie: owner.ownerCookie }),
      dealId: created.id,
      expectedVersion: created.version,
      input: dealInput(customer.id, { assignedToId: owner.ownerUserId }),
    });
    expect(reassigned.assignedToId).toBe(owner.ownerUserId);
  });

  it("returns not-found for a deal in a different organization (TENANT-04)", async () => {
    const orgA = await setupOwnerWithCustomer();
    const orgB = await setupOwnerWithCustomer();
    const created = await createDeal({
      headers: new Headers({ cookie: orgA.ownerCookie }),
      input: dealInput(orgA.customerId, { assignedToId: orgA.ownerUserId }),
    });

    await expect(
      getDeal({ headers: new Headers({ cookie: orgB.ownerCookie }), dealId: created.id }),
    ).rejects.toThrow(/not found/i);

    await expect(
      updateDeal({
        headers: new Headers({ cookie: orgB.ownerCookie }),
        dealId: created.id,
        expectedVersion: created.version,
        input: dealInput(orgB.customerId, { assignedToId: orgB.ownerUserId }),
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("hides a non-WON deal from FINANCE (not-found, not forbidden), but shows WON deals", async () => {
    const owner = await setupOwnerWithCustomer();
    const created = await createDeal({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: dealInput(owner.customerId, { assignedToId: owner.ownerUserId }),
    });

    const financeCookie = await (async () => {
      const email = `finance-${Date.now()}-${Math.random()}@example.test`;
      const password = "correct-horse-battery-staple";
      const invite = await inviteMember({
        email,
        role: "FINANCE",
        organizationId: owner.organizationId,
        headers: new Headers({ cookie: owner.ownerCookie }),
      });
      await auth.api.signUpEmail({ body: { email, password, name: "Finance" } });
      const cookie = await sessionCookieFor(email, password);
      const user = await db.query.user.findFirst({ where: (u, { eq: eqOp }) => eqOp(u.email, email) });
      await acceptInvitation({ invitationId: invite.id, userId: user!.id, headers: new Headers({ cookie }) });
      return cookie;
    })();

    await expect(
      getDeal({ headers: new Headers({ cookie: financeCookie }), dealId: created.id }),
    ).rejects.toThrow(/not found/i);

    const listBeforeWon = await listDeals({ headers: new Headers({ cookie: financeCookie }) });
    expect(listBeforeWon.items).toHaveLength(0);

    // Directly flip status to simulate a WON deal: the transition function
    // itself is a separate, later commit, this test only exercises the
    // read-side filter.
    await db.update(deals).set({ status: "WON" }).where(eq(deals.id, created.id));

    const readByFinance = await getDeal({ headers: new Headers({ cookie: financeCookie }), dealId: created.id });
    expect(readByFinance.id).toBe(created.id);

    const listAfterWon = await listDeals({ headers: new Headers({ cookie: financeCookie }) });
    expect(listAfterWon.items).toHaveLength(1);
  });

  it("scopes listDeals to the caller's own organization only", async () => {
    const orgA = await setupOwnerWithCustomer();
    const orgB = await setupOwnerWithCustomer();
    await createDeal({
      headers: new Headers({ cookie: orgA.ownerCookie }),
      input: dealInput(orgA.customerId, { assignedToId: orgA.ownerUserId }),
    });
    await createDeal({
      headers: new Headers({ cookie: orgB.ownerCookie }),
      input: dealInput(orgB.customerId, { assignedToId: orgB.ownerUserId, title: "Other org deal" }),
    });

    const listA = await listDeals({ headers: new Headers({ cookie: orgA.ownerCookie }) });
    expect(listA.items).toHaveLength(1);
    // TENANT-04: the paginated count itself must not leak org B's row into
    // org A's total, not just the returned items array.
    expect(listA.totalItems).toBe(1);

    const crossCheck = await db.query.deals.findMany({
      where: and(eq(deals.organizationId, orgA.organizationId), eq(deals.title, "Other org deal")),
    });
    expect(crossCheck).toHaveLength(0);
  });

  it("paginates listDeals: correct slice, totalItems, and totalPages across pages (SEARCH-02)", async () => {
    const { ownerCookie, customerId, ownerUserId } = await setupOwnerWithCustomer();
    for (const title of ["Deal Satu", "Deal Dua", "Deal Tiga", "Deal Empat", "Deal Lima"]) {
      await createDeal({
        headers: new Headers({ cookie: ownerCookie }),
        input: dealInput(customerId, { assignedToId: ownerUserId, title }),
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const pageOne = await listDeals({ headers: new Headers({ cookie: ownerCookie }), page: 1, pageSize: 2 });
    expect(pageOne.items).toHaveLength(2);
    expect(pageOne.totalItems).toBe(5);
    expect(pageOne.totalPages).toBe(3);
    expect(pageOne.items.map((d) => d.title)).toEqual(["Deal Lima", "Deal Empat"]);

    const pageTwo = await listDeals({ headers: new Headers({ cookie: ownerCookie }), page: 2, pageSize: 2 });
    expect(pageTwo.items.map((d) => d.title)).toEqual(["Deal Tiga", "Deal Dua"]);

    const pageThree = await listDeals({ headers: new Headers({ cookie: ownerCookie }), page: 3, pageSize: 2 });
    expect(pageThree.items.map((d) => d.title)).toEqual(["Deal Satu"]);
  });

  it("counts only WON deals for a paginated Finance listDeals (§3 Finance visibility)", async () => {
    const owner = await setupOwnerWithCustomer();
    const wonDeal = await createDeal({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: dealInput(owner.customerId, { assignedToId: owner.ownerUserId, title: "Deal WON" }),
    });
    await createDeal({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: dealInput(owner.customerId, { assignedToId: owner.ownerUserId, title: "Deal masih NEW" }),
    });
    await db.update(deals).set({ status: "WON" }).where(eq(deals.id, wonDeal.id));

    const financeCookie = await (async () => {
      const email = `finance-${Date.now()}-${Math.random()}@example.test`;
      const password = "correct-horse-battery-staple";
      const invite = await inviteMember({
        email,
        role: "FINANCE",
        organizationId: owner.organizationId,
        headers: new Headers({ cookie: owner.ownerCookie }),
      });
      await auth.api.signUpEmail({ body: { email, password, name: "Finance" } });
      const cookie = await sessionCookieFor(email, password);
      const user = await db.query.user.findFirst({ where: (u, { eq: eqOp }) => eqOp(u.email, email) });
      await acceptInvitation({ invitationId: invite.id, userId: user!.id, headers: new Headers({ cookie }) });
      return cookie;
    })();

    const financeList = await listDeals({ headers: new Headers({ cookie: financeCookie }), page: 1, pageSize: 25 });
    expect(financeList.items).toHaveLength(1);
    expect(financeList.totalItems).toBe(1);
    expect(financeList.items[0]?.id).toBe(wonDeal.id);
  });

  it("walks the full pipeline NEW -> CONTACTED -> QUALIFIED -> QUOTATION -> NEGOTIATION -> WON, logging an activity per step", async () => {
    const { ownerCookie, customerId, ownerUserId } = await setupOwnerWithCustomer();
    let deal = await createDeal({
      headers: new Headers({ cookie: ownerCookie }),
      input: dealInput(customerId, { assignedToId: ownerUserId }),
    });

    for (const toStatus of ["CONTACTED", "QUALIFIED", "QUOTATION", "NEGOTIATION", "WON"] as const) {
      deal = await transitionDeal({
        headers: new Headers({ cookie: ownerCookie }),
        dealId: deal.id,
        expectedVersion: deal.version,
        input: { toStatus },
      });
      expect(deal.status).toBe(toStatus);
    }

    expect(deal.wonAt).not.toBeNull();
    expect(deal.wonValue).toBe("30000000");

    // created + 5 transitions = 6 activity rows.
    const log = await db.query.activities.findMany({ where: eq(activities.dealId, deal.id) });
    expect(log).toHaveLength(6);
    expect(log.map((a) => a.eventType).sort()).toEqual(
      ["created", "stage_changed", "stage_changed", "stage_changed", "stage_changed", "won"].sort(),
    );

    const wonEvent = log.find((a) => a.eventType === "won");
    const metadata = wonEvent?.metadata as { wonValue: string };
    expect(metadata.wonValue).toBe("30000000");
  });

  it("rejects an illegal transition (skipping stages) without mutating the deal", async () => {
    const { ownerCookie, customerId, ownerUserId } = await setupOwnerWithCustomer();
    const created = await createDeal({
      headers: new Headers({ cookie: ownerCookie }),
      input: dealInput(customerId, { assignedToId: ownerUserId }),
    });

    await expect(
      transitionDeal({
        headers: new Headers({ cookie: ownerCookie }),
        dealId: created.id,
        expectedVersion: created.version,
        input: { toStatus: "WON" },
      }),
    ).rejects.toThrow(/Cannot transition/);

    const unchanged = await db.query.deals.findFirst({ where: eq(deals.id, created.id) });
    expect(unchanged?.status).toBe("NEW");
    expect(unchanged?.version).toBe(1);
  });

  it("rejects CONTACTED -> QUOTATION directly, skipping QUALIFIED", async () => {
    const { ownerCookie, customerId, ownerUserId } = await setupOwnerWithCustomer();
    const created = await createDeal({
      headers: new Headers({ cookie: ownerCookie }),
      input: dealInput(customerId, { assignedToId: ownerUserId }),
    });
    const contacted = await transitionDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId: created.id,
      expectedVersion: created.version,
      input: { toStatus: "CONTACTED" },
    });

    await expect(
      transitionDeal({
        headers: new Headers({ cookie: ownerCookie }),
        dealId: contacted.id,
        expectedVersion: contacted.version,
        input: { toStatus: "QUOTATION" },
      }),
    ).rejects.toThrow(/Cannot transition/);

    const unchangedAfterContacted = await db.query.deals.findFirst({ where: eq(deals.id, created.id) });
    expect(unchangedAfterContacted?.status).toBe("CONTACTED");
    expect(unchangedAfterContacted?.version).toBe(2);
  });

  it("treats a retried transition to the already-current status as an idempotent no-op, not a new activity", async () => {
    const { ownerCookie, customerId, ownerUserId } = await setupOwnerWithCustomer();
    const created = await createDeal({
      headers: new Headers({ cookie: ownerCookie }),
      input: dealInput(customerId, { assignedToId: ownerUserId }),
    });
    const contacted = await transitionDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId: created.id,
      expectedVersion: created.version,
      input: { toStatus: "CONTACTED" },
    });
    expect(contacted.version).toBe(2);

    // Simulates a retried request (e.g. a network hiccup) submitting the
    // same target status the deal is already in.
    const retried = await transitionDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId: contacted.id,
      expectedVersion: contacted.version,
      input: { toStatus: "CONTACTED" },
    });
    expect(retried.version).toBe(2); // unchanged, not bumped to 3

    const log = await db.query.activities.findMany({ where: eq(activities.dealId, created.id) });
    expect(log).toHaveLength(2); // "created" + the one real CONTACTED transition, no duplicate
  });

  it("treats a retried transition to QUALIFIED as an idempotent no-op, not a new activity", async () => {
    const { ownerCookie, customerId, ownerUserId } = await setupOwnerWithCustomer();
    const created = await createDeal({
      headers: new Headers({ cookie: ownerCookie }),
      input: dealInput(customerId, { assignedToId: ownerUserId }),
    });
    const contacted = await transitionDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId: created.id,
      expectedVersion: created.version,
      input: { toStatus: "CONTACTED" },
    });
    const qualified = await transitionDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId: contacted.id,
      expectedVersion: contacted.version,
      input: { toStatus: "QUALIFIED" },
    });
    expect(qualified.version).toBe(3);

    const retried = await transitionDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId: qualified.id,
      expectedVersion: qualified.version,
      input: { toStatus: "QUALIFIED" },
    });
    expect(retried.version).toBe(3); // unchanged, not bumped to 4

    const log = await db.query.activities.findMany({ where: eq(activities.dealId, created.id) });
    expect(log).toHaveLength(3); // created + CONTACTED + QUALIFIED, no duplicate
  });

  it("requires a valid reason to mark a deal LOST, and freezes lostAt", async () => {
    const { ownerCookie, customerId, ownerUserId } = await setupOwnerWithCustomer();
    const created = await createDeal({
      headers: new Headers({ cookie: ownerCookie }),
      input: dealInput(customerId, { assignedToId: ownerUserId }),
    });

    await expect(
      transitionDeal({
        headers: new Headers({ cookie: ownerCookie }),
        dealId: created.id,
        expectedVersion: created.version,
        input: { toStatus: "LOST" },
      }),
    ).rejects.toThrow();

    const lost = await transitionDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId: created.id,
      expectedVersion: created.version,
      input: { toStatus: "LOST", lostReason: "NO_RESPONSE", lostNote: "Tidak ada balasan setelah 3 minggu" },
    });
    expect(lost.lostReason).toBe("NO_RESPONSE");
    expect(lost.lostAt).not.toBeNull();

    // AUD-01: "simpan lost_at dan event alasan" -- the reason belongs on
    // the activity event itself, not just the deals row.
    const lostEvent = await db.query.activities.findFirst({
      where: and(eq(activities.dealId, created.id), eq(activities.eventType, "lost")),
    });
    const metadata = lostEvent?.metadata as { lostReason: string; lostNote: string };
    expect(metadata.lostReason).toBe("NO_RESPONSE");
    expect(metadata.lostNote).toBe("Tidak ada balasan setelah 3 minggu");
  });

  it("requires a valid reason to mark a QUALIFIED deal LOST", async () => {
    const { ownerCookie, customerId, ownerUserId } = await setupOwnerWithCustomer();
    const created = await createDeal({
      headers: new Headers({ cookie: ownerCookie }),
      input: dealInput(customerId, { assignedToId: ownerUserId }),
    });
    let deal = created;
    for (const toStatus of ["CONTACTED", "QUALIFIED"] as const) {
      deal = await transitionDeal({
        headers: new Headers({ cookie: ownerCookie }),
        dealId: deal.id,
        expectedVersion: deal.version,
        input: { toStatus },
      });
    }
    expect(deal.status).toBe("QUALIFIED");

    await expect(
      transitionDeal({
        headers: new Headers({ cookie: ownerCookie }),
        dealId: deal.id,
        expectedVersion: deal.version,
        input: { toStatus: "LOST" },
      }),
    ).rejects.toThrow();

    const lost = await transitionDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId: deal.id,
      expectedVersion: deal.version,
      input: { toStatus: "LOST", lostReason: "BUDGET_UNAVAILABLE" },
    });
    expect(lost.status).toBe("LOST");
    expect(lost.lostReason).toBe("BUDGET_UNAVAILABLE");
  });

  it("rejects marking a zero-value deal WON (DEAL-04)", async () => {
    const { ownerCookie, customerId, ownerUserId } = await setupOwnerWithCustomer();
    let deal = await createDeal({
      headers: new Headers({ cookie: ownerCookie }),
      input: dealInput(customerId, { assignedToId: ownerUserId, estimatedValue: "0" }),
    });
    for (const toStatus of ["CONTACTED", "QUALIFIED", "QUOTATION", "NEGOTIATION"] as const) {
      deal = await transitionDeal({
        headers: new Headers({ cookie: ownerCookie }),
        dealId: deal.id,
        expectedVersion: deal.version,
        input: { toStatus },
      });
    }

    await expect(
      transitionDeal({
        headers: new Headers({ cookie: ownerCookie }),
        dealId: deal.id,
        expectedVersion: deal.version,
        input: { toStatus: "WON" },
      }),
    ).rejects.toThrow(/positive/);
  });

  it("rejects a transition with a stale version, and does not leave an orphaned activity", async () => {
    const { ownerCookie, customerId, ownerUserId } = await setupOwnerWithCustomer();
    const created = await createDeal({
      headers: new Headers({ cookie: ownerCookie }),
      input: dealInput(customerId, { assignedToId: ownerUserId }),
    });

    await transitionDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId: created.id,
      expectedVersion: created.version,
      input: { toStatus: "CONTACTED" },
    });

    await expect(
      transitionDeal({
        headers: new Headers({ cookie: ownerCookie }),
        dealId: created.id,
        expectedVersion: created.version, // stale, already moved to version 2
        input: { toStatus: "QUALIFIED" },
      }),
    ).rejects.toThrow(/modified by someone else/);

    const log = await db.query.activities.findMany({ where: eq(activities.dealId, created.id) });
    expect(log).toHaveLength(2); // created + the one successful CONTACTED transition, not 3
  });

  it("rejects FINANCE transitioning a deal", async () => {
    const owner = await setupOwnerWithCustomer();
    const created = await createDeal({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: dealInput(owner.customerId, { assignedToId: owner.ownerUserId }),
    });

    const financeCookie = await (async () => {
      const email = `finance-${Date.now()}-${Math.random()}@example.test`;
      const password = "correct-horse-battery-staple";
      const invite = await inviteMember({
        email,
        role: "FINANCE",
        organizationId: owner.organizationId,
        headers: new Headers({ cookie: owner.ownerCookie }),
      });
      await auth.api.signUpEmail({ body: { email, password, name: "Finance" } });
      const cookie = await sessionCookieFor(email, password);
      const user = await db.query.user.findFirst({ where: (u, { eq: eqOp }) => eqOp(u.email, email) });
      await acceptInvitation({ invitationId: invite.id, userId: user!.id, headers: new Headers({ cookie }) });
      return cookie;
    })();

    await expect(
      transitionDeal({
        headers: new Headers({ cookie: financeCookie }),
        dealId: created.id,
        expectedVersion: created.version,
        input: { toStatus: "CONTACTED" },
      }),
    ).rejects.toThrow();
  });

  it("locks a WON deal against general edits via updateDeal (DEAL-06)", async () => {
    const { ownerCookie, customerId, ownerUserId } = await setupOwnerWithCustomer();
    const created = await createDeal({
      headers: new Headers({ cookie: ownerCookie }),
      input: dealInput(customerId, { assignedToId: ownerUserId }),
    });
    let deal = created;
    for (const toStatus of ["CONTACTED", "QUALIFIED", "QUOTATION", "NEGOTIATION", "WON"] as const) {
      deal = await transitionDeal({
        headers: new Headers({ cookie: ownerCookie }),
        dealId: deal.id,
        expectedVersion: deal.version,
        input: { toStatus },
      });
    }

    await expect(
      updateDeal({
        headers: new Headers({ cookie: ownerCookie }),
        dealId: deal.id,
        expectedVersion: deal.version,
        input: dealInput(customerId, { assignedToId: ownerUserId, title: "Trying to edit a closed deal" }),
      }),
    ).rejects.toThrow(/won or lost/);
  });
});
