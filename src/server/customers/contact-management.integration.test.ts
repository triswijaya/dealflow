import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type postgres from "postgres";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";
import { createDeal, updateDeal } from "@/server/deals/deals";
import { getDealDetail } from "@/server/deals/deal-views";
import { createQuotation, getQuotation, transitionQuotationStatus } from "@/server/quotations/quotations";
import { buildFollowUpWhatsAppMessage } from "@/server/whatsapp/whatsapp";
import { orgDay } from "@/server/testing/dates";
import { addMember, migrateTestDatabase, setupOrganization, type TestOrg } from "@/server/testing/org-helpers";
import { createContact, deleteContact, listContacts, setPrimaryContact, updateContact } from "./contacts";
import { createCustomer, findSimilarCustomers, getCustomer, updateCustomer } from "./customers";

describe("contact management and the deal contact (CUS-04)", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  async function customerWithContacts(org: TestOrg) {
    const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Banyak Kontak", contactPerson: "Budi", phone: "08123456789" } });
    const finance = await createContact({ headers: org.ownerHeaders, customerId: customer.id, input: { name: "Lestari", role: "Finance", phone: "0877 1234 5678", email: "lestari@bk.example" } });
    const emailOnly = await createContact({ headers: org.ownerHeaders, customerId: customer.id, input: { name: "Direktur", email: "dir@bk.example" } });
    return { customer, finance, emailOnly };
  }
  const dealFor = (org: TestOrg, customerId: string, extra: Record<string, unknown> = {}) =>
    createDeal({ headers: org.ownerHeaders, input: { customerId, title: "CCTV", estimatedValue: "3000000", assignedToId: org.ownerUserId, ...extra } });

  describe("contacts", () => {
    it("lists the primary contact first and creates the others as non-primary", async () => {
      const org = await setupOrganization();
      const { customer, finance, emailOnly } = await customerWithContacts(org);
      expect(finance).toMatchObject({ isPrimary: false, role: "Finance", phoneNormalized: "6287712345678" });
      expect(emailOnly).toMatchObject({ phoneNormalized: null, email: "dir@bk.example" });
      const list = await listContacts({ headers: org.ownerHeaders, customerId: customer.id });
      expect(list.map((contact) => contact.name)).toEqual(["Budi", "Direktur", "Lestari"]);
      expect(list[0]!.isPrimary).toBe(true);
    });

    it("validates a contact like a customer's: a name, and a phone or an email", async () => {
      const org = await setupOrganization();
      const { customer } = await customerWithContacts(org);
      const create = (input: unknown) => createContact({ headers: org.ownerHeaders, customerId: customer.id, input });
      await expect(create({ name: "", phone: "08123456789" })).rejects.toThrow();
      await expect(create({ name: "Tanpa Kontak" })).rejects.toThrow();
      await expect(create({ name: "Salah", phone: "8123" })).rejects.toThrow(/phone/i);
      await expect(create({ name: "Peran", phone: "08123456789", role: "x".repeat(101) })).rejects.toThrow();
    });

    it("updates a contact with a version check, and moves the customer's version when the primary one changes", async () => {
      const org = await setupOrganization();
      const { customer, finance } = await customerWithContacts(org);

      await expect(updateContact({ headers: org.ownerHeaders, contactId: finance.id, expectedVersion: 9, input: { name: "X", email: "x@y.example" } })).rejects.toThrow(/modified by someone else/);
      const edited = await updateContact({ headers: org.ownerHeaders, contactId: finance.id, expectedVersion: finance.version, input: { name: "Lestari W.", role: "", email: "lestari@bk.example" } });
      expect(edited).toMatchObject({ name: "Lestari W.", role: null, phoneNormalized: null, version: 2 });
      expect((await getCustomer({ headers: org.ownerHeaders, customerId: customer.id })).version).toBe(customer.version);

      const primary = (await listContacts({ headers: org.ownerHeaders, customerId: customer.id }))[0]!;
      await updateContact({ headers: org.ownerHeaders, contactId: primary.id, expectedVersion: primary.version, input: { name: "Budi Baru", phone: "08123456789" } });
      expect((await getCustomer({ headers: org.ownerHeaders, customerId: customer.id }))).toMatchObject({ contactPerson: "Budi Baru", version: customer.version + 1 });
    });

    it("swaps the primary contact atomically, and the customer shows the new one", async () => {
      const org = await setupOrganization();
      const { customer, finance } = await customerWithContacts(org);

      const promoted = await setPrimaryContact({ headers: org.ownerHeaders, contactId: finance.id, expectedVersion: finance.version });
      expect(promoted.isPrimary).toBe(true);
      const list = await listContacts({ headers: org.ownerHeaders, customerId: customer.id });
      expect(list.filter((contact) => contact.isPrimary).map((contact) => contact.name)).toEqual(["Lestari"]);
      expect(await getCustomer({ headers: org.ownerHeaders, customerId: customer.id })).toMatchObject({ contactPerson: "Lestari", phoneNormalized: "6287712345678", version: customer.version + 1 });

      // Choosing the contact that is already primary changes nothing.
      const again = await setPrimaryContact({ headers: org.ownerHeaders, contactId: finance.id, expectedVersion: 1 });
      expect(again.version).toBe(promoted.version);
    });

    it("leaves exactly one primary contact when two swaps race", async () => {
      const org = await setupOrganization();
      const { customer, finance, emailOnly } = await customerWithContacts(org);
      const results = await Promise.allSettled([
        setPrimaryContact({ headers: org.ownerHeaders, contactId: finance.id, expectedVersion: finance.version }),
        setPrimaryContact({ headers: org.ownerHeaders, contactId: emailOnly.id, expectedVersion: emailOnly.version }),
      ]);
      expect(results.every((result) => result.status === "fulfilled")).toBe(true);
      const list = await listContacts({ headers: org.ownerHeaders, customerId: customer.id });
      expect(list.filter((contact) => contact.isPrimary)).toHaveLength(1);
    });

    it("refuses to delete the primary contact or a contact a deal uses, and deletes any other", async () => {
      const org = await setupOrganization();
      const { customer, finance, emailOnly } = await customerWithContacts(org);
      const primary = (await listContacts({ headers: org.ownerHeaders, customerId: customer.id }))[0]!;

      await expect(deleteContact({ headers: org.ownerHeaders, contactId: primary.id, expectedVersion: primary.version })).rejects.toThrow(/primary contact cannot be deleted/);
      await dealFor(org, customer.id, { contactId: finance.id });
      await expect(deleteContact({ headers: org.ownerHeaders, contactId: finance.id, expectedVersion: finance.version })).rejects.toThrow(/contact of a deal/);
      await expect(deleteContact({ headers: org.ownerHeaders, contactId: emailOnly.id, expectedVersion: 99 })).rejects.toThrow(/modified by someone else/);
      await deleteContact({ headers: org.ownerHeaders, contactId: emailOnly.id, expectedVersion: emailOnly.version });
      expect((await listContacts({ headers: org.ownerHeaders, customerId: customer.id })).map((contact) => contact.name)).toEqual(["Budi", "Lestari"]);
    });

    it("stays inside the organization and closes writes to Finance", async () => {
      const orgA = await setupOrganization();
      const orgB = await setupOrganization();
      const { customer, finance } = await customerWithContacts(orgA);
      const accountant = await addMember(orgA, "FINANCE", "Dewi");

      await expect(listContacts({ headers: orgB.ownerHeaders, customerId: customer.id })).rejects.toThrow(/not found/i);
      await expect(updateContact({ headers: orgB.ownerHeaders, contactId: finance.id, expectedVersion: 1, input: { name: "X", email: "x@y.example" } })).rejects.toThrow(/not found/i);
      expect(await listContacts({ headers: accountant.headers, customerId: customer.id })).toHaveLength(3);
      await expect(createContact({ headers: accountant.headers, customerId: customer.id, input: { name: "X", email: "x@y.example" } })).rejects.toThrow();
    });
  });

  describe("the deal's contact", () => {
    it("takes one of the customer's contacts, and refuses one that is not", async () => {
      const org = await setupOrganization();
      const { customer, finance } = await customerWithContacts(org);
      const other = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Lain", phone: "08111111111" } });

      const deal = await dealFor(org, customer.id, { contactId: finance.id });
      expect(deal.contactId).toBe(finance.id);
      const detail = await getDealDetail({ headers: org.ownerHeaders, dealId: deal.id });
      expect(detail.contact).toMatchObject({ id: finance.id, name: "Lestari", role: "Finance" });

      await expect(dealFor(org, other.id, { contactId: finance.id })).rejects.toThrow(/Contact not found/);
      await expect(dealFor(org, customer.id, { contactId: crypto.randomUUID() })).rejects.toThrow(/Contact not found/);
    });

    it("keeps the contact on update unless it is cleared, and drops it when the customer changes", async () => {
      const org = await setupOrganization();
      const { customer, finance } = await customerWithContacts(org);
      const other = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Lain", phone: "08111111111" } });
      let deal = await dealFor(org, customer.id, { contactId: finance.id });
      const base = { customerId: customer.id, title: "CCTV", estimatedValue: "3000000", assignedToId: org.ownerUserId };

      deal = await updateDeal({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { ...base, title: "CCTV 2" } });
      expect(deal.contactId).toBe(finance.id);
      deal = await updateDeal({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { ...base, contactId: null } });
      expect(deal.contactId).toBeNull();
      deal = await updateDeal({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { ...base, contactId: finance.id } });
      deal = await updateDeal({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: deal.version, input: { ...base, customerId: other.id } });
      expect(deal).toMatchObject({ customerId: other.id, contactId: null });
    });

    it("is backed by a composite foreign key, so no write can pair a deal with another customer's contact", async () => {
      const org = await setupOrganization();
      const { finance } = await customerWithContacts(org);
      const other = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Lain", phone: "08111111111" } });
      const deal = await dealFor(org, other.id);
      await expect(db.update(deals).set({ contactId: finance.id }).where(eq(deals.id, deal.id))).rejects.toMatchObject({ cause: { code: "23503" } });
    });

    it("opens WhatsApp to the deal's contact, else the primary contact when that one has no phone", async () => {
      const org = await setupOrganization();
      const { customer, finance, emailOnly } = await customerWithContacts(org);
      const withPic = await dealFor(org, customer.id, { contactId: finance.id });
      const withoutPhone = await dealFor(org, customer.id, { contactId: emailOnly.id, title: "Tanpa nomor" });
      const plain = await dealFor(org, customer.id, { title: "Tanpa PIC" });

      expect(await buildFollowUpWhatsAppMessage({ headers: org.ownerHeaders, dealId: withPic.id })).toMatchObject({ phoneInternational: "6287712345678", contactName: "Lestari" });
      expect(await buildFollowUpWhatsAppMessage({ headers: org.ownerHeaders, dealId: withoutPhone.id })).toMatchObject({ phoneInternational: "628123456789", contactName: "Budi" });
      expect(await buildFollowUpWhatsAppMessage({ headers: org.ownerHeaders, dealId: plain.id })).toMatchObject({ contactName: "Budi" });
    });

    it("says so when no contact of the deal can be reached on WhatsApp", async () => {
      const org = await setupOrganization();
      const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Surel", contactPerson: "Sari", email: "sari@surel.example" } });
      const deal = await dealFor(org, customer.id);
      await expect(buildFollowUpWhatsAppMessage({ headers: org.ownerHeaders, dealId: deal.id })).rejects.toThrow(/no phone number/);
    });

    it("freezes the deal's contact into a new quotation snapshot, and the primary one without a PIC", async () => {
      const org = await setupOrganization();
      const { customer, finance } = await customerWithContacts(org);
      const send = async (dealId: string) => {
        const draft = await createQuotation({ headers: org.ownerHeaders, input: { dealId, validUntil: orgDay(14), items: [{ description: "Kamera", quantity: "1", unit: "pcs", unitPrice: "3000000" }] } });
        return transitionQuotationStatus({ headers: org.ownerHeaders, quotationId: draft.id, expectedEditVersion: draft.editVersion, toStatus: "SENT" });
      };
      const withPic = await send((await dealFor(org, customer.id, { contactId: finance.id })).id);
      const plain = await send((await dealFor(org, customer.id, { title: "Tanpa PIC" })).id);

      expect(withPic.customerSnapshot).toMatchObject({ contactPerson: "Lestari", phone: "6287712345678", email: "lestari@bk.example" });
      expect(plain.customerSnapshot).toMatchObject({ contactPerson: "Budi", phone: "628123456789" });
      await updateContact({ headers: org.ownerHeaders, contactId: finance.id, expectedVersion: finance.version, input: { name: "Orang Baru", email: "baru@bk.example" } });
      expect((await getQuotation({ headers: org.ownerHeaders, quotationId: withPic.id })).customerSnapshot).toMatchObject({ contactPerson: "Lestari" });
    });
  });

  describe("duplicate warnings", () => {
    it("match on any contact's email and on the tax id, never rejecting", async () => {
      const org = await setupOrganization();
      const { customer } = await customerWithContacts(org);
      await updateCustomer({ headers: org.ownerHeaders, customerId: customer.id, expectedVersion: customer.version, input: { companyName: "PT Banyak Kontak", contactPerson: "Budi", phone: "08123456789", taxId: "01.234.567.8-901.234" } });

      const byEmail = await findSimilarCustomers({ headers: org.ownerHeaders, email: "LESTARI@bk.example" });
      const byTaxId = await findSimilarCustomers({ headers: org.ownerHeaders, taxId: "012345678901234" });
      expect(byEmail.map((match) => match.id)).toEqual([customer.id]);
      expect(byTaxId.map((match) => match.id)).toEqual([customer.id]);
      expect(await findSimilarCustomers({ headers: org.ownerHeaders, email: "nobody@else.example", taxId: "123" })).toEqual([]);
      await expect(createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Kembar NPWP", phone: "08999999999", taxId: "012345678901234" } })).resolves.toBeDefined();
    });
  });
});
