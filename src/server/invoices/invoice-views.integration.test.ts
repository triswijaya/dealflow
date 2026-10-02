import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { createCustomer } from "@/server/customers/customers";
import { createDeal, getDeal, transitionDeal } from "@/server/deals/deals";
import { createQuotation, transitionQuotationStatus } from "@/server/quotations/quotations";
import { addMember, migrateTestDatabase, setupOrganization, type TestOrg } from "@/server/testing/org-helpers";
import { createInvoice } from "./invoices";
import {
  getInvoiceDetail,
  getInvoiceSourceContent,
  getInvoiceSummary,
  getInvoiceDraftContext,
  listInvoiceActivities,
  listInvoiceRows,
  listInvoiceableDeals,
} from "./invoice-views";
import { recordPayment } from "./payments";

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe("invoice read models", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  async function wonDeal(org: TestOrg, title = "Paket CCTV", companyName = "Klinik Sehat") {
    const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName, contactPerson: "dr. Lestari", phone: "08161234567" } });
    let deal = await createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title, estimatedValue: "30000000", assignedToId: org.ownerUserId } });
    for (const toStatus of ["CONTACTED", "QUALIFIED", "QUOTATION", "NEGOTIATION", "WON"]) {
      deal = await transitionDeal({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { toStatus } });
    }
    return { customer, deal };
  }

  const issue = (org: TestOrg, dealId: string, overrides: Record<string, unknown> = {}) =>
    createInvoice({
      headers: org.ownerHeaders,
      input: { dealId, dueDate: day(20), items: [{ description: "Paket", quantity: "1", unit: "paket", unitPrice: "30000000" }], idempotencyKey: crypto.randomUUID(), ...overrides },
    });

  const pay = (org: TestOrg, invoiceId: string, amount: string, paymentDate = day(0)) =>
    recordPayment({ headers: org.ownerHeaders, input: { invoiceId, amount, paymentDate, paymentMethod: "BANK_TRANSFER", idempotencyKey: crypto.randomUUID() } });

  describe("list, filter and summary", () => {
    it("derives status from payments and the calendar, with overdue beating partial and the due day not yet late", async () => {
      const org = await setupOrganization();
      const mk = async (title: string, overrides: Record<string, unknown>) => {
        const { deal } = await wonDeal(org, title);
        return issue(org, deal.id, overrides);
      };
      const unpaid = await mk("Belum", { dueDate: day(10) });
      const partial = await mk("Sebagian", { dueDate: day(10) });
      await pay(org, partial.id, "10000000");
      const paid = await mk("Lunas", { dueDate: day(10) });
      await pay(org, paid.id, "30000000");
      const overdue = await mk("Terlambat", { issueDate: day(-30), dueDate: day(-5) });
      const overduePartial = await mk("Terlambat sebagian", { issueDate: day(-30), dueDate: day(-5) });
      await pay(org, overduePartial.id, "5000000", day(-3));
      const dueToday = await mk("Hari ini", { issueDate: day(-3), dueDate: day(0) });

      const ids = async (status?: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE") =>
        (await listInvoiceRows({ headers: org.ownerHeaders, filters: { status } })).items.map((row) => row.id).sort();

      expect(await ids("UNPAID")).toEqual([unpaid.id, dueToday.id].sort());
      expect(await ids("PARTIALLY_PAID")).toEqual([partial.id]);
      expect(await ids("PAID")).toEqual([paid.id]);
      expect(await ids("OVERDUE")).toEqual([overdue.id, overduePartial.id].sort());
      expect((await listInvoiceRows({ headers: org.ownerHeaders })).totalItems).toBe(6);

      const rows = (await listInvoiceRows({ headers: org.ownerHeaders })).items;
      const partialRow = rows.find((row) => row.id === partial.id)!;
      expect(partialRow).toMatchObject({ status: "PARTIALLY_PAID", paidAmount: "10000000", remainingAmount: "20000000", total: "30000000", dealTitle: "Sebagian" });
      expect(rows.find((row) => row.id === overduePartial.id)?.status).toBe("OVERDUE");
    });

    it("searches the number, deal and customer, and filters by customer and an inclusive due-date range", async () => {
      const org = await setupOrganization();
      const a = await wonDeal(org, "Paket A", "PT Alfa");
      const b = await wonDeal(org, "Paket B", "PT Beta");
      const ia = await issue(org, a.deal.id, { dueDate: day(5) });
      const ib = await issue(org, b.deal.id, { dueDate: day(15) });

      const ids = async (filters: Record<string, string>) => (await listInvoiceRows({ headers: org.ownerHeaders, filters })).items.map((row) => row.id);
      expect(await ids({ query: ia.invoiceNumber })).toEqual([ia.id]);
      expect(await ids({ query: "beta" })).toEqual([ib.id]);
      expect(await ids({ query: "paket a" })).toEqual([ia.id]);
      expect(await ids({ customerId: b.customer.id })).toEqual([ib.id]);
      expect(await ids({ dueFrom: day(5), dueTo: day(5) })).toEqual([ia.id]);
      expect((await ids({ dueFrom: day(5), dueTo: day(15) })).sort()).toEqual([ia.id, ib.id].sort());
      await expect(listInvoiceRows({ headers: org.ownerHeaders, filters: { dueFrom: day(10), dueTo: day(5) } })).rejects.toThrow(/date range/i);
    });

    it("summarizes what is owed, what is late and what was settled this month, without doubling", async () => {
      const org = await setupOrganization();
      const first = await wonDeal(org, "Satu");
      const second = await wonDeal(org, "Dua");
      const third = await wonDeal(org, "Tiga");
      const open = await issue(org, first.deal.id, { dueDate: day(10) });
      await pay(org, open.id, "10000000");
      await pay(org, open.id, "5000000");
      await issue(org, second.deal.id, { issueDate: day(-30), dueDate: day(-2) });
      const settled = await issue(org, third.deal.id, { dueDate: day(10) });
      await pay(org, settled.id, "30000000");

      const summary = await getInvoiceSummary({ headers: org.ownerHeaders });
      // 15M still owed on the first (two payments must not double its sum) + 30M on the late one.
      expect(summary).toMatchObject({ outstandingTotal: "45000000", outstandingCount: 2, overdueTotal: "30000000", overdueCount: 1, paidThisMonth: 1 });
      expect(await getInvoiceSummary({ headers: (await setupOrganization()).ownerHeaders })).toEqual({
        outstandingTotal: "0",
        outstandingCount: 0,
        overdueTotal: "0",
        overdueCount: 0,
        paidThisMonth: 0,
      });
    });

    it("is closed to Sales and never lists another organization's invoices", async () => {
      const org = await setupOrganization();
      const other = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const { deal } = await wonDeal(org);
      await issue(org, deal.id);
      await expect(listInvoiceRows({ headers: sales.headers })).rejects.toThrow();
      await expect(getInvoiceSummary({ headers: sales.headers })).rejects.toThrow();
      expect((await listInvoiceRows({ headers: other.ownerHeaders })).items).toEqual([]);
    });
  });

  describe("detail", () => {
    it("returns the document, payments with who recorded them, and the finance trail", async () => {
      const org = await setupOrganization();
      const finance = await addMember(org, "FINANCE", "Dewi");
      const { deal } = await wonDeal(org);
      const invoice = await issue(org, deal.id, { notes: "Catatan", terms: "Syarat" });
      await recordPayment({
        headers: finance.headers,
        input: { invoiceId: invoice.id, amount: "10000000", paymentDate: day(0), paymentMethod: "BANK_TRANSFER", reference: "TRF-1", note: "Tahap pertama", idempotencyKey: crypto.randomUUID() },
      });

      const detail = await getInvoiceDetail({ headers: finance.headers, invoiceId: invoice.id });
      expect(detail).toMatchObject({ dealTitle: "Paket CCTV", status: "PARTIALLY_PAID", paidAmount: "10000000", remainingAmount: "20000000", createdByName: "Owner", sourceQuotation: null });
      expect(detail.customer.companyName).toBe("Klinik Sehat");
      expect(detail.items[0]).toMatchObject({ quantity: "1.000", subtotal: "30000000" });
      expect(detail.payments).toHaveLength(1);
      expect(detail.payments[0]).toMatchObject({ amount: "10000000", reference: "TRF-1", createdByName: "Dewi" });

      const kinds = (await listInvoiceActivities({ headers: finance.headers, invoiceId: invoice.id })).map((event) => `${event.entityType}.${event.eventType}`).sort();
      expect(kinds).toEqual(["invoice.created", "payment.recorded"]);
    });

    it("answers NOT_FOUND for a missing, malformed or cross-tenant id", async () => {
      const org = await setupOrganization();
      const other = await setupOrganization();
      const { deal } = await wonDeal(org);
      const invoice = await issue(org, deal.id);
      for (const [headers, invoiceId] of [
        [org.ownerHeaders, "00000000-0000-4000-8000-000000000000"],
        [org.ownerHeaders, "not-a-uuid"],
        [other.ownerHeaders, invoice.id],
      ] as const) {
        await expect(getInvoiceDetail({ headers, invoiceId })).rejects.toThrow(/not found/i);
        await expect(listInvoiceActivities({ headers, invoiceId })).rejects.toThrow(/not found/i);
      }
    });
  });

  describe("creating an invoice", () => {
    it("lists only won deals that have no invoice yet", async () => {
      const org = await setupOrganization();
      const billed = await wonDeal(org, "Sudah ditagih");
      const ready = await wonDeal(org, "Siap ditagih");
      await issue(org, billed.deal.id);
      const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Aktif", contactPerson: "X", phone: "08123456789" } });
      await createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "Masih aktif", estimatedValue: "1000000", assignedToId: org.ownerUserId } });

      const deals = await listInvoiceableDeals({ headers: org.ownerHeaders });
      expect(deals.map((deal) => deal.id)).toEqual([ready.deal.id]);
      expect(deals[0]).toMatchObject({ title: "Siap ditagih", customerName: "Klinik Sehat", wonValue: "30000000" });
      expect(await listInvoiceableDeals({ headers: org.ownerHeaders, query: "tidak ada" })).toEqual([]);
    });

    it("offers the deal's quotations as sources, recommends the accepted latest, and lets Finance read the content", async () => {
      const org = await setupOrganization();
      const finance = await addMember(org, "FINANCE", "Dewi");
      const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Maju", contactPerson: "Budi", phone: "08123456789" } });
      let deal = await createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "CCTV", estimatedValue: "13500000", assignedToId: org.ownerUserId } });
      for (const toStatus of ["CONTACTED", "QUALIFIED"]) {
        deal = await transitionDeal({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { toStatus } });
      }
      const quotation = await createQuotation({
        headers: org.ownerHeaders,
        input: { dealId: deal.id, validUntil: day(20), items: [{ description: "Kamera", quantity: "4", unit: "pcs", unitPrice: "3375000" }], notes: "Catatan", terms: "Syarat" },
      });
      const sent = await transitionQuotationStatus({ headers: org.ownerHeaders, quotationId: quotation.id, expectedEditVersion: quotation.editVersion, toStatus: "SENT" });
      const accepted = await transitionQuotationStatus({ headers: org.ownerHeaders, quotationId: sent.id, expectedEditVersion: sent.editVersion, toStatus: "ACCEPTED" });
      // Sending moved the deal to QUOTATION by itself; walk it on to WON.
      for (const toStatus of ["NEGOTIATION", "WON"]) {
        const current = await getDeal({ headers: org.ownerHeaders, dealId: deal.id });
        await transitionDeal({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: current.version, input: { toStatus } });
      }

      const context = await getInvoiceDraftContext({ headers: finance.headers, dealId: deal.id });
      expect(context.existingInvoice).toBeNull();
      expect(context.sources).toHaveLength(1);
      expect(context.sources[0]).toMatchObject({ id: quotation.id, status: accepted.status, recommended: true, total: "13500000" });

      const content = await getInvoiceSourceContent({ headers: finance.headers, dealId: deal.id, quotationId: quotation.id });
      expect(content.items).toEqual([{ description: "Kamera", quantity: "4.000", unit: "pcs", unitPrice: "3375000" }]);
      expect(content).toMatchObject({ notes: "Catatan", terms: "Syarat", discount: "0", tax: "0" });
      expect(content.editVersion).toBeGreaterThan(0);
    });

    it("refuses a deal that is not won, flags one already billed, and hides another deal's quotation", async () => {
      const org = await setupOrganization();
      const open = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Terbuka", contactPerson: "X", phone: "08123456789" } });
      const openDeal = await createDeal({ headers: org.ownerHeaders, input: { customerId: open.id, title: "Terbuka", estimatedValue: "1000000", assignedToId: org.ownerUserId } });
      await expect(getInvoiceDraftContext({ headers: org.ownerHeaders, dealId: openDeal.id })).rejects.toThrow(/WON/);

      const { deal } = await wonDeal(org, "Ditagih");
      const invoice = await issue(org, deal.id);
      const context = await getInvoiceDraftContext({ headers: org.ownerHeaders, dealId: deal.id });
      expect(context.existingInvoice).toEqual({ id: invoice.id, invoiceNumber: invoice.invoiceNumber });

      await expect(getInvoiceSourceContent({ headers: org.ownerHeaders, dealId: deal.id, quotationId: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow(/not found/i);
    });
  });
});
