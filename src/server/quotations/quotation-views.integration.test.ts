import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type postgres from "postgres";
import { createCustomer, updateCustomer } from "@/server/customers/customers";
import { db } from "@/server/db/client";
import { createDeal, transitionDeal } from "@/server/deals/deals";
import { customers, organizationSettings, quotations } from "@/server/db/schema";
import { addMember, migrateTestDatabase, setupOrganization, type TestOrg } from "@/server/testing/org-helpers";
import { createQuotation, reviseQuotation, transitionQuotationStatus } from "./quotations";
import { getQuotationEditorContext, getQuotationDetail, listQuotationActivities, listQuotationRows, listQuotationVersions } from "./quotation-views";
import { orgDay } from "@/server/testing/dates";

describe("quotation read models", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  const item = (overrides: Record<string, unknown> = {}) => ({ description: "CCTV Camera 4MP", quantity: "4", unit: "pcs", unitPrice: "1500000", ...overrides });
  const future = orgDay;

  async function dealWith(org: TestOrg, companyName = "PT Maju Jaya", title = "CCTV Installation") {
    const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName, contactPerson: "Budi Santoso", phone: "08123456789", email: "budi@example.test", address: "Jl. Industri 12" } });
    let deal = await createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title, estimatedValue: "10000000", assignedToId: org.ownerUserId } });
    for (const toStatus of ["PROPOSAL"]) {
      deal = await transitionDeal({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { toStatus } });
    }
    return { customer, deal };
  }

  const draft = (org: TestOrg, dealId: string, overrides: Record<string, unknown> = {}) =>
    createQuotation({ headers: org.ownerHeaders, input: { dealId, validUntil: future(14), items: [item()], ...overrides } });

  async function send(org: TestOrg, quotation: { id: string; editVersion: number }) {
    return transitionQuotationStatus({ headers: org.ownerHeaders, quotationId: quotation.id, expectedEditVersion: quotation.editVersion, toStatus: "SENT" });
  }

  describe("listQuotationRows", () => {
    it("searches number, deal and customer, and filters by customer", async () => {
      const org = await setupOrganization();
      const a = await dealWith(org, "PT Maju Jaya", "Instalasi CCTV");
      const b = await dealWith(org, "CV Cahaya Abadi", "Jaringan kantor");
      const qa = await draft(org, a.deal.id);
      await draft(org, b.deal.id);

      const numbers = async (filters: Record<string, string>) => (await listQuotationRows({ headers: org.ownerHeaders, filters })).items.map((row) => row.customerName).sort();
      expect(await numbers({})).toEqual(["CV Cahaya Abadi", "PT Maju Jaya"]);
      expect(await numbers({ query: qa.quotationNumber })).toEqual(["PT Maju Jaya"]);
      expect(await numbers({ query: "jaringan" })).toEqual(["CV Cahaya Abadi"]);
      expect(await numbers({ query: "cahaya" })).toEqual(["CV Cahaya Abadi"]);
      expect(await numbers({ customerId: a.customer.id })).toEqual(["PT Maju Jaya"]);
      const row = (await listQuotationRows({ headers: org.ownerHeaders, filters: { customerId: a.customer.id } })).items[0]!;
      expect(row).toMatchObject({ dealTitle: "Instalasi CCTV", status: "DRAFT", total: "6000000", isLatest: true });
    });

    it("shows only the newest version of each family unless asked for all", async () => {
      const org = await setupOrganization();
      const { deal } = await dealWith(org);
      const first = await draft(org, deal.id);
      const sent = await send(org, first);
      const revised = await reviseQuotation({
        headers: org.ownerHeaders,
        input: { sourceQuotationId: sent.id, expectedLatestQuotationId: sent.id, idempotencyKey: `k-${Date.now()}` },
      });

      const latest = await listQuotationRows({ headers: org.ownerHeaders });
      expect(latest.items.map((row) => row.quotationNumber)).toEqual([revised.quotationNumber]);
      const all = await listQuotationRows({ headers: org.ownerHeaders, filters: { latestOnly: false } });
      expect(all.totalItems).toBe(2);
      expect(all.items.map((row) => row.isLatest).sort()).toEqual([false, true]);
    });

    it("filters by effective status: a sent quotation past its date is EXPIRED, and a late draft stays a draft", async () => {
      const org = await setupOrganization();
      const { deal } = await dealWith(org);
      const live = await draft(org, deal.id);
      const sentLive = await send(org, live);
      const { deal: other } = await dealWith(org, "CV Lain", "Lain");
      const old = await draft(org, other.id);
      const sentOld = await send(org, old);
      const { deal: third } = await dealWith(org, "PT Ketiga", "Ketiga");
      const lateDraft = await draft(org, third.id);

      await db.update(quotations).set({ validUntil: future(-2) }).where(eq(quotations.id, sentOld.id));
      await db.update(quotations).set({ validUntil: future(-2) }).where(eq(quotations.id, lateDraft.id));

      const ids = async (status: "DRAFT" | "SENT" | "EXPIRED") =>
        (await listQuotationRows({ headers: org.ownerHeaders, filters: { status } })).items.map((row) => row.id);
      expect(await ids("SENT")).toEqual([sentLive.id]);
      expect(await ids("EXPIRED")).toEqual([sentOld.id]);
      expect(await ids("DRAFT")).toEqual([lateDraft.id]);
      const shown = (await listQuotationRows({ headers: org.ownerHeaders })).items.find((row) => row.id === sentOld.id);
      expect(shown?.status).toBe("EXPIRED");
    });

    it("is closed to Finance and never lists another organization's quotations", async () => {
      const org = await setupOrganization();
      const other = await setupOrganization();
      const finance = await addMember(org, "FINANCE", "Dewi");
      const { deal } = await dealWith(org);
      await draft(org, deal.id);
      await expect(listQuotationRows({ headers: finance.headers })).rejects.toThrow();
      expect((await listQuotationRows({ headers: other.ownerHeaders })).items).toEqual([]);
    });
  });

  describe("getQuotationDetail", () => {
    it("reads the live company and customer while a draft, and the frozen snapshot once sent", async () => {
      const org = await setupOrganization();
      const { customer, deal } = await dealWith(org);
      const created = await draft(org, deal.id, { notes: "Catatan", terms: "Syarat" });

      const asDraft = await getQuotationDetail({ headers: org.ownerHeaders, quotationId: created.id });
      expect(asDraft).toMatchObject({ dealTitle: "CCTV Installation", customerName: "PT Maju Jaya", status: "DRAFT", createdByName: "Owner", sentByName: null });
      expect(asDraft.customer.companyName).toBe("PT Maju Jaya");
      expect(asDraft.items).toHaveLength(1);
      expect(asDraft.items[0]).toMatchObject({ quantity: "4.000", subtotal: "6000000" });

      await send(org, created);
      const existing = await db.query.customers.findFirst({ where: eq(customers.id, customer.id) });
      await updateCustomer({
        headers: org.ownerHeaders,
        customerId: customer.id,
        expectedVersion: existing!.version,
        input: { companyName: "PT Maju Jaya Baru", contactPerson: "Budi Santoso", phone: "08123456789" },
      });

      const asSent = await getQuotationDetail({ headers: org.ownerHeaders, quotationId: created.id });
      expect(asSent.status).toBe("SENT");
      expect(asSent.sentByName).toBe("Owner");
      // CUS-03: editing the customer later does not rewrite a sent document.
      expect(asSent.customer.companyName).toBe("PT Maju Jaya");
      expect(asSent.versions).toHaveLength(1);
      expect(asSent.invoice).toBeNull();
    });

    it("lists every version of the family, flags the newest and leaves the old one read-only", async () => {
      const org = await setupOrganization();
      const { deal } = await dealWith(org);
      const first = await send(org, await draft(org, deal.id));
      const second = await reviseQuotation({
        headers: org.ownerHeaders,
        input: { sourceQuotationId: first.id, expectedLatestQuotationId: first.id, idempotencyKey: `k-${Date.now()}` },
      });

      const oldDetail = await getQuotationDetail({ headers: org.ownerHeaders, quotationId: first.id });
      expect(oldDetail.isLatest).toBe(false);
      expect(oldDetail.latestVersionId).toBe(second.id);
      expect(oldDetail.versions.map((version) => version.quotationNumber)).toEqual([first.quotationNumber, second.quotationNumber]);

      const { familyNumber, versions } = await listQuotationVersions({ headers: org.ownerHeaders, quotationId: second.id });
      expect(familyNumber).toBe(first.quotationNumber);
      expect(versions.map((version) => version.quotationNumber)).toEqual([second.quotationNumber, first.quotationNumber]);
      expect(versions[0]).toMatchObject({ isLatest: true, itemCount: 1, revisedFromNumber: first.quotationNumber, createdByName: "Owner" });
      expect(versions[1]).toMatchObject({ isLatest: false, revisedFromNumber: null });
    });

    it("answers NOT_FOUND for a missing, malformed or cross-tenant id, and is closed to Finance", async () => {
      const org = await setupOrganization();
      const other = await setupOrganization();
      const finance = await addMember(org, "FINANCE", "Dewi");
      const { deal } = await dealWith(org);
      const created = await draft(org, deal.id);

      for (const [headers, quotationId] of [
        [org.ownerHeaders, "00000000-0000-4000-8000-000000000000"],
        [org.ownerHeaders, "not-a-uuid"],
        [other.ownerHeaders, created.id],
      ] as const) {
        await expect(getQuotationDetail({ headers, quotationId })).rejects.toThrow(/not found/i);
        await expect(listQuotationActivities({ headers, quotationId })).rejects.toThrow(/not found/i);
        await expect(listQuotationVersions({ headers, quotationId })).rejects.toThrow(/not found/i);
      }
      await expect(getQuotationDetail({ headers: finance.headers, quotationId: created.id })).rejects.toThrow();
    });
  });

  it("collects one quotation's own activity, including revisions that mention it", async () => {
    const org = await setupOrganization();
    const { deal } = await dealWith(org);
    const first = await send(org, await draft(org, deal.id));
    const second = await reviseQuotation({
      headers: org.ownerHeaders,
      input: { sourceQuotationId: first.id, expectedLatestQuotationId: first.id, idempotencyKey: `k-${Date.now()}` },
    });

    const kinds = async (quotationId: string) => (await listQuotationActivities({ headers: org.ownerHeaders, quotationId })).map((event) => event.eventType).sort();
    expect(await kinds(first.id)).toEqual(["created", "revised", "sent"]);
    expect(await kinds(second.id)).toEqual(["revised"]);
  });

  it("gives the editor the deal, customer and the company's default terms", async () => {
    const org = await setupOrganization();
    const { deal } = await dealWith(org);
    await db.update(organizationSettings).set({ defaultQuotationTerms: "Pembayaran 50% di muka." }).where(eq(organizationSettings.organizationId, org.organizationId));

    const context = await getQuotationEditorContext({ headers: org.ownerHeaders, dealId: deal.id });
    expect(context).toMatchObject({ deal: { id: deal.id, title: "CCTV Installation" }, customer: { companyName: "PT Maju Jaya" }, defaultTerms: "Pembayaran 50% di muka." });
    expect(context.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect(getQuotationEditorContext({ headers: org.ownerHeaders, dealId: "not-a-uuid" })).rejects.toThrow(/not found/i);
  });
});
