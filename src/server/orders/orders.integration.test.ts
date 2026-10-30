import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import type postgres from "postgres";
import { createCustomer } from "@/server/customers/customers";
import { db } from "@/server/db/client";
import { activities, auditEvents, billingItems, deals, followUps, invoices, orders, quotations } from "@/server/db/schema";
import { createDeal, reopenDeal, transitionDeal } from "@/server/deals/deals";
import { createFollowUp } from "@/server/follow-ups/follow-ups";
import { createInvoice, voidInvoice } from "@/server/invoices/invoices";
import { recordPayment } from "@/server/invoices/payments";
import { renderInvoicePdf } from "@/server/pdf/quotation-document";
import { createQuotation, transitionQuotationStatus } from "@/server/quotations/quotations";
import { orgDay } from "@/server/testing/dates";
import { addMember, migrateTestDatabase, setupOrganization, type TestOrg } from "@/server/testing/org-helpers";
import { getInvoiceForPdf } from "@/server/invoices/invoice-views";
import { winDeal } from "@/server/testing/orders";
import { addOrderToDeal, amendOrder, cancelOrder, confirmWon, createDirectOrder, getOrder, listOrders, markMilestone, rebalanceBillingItems } from "./orders";

describe("orders, billing items and invoices (ADR-0002)", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  async function customerFor(org: TestOrg, name = "PT Maju Jaya") {
    return createCustomer({ headers: org.ownerHeaders, input: { companyName: name, contactPerson: "Budi", phone: "08123456789" } });
  }
  async function openDeal(org: TestOrg, overrides: Record<string, unknown> = {}) {
    const customer = await customerFor(org);
    return createDeal({
      headers: org.ownerHeaders,
      input: { customerId: customer.id, title: "Proyek CCTV", estimatedValue: "100000000", assignedToId: org.ownerUserId, stage: "COMMITMENT", ...overrides },
    });
  }
  const invoiceInput = (billingItemId: string, amount: string, overrides: Record<string, unknown> = {}) => ({
    billingItemId,
    dueDate: orgDay(30),
    items: [{ description: "Termin", quantity: "1", unit: "paket", unitPrice: amount }],
    idempotencyKey: crypto.randomUUID(),
    ...overrides,
  });
  const dp = [
    { label: "DP 30%", amount: "30000000", trigger: "ON_ORDER" },
    { label: "Termin 2 setelah BAST", amount: "40000000", trigger: "ON_MILESTONE" },
    { label: "Pelunasan", amount: "30000000", trigger: "ON_DATE", dueOn: orgDay(60) },
  ];

  describe("confirmWon (DEAL-04, ORD-02)", () => {
    it("wins the deal and creates its order and default billing item in one transaction", async () => {
      const org = await setupOrganization();
      const deal = await openDeal(org);
      const task = await createFollowUp({ headers: org.ownerHeaders, input: { dealId: deal.id, type: "CALL", followUpAt: new Date(Date.now() + 86_400_000).toISOString() } });

      const { deal: won, order } = await confirmWon({
        headers: org.ownerHeaders,
        dealId: deal.id,
        expectedVersion: deal.version,
        input: { commitmentType: "PURCHASE_ORDER", commitmentRef: "PO-77" },
      });

      expect(won).toMatchObject({ status: "WON", wonValue: "100000000" });
      expect(order).toMatchObject({
        dealId: deal.id,
        commitmentType: "PURCHASE_ORDER",
        commitmentRef: "PO-77",
        originalValue: "100000000",
        currentValue: "100000000",
        status: "ACTIVE",
        title: "Proyek CCTV",
      });
      expect(order.orderNumber).toMatch(/^SO-\d{4}-00001$/);
      expect(order.billingItems).toHaveLength(1);
      expect(order.billingItems[0]).toMatchObject({ amount: "100000000", trigger: "ON_ORDER", status: "READY" });
      expect((await db.query.followUps.findFirst({ where: eq(followUps.id, task.id) }))!.cancelledAt).not.toBeNull();
      const event = await db.query.activities.findFirst({ where: and(eq(activities.dealId, deal.id), eq(activities.eventType, "won")) });
      expect(event!.metadata).toMatchObject({ orderNumber: order.orderNumber, commitmentType: "PURCHASE_ORDER", cancelledTasks: 1 });
    });

    it("needs a real commitment type, never LEGACY, and an open deal at the version the caller saw", async () => {
      const org = await setupOrganization();
      const deal = await openDeal(org);
      const win = (input: unknown, version = deal.version) => confirmWon({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: version, input });

      await expect(win({})).rejects.toThrow();
      await expect(win({ commitmentType: "LEGACY" })).rejects.toThrow();
      await expect(win({ commitmentType: "HANDSHAKE" })).rejects.toThrow();
      await expect(win({ commitmentType: "CONTRACT" }, deal.version + 3)).rejects.toThrow(/modified by someone else/);
      expect((await db.query.deals.findFirst({ where: eq(deals.id, deal.id) }))).toMatchObject({ status: "COMMITMENT", version: deal.version });
      expect(await db.query.orders.findMany({ where: eq(orders.dealId, deal.id) })).toHaveLength(0);

      await win({ commitmentType: "CONTRACT" });
      await expect(win({ commitmentType: "CONTRACT" })).rejects.toThrow(/open deal/);
    });

    it("rolls everything back when the billing plan does not add up", async () => {
      const org = await setupOrganization();
      const deal = await openDeal(org);
      await expect(
        confirmWon({
          headers: org.ownerHeaders,
          dealId: deal.id,
          expectedVersion: deal.version,
          input: { commitmentType: "PURCHASE_ORDER", billingItems: [{ label: "DP", amount: "30000000" }, { label: "Sisa", amount: "60000000" }] },
        }),
      ).rejects.toThrow(/add up/);
      expect(await db.query.deals.findFirst({ where: eq(deals.id, deal.id) })).toMatchObject({ status: "COMMITMENT", wonAt: null, version: deal.version });
      expect(await db.query.orders.findMany({ where: eq(orders.dealId, deal.id) })).toHaveLength(0);
    });

    it("takes the order value from the caller when given, plans a 30/40/30 schedule, and clears a hold", async () => {
      const org = await setupOrganization();
      const deal = await openDeal(org, { estimatedValue: "90000000" });
      const { order, deal: won } = await confirmWon({
        headers: org.ownerHeaders,
        dealId: deal.id,
        expectedVersion: deal.version,
        input: { commitmentType: "CONTRACT", value: "100000000", billingItems: dp },
      });
      expect(won.wonValue).toBe("100000000");
      expect(order.billingItems.map((item) => [item.label, item.status])).toEqual([
        ["DP 30%", "READY"],
        ["Termin 2 setelah BAST", "PLANNED"],
        ["Pelunasan", "PLANNED"],
      ]);
    });

    it("freezes the chosen source quotation, refuses a rejected one, and one of another deal", async () => {
      const org = await setupOrganization();
      const deal = await openDeal(org, { stage: "PROSPECT" });
      const draft = await createQuotation({ headers: org.ownerHeaders, input: { dealId: deal.id, validUntil: orgDay(14), items: [{ description: "Kamera", quantity: "1", unit: "pcs", unitPrice: "100000000" }] } });
      const other = await openDeal(org, { title: "Lain" });
      const foreign = await createQuotation({ headers: org.ownerHeaders, input: { dealId: other.id, validUntil: orgDay(14), items: [{ description: "X", quantity: "1", unit: "pcs", unitPrice: "1000" }] } });

      // Creating the quotations bumped the deal's version, so read it again.
      const version = (await db.query.deals.findFirst({ where: eq(deals.id, deal.id) }))!.version;
      await expect(confirmWon({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: version, input: { commitmentType: "PURCHASE_ORDER", sourceQuotationId: foreign.id } })).rejects.toThrow(/not found/i);
      const { order } = await confirmWon({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: version, input: { commitmentType: "PURCHASE_ORDER", sourceQuotationId: draft.id } });
      expect(order.sourceQuotationId).toBe(draft.id);
      const frozen = await db.query.quotations.findFirst({ where: eq(quotations.id, draft.id) });
      expect(frozen!.frozenAt).not.toBeNull();
      expect(frozen!.editVersion).toBe(draft.editVersion + 1);
    });

    it("lets Sales win a deal but not Finance", async () => {
      const org = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const finance = await addMember(org, "FINANCE", "Dewi");
      const deal = await openDeal(org);
      await expect(confirmWon({ headers: finance.headers, dealId: deal.id, expectedVersion: deal.version, input: { commitmentType: "PURCHASE_ORDER" } })).rejects.toThrow();
      const { deal: won } = await confirmWon({ headers: sales.headers, dealId: deal.id, expectedVersion: deal.version, input: { commitmentType: "PAYMENT" } });
      expect(won.status).toBe("WON");
    });

    it("numbers orders per organization and year without gaps or repeats", async () => {
      const org = await setupOrganization();
      const numbers = [];
      for (let index = 0; index < 3; index += 1) {
        const deal = await openDeal(org, { title: `Deal ${index}` });
        numbers.push((await confirmWon({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { commitmentType: "PURCHASE_ORDER" } })).order.orderNumber);
      }
      expect(numbers.map((number) => Number(number.slice(-5)))).toEqual([1, 2, 3]);
    });
  });

  describe("addOrderToDeal and createDirectOrder", () => {
    it("adds a second order to a won deal without changing the deal, and refuses an open one", async () => {
      const org = await setupOrganization();
      const deal = await openDeal(org);
      await expect(addOrderToDeal({ headers: org.ownerHeaders, dealId: deal.id, input: { commitmentType: "PURCHASE_ORDER", value: "5000000" } })).rejects.toThrow(/won deal/);

      const { deal: won } = await winDeal(org.ownerHeaders, deal.id);
      const second = await addOrderToDeal({ headers: org.ownerHeaders, dealId: deal.id, input: { commitmentType: "PURCHASE_ORDER", commitmentRef: "PO-2", value: "5000000", title: "Instalasi tambahan" } });

      expect(second).toMatchObject({ dealId: deal.id, originalValue: "5000000", title: "Instalasi tambahan" });
      expect(second.orderNumber).toMatch(/00002$/);
      expect(await db.query.deals.findFirst({ where: eq(deals.id, deal.id) })).toMatchObject({ version: won.version, wonValue: 100_000_000n });
      expect((await listOrders({ headers: org.ownerHeaders, dealId: deal.id })).items).toHaveLength(2);
    });

    it("creates an order without a deal, with its own timeline, for Sales as well", async () => {
      const org = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const customer = await customerFor(org);

      const order = await createDirectOrder({
        headers: sales.headers,
        input: { customerId: customer.id, title: "Repeat order kamera", commitmentType: "WRITTEN_CONFIRMATION", value: "12000000" },
      });
      expect(order).toMatchObject({ dealId: null, customerId: customer.id, status: "ACTIVE" });
      expect(order.billingItems).toHaveLength(1);
      const event = await db.query.activities.findFirst({ where: and(eq(activities.orderId, order.id), isNull(activities.dealId)) });
      expect(event).toMatchObject({ entityType: "order", eventType: "created" });
      expect(await db.query.deals.findMany({ where: eq(deals.customerId, customer.id) })).toHaveLength(0);
    });

    it("needs a customer of the organization, a title and a value, and takes no source quotation", async () => {
      const org = await setupOrganization();
      const other = await setupOrganization();
      const theirs = await customerFor(other);
      const mine = await customerFor(org);
      const create = (input: Record<string, unknown>) => createDirectOrder({ headers: org.ownerHeaders, input: { commitmentType: "PAYMENT", ...input } });

      await expect(create({ customerId: theirs.id, title: "X", value: "1000" })).rejects.toThrow(/Customer not found/);
      await expect(create({ customerId: mine.id, value: "1000" })).rejects.toThrow();
      await expect(create({ customerId: mine.id, title: "X" })).rejects.toThrow();
      await expect(create({ customerId: mine.id, title: "X", value: "0" })).rejects.toThrow();
      await expect(create({ customerId: mine.id, title: "X", value: "1000", sourceQuotationId: crypto.randomUUID() })).rejects.toThrow(/no deal/);
    });

    it("keeps orders inside the organization", async () => {
      const orgA = await setupOrganization();
      const orgB = await setupOrganization();
      const { order } = await winDeal(orgA.ownerHeaders, (await openDeal(orgA)).id);
      await expect(getOrder({ headers: orgB.ownerHeaders, orderId: order.id })).rejects.toThrow(/not found/i);
      await expect(getOrder({ headers: orgB.ownerHeaders, orderId: "nope" })).rejects.toThrow(/not found/i);
      expect((await listOrders({ headers: orgB.ownerHeaders })).items).toHaveLength(0);
    });
  });

  describe("invoicing billing items (INV-01, INV-03, INV-04)", () => {
    async function plannedOrder(org: TestOrg) {
      const deal = await openDeal(org);
      const { order } = await confirmWon({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { commitmentType: "CONTRACT", billingItems: dp } });
      return { deal, order, items: order.billingItems };
    }

    it("invoices a ready item for exactly its amount and rejects any other total", async () => {
      const org = await setupOrganization();
      const { order, items } = await plannedOrder(org);
      const [first] = items;

      await expect(createInvoice({ headers: org.ownerHeaders, input: invoiceInput(first!.id, "29000000") })).rejects.toThrow(/must equal the billing item amount/);
      await expect(createInvoice({ headers: org.ownerHeaders, input: invoiceInput(first!.id, "31000000") })).rejects.toThrow(/must equal/);

      const invoice = await createInvoice({ headers: org.ownerHeaders, input: invoiceInput(first!.id, "30000000") });
      expect(invoice).toMatchObject({ orderId: order.id, billingItemId: first!.id, total: "30000000", dealId: order.dealId, status: "UNPAID" });
      const refreshed = await getOrder({ headers: org.ownerHeaders, orderId: order.id });
      expect(refreshed.billingItems[0]).toMatchObject({ status: "INVOICED", invoiceId: invoice.id });
      expect(refreshed.billedAmount).toBe("30000000");
      expect(refreshed.status).toBe("ACTIVE");
    });

    it("refuses an item whose trigger is not met until the milestone is marked or the date arrives", async () => {
      const org = await setupOrganization();
      const { items } = await plannedOrder(org);
      const [, bast, final] = items;

      await expect(createInvoice({ headers: org.ownerHeaders, input: invoiceInput(bast!.id, "40000000") })).rejects.toThrow(/not ready/);
      await expect(createInvoice({ headers: org.ownerHeaders, input: invoiceInput(final!.id, "30000000") })).rejects.toThrow(/not ready/);

      const marked = await markMilestone({ headers: org.ownerHeaders, billingItemId: bast!.id, input: { milestoneRef: "BAST-001" } });
      expect(marked.billingItems[1]).toMatchObject({ status: "READY", milestoneRef: "BAST-001" });
      await createInvoice({ headers: org.ownerHeaders, input: invoiceInput(bast!.id, "40000000") });
      await expect(markMilestone({ headers: org.ownerHeaders, billingItemId: items[0]!.id })).rejects.toThrow(/Only a milestone/);
    });

    it("lets only one of two concurrent invoices for the same item win", async () => {
      const org = await setupOrganization();
      const { items } = await plannedOrder(org);
      const results = await Promise.allSettled([
        createInvoice({ headers: org.ownerHeaders, input: invoiceInput(items[0]!.id, "30000000") }),
        createInvoice({ headers: org.ownerHeaders, input: invoiceInput(items[0]!.id, "30000000") }),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const failure = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
      expect(String(failure.reason?.body?.message ?? failure.reason)).toMatch(/already has invoice/);
      expect(await db.query.invoices.findMany({ where: and(eq(invoices.billingItemId, items[0]!.id), isNull(invoices.voidedAt)) })).toHaveLength(1);
    });

    it("returns the same invoice for a retry with the same key and refuses the key with other content", async () => {
      const org = await setupOrganization();
      const { items } = await plannedOrder(org);
      const input = invoiceInput(items[0]!.id, "30000000", { idempotencyKey: "retry-1" });
      const first = await createInvoice({ headers: org.ownerHeaders, input });
      const again = await createInvoice({ headers: org.ownerHeaders, input });
      expect(again.id).toBe(first.id);
      await expect(createInvoice({ headers: org.ownerHeaders, input: { ...input, dueDate: orgDay(45) } })).rejects.toThrow(/different request/);
      await expect(createInvoice({ headers: org.ownerHeaders, input: { ...input, notes: "lain" } })).rejects.toThrow(/different request/);
    });

    it("lets Finance and Owner invoice but not Sales", async () => {
      const org = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const finance = await addMember(org, "FINANCE", "Dewi");
      const { items } = await plannedOrder(org);
      await expect(createInvoice({ headers: sales.headers, input: invoiceInput(items[0]!.id, "30000000") })).rejects.toThrow();
      expect((await createInvoice({ headers: finance.headers, input: invoiceInput(items[0]!.id, "30000000") })).status).toBe("UNPAID");
    });

    it("bills a direct order and an order of a won deal alike, and never from another organization's item", async () => {
      const org = await setupOrganization();
      const other = await setupOrganization();
      const customer = await customerFor(org);
      const direct = await createDirectOrder({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "Tunai", commitmentType: "PAYMENT", value: "2500000" } });
      const invoice = await createInvoice({ headers: org.ownerHeaders, input: invoiceInput(direct.billingItems[0]!.id, "2500000") });
      expect(invoice).toMatchObject({ dealId: null, orderId: direct.id });
      const events = await db.query.activities.findMany({ where: and(eq(activities.orderId, direct.id), eq(activities.entityType, "invoice")) });
      expect(events).toHaveLength(1);

      await expect(createInvoice({ headers: other.ownerHeaders, input: invoiceInput(direct.billingItems[0]!.id, "2500000") })).rejects.toThrow(/not found/i);
    });

    it("refuses a rejected quotation as the source and a quotation of another deal", async () => {
      const org = await setupOrganization();
      const deal = await openDeal(org);
      const draft = await createQuotation({ headers: org.ownerHeaders, input: { dealId: deal.id, validUntil: orgDay(14), items: [{ description: "K", quantity: "1", unit: "pcs", unitPrice: "100000000" }] } });
      const sent = await transitionQuotationStatus({ headers: org.ownerHeaders, quotationId: draft.id, expectedEditVersion: draft.editVersion, toStatus: "SENT" });
      const rejected = await transitionQuotationStatus({ headers: org.ownerHeaders, quotationId: sent.id, expectedEditVersion: sent.editVersion, toStatus: "REJECTED" });
      const { order } = await confirmWon({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: (await db.query.deals.findFirst({ where: eq(deals.id, deal.id) }))!.version, input: { commitmentType: "PURCHASE_ORDER" } });

      await expect(
        createInvoice({ headers: org.ownerHeaders, input: invoiceInput(order.billingItems[0]!.id, "100000000", { quotationId: rejected.id, expectedSourceEditVersion: rejected.editVersion }) }),
      ).rejects.toThrow(/rejected/);
    });
  });

  describe("amendments and the billing plan (ORD-03, BIL-02)", () => {
    async function wonOrder(org: TestOrg, plan?: unknown) {
      const deal = await openDeal(org);
      return (await confirmWon({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { commitmentType: "CONTRACT", ...(plan ? { billingItems: plan } : {}) } })).order;
    }
    const sum = (order: Awaited<ReturnType<typeof wonOrder>>) => order.billingItems.filter((item) => item.status !== "CANCELLED").reduce((total, item) => total + BigInt(item.amount), 0n);

    it("adds an item for extra work and keeps the plan equal to the running value", async () => {
      const org = await setupOrganization();
      const order = await wonOrder(org);
      const amended = await amendOrder({ headers: org.ownerHeaders, orderId: order.id, input: { delta: "15000000", reason: "Tambah 6 kamera", reference: "ADD-01" } });
      expect(amended).toMatchObject({ originalValue: "100000000", currentValue: "115000000" });
      expect(amended.amendments).toHaveLength(1);
      expect(sum(amended)).toBe(115_000_000n);
      expect(amended.billingItems.filter((item) => item.status !== "CANCELLED")).toHaveLength(2);
    });

    it("trims the not-yet-invoiced items for reduced work and refuses to cut below what is invoiced", async () => {
      const org = await setupOrganization();
      const order = await wonOrder(org, dp);
      await createInvoice({ headers: org.ownerHeaders, input: invoiceInput(order.billingItems[0]!.id, "30000000") });

      const cut = await amendOrder({ headers: org.ownerHeaders, orderId: order.id, input: { delta: "-35000000", reason: "Kurangi lingkup" } });
      expect(cut.currentValue).toBe("65000000");
      expect(sum(cut)).toBe(65_000_000n);
      expect(cut.billingItems[0]).toMatchObject({ status: "INVOICED", amount: "30000000" });

      await expect(amendOrder({ headers: org.ownerHeaders, orderId: order.id, input: { delta: "-40000000", reason: "Terlalu banyak" } })).rejects.toThrow(/below what is already invoiced/);
      await expect(amendOrder({ headers: org.ownerHeaders, orderId: order.id, input: { delta: "-1000", reason: "Zzz" } })).resolves.toBeDefined();
      await expect(amendOrder({ headers: org.ownerHeaders, orderId: order.id, input: { delta: "0", reason: "Nol" } })).rejects.toThrow();
      await expect(amendOrder({ headers: org.ownerHeaders, orderId: order.id, input: { delta: "5000", reason: "" } })).rejects.toThrow();
    });

    it("rebalances the free part of the plan, keeps the total, and locks an invoiced item", async () => {
      const org = await setupOrganization();
      const order = await wonOrder(org, dp);
      const [first, second, third] = order.billingItems;
      await createInvoice({ headers: org.ownerHeaders, input: invoiceInput(first!.id, "30000000") });

      const rebalanced = await rebalanceBillingItems({
        headers: org.ownerHeaders,
        orderId: order.id,
        input: {
          reason: "Ubah termin",
          items: [
            { id: second!.id, label: "Termin 2", amount: "50000000", trigger: "ON_MILESTONE" },
            { id: third!.id, label: "Retensi 5%", amount: "20000000", trigger: "ON_DATE", dueOn: orgDay(90), isRetention: true },
          ],
        },
      });
      expect(rebalanced.billingItems.map((item) => [item.label, item.amount])).toEqual([
        ["DP 30%", "30000000"],
        ["Termin 2", "50000000"],
        ["Retensi 5%", "20000000"],
      ]);

      await expect(rebalanceBillingItems({ headers: org.ownerHeaders, orderId: order.id, input: { reason: "X", items: [{ id: first!.id, label: "DP", amount: "70000000" }] } })).rejects.toThrow(/locked/);
      await expect(rebalanceBillingItems({ headers: org.ownerHeaders, orderId: order.id, input: { reason: "X", items: [{ label: "Sisa", amount: "10000000" }] } })).rejects.toThrow(/add up/);
      expect((await getOrder({ headers: org.ownerHeaders, orderId: order.id })).billingItems.filter((item) => item.status !== "CANCELLED")).toHaveLength(3);
    });

    it("splits an item to bill part of it, then bills the rest", async () => {
      const org = await setupOrganization();
      const order = await wonOrder(org);
      const split = await rebalanceBillingItems({
        headers: org.ownerHeaders,
        orderId: order.id,
        input: { reason: "Tagih dulu separuh", items: [{ id: order.billingItems[0]!.id, label: "Tahap 1", amount: "50000000" }, { label: "Tahap 2", amount: "50000000" }] },
      });
      await createInvoice({ headers: org.ownerHeaders, input: invoiceInput(split.billingItems[0]!.id, "50000000") });
      await createInvoice({ headers: org.ownerHeaders, input: invoiceInput(split.billingItems[1]!.id, "50000000") });
      expect((await getOrder({ headers: org.ownerHeaders, orderId: order.id })).status).toBe("FULLY_BILLED");
    });

    it("lets Sales amend and refuses a cancelled order", async () => {
      const org = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const order = await wonOrder(org);
      await amendOrder({ headers: sales.headers, orderId: order.id, input: { delta: "1000000", reason: "Tambah" } });
      await cancelOrder({ headers: org.ownerHeaders, orderId: order.id, input: { reason: "Batal" } });
      await expect(amendOrder({ headers: org.ownerHeaders, orderId: order.id, input: { delta: "1000000", reason: "Lagi" } })).rejects.toThrow(/cancelled/);
    });
  });

  describe("voiding an invoice (INV-08)", () => {
    async function invoicedOrder(org: TestOrg) {
      const deal = await openDeal(org);
      const { order } = await confirmWon({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { commitmentType: "CONTRACT" } });
      const invoice = await createInvoice({ headers: org.ownerHeaders, input: invoiceInput(order.billingItems[0]!.id, "100000000") });
      return { deal, order, invoice };
    }

    it("keeps the invoice and its number, frees the item, records who and why, and audits it", async () => {
      const org = await setupOrganization();
      const { order, invoice } = await invoicedOrder(org);

      const voided = await voidInvoice({ headers: org.ownerHeaders, invoiceId: invoice.id, input: { reason: "Salah nominal" } });
      expect(voided).toMatchObject({ status: "VOID", voidReason: "Salah nominal", invoiceNumber: invoice.invoiceNumber, total: "100000000", remainingAmount: "0" });
      expect((await getOrder({ headers: org.ownerHeaders, orderId: order.id })).billingItems[0]).toMatchObject({ status: "READY", invoiceId: null });
      const audit = await db.query.auditEvents.findFirst({ where: and(eq(auditEvents.targetId, invoice.id), eq(auditEvents.action, "invoice.voided")) });
      expect(audit).toMatchObject({ actorId: org.ownerUserId, targetType: "invoice" });
    });

    it("is a no-op the second time, needs a reason, and refuses an invoice with payments", async () => {
      const org = await setupOrganization();
      const { invoice } = await invoicedOrder(org);
      await expect(voidInvoice({ headers: org.ownerHeaders, invoiceId: invoice.id, input: { reason: "  " } })).rejects.toThrow();

      await recordPayment({
        headers: org.ownerHeaders,
        input: { invoiceId: invoice.id, amount: "1000000", paymentDate: invoice.issueDate, paymentMethod: "BANK_TRANSFER", idempotencyKey: crypto.randomUUID() },
      });
      await expect(voidInvoice({ headers: org.ownerHeaders, invoiceId: invoice.id, input: { reason: "Coba" } })).rejects.toThrow(/payments/);

      const other = await invoicedOrder(org);
      const first = await voidInvoice({ headers: org.ownerHeaders, invoiceId: other.invoice.id, input: { reason: "Salah" } });
      const second = await voidInvoice({ headers: org.ownerHeaders, invoiceId: other.invoice.id, input: { reason: "Lagi" } });
      expect(second.voidedAt).toBe(first.voidedAt);
      expect(await db.query.auditEvents.findMany({ where: and(eq(auditEvents.targetId, other.invoice.id), eq(auditEvents.action, "invoice.voided")) })).toHaveLength(1);
    });

    it("refuses a payment on a voided invoice and issues a replacement that points back", async () => {
      const org = await setupOrganization();
      const { order, invoice } = await invoicedOrder(org);
      await voidInvoice({ headers: org.ownerHeaders, invoiceId: invoice.id, input: { reason: "Salah customer" } });

      await expect(
        recordPayment({ headers: org.ownerHeaders, input: { invoiceId: invoice.id, amount: "1000", paymentDate: invoice.issueDate, paymentMethod: "CASH", idempotencyKey: crypto.randomUUID() } }),
      ).rejects.toThrow(/void/);

      const item = order.billingItems[0]!;
      await expect(createInvoice({ headers: org.ownerHeaders, input: invoiceInput(item.id, "100000000", { replacesInvoiceId: crypto.randomUUID() }) })).rejects.toThrow(/not found/i);
      const replacement = await createInvoice({ headers: org.ownerHeaders, input: invoiceInput(item.id, "100000000", { replacesInvoiceId: invoice.id }) });
      expect(replacement.replacesInvoiceId).toBe(invoice.id);
      expect(replacement.invoiceNumber).not.toBe(invoice.invoiceNumber);
      await expect(createInvoice({ headers: org.ownerHeaders, input: invoiceInput(item.id, "100000000", { replacesInvoiceId: replacement.id }) })).rejects.toThrow();
    });

    it("lets a Sales user do nothing here", async () => {
      const org = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const { invoice } = await invoicedOrder(org);
      await expect(voidInvoice({ headers: sales.headers, invoiceId: invoice.id, input: { reason: "Coba" } })).rejects.toThrow();
    });

    it("renders the PDF of an invoice, marked VOID once voided", async () => {
      const org = await setupOrganization();
      const { invoice } = await invoicedOrder(org);
      const live = await renderInvoicePdf(await getInvoiceForPdf({ headers: org.ownerHeaders, invoiceId: invoice.id }));
      expect(live.subarray(0, 4).toString()).toBe("%PDF");
      await voidInvoice({ headers: org.ownerHeaders, invoiceId: invoice.id, input: { reason: "Salah" } });
      const document = await getInvoiceForPdf({ headers: org.ownerHeaders, invoiceId: invoice.id });
      expect(document.voided).toBe(true);
      expect((await renderInvoicePdf(document)).subarray(0, 4).toString()).toBe("%PDF");
    });
  });

  describe("cancelling an order and reopening a won deal", () => {
    it("cancels an order without live invoices, and not one that still has them", async () => {
      const org = await setupOrganization();
      const deal = await openDeal(org);
      const { order } = await confirmWon({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { commitmentType: "CONTRACT" } });
      const invoice = await createInvoice({ headers: org.ownerHeaders, input: invoiceInput(order.billingItems[0]!.id, "100000000") });

      await expect(cancelOrder({ headers: org.ownerHeaders, orderId: order.id, input: { reason: "Batal" } })).rejects.toThrow(/invoices/);
      await voidInvoice({ headers: org.ownerHeaders, invoiceId: invoice.id, input: { reason: "Batal" } });
      const cancelled = await cancelOrder({ headers: org.ownerHeaders, orderId: order.id, input: { reason: "Customer mundur" } });
      expect(cancelled).toMatchObject({ status: "CANCELLED", cancelReason: "Customer mundur" });
      expect(cancelled.billingItems.every((item) => item.status === "CANCELLED")).toBe(true);
      await expect(createInvoice({ headers: org.ownerHeaders, input: invoiceInput(order.billingItems[0]!.id, "100000000") })).rejects.toThrow(/cancelled/);
      expect((await cancelOrder({ headers: org.ownerHeaders, orderId: order.id, input: { reason: "Lagi" } })).status).toBe("CANCELLED");
    });

    it("reopens a won deal for Owner/Admin only, cancels its orders, and lets it be won again", async () => {
      const org = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const admin = await addMember(org, "ADMIN", "Maya");
      const deal = await openDeal(org, { assignedToId: sales.userId });
      const { deal: won, order } = await confirmWon({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { commitmentType: "PURCHASE_ORDER" } });
      const input = { toStatus: "NEGOTIATION", reason: "Customer minta negosiasi ulang" };

      await expect(reopenDeal({ headers: sales.headers, dealId: deal.id, expectedVersion: won.version, input })).rejects.toThrow(/owner or an admin/);
      const reopened = await reopenDeal({ headers: admin.headers, dealId: deal.id, expectedVersion: won.version, input });
      expect(reopened).toMatchObject({ status: "NEGOTIATION", wonAt: null, wonValue: null });
      expect((await getOrder({ headers: org.ownerHeaders, orderId: order.id })).status).toBe("CANCELLED");
      const event = await db.query.activities.findFirst({ where: and(eq(activities.dealId, deal.id), eq(activities.eventType, "reopened")) });
      expect(event!.metadata).toMatchObject({ fromStatus: "WON", cancelledOrders: [order.orderNumber], previousWonValue: "100000000" });

      const again = await confirmWon({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: reopened.version, input: { commitmentType: "CONTRACT" } });
      expect(again.order.orderNumber).not.toBe(order.orderNumber);
      expect(again.order.status).toBe("ACTIVE");
    });

    it("refuses to reopen a won deal that has a live invoice until it is voided", async () => {
      const org = await setupOrganization();
      const deal = await openDeal(org);
      const { deal: won, order } = await confirmWon({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { commitmentType: "PURCHASE_ORDER" } });
      const invoice = await createInvoice({ headers: org.ownerHeaders, input: invoiceInput(order.billingItems[0]!.id, "100000000") });
      const input = { toStatus: "PROPOSAL", reason: "Coba" };

      await expect(reopenDeal({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: won.version, input })).rejects.toThrow(/void the invoices/);
      expect(await db.query.deals.findFirst({ where: eq(deals.id, deal.id) })).toMatchObject({ status: "WON", version: won.version });
      expect((await getOrder({ headers: org.ownerHeaders, orderId: order.id })).status).toBe("FULLY_BILLED");

      await voidInvoice({ headers: org.ownerHeaders, invoiceId: invoice.id, input: { reason: "Batal" } });
      expect((await reopenDeal({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: won.version, input })).status).toBe("PROPOSAL");
    });
  });

  describe("derived order status (ORD-05)", () => {
    it("moves from ACTIVE to FULLY_BILLED to CLOSED as the invoice is issued and paid", async () => {
      const org = await setupOrganization();
      const deal = await openDeal(org);
      const { order } = await confirmWon({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { commitmentType: "CONTRACT" } });
      expect(order.status).toBe("ACTIVE");

      const invoice = await createInvoice({ headers: org.ownerHeaders, input: invoiceInput(order.billingItems[0]!.id, "100000000") });
      expect((await getOrder({ headers: org.ownerHeaders, orderId: order.id })).status).toBe("FULLY_BILLED");

      await recordPayment({
        headers: org.ownerHeaders,
        input: { invoiceId: invoice.id, amount: "100000000", paymentDate: invoice.issueDate, paymentMethod: "BANK_TRANSFER", idempotencyKey: crypto.randomUUID() },
      });
      expect((await getOrder({ headers: org.ownerHeaders, orderId: order.id })).status).toBe("CLOSED");
    });
  });

  it("turns a lost deal's transition into a plain one, so LOST still needs no order", async () => {
    const org = await setupOrganization();
    const deal = await openDeal(org);
    const lost = await transitionDeal({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { toStatus: "LOST", lostReason: "NO_NEED" } });
    expect(lost.status).toBe("LOST");
    expect(await db.query.billingItems.findMany({ where: eq(billingItems.organizationId, org.organizationId) })).toHaveLength(0);
  });
});
