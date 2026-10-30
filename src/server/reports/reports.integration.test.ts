import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type postgres from "postgres";
import { createCustomer } from "@/server/customers/customers";
import { db } from "@/server/db/client";
import { billingItems, deals, invoices, outboxEvents, settlements } from "@/server/db/schema";
import { createDeal, transitionDeal } from "@/server/deals/deals";
import { createInvoice, voidInvoice } from "@/server/invoices/invoices";
import { recordPayment } from "@/server/invoices/payments";
import { amendOrder, cancelOrder, confirmWon, createDirectOrder } from "@/server/orders/orders";
import { allocateReceipt, recordReceipt, recordRefund, settleInvoice } from "@/server/receipts/receipts";
import { orgDay } from "@/server/testing/dates";
import { addMember, migrateTestDatabase, setupOrganization, type TestOrg } from "@/server/testing/org-helpers";
import { exportCsv, getReportSummary } from "./reports";
import { runReconcile } from "./reconcile";

const key = () => crypto.randomUUID();

describe("report figures, exports and reconcile (§11.1, OPS)", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  const wide = { from: orgDay(-400), to: orgDay(0) };
  const customerFor = (org: TestOrg, name: string) => createCustomer({ headers: org.ownerHeaders, input: { companyName: name, contactPerson: "Budi", phone: "08123456789" } });

  async function invoiceFor(org: TestOrg, amount: string, issue: number, due: number, name = "PT Pelanggan") {
    const customer = await customerFor(org, name);
    const order = await createDirectOrder({ headers: org.ownerHeaders, input: { customerId: customer.id, title: `Pesanan ${amount}`, commitmentType: "PURCHASE_ORDER", value: amount, commitmentDate: orgDay(issue) } });
    const invoice = await createInvoice({
      headers: org.ownerHeaders,
      input: { billingItemId: order.billingItems[0]!.id, issueDate: orgDay(issue), dueDate: orgDay(due), items: [{ description: "Jasa", quantity: "1", unit: "paket", unitPrice: amount }], idempotencyKey: key() },
    });
    return { customer, order, invoice };
  }

  describe("getReportSummary", () => {
    it("computes bookings, billing, cash, ready-to-bill, outstanding, credit and aging with one definition each", async () => {
      const org = await setupOrganization();
      // A won deal of 100M, extended by 10M today.
      const customer = await customerFor(org, "PT Menang");
      const deal = await createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "Proyek", estimatedValue: "100000000", assignedToId: org.ownerUserId, stage: "COMMITMENT" } });
      const { order } = await confirmWon({
        headers: org.ownerHeaders,
        dealId: deal.id,
        expectedVersion: deal.version,
        input: { commitmentType: "CONTRACT", billingItems: [{ label: "DP", amount: "30000000" }, { label: "Retensi 5%", amount: "70000000", trigger: "ON_MILESTONE", isRetention: true }] },
      });
      await amendOrder({ headers: org.ownerHeaders, orderId: order.id, input: { delta: "10000000", reason: "Tambah" } });
      // An order of 20M a year ago (outside the default month) and a cancelled one, which counts nowhere.
      await createDirectOrder({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "Lama", commitmentType: "PAYMENT", value: "20000000", commitmentDate: orgDay(-200) } });
      const cancelled = await createDirectOrder({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "Batal", commitmentType: "PAYMENT", value: "9000000" } });
      await cancelOrder({ headers: org.ownerHeaders, orderId: cancelled.id, input: { reason: "Batal" } });

      const month = await getReportSummary({ headers: org.ownerHeaders });
      expect(month.period.to).toBe(orgDay(0));
      // 100M order + 10M amendment; the 20M order is another month, the 9M order is cancelled.
      expect(month.bookings).toEqual({ total: "110000000", orders: 1 });
      expect((await getReportSummary({ headers: org.ownerHeaders, range: wide })).bookings).toEqual({ total: "130000000", orders: 2 });

      // Ready to bill: the DP (30M), the 10M top-up item and the 20M old order are ON_ORDER; the retention (70M) waits for its milestone and is held.
      expect(month.readyToBill).toEqual({ total: "60000000", items: 3, retentionHeld: "70000000" });
    });

    it("reports outstanding and aging per bucket, and leaves out paid, void and settled-by-write-off amounts", async () => {
      const org = await setupOrganization();
      const notDue = await invoiceFor(org, "1000000", -3, 25, "A");
      const late5 = await invoiceFor(org, "2000000", -40, -5, "B");
      const late45 = await invoiceFor(org, "3000000", -80, -45, "C");
      const late75 = await invoiceFor(org, "4000000", -120, -75, "D");
      const late100 = await invoiceFor(org, "5000000", -150, -100, "E");
      const voided = await invoiceFor(org, "9000000", -50, -20, "F");
      const paid = await invoiceFor(org, "8000000", -60, -30, "G");
      await voidInvoice({ headers: org.ownerHeaders, invoiceId: voided.invoice.id, input: { reason: "Salah" } });
      await recordPayment({ headers: org.ownerHeaders, input: { invoiceId: paid.invoice.id, amount: "8000000", paymentDate: orgDay(-1), paymentMethod: "CASH", idempotencyKey: key() } });
      await recordPayment({ headers: org.ownerHeaders, input: { invoiceId: late45.invoice.id, amount: "1000000", paymentDate: orgDay(-1), paymentMethod: "CASH", idempotencyKey: key() } });
      await settleInvoice({ headers: org.ownerHeaders, invoiceId: late5.invoice.id, input: { kind: "WRITE_OFF", amount: "10000", note: "Biaya transfer", idempotencyKey: key() } });
      void notDue;
      void late75;
      void late100;

      const report = await getReportSummary({ headers: org.ownerHeaders, range: wide });
      expect(report.aging).toEqual([
        { bucket: "NOT_DUE", invoices: 1, amount: "1000000" },
        { bucket: "1_30", invoices: 1, amount: "1990000" },
        { bucket: "31_60", invoices: 1, amount: "2000000" },
        { bucket: "61_90", invoices: 1, amount: "4000000" },
        { bucket: "OVER_90", invoices: 1, amount: "5000000" },
      ]);
      expect(report.outstanding).toEqual({ total: "13990000", invoices: 5 });
      // Billed excludes the voided invoice.
      expect(report.billed).toEqual({ total: String(1_000_000 + 2_000_000 + 3_000_000 + 4_000_000 + 5_000_000 + 8_000_000), invoices: 6 });
    });

    it("counts cash as receipts minus refunds, not withholding or write-offs, and credit as what is left", async () => {
      const org = await setupOrganization();
      const { customer, invoice } = await invoiceFor(org, "10000000", -10, 20);
      const receipt = await recordReceipt({ headers: org.ownerHeaders, input: { amount: "9800000", receivedOn: orgDay(-2), method: "BANK_TRANSFER", customerId: customer.id, idempotencyKey: key() } });
      await allocateReceipt({ headers: org.ownerHeaders, receiptId: receipt.id, input: { allocations: [{ invoiceId: invoice.id, amount: "9000000" }], idempotencyKey: key() } });
      await settleInvoice({ headers: org.ownerHeaders, invoiceId: invoice.id, input: { kind: "WITHHOLDING", amount: "200000", reference: "BP-1", idempotencyKey: key() } });
      await recordRefund({ headers: org.ownerHeaders, receiptId: receipt.id, input: { amount: "300000", refundedOn: orgDay(-1), reason: "Kelebihan", idempotencyKey: key() } });
      await recordReceipt({ headers: org.ownerHeaders, input: { amount: "1000000", receivedOn: orgDay(-400) , method: "CASH", idempotencyKey: key() } });

      const report = await getReportSummary({ headers: org.ownerHeaders, range: { from: orgDay(-5), to: orgDay(0) } });
      expect(report.cashReceived).toEqual({ total: String(9_800_000 - 300_000), receipts: 1 });
      expect(report.customerCredit).toEqual({ total: "500000", receipts: 1 });
      expect((await getReportSummary({ headers: org.ownerHeaders, range: wide })).outstanding!.total).toBe("800000");
    });

    it("computes the win rate and the median days to win from closing dates", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org, "PT Hasil");
      const open = () => createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "Deal", estimatedValue: "1000000", assignedToId: org.ownerUserId } });
      for (const index of [1, 2]) {
        const deal = await open();
        await confirmWon({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { commitmentType: "PURCHASE_ORDER" } });
        await db.update(deals).set({ createdAt: new Date(Date.now() - index * 10 * 86_400_000) }).where(eq(deals.id, deal.id));
      }
      const lost = await open();
      await transitionDeal({ headers: org.ownerHeaders, dealId: lost.id, expectedVersion: lost.version, input: { toStatus: "LOST", lostReason: "NO_NEED" } });

      const report = await getReportSummary({ headers: org.ownerHeaders });
      expect(report.winRate).toMatchObject({ won: 2, lost: 1 });
      expect(report.winRate!.rate).toBeCloseTo(2 / 3);
      expect(report.winRate!.medianDaysToWin).toBe(15);
      expect((await getReportSummary({ headers: (await setupOrganization()).ownerHeaders })).winRate).toEqual({ won: 0, lost: 0, rate: null, medianDaysToWin: null });
    });

    it("shows each role only its figures", async () => {
      const org = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const finance = await addMember(org, "FINANCE", "Dewi");
      const forSales = await getReportSummary({ headers: sales.headers });
      expect(forSales.bookings).not.toBeNull();
      expect(forSales.winRate).not.toBeNull();
      expect([forSales.billed, forSales.cashReceived, forSales.aging, forSales.outstanding, forSales.customerCredit, forSales.readyToBill]).toEqual([null, null, null, null, null, null]);
      const forFinance = await getReportSummary({ headers: finance.headers });
      expect(forFinance.bookings).not.toBeNull();
      expect(forFinance.aging).not.toBeNull();
      expect(forFinance.winRate).toBeNull();
    });

    it("rejects an inverted or malformed range and stays inside the organization", async () => {
      const org = await setupOrganization();
      await invoiceFor(org, "1000000", -3, 25);
      await expect(getReportSummary({ headers: org.ownerHeaders, range: { from: orgDay(0), to: orgDay(-5) } })).rejects.toThrow(/Invalid date range/);
      await expect(getReportSummary({ headers: org.ownerHeaders, range: { from: "kemarin" } })).rejects.toThrow();
      const other = await getReportSummary({ headers: (await setupOrganization()).ownerHeaders, range: wide });
      expect(other.billed).toEqual({ total: "0", invoices: 0 });
      expect(other.outstanding).toEqual({ total: "0", invoices: 0 });
    });
  });

  describe("exportCsv", () => {
    it("exports the invoices of a period with their settled amount, defusing formula-looking names", async () => {
      const org = await setupOrganization();
      const { invoice } = await invoiceFor(org, "2500000", -3, 25, "=HYPERLINK(\"x\")");
      await recordPayment({ headers: org.ownerHeaders, input: { invoiceId: invoice.id, amount: "1000000", paymentDate: orgDay(-1), paymentMethod: "CASH", idempotencyKey: key() } });

      const csv = await exportCsv({ headers: org.ownerHeaders, kind: "invoices", range: wide });
      expect(csv.filename).toBe(`invoices-${wide.from}-${wide.to}.csv`);
      const lines = csv.content.replace("﻿", "").trim().split("\r\n");
      expect(lines[0]).toBe("Invoice,Customer,Pesanan,Tanggal terbit,Jatuh tempo,Total,Terselesaikan,Status");
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain(invoice.invoiceNumber);
      expect(lines[1]).toContain("2500000,1000000,LIVE");
      expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    });

    it("exports receipts and orders, and refuses what the role may not read or an unknown kind", async () => {
      const org = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const { customer } = await invoiceFor(org, "1000000", -2, 10);
      await recordReceipt({ headers: org.ownerHeaders, input: { amount: "500000", receivedOn: orgDay(-1), method: "BANK_TRANSFER", reference: "TRF-9", customerId: customer.id, idempotencyKey: key() } });

      expect((await exportCsv({ headers: org.ownerHeaders, kind: "receipts", range: wide })).content).toContain("TRF-9");
      const orders = await exportCsv({ headers: sales.headers, kind: "orders", range: wide });
      expect(orders.content).toContain("PURCHASE_ORDER");
      await expect(exportCsv({ headers: sales.headers, kind: "invoices", range: wide })).rejects.toThrow();
      await expect(exportCsv({ headers: sales.headers, kind: "receipts", range: wide })).rejects.toThrow();
      await expect(exportCsv({ headers: org.ownerHeaders, kind: "everything", range: wide })).rejects.toThrow(/Unknown export/);
    });
  });

  describe("runReconcile", () => {
    class Rollback extends Error {}
    /** Breaks the data the way a bug or a hand-run UPDATE would, looks, and rolls the damage back. */
    async function withDamage(org: TestOrg, damage: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<void>) {
      let found: Awaited<ReturnType<typeof runReconcile>> = [];
      await db
        .transaction(async (tx) => {
          await damage(tx);
          found = await runReconcile(tx, { organizationId: org.organizationId });
          throw new Rollback();
        })
        .catch((error) => {
          if (!(error instanceof Rollback)) throw error;
        });
      return found;
    }

    it("finds nothing in data the services produced, including every kind of correction", async () => {
      const org = await setupOrganization();
      const { customer, invoice, order } = await invoiceFor(org, "10000000", -10, 20);
      await recordPayment({ headers: org.ownerHeaders, input: { invoiceId: invoice.id, amount: "4000000", paymentDate: orgDay(-1), paymentMethod: "CASH", idempotencyKey: key() } });
      await settleInvoice({ headers: org.ownerHeaders, invoiceId: invoice.id, input: { kind: "WITHHOLDING", amount: "200000", reference: "BP", idempotencyKey: key() } });
      const receipt = await recordReceipt({ headers: org.ownerHeaders, input: { amount: "3000000", receivedOn: orgDay(-1), method: "CASH", customerId: customer.id, idempotencyKey: key() } });
      await recordRefund({ headers: org.ownerHeaders, receiptId: receipt.id, input: { amount: "1000000", refundedOn: orgDay(0), reason: "Salah", idempotencyKey: key() } });
      await amendOrder({ headers: org.ownerHeaders, orderId: order.id, input: { delta: "5000000", reason: "Tambah" } });
      const second = await invoiceFor(org, "1000000", -5, 5, "PT Lain");
      await voidInvoice({ headers: org.ownerHeaders, invoiceId: second.invoice.id, input: { reason: "Salah" } });

      expect(await runReconcile(db, { organizationId: org.organizationId })).toEqual([]);
    });

    it("catches a plan that no longer adds up, an invoice that differs from its item, and double invoices", async () => {
      const org = await setupOrganization();
      const { invoice, order } = await invoiceFor(org, "10000000", -10, 20);
      const found = await withDamage(org, async (tx) => {
        await tx.update(billingItems).set({ amount: 9_000_000n }).where(eq(billingItems.id, order.billingItems[0]!.id));
        // The unique index would stop a second live invoice; dropping the void marker simulates one slipping in.
        await tx.execute(sql`drop index "invoices_billingItemId_live_uidx"`);
        await tx.insert(invoices).values({ ...(await tx.query.invoices.findFirst({ where: eq(invoices.id, invoice.id) }))!, id: crypto.randomUUID(), invoiceNumber: "INV-COPY-1" });
      });
      expect(found.map((finding) => finding.check).sort()).toEqual(["live_invoice_equals_item", "one_live_invoice_per_item", "order_plan_matches_value"]);
      expect(found.every((finding) => finding.severity === "error" && finding.organizationId === org.organizationId)).toBe(true);
    });

    it("catches over-settled invoices, over-allocated receipts, cross-customer settlements and a settlement on a void invoice", async () => {
      const org = await setupOrganization();
      const mine = await invoiceFor(org, "5000000", -10, 20, "PT Saya");
      const theirs = await invoiceFor(org, "5000000", -10, 20, "PT Mereka");
      const receipt = await recordReceipt({ headers: org.ownerHeaders, input: { amount: "1000000", receivedOn: orgDay(-1), method: "CASH", customerId: mine.customer.id, idempotencyKey: key() } });
      const found = await withDamage(org, async (tx) => {
        const base = { organizationId: org.organizationId, kind: "RECEIPT", receiptId: receipt.id, settledOn: orgDay(-1), createdById: org.ownerUserId };
        // 2M of a 1M receipt, onto the other customer's invoice, and 6M onto a 5M invoice.
        await tx.insert(settlements).values({ ...base, invoiceId: theirs.invoice.id, amount: 2_000_000n });
        await tx.insert(settlements).values({ ...base, invoiceId: mine.invoice.id, amount: 6_000_000n });
      });
      const names = found.map((finding) => finding.check);
      expect(names).toEqual(expect.arrayContaining(["invoice_not_over_settled", "receipt_not_over_allocated", "settlement_same_customer"]));
    });

    it("warns about a won deal without an order and about mail that gave up, without failing", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org, "PT Lama");
      const deal = await createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "Lama", estimatedValue: "1000000", assignedToId: org.ownerUserId } });
      const found = await withDamage(org, async (tx) => {
        await tx.update(deals).set({ status: "WON", wonAt: new Date(), wonValue: 1_000_000n }).where(eq(deals.id, deal.id));
        await tx.insert(outboxEvents).values({ organizationId: org.organizationId, type: "x", payload: {}, dedupeKey: key(), status: "DEAD" });
      });
      expect(found.map((finding) => [finding.check, finding.severity]).sort()).toEqual([
        ["outbox_dead", "warning"],
        ["won_deal_has_order", "warning"],
      ]);
    });

    it("finds an open task on a closed deal", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org, "PT Task");
      const deal = await createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "T", estimatedValue: "1000000", assignedToId: org.ownerUserId } });
      const { createFollowUp } = await import("@/server/follow-ups/follow-ups");
      await createFollowUp({ headers: org.ownerHeaders, input: { dealId: deal.id, type: "CALL", followUpAt: new Date(Date.now() + 86_400_000).toISOString() } });
      const found = await withDamage(org, async (tx) => {
        await tx.update(deals).set({ status: "LOST", lostAt: new Date(), lostReason: "OTHER" }).where(eq(deals.id, deal.id));
      });
      expect(found.map((finding) => finding.check)).toEqual(["no_open_task_on_closed_deal"]);
    });
  });
});
