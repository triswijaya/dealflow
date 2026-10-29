import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "@/server/auth/auth";
import { acceptInvitation, inviteMember } from "@/server/auth/members";
import { registerOwner } from "@/server/auth/register-owner";
import { createCustomer } from "@/server/customers/customers";
import { createDeal, transitionDeal } from "@/server/deals/deals";
import { db } from "@/server/db/client";
import { activities, payments } from "@/server/db/schema";
import { createInvoice, getInvoice } from "./invoices";
import { listPayments, recordPayment } from "./payments";

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

/** Today in Asia/Jakarta, the organization timezone every test org gets. */
function todayJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function daysFromTodayJakarta(days: number): string {
  const base = new Date(`${todayJakarta()}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

describe("payments", () => {
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
      companyName: `Payment Co ${Date.now()}`,
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

  /**
   * A WON deal with an issued invoice. The invoice total is Rp30.000.000,
   * matching §10.3's worked acceptance example so the AT-14 test below reads
   * exactly like the requirement.
   */
  async function setupInvoice(overrides: Record<string, unknown> = {}) {
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
    for (const toStatus of ["PROPOSAL", "NEGOTIATION", "COMMITMENT", "WON"]) {
      const current = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, deal.id) });
      await transitionDeal({
        headers: new Headers({ cookie: owner.ownerCookie }),
        dealId: deal.id,
        expectedVersion: current!.version,
        input: { toStatus },
      });
    }
    const invoice = await createInvoice({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: {
        dealId: deal.id,
        dueDate: daysFromTodayJakarta(30),
        items: [{ description: "Paket CCTV terpasang", quantity: "1", unit: "paket", unitPrice: "30000000" }],
        idempotencyKey: crypto.randomUUID(),
        ...overrides,
      },
    });
    return { ...owner, customerId: customer.id, dealId: deal.id, invoice };
  }

  const paymentInput = (invoiceId: string, overrides: Record<string, unknown> = {}) => ({
    invoiceId,
    amount: "10000000",
    paymentDate: todayJakarta(),
    paymentMethod: "BANK_TRANSFER",
    idempotencyKey: crypto.randomUUID(),
    ...overrides,
  });

  it("walks Rp30jt through a Rp10jt then Rp20jt payment to PAID (AT-14, §10.3 worked example)", async () => {
    const { ownerCookie, invoice } = await setupInvoice();
    expect(invoice.total).toBe("30000000");
    expect(invoice.status).toBe("UNPAID");

    const first = await recordPayment({
      headers: new Headers({ cookie: ownerCookie }),
      input: paymentInput(invoice.id, { amount: "10000000" }),
    });
    expect(first.paidAmount).toBe("10000000");
    expect(first.remainingAmount).toBe("20000000");
    expect(first.status).toBe("PARTIALLY_PAID");

    const second = await recordPayment({
      headers: new Headers({ cookie: ownerCookie }),
      input: paymentInput(invoice.id, { amount: "20000000" }),
    });
    expect(second.paidAmount).toBe("30000000");
    expect(second.remainingAmount).toBe("0");
    expect(second.status).toBe("PAID");

    // The invoice read path must agree with what recordPayment returned.
    const read = await getInvoice({ headers: new Headers({ cookie: ownerCookie }), invoiceId: invoice.id });
    expect(read.paidAmount).toBe("30000000");
    expect(read.remainingAmount).toBe("0");
    expect(read.status).toBe("PAID");
  });

  it("rejects an amount larger than the outstanding balance (PAY-02)", async () => {
    const { ownerCookie, invoice } = await setupInvoice();
    await recordPayment({
      headers: new Headers({ cookie: ownerCookie }),
      input: paymentInput(invoice.id, { amount: "25000000" }),
    });

    await expect(
      recordPayment({
        headers: new Headers({ cookie: ownerCookie }),
        input: paymentInput(invoice.id, { amount: "5000001" }),
      }),
    ).rejects.toThrow(/exceeds the remaining balance/);
  });

  it("rejects a zero or negative amount (PAY-02)", async () => {
    const { ownerCookie, invoice } = await setupInvoice();
    await expect(
      recordPayment({ headers: new Headers({ cookie: ownerCookie }), input: paymentInput(invoice.id, { amount: "0" }) }),
    ).rejects.toThrow();
    await expect(
      recordPayment({
        headers: new Headers({ cookie: ownerCookie }),
        input: paymentInput(invoice.id, { amount: "-5000000" }),
      }),
    ).rejects.toThrow();
  });

  it("rejects any payment once the invoice is fully paid (PAY-02)", async () => {
    const { ownerCookie, invoice } = await setupInvoice();
    await recordPayment({
      headers: new Headers({ cookie: ownerCookie }),
      input: paymentInput(invoice.id, { amount: "30000000" }),
    });

    await expect(
      recordPayment({
        headers: new Headers({ cookie: ownerCookie }),
        input: paymentInput(invoice.id, { amount: "1000000" }),
      }),
    ).rejects.toThrow(/already fully paid/);
  });

  it("accepts a backdated payment inside the window but rejects one before issue date or in the future (PAY-02)", async () => {
    const { ownerCookie, invoice } = await setupInvoice({ issueDate: daysFromTodayJakarta(-5) });

    const backdated = await recordPayment({
      headers: new Headers({ cookie: ownerCookie }),
      input: paymentInput(invoice.id, { amount: "1000000", paymentDate: daysFromTodayJakarta(-2) }),
    });
    expect(backdated.payment.paymentDate).toBe(daysFromTodayJakarta(-2));
    // PAY-02: created_at stays the real recording time even when the
    // business date is backdated.
    expect(new Date(backdated.payment.createdAt).getTime()).toBeGreaterThan(
      new Date(`${daysFromTodayJakarta(-2)}T00:00:00Z`).getTime(),
    );

    await expect(
      recordPayment({
        headers: new Headers({ cookie: ownerCookie }),
        input: paymentInput(invoice.id, { amount: "1000000", paymentDate: daysFromTodayJakarta(-10) }),
      }),
    ).rejects.toThrow(/before the invoice issue date/);

    await expect(
      recordPayment({
        headers: new Headers({ cookie: ownerCookie }),
        input: paymentInput(invoice.id, { amount: "1000000", paymentDate: daysFromTodayJakarta(1) }),
      }),
    ).rejects.toThrow(/in the future/);
  });

  it("allows FINANCE and rejects SALES (§6.2, AT-19)", async () => {
    const owner = await setupInvoice();

    const { memberCookie: salesCookie } = await setupMember(owner, "SALES");
    await expect(
      recordPayment({ headers: new Headers({ cookie: salesCookie }), input: paymentInput(owner.invoice.id) }),
    ).rejects.toThrow();

    const { memberCookie: financeCookie } = await setupMember(owner, "FINANCE");
    const recorded = await recordPayment({
      headers: new Headers({ cookie: financeCookie }),
      input: paymentInput(owner.invoice.id),
    });
    expect(recorded.payment.id).toBeTruthy();
  });

  it("returns the original payment on an idempotent retry and conflicts on a reused key with a different payload (PAY-04)", async () => {
    const { ownerCookie, invoice } = await setupInvoice();
    const sharedKey = crypto.randomUUID();

    const first = await recordPayment({
      headers: new Headers({ cookie: ownerCookie }),
      input: paymentInput(invoice.id, { amount: "10000000", idempotencyKey: sharedKey }),
    });
    const retry = await recordPayment({
      headers: new Headers({ cookie: ownerCookie }),
      input: paymentInput(invoice.id, { amount: "10000000", idempotencyKey: sharedKey }),
    });

    expect(retry.payment.id).toBe(first.payment.id);
    // The retry must not have moved the balance a second time.
    expect(retry.paidAmount).toBe("10000000");
    expect(
      (await listPayments({ headers: new Headers({ cookie: ownerCookie }), invoiceId: invoice.id })).items,
    ).toHaveLength(1);

    await expect(
      recordPayment({
        headers: new Headers({ cookie: ownerCookie }),
        input: paymentInput(invoice.id, { amount: "5000000", idempotencyKey: sharedKey }),
      }),
    ).rejects.toThrow(/different request/);
  });

  it("lets a retry of the settling payment succeed even though the invoice is now PAID (PAY-03)", async () => {
    const { ownerCookie, invoice } = await setupInvoice();
    const settlingKey = crypto.randomUUID();

    const settled = await recordPayment({
      headers: new Headers({ cookie: ownerCookie }),
      input: paymentInput(invoice.id, { amount: "30000000", idempotencyKey: settlingKey }),
    });
    expect(settled.status).toBe("PAID");

    // Without the replay check running before the PAID gate, this retry
    // would be rejected by the very state its own first attempt created.
    const retry = await recordPayment({
      headers: new Headers({ cookie: ownerCookie }),
      input: paymentInput(invoice.id, { amount: "30000000", idempotencyKey: settlingKey }),
    });
    expect(retry.payment.id).toBe(settled.payment.id);
    expect(retry.status).toBe("PAID");
    expect(
      (await listPayments({ headers: new Headers({ cookie: ownerCookie }), invoiceId: invoice.id })).items,
    ).toHaveLength(1);
  });

  it("logs a payment.recorded activity without leaking the amount (AUD-01/AUD-04)", async () => {
    const { ownerCookie, dealId, invoice } = await setupInvoice();
    const recorded = await recordPayment({
      headers: new Headers({ cookie: ownerCookie }),
      input: paymentInput(invoice.id, { amount: "10000000" }),
    });

    const log = await db.query.activities.findMany({
      where: and(eq(activities.dealId, dealId), eq(activities.entityType, "payment")),
    });
    expect(log).toHaveLength(1);
    expect(log[0].eventType).toBe("recorded");
    expect(log[0].permissionCategory).toBe("finance");
    const metadata = log[0].metadata as Record<string, unknown>;
    expect(metadata.paymentId).toBe(recorded.payment.id);
    // AUD-04: "payment detail tidak boleh bocor melalui ... payload activity".
    expect(JSON.stringify(metadata)).not.toContain("10000000");
  });

  it("rolls back the payment, its activity and its idempotency claim together when validation fails (DATA-06/API-05)", async () => {
    const { ownerCookie, dealId, invoice } = await setupInvoice();
    const key = crypto.randomUUID();

    await expect(
      recordPayment({
        headers: new Headers({ cookie: ownerCookie }),
        input: paymentInput(invoice.id, { amount: "40000000", idempotencyKey: key }),
      }),
    ).rejects.toThrow(/exceeds the remaining balance/);

    expect(await db.query.payments.findMany({ where: eq(payments.invoiceId, invoice.id) })).toHaveLength(0);
    expect(
      await db.query.activities.findMany({
        where: and(eq(activities.dealId, dealId), eq(activities.entityType, "payment")),
      }),
    ).toHaveLength(0);

    // API-05: a failed attempt must not permanently consume the key, so the
    // same key with a now-valid amount still goes through. If the claim had
    // survived the rollback this would fail on the payload fingerprint.
    const retried = await recordPayment({
      headers: new Headers({ cookie: ownerCookie }),
      input: paymentInput(invoice.id, { amount: "5000000", idempotencyKey: key }),
    });
    expect(retried.paidAmount).toBe("5000000");
  });

  it("returns not-found for an invoice in another organization (TENANT-04)", async () => {
    const orgA = await setupInvoice();
    const orgB = await setupInvoice();

    await expect(
      recordPayment({
        headers: new Headers({ cookie: orgB.ownerCookie }),
        input: paymentInput(orgA.invoice.id),
      }),
    ).rejects.toThrow(/not found/i);

    await expect(
      listPayments({ headers: new Headers({ cookie: orgB.ownerCookie }), invoiceId: orgA.invoice.id }),
    ).rejects.toThrow(/not found/i);
  });

  it("keeps an overdue invoice OVERDUE after a partial payment, then PAID once settled (INV-06)", async () => {
    const { ownerCookie, invoice } = await setupInvoice({
      issueDate: "2020-01-01",
      dueDate: "2020-01-31",
    });
    expect(invoice.status).toBe("OVERDUE");

    const partial = await recordPayment({
      headers: new Headers({ cookie: ownerCookie }),
      input: paymentInput(invoice.id, { amount: "10000000", paymentDate: "2020-02-05" }),
    });
    // INV-06: "Invoice overdue yang baru dibayar sebagian tetap OVERDUE".
    expect(partial.status).toBe("OVERDUE");
    expect(partial.remainingAmount).toBe("20000000");

    const settled = await recordPayment({
      headers: new Headers({ cookie: ownerCookie }),
      input: paymentInput(invoice.id, { amount: "20000000", paymentDate: "2020-02-10" }),
    });
    // INV-06: "Saat lunas langsung PAID", even though it was paid late.
    expect(settled.status).toBe("PAID");
  });

  it("lists an invoice's payment history in business-date order (INV-05)", async () => {
    const { ownerCookie, invoice } = await setupInvoice({ issueDate: daysFromTodayJakarta(-10) });
    await recordPayment({
      headers: new Headers({ cookie: ownerCookie }),
      input: paymentInput(invoice.id, { amount: "5000000", paymentDate: daysFromTodayJakarta(-2) }),
    });
    await recordPayment({
      headers: new Headers({ cookie: ownerCookie }),
      input: paymentInput(invoice.id, { amount: "7000000", paymentDate: daysFromTodayJakarta(-6) }),
    });

    const history = await listPayments({ headers: new Headers({ cookie: ownerCookie }), invoiceId: invoice.id });
    expect(history.items.map((p) => p.amount)).toEqual(["7000000", "5000000"]);
  });

  it("paginates listPayments: correct slice and totalItems (SEARCH-02)", async () => {
    const { ownerCookie, invoice } = await setupInvoice({ issueDate: daysFromTodayJakarta(-30) });
    for (let i = 0; i < 5; i++) {
      await recordPayment({
        headers: new Headers({ cookie: ownerCookie }),
        input: paymentInput(invoice.id, { amount: "1000000", paymentDate: daysFromTodayJakarta(-(20 - i)) }),
      });
    }

    const pageOne = await listPayments({ headers: new Headers({ cookie: ownerCookie }), invoiceId: invoice.id, page: 1, pageSize: 2 });
    expect(pageOne.items).toHaveLength(2);
    expect(pageOne.totalItems).toBe(5);
    expect(pageOne.totalPages).toBe(3);

    const pageThree = await listPayments({
      headers: new Headers({ cookie: ownerCookie }),
      invoiceId: invoice.id,
      page: 3,
      pageSize: 2,
    });
    expect(pageThree.items).toHaveLength(1);
  });
});
