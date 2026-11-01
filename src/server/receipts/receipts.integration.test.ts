import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type postgres from "postgres";
import { createCustomer } from "@/server/customers/customers";
import { db } from "@/server/db/client";
import { auditEvents, invoices, orders, organizationSettings, receipts, settlements } from "@/server/db/schema";
import { getInvoiceDetail, getReceivedThisMonth } from "@/server/invoices/invoice-views";
import { createInvoice, getInvoice } from "@/server/invoices/invoices";
import { recordPayment } from "@/server/invoices/payments";
import { createDirectOrder } from "@/server/orders/orders";
import { createDirectOrderWithBilling } from "@/server/orders/direct-order";
import { orgDay } from "@/server/testing/dates";
import { addMember, migrateTestDatabase, setupOrganization, type TestOrg } from "@/server/testing/org-helpers";
import {
  allocateReceipt,
  getCustomerCredit,
  getReceipt,
  getReceiptLines,
  identifyReceipt,
  listReceipts,
  recordReceipt,
  recordRefund,
  reverseReceipt,
  reverseSettlement,
  settleInvoice,
} from "./receipts";

describe("receipts, settlements and corrections (ADR-0003)", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  const key = () => crypto.randomUUID();
  const customerFor = (org: TestOrg, name = "PT Bayar") => createCustomer({ headers: org.ownerHeaders, input: { companyName: name, contactPerson: "Budi", phone: "08123456789" } });

  async function invoiceFor(org: TestOrg, customerId: string, amount: string, issueDate = orgDay(-10)) {
    const order = await createDirectOrder({ headers: org.ownerHeaders, input: { customerId, title: `Pesanan ${amount}`, commitmentType: "PURCHASE_ORDER", value: amount } });
    return createInvoice({
      headers: org.ownerHeaders,
      input: { billingItemId: order.billingItems[0]!.id, issueDate, dueDate: orgDay(20), items: [{ description: "Jasa", quantity: "1", unit: "paket", unitPrice: amount }], idempotencyKey: key() },
    });
  }
  const receive = (org: TestOrg, amount: string, overrides: Record<string, unknown> = {}) =>
    recordReceipt({ headers: org.ownerHeaders, input: { amount, receivedOn: orgDay(-1), method: "BANK_TRANSFER", idempotencyKey: key(), ...overrides } });
  const balance = async (org: TestOrg, invoiceId: string) => {
    const invoice = await getInvoice({ headers: org.ownerHeaders, invoiceId });
    return { status: invoice.status, paid: invoice.paidAmount, remaining: invoice.remainingAmount };
  };

  describe("recording a receipt (RCP-01)", () => {
    it("records money before any invoice exists, with or without a customer", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const known = await receive(org, "5000000", { customerId: customer.id, reference: "TRF-1" });
      const unknown = await receive(org, "2500000");

      expect(known).toMatchObject({ amount: "5000000", availableAmount: "5000000", allocatedAmount: "0", status: "ACTIVE", customerName: "PT Bayar", reference: "TRF-1" });
      expect(unknown).toMatchObject({ customerId: null, availableAmount: "2500000" });
    });

    it("validates the amount, the date, the method and the customer", async () => {
      const org = await setupOrganization();
      const other = await setupOrganization();
      const theirs = await customerFor(other);
      const call = (overrides: Record<string, unknown>) => receive(org, "1000", overrides);

      await expect(call({ amount: "0" })).rejects.toThrow();
      await expect(receive(org, "-5")).rejects.toThrow();
      await expect(call({ receivedOn: orgDay(1) })).rejects.toThrow(/future/);
      await expect(call({ method: "BARTER" })).rejects.toThrow();
      await expect(call({ reference: "x".repeat(201) })).rejects.toThrow();
      await expect(call({ customerId: theirs.id })).rejects.toThrow(/Customer not found/);
    });

    it("returns the same receipt for a retry, and conflicts when the key is reused with other content", async () => {
      const org = await setupOrganization();
      const input = { amount: "1000000", receivedOn: orgDay(-1), method: "CASH", idempotencyKey: "same-key" };
      const first = await recordReceipt({ headers: org.ownerHeaders, input });
      const again = await recordReceipt({ headers: org.ownerHeaders, input });
      expect(again.id).toBe(first.id);
      await expect(recordReceipt({ headers: org.ownerHeaders, input: { ...input, amount: "2000000" } })).rejects.toThrow(/different request/);
      expect(await db.query.receipts.findMany({ where: eq(receipts.organizationId, org.organizationId) })).toHaveLength(1);
    });

    it("is for Owner, Admin and Finance, not Sales", async () => {
      const org = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const finance = await addMember(org, "FINANCE", "Dewi");
      const input = { amount: "1000", receivedOn: orgDay(-1), method: "CASH" };
      await expect(recordReceipt({ headers: sales.headers, input: { ...input, idempotencyKey: key() } })).rejects.toThrow();
      expect((await recordReceipt({ headers: finance.headers, input: { ...input, idempotencyKey: key() } })).status).toBe("ACTIVE");
      await expect(listReceipts({ headers: sales.headers })).rejects.toThrow();
    });
  });

  describe("allocating (SET-01, SET-02)", () => {
    it("settles one invoice from two transfers", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const invoice = await invoiceFor(org, customer.id, "30000000");
      const a = await receive(org, "10000000", { customerId: customer.id });
      const b = await receive(org, "20000000", { customerId: customer.id });

      await allocateReceipt({ headers: org.ownerHeaders, receiptId: a.id, input: { allocations: [{ invoiceId: invoice.id, amount: "10000000" }], idempotencyKey: key() } });
      expect(await balance(org, invoice.id)).toEqual({ status: "PARTIALLY_PAID", paid: "10000000", remaining: "20000000" });
      await allocateReceipt({ headers: org.ownerHeaders, receiptId: b.id, input: { allocations: [{ invoiceId: invoice.id, amount: "20000000" }], idempotencyKey: key() } });
      expect(await balance(org, invoice.id)).toEqual({ status: "PAID", paid: "30000000", remaining: "0" });
    });

    it("splits one transfer over two invoices and leaves the rest as the customer's credit", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const one = await invoiceFor(org, customer.id, "6000000");
      const two = await invoiceFor(org, customer.id, "4000000");
      const receipt = await receive(org, "13000000", { customerId: customer.id });

      const after = await allocateReceipt({
        headers: org.ownerHeaders,
        receiptId: receipt.id,
        input: { allocations: [{ invoiceId: one.id, amount: "6000000" }, { invoiceId: two.id, amount: "4000000" }], idempotencyKey: key() },
      });
      expect(after).toMatchObject({ allocatedAmount: "10000000", availableAmount: "3000000" });
      expect(await balance(org, one.id)).toMatchObject({ status: "PAID" });
      expect(await balance(org, two.id)).toMatchObject({ status: "PAID" });
      expect(await getCustomerCredit({ headers: org.ownerHeaders, customerId: customer.id })).toEqual({ customerId: customer.id, credit: "3000000", receipts: 1 });
      const lines = await getReceiptLines({ headers: org.ownerHeaders, receiptId: receipt.id });
      expect(lines.allocations.map((line) => [line.invoiceNumber, line.amount])).toEqual([
        [one.invoiceNumber, "6000000"],
        [two.invoiceNumber, "4000000"],
      ]);
      expect(lines.refunds).toEqual([]);
    });

    it("lets a deposit recorded before the invoice be allocated to it afterwards", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const deposit = await receive(org, "9000000", { customerId: customer.id, receivedOn: orgDay(-20) });
      const invoice = await invoiceFor(org, customer.id, "30000000", orgDay(-5));

      await allocateReceipt({ headers: org.ownerHeaders, receiptId: deposit.id, input: { allocations: [{ invoiceId: invoice.id, amount: "9000000" }], idempotencyKey: key() } });
      const detail = await getInvoiceDetail({ headers: org.ownerHeaders, invoiceId: invoice.id });
      expect(detail).toMatchObject({ paidAmount: "9000000", status: "PARTIALLY_PAID" });
      // The settlement never pre-dates the invoice, whatever the deposit date was.
      expect(detail.payments[0]).toMatchObject({ kind: "RECEIPT", paymentDate: orgDay(-5), receiptId: deposit.id });
    });

    it("refuses what is not allowed: no customer, other customer, void invoice, too much, duplicates", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const stranger = await customerFor(org, "PT Lain");
      const invoice = await invoiceFor(org, customer.id, "5000000");
      const foreign = await invoiceFor(org, stranger.id, "5000000");
      const anonymous = await receive(org, "5000000");
      const receipt = await receive(org, "7000000", { customerId: customer.id });
      const allocate = (receiptId: string, allocations: unknown) => allocateReceipt({ headers: org.ownerHeaders, receiptId, input: { allocations, idempotencyKey: key() } });

      await expect(allocate(anonymous.id, [{ invoiceId: invoice.id, amount: "1000" }])).rejects.toThrow(/Identify the customer/);
      await expect(allocate(receipt.id, [{ invoiceId: foreign.id, amount: "1000" }])).rejects.toThrow(/own customer/);
      await expect(allocate(receipt.id, [{ invoiceId: invoice.id, amount: "5000001" }])).rejects.toThrow(/exceeds the remaining balance/);
      await expect(allocate(receipt.id, [{ invoiceId: invoice.id, amount: "0" }])).rejects.toThrow();
      await expect(allocate(receipt.id, [{ invoiceId: invoice.id, amount: "1000" }, { invoiceId: invoice.id, amount: "1000" }])).rejects.toThrow(/once/);
      await expect(allocate(receipt.id, [{ invoiceId: crypto.randomUUID(), amount: "1000" }])).rejects.toThrow(/not found/i);
      expect(await db.query.settlements.findMany({ where: eq(settlements.organizationId, org.organizationId) })).toHaveLength(0);

      const big = await invoiceFor(org, customer.id, "9000000");
      await expect(allocate(receipt.id, [{ invoiceId: big.id, amount: "7000001" }])).rejects.toThrow(/what is left of the receipt/);
    });

    it("never spends the same receipt twice when allocations race", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const one = await invoiceFor(org, customer.id, "8000000");
      const two = await invoiceFor(org, customer.id, "8000000");
      const receipt = await receive(org, "10000000", { customerId: customer.id });

      const results = await Promise.allSettled([
        allocateReceipt({ headers: org.ownerHeaders, receiptId: receipt.id, input: { allocations: [{ invoiceId: one.id, amount: "8000000" }], idempotencyKey: key() } }),
        allocateReceipt({ headers: org.ownerHeaders, receiptId: receipt.id, input: { allocations: [{ invoiceId: two.id, amount: "8000000" }], idempotencyKey: key() } }),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(await getReceipt({ headers: org.ownerHeaders, receiptId: receipt.id })).toMatchObject({ allocatedAmount: "8000000", availableAmount: "2000000" });
    });

    it("answers a retried allocation with the receipt and does not allocate twice", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const invoice = await invoiceFor(org, customer.id, "4000000");
      const receipt = await receive(org, "4000000", { customerId: customer.id });
      const input = { allocations: [{ invoiceId: invoice.id, amount: "4000000" }], idempotencyKey: "alloc-1" };
      await allocateReceipt({ headers: org.ownerHeaders, receiptId: receipt.id, input });
      const again = await allocateReceipt({ headers: org.ownerHeaders, receiptId: receipt.id, input });
      expect(again.allocatedAmount).toBe("4000000");
      expect(await db.query.settlements.findMany({ where: eq(settlements.invoiceId, invoice.id) })).toHaveLength(1);
    });
  });

  describe("withholding tax and write-offs (SET-01)", () => {
    it("settles an invoice paid net of withholding without adding cash", async () => {
      // Paid today, not yesterday: on the 1st, yesterday falls in last month and the check below would miss it.
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const invoice = await invoiceFor(org, customer.id, "10000000");
      await recordPayment({ headers: org.ownerHeaders, input: { invoiceId: invoice.id, amount: "9800000", paymentDate: orgDay(0), paymentMethod: "BANK_TRANSFER", idempotencyKey: key() } });
      expect(await balance(org, invoice.id)).toMatchObject({ status: "PARTIALLY_PAID", remaining: "200000" });

      await expect(settleInvoice({ headers: org.ownerHeaders, invoiceId: invoice.id, input: { kind: "WITHHOLDING", amount: "200000", idempotencyKey: key() } })).rejects.toThrow(/withholding slip/);
      await settleInvoice({ headers: org.ownerHeaders, invoiceId: invoice.id, input: { kind: "WITHHOLDING", amount: "200000", reference: "BP-2026-0042", idempotencyKey: key() } });

      expect(await balance(org, invoice.id)).toEqual({ status: "PAID", paid: "10000000", remaining: "0" });
      expect((await getReceivedThisMonth({ headers: org.ownerHeaders })).total).toBe("9800000");
    });

    it("needs a note for a write-off and keeps Finance within the limit while Owner and Admin are not", async () => {
      const org = await setupOrganization();
      const finance = await addMember(org, "FINANCE", "Dewi");
      const customer = await customerFor(org);
      const invoice = await invoiceFor(org, customer.id, "1000000");
      await db.update(organizationSettings).set({ writeOffLimit: 25_000n }).where(eq(organizationSettings.organizationId, org.organizationId));
      const writeOff = (headers: Headers, amount: string, note: string | undefined = "Biaya transfer") =>
        settleInvoice({ headers, invoiceId: invoice.id, input: { kind: "WRITE_OFF", amount, note, idempotencyKey: key() } });

      await expect(writeOff(finance.headers, "10000", "")).rejects.toThrow(/needs a note/);
      await expect(writeOff(finance.headers, "30000")).rejects.toThrow(/above the limit/);
      await writeOff(finance.headers, "25000");
      await writeOff(org.ownerHeaders, "30000");
      expect(await balance(org, invoice.id)).toMatchObject({ paid: "55000", remaining: "945000" });
      const audits = await db.query.auditEvents.findMany({ where: and(eq(auditEvents.organizationId, org.organizationId), eq(auditEvents.action, "settlement.written_off")) });
      expect(audits).toHaveLength(2);
    });

    it("never settles more than the invoice owes", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const invoice = await invoiceFor(org, customer.id, "100000");
      await expect(settleInvoice({ headers: org.ownerHeaders, invoiceId: invoice.id, input: { kind: "WRITE_OFF", amount: "100001", note: "x", idempotencyKey: key() } })).rejects.toThrow(/exceeds the remaining/);
    });
  });

  describe("identifying a receipt (RCP-02)", () => {
    it("names the customer with a basis, audits it, and then allows allocation", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const invoice = await invoiceFor(org, customer.id, "3000000");
      const mystery = await receive(org, "3000000");

      await expect(identifyReceipt({ headers: org.ownerHeaders, receiptId: mystery.id, input: { customerId: customer.id, basis: "" } })).rejects.toThrow();
      const identified = await identifyReceipt({ headers: org.ownerHeaders, receiptId: mystery.id, input: { customerId: customer.id, basis: "Nama pengirim cocok dengan PT Bayar" } });
      expect(identified).toMatchObject({ customerId: customer.id, identificationNote: "Nama pengirim cocok dengan PT Bayar" });
      const audit = await db.query.auditEvents.findFirst({ where: and(eq(auditEvents.targetId, mystery.id), eq(auditEvents.action, "receipt.identified")) });
      expect(audit!.metadata).toMatchObject({ customerId: customer.id, previousCustomerId: null });

      await allocateReceipt({ headers: org.ownerHeaders, receiptId: mystery.id, input: { allocations: [{ invoiceId: invoice.id, amount: "3000000" }], idempotencyKey: key() } });
      expect(await balance(org, invoice.id)).toMatchObject({ status: "PAID" });
    });

    it("corrects a wrong identification only after the allocations are reversed", async () => {
      const org = await setupOrganization();
      const wrong = await customerFor(org, "PT Salah");
      const right = await customerFor(org, "PT Benar");
      const invoice = await invoiceFor(org, wrong.id, "2000000");
      const receipt = await receive(org, "2000000", { customerId: wrong.id });
      await allocateReceipt({ headers: org.ownerHeaders, receiptId: receipt.id, input: { allocations: [{ invoiceId: invoice.id, amount: "2000000" }], idempotencyKey: key() } });

      await expect(identifyReceipt({ headers: org.ownerHeaders, receiptId: receipt.id, input: { customerId: right.id, basis: "Koreksi" } })).rejects.toThrow(/reverse the allocations/);
      const settlement = (await db.query.settlements.findFirst({ where: eq(settlements.invoiceId, invoice.id) }))!;
      await reverseSettlement({ headers: org.ownerHeaders, settlementId: settlement.id, input: { reason: "Salah customer" } });
      expect((await identifyReceipt({ headers: org.ownerHeaders, receiptId: receipt.id, input: { customerId: right.id, basis: "Koreksi" } })).customerId).toBe(right.id);
    });

    it("refuses a customer of another organization and stays silent about whether the receipt exists", async () => {
      const org = await setupOrganization();
      const other = await setupOrganization();
      const theirs = await customerFor(other);
      const mine = await receive(org, "1000");
      await expect(identifyReceipt({ headers: org.ownerHeaders, receiptId: mine.id, input: { customerId: theirs.id, basis: "x" } })).rejects.toThrow(/Customer not found/);
      await expect(identifyReceipt({ headers: other.ownerHeaders, receiptId: mine.id, input: { customerId: theirs.id, basis: "x" } })).rejects.toThrow(/Receipt not found/);
    });
  });

  describe("corrections (RCP-04)", () => {
    it("reversing a settlement reopens the invoice and gives the money back to the receipt, with an audit event", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const invoice = await invoiceFor(org, customer.id, "6000000");
      const receipt = await receive(org, "6000000", { customerId: customer.id });
      await allocateReceipt({ headers: org.ownerHeaders, receiptId: receipt.id, input: { allocations: [{ invoiceId: invoice.id, amount: "6000000" }], idempotencyKey: key() } });
      const settlement = (await db.query.settlements.findFirst({ where: eq(settlements.invoiceId, invoice.id) }))!;

      await expect(reverseSettlement({ headers: org.ownerHeaders, settlementId: settlement.id, input: { reason: " " } })).rejects.toThrow();
      await reverseSettlement({ headers: org.ownerHeaders, settlementId: settlement.id, input: { reason: "Salah alokasi" } });
      expect(await balance(org, invoice.id)).toMatchObject({ status: "UNPAID", remaining: "6000000" });
      expect(await getReceipt({ headers: org.ownerHeaders, receiptId: receipt.id })).toMatchObject({ allocatedAmount: "0", availableAmount: "6000000" });

      // Again is a no-op: one reversal, one audit event, the first reason kept.
      await reverseSettlement({ headers: org.ownerHeaders, settlementId: settlement.id, input: { reason: "Lagi" } });
      expect(await db.query.auditEvents.findMany({ where: and(eq(auditEvents.targetId, settlement.id), eq(auditEvents.action, "settlement.reversed")) })).toHaveLength(1);
      expect((await db.query.settlements.findFirst({ where: eq(settlements.id, settlement.id) }))!.reversalReason).toBe("Salah alokasi");
      // The reversed settlement stays visible on the invoice, marked.
      expect((await getInvoiceDetail({ headers: org.ownerHeaders, invoiceId: invoice.id })).payments[0]).toMatchObject({ reversalReason: "Salah alokasi" });
    });

    it("reverses a receipt only while nothing is allocated or refunded", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const invoice = await invoiceFor(org, customer.id, "1000000");
      const receipt = await receive(org, "2000000", { customerId: customer.id });
      await allocateReceipt({ headers: org.ownerHeaders, receiptId: receipt.id, input: { allocations: [{ invoiceId: invoice.id, amount: "1000000" }], idempotencyKey: key() } });

      await expect(reverseReceipt({ headers: org.ownerHeaders, receiptId: receipt.id, input: { reason: "Gagal" } })).rejects.toThrow(/active allocations/);
      const clean = await receive(org, "500000", { customerId: customer.id });
      const reversed = await reverseReceipt({ headers: org.ownerHeaders, receiptId: clean.id, input: { reason: "Transfer gagal" } });
      expect(reversed).toMatchObject({ status: "REVERSED", availableAmount: "0", reversalReason: "Transfer gagal" });
      await expect(allocateReceipt({ headers: org.ownerHeaders, receiptId: clean.id, input: { allocations: [{ invoiceId: invoice.id, amount: "1" }], idempotencyKey: key() } })).rejects.toThrow(/reversed/);
      expect((await getCustomerCredit({ headers: org.ownerHeaders, customerId: customer.id })).credit).toBe("1000000");
    });

    it("refunds from what is left, never more, and then the receipt cannot be reversed", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const invoice = await invoiceFor(org, customer.id, "3000000");
      const receipt = await receive(org, "5000000", { customerId: customer.id });
      await allocateReceipt({ headers: org.ownerHeaders, receiptId: receipt.id, input: { allocations: [{ invoiceId: invoice.id, amount: "3000000" }], idempotencyKey: key() } });
      const refund = (amount: string, overrides: Record<string, unknown> = {}) =>
        recordRefund({ headers: org.ownerHeaders, receiptId: receipt.id, input: { amount, refundedOn: orgDay(0), reason: "Kelebihan bayar", idempotencyKey: key(), ...overrides } });

      await expect(refund("2000001")).rejects.toThrow(/cannot exceed what is left/);
      await expect(refund("1000", { reason: "" })).rejects.toThrow();
      await expect(refund("1000", { refundedOn: orgDay(1) })).rejects.toThrow(/future/);
      const after = await refund("2000000");
      expect(after).toMatchObject({ refundedAmount: "2000000", availableAmount: "0" });
      await expect(refund("1")).rejects.toThrow(/cannot exceed/);
      await expect(reverseReceipt({ headers: org.ownerHeaders, receiptId: receipt.id, input: { reason: "Coba" } })).rejects.toThrow();
      expect((await getCustomerCredit({ headers: org.ownerHeaders, customerId: customer.id })).credit).toBe("0");
    });

    it("refuses to refund an unidentified receipt, and replays a refund once", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const mystery = await receive(org, "1000000");
      await expect(recordRefund({ headers: org.ownerHeaders, receiptId: mystery.id, input: { amount: "1000", refundedOn: orgDay(0), reason: "x", idempotencyKey: key() } })).rejects.toThrow(/Identify/);

      const known = await receive(org, "1000000", { customerId: customer.id });
      const input = { amount: "400000", refundedOn: orgDay(0), reason: "Salah transfer", idempotencyKey: "refund-1" };
      await recordRefund({ headers: org.ownerHeaders, receiptId: known.id, input });
      const again = await recordRefund({ headers: org.ownerHeaders, receiptId: known.id, input });
      expect(again.refundedAmount).toBe("400000");
    });
  });

  describe("derived views", () => {
    it("lists open receipts (money not yet allocated), including unidentified ones, newest first", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const invoice = await invoiceFor(org, customer.id, "1000000");
      const spent = await receive(org, "1000000", { customerId: customer.id, receivedOn: orgDay(-3) });
      await allocateReceipt({ headers: org.ownerHeaders, receiptId: spent.id, input: { allocations: [{ invoiceId: invoice.id, amount: "1000000" }], idempotencyKey: key() } });
      const credit = await receive(org, "700000", { customerId: customer.id, receivedOn: orgDay(-2) });
      const mystery = await receive(org, "300000", { receivedOn: orgDay(-1) });
      const reversed = await receive(org, "100000", { receivedOn: orgDay(-1) });
      await reverseReceipt({ headers: org.ownerHeaders, receiptId: reversed.id, input: { reason: "Gagal" } });

      expect((await listReceipts({ headers: org.ownerHeaders, open: true })).items.map((item) => item.id)).toEqual([mystery.id, credit.id]);
      expect((await listReceipts({ headers: org.ownerHeaders })).totalItems).toBe(4);
      expect((await listReceipts({ headers: org.ownerHeaders, customerId: customer.id })).items).toHaveLength(2);
    });

    it("keeps receipts inside the organization", async () => {
      const orgA = await setupOrganization();
      const orgB = await setupOrganization();
      const receipt = await receive(orgA, "1000");
      await expect(getReceipt({ headers: orgB.ownerHeaders, receiptId: receipt.id })).rejects.toThrow(/not found/i);
      expect((await listReceipts({ headers: orgB.ownerHeaders })).items).toHaveLength(0);
    });
  });

  describe("the one-step payment keeps working on top of receipts (PAY-01)", () => {
    it("creates a receipt and its settlement together, and an overpayment goes the long way", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const invoice = await invoiceFor(org, customer.id, "4000000");
      const result = await recordPayment({ headers: org.ownerHeaders, input: { invoiceId: invoice.id, amount: "1500000", paymentDate: orgDay(-1), paymentMethod: "CASH", idempotencyKey: key() } });

      expect(result).toMatchObject({ remainingAmount: "2500000", status: "PARTIALLY_PAID" });
      expect(await getReceipt({ headers: org.ownerHeaders, receiptId: result.payment.id })).toMatchObject({ customerId: customer.id, allocatedAmount: "1500000", availableAmount: "0" });
      await expect(recordPayment({ headers: org.ownerHeaders, input: { invoiceId: invoice.id, amount: "2500001", paymentDate: orgDay(-1), paymentMethod: "CASH", idempotencyKey: key() } })).rejects.toThrow(/exceeds the remaining/);

      const big = await receive(org, "9000000", { customerId: customer.id });
      await allocateReceipt({ headers: org.ownerHeaders, receiptId: big.id, input: { allocations: [{ invoiceId: invoice.id, amount: "2500000" }], idempotencyKey: key() } });
      expect(await balance(org, invoice.id)).toMatchObject({ status: "PAID" });
      expect((await getCustomerCredit({ headers: org.ownerHeaders, customerId: customer.id })).credit).toBe("6500000");
    });
  });

  describe("a direct order that pays on the spot (ORD-02)", () => {
    const orderPart = (customerId: string) => ({ customerId, title: "Penjualan tunai", commitmentType: "PAYMENT", value: "2500000" });

    it("makes the order, the invoice and the payment in one submit, without a deal", async () => {
      const org = await setupOrganization();
      const customer = await customerFor(org);
      const result = await createDirectOrderWithBilling({
        headers: org.ownerHeaders,
        input: { order: orderPart(customer.id), invoice: { idempotencyKey: key() }, payment: { paymentMethod: "CASH", idempotencyKey: key() } },
      });
      expect(result.order).toMatchObject({ dealId: null, status: "CLOSED", billedAmount: "2500000" });
      expect(await balance(org, result.invoiceId!)).toMatchObject({ status: "PAID" });
    });

    it("rolls everything back when the payment is refused, and keeps Sales to the order alone", async () => {
      const org = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const customer = await customerFor(org);
      await expect(
        createDirectOrderWithBilling({
          headers: org.ownerHeaders,
          input: { order: orderPart(customer.id), invoice: { idempotencyKey: key() }, payment: { amount: "9999999", paymentMethod: "CASH", idempotencyKey: key() } },
        }),
      ).rejects.toThrow(/exceeds the remaining/);
      expect(await db.query.orders.findMany({ where: eq(orders.customerId, customer.id) })).toHaveLength(0);
      expect(await db.query.invoices.findMany({ where: eq(invoices.customerId, customer.id) })).toHaveLength(0);

      await expect(createDirectOrderWithBilling({ headers: sales.headers, input: { order: orderPart(customer.id), invoice: { idempotencyKey: key() } } })).rejects.toThrow();
      const orderOnly = await createDirectOrderWithBilling({ headers: sales.headers, input: { order: orderPart(customer.id) } });
      expect(orderOnly).toMatchObject({ invoiceId: null, paymentId: null });
      await expect(createDirectOrderWithBilling({ headers: org.ownerHeaders, input: { order: orderPart(customer.id), payment: { paymentMethod: "CASH", idempotencyKey: key() } } })).rejects.toThrow(/needs an invoice/);
    });
  });
});
