import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type postgres from "postgres";
import { createCustomer } from "@/server/customers/customers";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";
import { createDeal, transitionDeal } from "@/server/deals/deals";
import { listRecentActivities } from "@/server/deals/deal-views";
import { zonedLocalToInstant } from "@/lib/format";
import { completeFollowUp, createFollowUp } from "@/server/follow-ups/follow-ups";
import { countTodayCustomers } from "@/server/follow-ups/follow-up-views";
import { createInvoice } from "@/server/invoices/invoices";
import { getReceivedThisMonth, listNearestDueInvoices, listRecentPayments } from "@/server/invoices/invoice-views";
import { recordPayment } from "@/server/invoices/payments";
import { organizationDateString } from "@/server/shared/organization-date";
import { addMember, migrateTestDatabase, setupOrganization, type TestOrg } from "@/server/testing/org-helpers";
import { getPipelineMetrics, getWonThisMonth } from "./dashboard";

const TZ = "Asia/Jakarta";
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe("dashboard metrics", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  async function newDeal(org: TestOrg, title: string, value: string, path: string[] = [], companyName = `PT ${title}`) {
    const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName, contactPerson: "X", phone: "08123456789" } });
    let deal = await createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title, estimatedValue: value, assignedToId: org.ownerUserId } });
    for (const toStatus of path) {
      deal = await transitionDeal({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { toStatus } });
    }
    return { customer, deal };
  }
  const WON = ["CONTACTED", "QUALIFIED", "QUOTATION", "NEGOTIATION", "WON"];

  it("sums the active pipeline by stage with exact bigint values and zeros for empty stages", async () => {
    const org = await setupOrganization();
    await newDeal(org, "A", "15000000");
    await newDeal(org, "B", "22750000", ["CONTACTED"]);
    await newDeal(org, "C", "48500000", ["CONTACTED", "QUALIFIED", "QUOTATION"]);
    await newDeal(org, "Menang", "99000000", WON);
    await newDeal(org, "Kalah", "77000000");

    const metrics = await getPipelineMetrics({ headers: org.ownerHeaders });
    expect(metrics.stages.map((stage) => [stage.status, stage.count, stage.value])).toEqual([
      ["NEW", 2, "92000000"],
      ["CONTACTED", 1, "22750000"],
      ["QUALIFIED", 0, "0"],
      ["QUOTATION", 1, "48500000"],
      ["NEGOTIATION", 0, "0"],
    ]);
    expect(metrics.totalCount).toBe(4);
    expect(metrics.totalValue).toBe("163250000");
  });

  it("counts won value by the organization's calendar month, half-open at local midnight", async () => {
    const org = await setupOrganization();
    const today = organizationDateString(TZ, new Date());
    const monthStart = `${today.slice(0, 7)}-01`;
    const startInstant = zonedLocalToInstant(`${monthStart}T00:00`, TZ);
    const a = await newDeal(org, "Awal bulan", "10000000", WON);
    const b = await newDeal(org, "Sebelum", "20000000", WON);
    const c = await newDeal(org, "Sekarang", "5000000", WON);
    await db.update(deals).set({ wonAt: startInstant }).where(eq(deals.id, a.deal.id));
    await db.update(deals).set({ wonAt: new Date(startInstant.getTime() - 1000) }).where(eq(deals.id, b.deal.id));

    const won = await getWonThisMonth({ headers: org.ownerHeaders });
    expect(won).toEqual({ count: 2, value: "15000000" });
    void c;
  });

  it("counts follow-up customers once however many tasks they have today", async () => {
    const org = await setupOrganization();
    const first = await newDeal(org, "Satu", "1000000");
    const second = await newDeal(org, "Dua", "1000000", [], "PT Lain");
    const today = organizationDateString(TZ, new Date());
    const at = (time: string) => zonedLocalToInstant(`${today}T${time}`, TZ).toISOString();
    for (const [deal, time] of [[first.deal, "09:00"], [first.deal, "10:00"], [second.deal, "11:00"]] as const) {
      await createFollowUp({ headers: org.ownerHeaders, input: { dealId: deal.id, type: "CALL", followUpAt: at(time) } });
    }
    const done = await createFollowUp({ headers: org.ownerHeaders, input: { dealId: second.deal.id, type: "CALL", followUpAt: at("12:00") } });
    await completeFollowUp({ headers: org.ownerHeaders, followUpId: done.id, expectedVersion: done.version, input: { completedAt: new Date(Date.now() - 60_000).toISOString() } });
    expect(await countTodayCustomers({ headers: org.ownerHeaders })).toBe(2);
  });

  it("feeds the finance widgets: nearest due, recent payments and money received this month", async () => {
    const org = await setupOrganization();
    const issue = async (title: string, dueDate: string) => {
      const { deal } = await newDeal(org, title, "30000000", WON);
      return createInvoice({ headers: org.ownerHeaders, input: { dealId: deal.id, issueDate: day(-10), dueDate, items: [{ description: "Paket", quantity: "1", unit: "paket", unitPrice: "30000000" }], idempotencyKey: crypto.randomUUID() } });
    };
    const late = await issue("Terlambat", day(-2));
    const soon = await issue("Segera", day(3));
    const settled = await issue("Lunas", day(1));
    const pay = (invoiceId: string, amount: string) =>
      recordPayment({ headers: org.ownerHeaders, input: { invoiceId, amount, paymentDate: day(0), paymentMethod: "CASH", idempotencyKey: crypto.randomUUID() } });
    await pay(settled.id, "30000000");
    await pay(soon.id, "10000000");

    const nearest = await listNearestDueInvoices({ headers: org.ownerHeaders });
    expect(nearest.map((invoice) => invoice.id)).toEqual([late.id, soon.id]);
    expect(nearest[0]).toMatchObject({ status: "OVERDUE", remainingAmount: "30000000" });
    expect(nearest[1]).toMatchObject({ status: "PARTIALLY_PAID", remainingAmount: "20000000" });

    const payments = await listRecentPayments({ headers: org.ownerHeaders });
    expect(payments).toHaveLength(2);
    expect(payments[0]).toMatchObject({ paymentMethod: "CASH" });
    const received = await getReceivedThisMonth({ headers: org.ownerHeaders });
    // Both payments are dated today, so unless today is the first of a month the whole 40M counts.
    expect(received).toEqual({ total: "40000000", count: 2 });
  });

  it("filters the team feed by role", async () => {
    const org = await setupOrganization();
    const sales = await addMember(org, "SALES", "Andi");
    const finance = await addMember(org, "FINANCE", "Dewi");
    const { deal } = await newDeal(org, "Menang", "30000000", WON);
    await createInvoice({ headers: org.ownerHeaders, input: { dealId: deal.id, dueDate: day(10), items: [{ description: "Paket", quantity: "1", unit: "paket", unitPrice: "30000000" }], idempotencyKey: crypto.randomUUID() } });

    const kinds = async (headers: Headers) => (await listRecentActivities({ headers, limit: 20 })).map((event) => `${event.entityType}.${event.eventType}`);
    expect(await kinds(org.ownerHeaders)).toContain("invoice.created");
    expect(await kinds(sales.headers)).not.toContain("invoice.created");
    expect((await kinds(finance.headers)).sort()).toEqual(["deal.won", "invoice.created"]);
    const feed = await listRecentActivities({ headers: org.ownerHeaders, limit: 2 });
    expect(feed).toHaveLength(2);
    expect(feed[0]).toMatchObject({ dealTitle: "Menang", customerName: "PT Menang" });
  });
});
