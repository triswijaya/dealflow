import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type postgres from "postgres";
import { createContact } from "@/server/customers/contacts";
import { createCustomer } from "@/server/customers/customers";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";
import { createDeal } from "@/server/deals/deals";
import { createFollowUp } from "@/server/follow-ups/follow-ups";
import { createInvoice, voidInvoice } from "@/server/invoices/invoices";
import { recordPayment } from "@/server/invoices/payments";
import { createDirectOrder } from "@/server/orders/orders";
import { orgDay } from "@/server/testing/dates";
import { addMember, migrateTestDatabase, setupOrganization, type TestOrg } from "@/server/testing/org-helpers";
import { putDealOnHold } from "@/server/deals/deals";
import { recordReceipt } from "@/server/receipts/receipts";
import {
  buildCollectionWhatsAppMessage,
  cancelCollectionTask,
  cancelDealTask,
  completeCollectionTask,
  createCollectionTask,
  getWorkQueues,
  listCollectionTasks,
  updateCollectionTask,
} from "./collections";

describe("collection tasks, work queues and WhatsApp collection (FUP, TASK-01, WA-04)", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  const key = () => crypto.randomUUID();
  const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

  async function invoiceFor(org: TestOrg, amount: string, schedule: { issue: number; due: number }, customerName = "PT Tagih") {
    const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: customerName, contactPerson: "Budi Keuangan", phone: "08123456789" } });
    const order = await createDirectOrder({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "Pesanan", commitmentType: "PURCHASE_ORDER", value: amount } });
    const invoice = await createInvoice({
      headers: org.ownerHeaders,
      input: { billingItemId: order.billingItems[0]!.id, issueDate: orgDay(schedule.issue), dueDate: orgDay(schedule.due), items: [{ description: "Jasa", quantity: "1", unit: "paket", unitPrice: amount }], idempotencyKey: key() },
    });
    return { customer, order, invoice };
  }
  const task = (org: TestOrg, invoiceId: string, overrides: Record<string, unknown> = {}) =>
    createCollectionTask({ headers: org.ownerHeaders, input: { invoiceId, type: "CALL", followUpAt: at(1), ...overrides } });

  describe("collection tasks", () => {
    it("lets Finance create, reschedule, complete and cancel a task on an invoice", async () => {
      const org = await setupOrganization();
      const finance = await addMember(org, "FINANCE", "Dewi");
      const { invoice } = await invoiceFor(org, "5000000", { issue: -10, due: 20 });

      const created = await createCollectionTask({ headers: finance.headers, input: { invoiceId: invoice.id, type: "WHATSAPP", note: "Ingatkan", followUpAt: at(2) } });
      expect(created).toMatchObject({ invoiceId: invoice.id, dealId: null, type: "WHATSAPP", completedAt: null });

      const moved = await updateCollectionTask({ headers: finance.headers, followUpId: created.id, expectedVersion: created.version, input: { note: "Ingatkan lagi", followUpAt: at(5) } });
      expect(moved).toMatchObject({ note: "Ingatkan lagi", version: 2 });
      await expect(updateCollectionTask({ headers: finance.headers, followUpId: created.id, expectedVersion: 1, input: { followUpAt: at(6) } })).rejects.toThrow(/modified by someone else/);

      const done = await completeCollectionTask({ headers: finance.headers, followUpId: created.id, expectedVersion: moved.version });
      expect(done.completedAt).not.toBeNull();
      const again = await completeCollectionTask({ headers: finance.headers, followUpId: created.id, expectedVersion: 99 });
      expect(again.completedAt).toBe(done.completedAt);
      await expect(cancelCollectionTask({ headers: finance.headers, followUpId: created.id, input: { reason: "x" } })).rejects.toThrow(/completed/);

      const other = await task(org, invoice.id);
      const cancelled = await cancelCollectionTask({ headers: finance.headers, followUpId: other.id, input: { reason: "Sudah dibayar" } });
      expect(cancelled.id).toBe(other.id);
      await expect(completeCollectionTask({ headers: finance.headers, followUpId: other.id, expectedVersion: 99 })).rejects.toThrow(/cancelled/);
      expect((await listCollectionTasks({ headers: finance.headers, invoiceId: invoice.id })).map((item) => item.id)).toEqual([created.id, other.id]);
    });

    it("makes a promise to pay only on an invoice, and refuses to log one as already done", async () => {
      const org = await setupOrganization();
      const { invoice } = await invoiceFor(org, "5000000", { issue: -10, due: 20 });
      const promise = await task(org, invoice.id, { type: "PROMISE_TO_PAY", followUpAt: at(3) });
      expect(promise.type).toBe("PROMISE_TO_PAY");
      await expect(task(org, invoice.id, { type: "PROMISE_TO_PAY", completedAt: new Date().toISOString() })).rejects.toThrow(/already done/);

      const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Deal", phone: "08123456789" } });
      const deal = await createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "X", estimatedValue: "1000000", assignedToId: org.ownerUserId } });
      await expect(createFollowUp({ headers: org.ownerHeaders, input: { dealId: deal.id, type: "PROMISE_TO_PAY", followUpAt: at(1) } })).rejects.toThrow();
    });

    it("refuses a task on a void or fully paid invoice and an unknown one", async () => {
      const org = await setupOrganization();
      const paid = await invoiceFor(org, "1000000", { issue: -5, due: 10 });
      await recordPayment({ headers: org.ownerHeaders, input: { invoiceId: paid.invoice.id, amount: "1000000", paymentDate: orgDay(-1), paymentMethod: "CASH", idempotencyKey: key() } });
      const voided = await invoiceFor(org, "1000000", { issue: -5, due: 10 }, "PT Void");
      await voidInvoice({ headers: org.ownerHeaders, invoiceId: voided.invoice.id, input: { reason: "Salah" } });

      await expect(task(org, paid.invoice.id)).rejects.toThrow(/already paid/);
      await expect(task(org, voided.invoice.id)).rejects.toThrow(/void/);
      await expect(task(org, crypto.randomUUID())).rejects.toThrow(/not found/i);
    });

    it("lets Sales read but not write, keeps other organizations out, and does not mix with deal tasks", async () => {
      const org = await setupOrganization();
      const other = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const { invoice } = await invoiceFor(org, "2000000", { issue: -5, due: 10 });
      const created = await task(org, invoice.id);

      await expect(createCollectionTask({ headers: sales.headers, input: { invoiceId: invoice.id, type: "CALL", followUpAt: at(1) } })).rejects.toThrow();
      expect(await listCollectionTasks({ headers: sales.headers, invoiceId: invoice.id })).toHaveLength(1);
      await expect(listCollectionTasks({ headers: other.ownerHeaders, invoiceId: invoice.id })).rejects.toThrow(/not found/i);
      await expect(completeCollectionTask({ headers: other.ownerHeaders, followUpId: created.id, expectedVersion: 1 })).rejects.toThrow(/not found/i);
    });

    it("cancels a sales task with a reason, once", async () => {
      const org = await setupOrganization();
      const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Deal", phone: "08123456789" } });
      const deal = await createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "X", estimatedValue: "1000000", assignedToId: org.ownerUserId } });
      const followUp = await createFollowUp({ headers: org.ownerHeaders, input: { dealId: deal.id, type: "CALL", followUpAt: at(1) } });
      const cancelled = await cancelDealTask({ headers: org.ownerHeaders, followUpId: followUp.id, input: { reason: "Customer sudah menelepon" } });
      expect(cancelled.id).toBe(followUp.id);
      await cancelDealTask({ headers: org.ownerHeaders, followUpId: followUp.id, input: { reason: "Lagi" } });
      const { invoice } = await invoiceFor(org, "1000000", { issue: -1, due: 10 }, "PT Lain");
      const invoiceTask = await task(org, invoice.id);
      await expect(cancelDealTask({ headers: org.ownerHeaders, followUpId: invoiceTask.id, input: {} })).rejects.toThrow(/not found/i);
    });
  });

  describe("work queues (TASK-01)", () => {
    it("lists invoices to chase: overdue and due soon without a task, not those already being worked, not paid, not void", async () => {
      const org = await setupOrganization();
      const overdue = await invoiceFor(org, "1000000", { issue: -40, due: -10 }, "PT Telat");
      const soon = await invoiceFor(org, "2000000", { issue: -20, due: 5 }, "PT Segera");
      const later = await invoiceFor(org, "3000000", { issue: -2, due: 30 }, "PT Nanti");
      const worked = await invoiceFor(org, "4000000", { issue: -40, due: -8 }, "PT Digarap");
      const paid = await invoiceFor(org, "5000000", { issue: -40, due: -8 }, "PT Lunas");
      const voided = await invoiceFor(org, "6000000", { issue: -40, due: -8 }, "PT Void");
      await task(org, worked.invoice.id);
      await recordPayment({ headers: org.ownerHeaders, input: { invoiceId: paid.invoice.id, amount: "5000000", paymentDate: orgDay(-1), paymentMethod: "CASH", idempotencyKey: key() } });
      await voidInvoice({ headers: org.ownerHeaders, invoiceId: voided.invoice.id, input: { reason: "Salah" } });

      const queues = await getWorkQueues({ headers: org.ownerHeaders });
      expect(queues.collection!.items.map((item) => [item.invoiceId, item.reason])).toEqual([
        [overdue.invoice.id, "OVERDUE"],
        [soon.invoice.id, "DUE_SOON"],
      ]);
      expect(queues.collection!.items.map((item) => item.invoiceId)).not.toContain(later.invoice.id);
      expect(queues.collection!.count).toBe(2);

      // Working the invoice removes it from the queue; nothing else does.
      await task(org, overdue.invoice.id);
      expect((await getWorkQueues({ headers: org.ownerHeaders })).collection!.items.map((item) => item.invoiceId)).toEqual([soon.invoice.id]);
    });

    it("shows a broken promise to pay even while a task is open, and stops when the promise is completed or kept", async () => {
      const org = await setupOrganization();
      const { invoice } = await invoiceFor(org, "8000000", { issue: -30, due: -5 });
      const promise = await task(org, invoice.id, { type: "PROMISE_TO_PAY", followUpAt: at(-3) });

      const first = (await getWorkQueues({ headers: org.ownerHeaders })).collection!;
      expect(first.items).toHaveLength(1);
      expect(first.items[0]).toMatchObject({ invoiceId: invoice.id, reason: "PROMISE_BROKEN", remaining: "8000000" });
      expect(first.items[0]!.promisedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      await completeCollectionTask({ headers: org.ownerHeaders, followUpId: promise.id, expectedVersion: promise.version });
      expect((await getWorkQueues({ headers: org.ownerHeaders })).collection!.items.map((item) => [item.invoiceId, item.reason])).toEqual([[invoice.id, "OVERDUE"]]);
    });

    it("does not treat a promise for tomorrow as broken", async () => {
      const org = await setupOrganization();
      const { invoice } = await invoiceFor(org, "8000000", { issue: -30, due: -5 });
      await task(org, invoice.id, { type: "PROMISE_TO_PAY", followUpAt: at(2) });
      expect((await getWorkQueues({ headers: org.ownerHeaders })).collection!.count).toBe(0);
      void invoice;
    });

    it("lists ready billing items, unallocated money and deals due for review, per role", async () => {
      const org = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const finance = await addMember(org, "FINANCE", "Dewi");
      await createDirectOrder({
        headers: org.ownerHeaders,
        input: {
          customerId: (await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Siap", phone: "08123456789" } })).id,
          title: "Siap",
          commitmentType: "CONTRACT",
          value: "10000000",
          billingItems: [
            { label: "DP", amount: "4000000", trigger: "ON_ORDER" },
            { label: "BAST", amount: "6000000", trigger: "ON_MILESTONE" },
          ],
        },
      });
      await recordReceipt({ headers: org.ownerHeaders, input: { amount: "750000", receivedOn: orgDay(-1), method: "BANK_TRANSFER", idempotencyKey: key() } });
      const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Tahan", phone: "08123456789" } });
      const deal = await createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "Ditahan", estimatedValue: "1000000", assignedToId: org.ownerUserId } });
      await putDealOnHold({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { reason: "Tunggu", reviewDate: orgDay(3) } });
      expect((await getWorkQueues({ headers: org.ownerHeaders })).reviewDue!.count).toBe(0);
      await db.update(deals).set({ onHoldUntil: orgDay(0) }).where(eq(deals.id, deal.id));

      const owner = await getWorkQueues({ headers: org.ownerHeaders });
      expect(owner.readyToBill).toMatchObject({ count: 1, total: "4000000" });
      expect(owner.readyToBill!.items[0]).toMatchObject({ label: "DP", amount: "4000000", customerName: "PT Siap" });
      expect(owner.unallocatedMoney).toMatchObject({ count: 1, total: "750000" });
      expect(owner.unallocatedMoney!.items[0]).toMatchObject({ customerName: null, available: "750000" });
      expect(owner.reviewDue!.items.map((item) => item.dealId)).toEqual([deal.id]);

      const forFinance = await getWorkQueues({ headers: finance.headers });
      expect(forFinance.reviewDue).toBeNull();
      expect(forFinance.readyToBill!.count).toBe(1);
      const forSales = await getWorkQueues({ headers: sales.headers });
      expect(forSales).toMatchObject({ readyToBill: null, collection: null, unallocatedMoney: null });
      expect(forSales.reviewDue!.count).toBe(1);
    });

    it("keeps one organization's queues out of another's", async () => {
      const orgA = await setupOrganization();
      const orgB = await setupOrganization();
      await invoiceFor(orgA, "1000000", { issue: -40, due: -10 });
      const queues = await getWorkQueues({ headers: orgB.ownerHeaders });
      expect(queues.collection!.count).toBe(0);
      expect(queues.readyToBill!.count).toBe(0);
    });
  });

  describe("WhatsApp from an invoice (WA-04)", () => {
    it("writes the reminder to the order's contact, with the remaining amount and the due date", async () => {
      const org = await setupOrganization();
      const finance = await addMember(org, "FINANCE", "Dewi");
      const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Tagih", contactPerson: "Budi", phone: "08123456789" } });
      const accountant = await createContact({ headers: org.ownerHeaders, customerId: customer.id, input: { name: "Ibu Sari", role: "Finance", phone: "0877 1234 5678" } });
      const order = await createDirectOrder({ headers: org.ownerHeaders, input: { customerId: customer.id, contactId: accountant.id, title: "Pesanan", commitmentType: "PURCHASE_ORDER", value: "10000000" } });
      const invoice = await createInvoice({
        headers: org.ownerHeaders,
        input: { billingItemId: order.billingItems[0]!.id, issueDate: orgDay(-30), dueDate: orgDay(-5), items: [{ description: "Jasa", quantity: "1", unit: "paket", unitPrice: "10000000" }], idempotencyKey: key() },
      });
      await recordPayment({ headers: org.ownerHeaders, input: { invoiceId: invoice.id, amount: "4000000", paymentDate: orgDay(-3), paymentMethod: "CASH", idempotencyKey: key() } });

      const built = await buildCollectionWhatsAppMessage({ headers: finance.headers, invoiceId: invoice.id });
      expect(built).toMatchObject({ contactName: "Ibu Sari", phoneInternational: "6287712345678" });
      expect(built.message).toContain(invoice.invoiceNumber);
      expect(built.message).toContain("Rp6.000.000");
      expect(built.message).toContain("mengingatkan");
      expect(built.deepLink.startsWith("https://wa.me/6287712345678?text=")).toBe(true);
    });

    it("refuses Sales, a paid or void invoice, a contact without a phone, and another organization", async () => {
      const org = await setupOrganization();
      const other = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const { invoice } = await invoiceFor(org, "1000000", { issue: -5, due: 10 });
      await expect(buildCollectionWhatsAppMessage({ headers: sales.headers, invoiceId: invoice.id })).rejects.toThrow();
      await expect(buildCollectionWhatsAppMessage({ headers: other.ownerHeaders, invoiceId: invoice.id })).rejects.toThrow(/not found/i);

      await recordPayment({ headers: org.ownerHeaders, input: { invoiceId: invoice.id, amount: "1000000", paymentDate: orgDay(-1), paymentMethod: "CASH", idempotencyKey: key() } });
      await expect(buildCollectionWhatsAppMessage({ headers: org.ownerHeaders, invoiceId: invoice.id })).rejects.toThrow(/already paid/);

      const emailOnly = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Surel", contactPerson: "Sari", email: "sari@surel.example" } });
      const order = await createDirectOrder({ headers: org.ownerHeaders, input: { customerId: emailOnly.id, title: "P", commitmentType: "PAYMENT", value: "2000000" } });
      const noPhone = await createInvoice({
        headers: org.ownerHeaders,
        input: { billingItemId: order.billingItems[0]!.id, issueDate: orgDay(-5), dueDate: orgDay(10), items: [{ description: "J", quantity: "1", unit: "paket", unitPrice: "2000000" }], idempotencyKey: key() },
      });
      await expect(buildCollectionWhatsAppMessage({ headers: org.ownerHeaders, invoiceId: noPhone.id })).rejects.toThrow(/no phone number/);
    });
  });
});
