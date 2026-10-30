import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { createCustomer } from "@/server/customers/customers";
import { createDeal,  } from "@/server/deals/deals";
import { createQuotation } from "@/server/quotations/quotations";
import { addMember, migrateTestDatabase, setupOrganization, type TestOrg } from "@/server/testing/org-helpers";
import { globalSearch } from "./search";
import { orgDay } from "@/server/testing/dates";
import { transitionOrWin, createInvoiceForDeal } from "@/server/testing/orders";

describe("global search", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  async function fixture(org: TestOrg) {
    const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Maju Jaya", contactPerson: "Budi Santoso", phone: "08123456789" } });
    let won = await createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "Paket CCTV Maju", estimatedValue: "30000000", assignedToId: org.ownerUserId } });
    for (const toStatus of ["PROPOSAL", "NEGOTIATION", "COMMITMENT", "WON"]) {
      won = await transitionOrWin({ headers: org.ownerHeaders, dealId: won.id, expectedVersion: won.version, input: { toStatus } });
    }
    const open = await createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "Jaringan Maju", estimatedValue: "5000000", assignedToId: org.ownerUserId } });
    const quotation = await createQuotation({
      headers: org.ownerHeaders,
      input: { dealId: open.id, validUntil: orgDay(14), items: [{ description: "Kabel", quantity: "1", unit: "paket", unitPrice: "5000000" }] },
    });
    const invoice = await createInvoiceForDeal({
      headers: org.ownerHeaders,
      input: { dealId: won.id, dueDate: orgDay(20), items: [{ description: "Paket", quantity: "1", unit: "paket", unitPrice: "30000000" }], idempotencyKey: crypto.randomUUID() },
    });
    return { customer, won, open, quotation, invoice };
  }

  it("finds across customers, deals, quotations and invoices, and matches a phone in any format", async () => {
    const org = await setupOrganization();
    const data = await fixture(org);

    const byName = await globalSearch({ headers: org.ownerHeaders, query: "maju" });
    expect(byName.searched).toBe(true);
    expect(byName.customers.map((c) => c.id)).toEqual([data.customer.id]);
    expect(byName.deals.map((d) => d.title).sort()).toEqual(["Jaringan Maju", "Paket CCTV Maju"]);
    expect(byName.quotations.map((q) => q.id)).toEqual([data.quotation.id]);
    expect(byName.invoices.map((i) => i.id)).toEqual([data.invoice.id]);

    const byNumber = await globalSearch({ headers: org.ownerHeaders, query: data.invoice.invoiceNumber });
    expect(byNumber.invoices.map((i) => i.id)).toEqual([data.invoice.id]);
    expect((await globalSearch({ headers: org.ownerHeaders, query: data.quotation.quotationNumber })).quotations).toHaveLength(1);

    for (const phone of ["0812 3456", "+62 812-3456-789", "62812"]) {
      expect((await globalSearch({ headers: org.ownerHeaders, query: phone })).customers.map((c) => c.id)).toEqual([data.customer.id]);
    }
  });

  it("does not search a query shorter than two characters, and caps each group", async () => {
    const org = await setupOrganization();
    await fixture(org);
    expect(await globalSearch({ headers: org.ownerHeaders, query: "m" })).toMatchObject({ searched: false, customers: [], deals: [], quotations: [], invoices: [] });
    const capped = await globalSearch({ headers: org.ownerHeaders, query: "maju", limit: 1 });
    expect(capped.deals).toHaveLength(1);
    await expect(globalSearch({ headers: org.ownerHeaders, query: "a".repeat(201) })).rejects.toThrow();
  });

  it("scopes by role: Sales sees no invoices, Finance sees won deals and invoices but no quotations", async () => {
    const org = await setupOrganization();
    const sales = await addMember(org, "SALES", "Andi");
    const finance = await addMember(org, "FINANCE", "Dewi");
    await fixture(org);

    const asSales = await globalSearch({ headers: sales.headers, query: "maju" });
    expect(asSales.invoices).toEqual([]);
    expect(asSales.quotations).toHaveLength(1);
    expect(asSales.deals).toHaveLength(2);

    const asFinance = await globalSearch({ headers: finance.headers, query: "maju" });
    expect(asFinance.quotations).toEqual([]);
    expect(asFinance.deals.map((d) => d.title)).toEqual(["Paket CCTV Maju"]);
    expect(asFinance.invoices).toHaveLength(1);
    expect(asFinance.customers).toHaveLength(1);
  });

  it("never returns another organization's records", async () => {
    const org = await setupOrganization();
    const other = await setupOrganization();
    await fixture(org);
    const result = await globalSearch({ headers: other.ownerHeaders, query: "maju" });
    expect(result).toMatchObject({ customers: [], deals: [], quotations: [], invoices: [] });
  });
});
