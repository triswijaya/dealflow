import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type postgres from "postgres";
import { db } from "@/server/db/client";
import { contacts, customers } from "@/server/db/schema";
import { createDeal } from "@/server/deals/deals";
import { createQuotation, transitionQuotationStatus, getQuotation } from "@/server/quotations/quotations";
import { orgDay } from "@/server/testing/dates";
import { addMember, migrateTestDatabase, setupOrganization } from "@/server/testing/org-helpers";
import { createCustomer, findSimilarCustomers, getCustomer, listCustomers, searchCustomerOptions, updateCustomer } from "./customers";

describe("customer contacts and tax id (CUS-01, CUS-04)", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });

  const contactsOf = (customerId: string) => db.query.contacts.findMany({ where: eq(contacts.customerId, customerId) });

  describe("createCustomer", () => {
    it("creates the customer together with its one primary contact", async () => {
      const org = await setupOrganization();
      const created = await createCustomer({
        headers: org.ownerHeaders,
        input: { companyName: "PT Maju Jaya", contactPerson: "Budi Santoso", phone: "0812 3456 789", email: "budi@majujaya.example" },
      });

      expect(created).toMatchObject({ contactPerson: "Budi Santoso", phoneRaw: "0812 3456 789", phoneNormalized: "628123456789", email: "budi@majujaya.example", taxId: null });
      const rows = await contactsOf(created.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: created.primaryContactId, isPrimary: true, name: "Budi Santoso", organizationId: org.organizationId, createdById: org.ownerUserId });
    });

    it("lets a prospect be just a name and a number: the contact takes the customer's name", async () => {
      const org = await setupOrganization();
      const created = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "Pak Hendra", phone: "08123456789" } });
      expect(created).toMatchObject({ contactPerson: "Pak Hendra", phoneNormalized: "628123456789", email: null });
    });

    it("accepts an email-only contact", async () => {
      const org = await setupOrganization();
      const created = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Surel", contactPerson: "Sari", email: "sari@surel.example" } });
      expect(created).toMatchObject({ phoneRaw: null, phoneNormalized: null, email: "sari@surel.example" });
    });

    it("rejects a contact with neither a phone nor an email, and creates nothing", async () => {
      const org = await setupOrganization();
      await expect(createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Tanpa Kontak", contactPerson: "Budi" } })).rejects.toThrow();
      await expect(createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Tanpa Kontak", contactPerson: "Budi", phone: "  ", email: "" } })).rejects.toThrow();
      const found = await db.query.customers.findMany({ where: and(eq(customers.organizationId, org.organizationId), eq(customers.companyName, "PT Tanpa Kontak")) });
      expect(found).toHaveLength(0);
    });

    it("rolls the customer back when the phone cannot be normalized", async () => {
      const org = await setupOrganization();
      await expect(createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Rollback", phone: "8123456789" } })).rejects.toThrow(/phone/i);
      expect(await db.query.customers.findMany({ where: and(eq(customers.organizationId, org.organizationId), eq(customers.companyName, "PT Rollback")) })).toHaveLength(0);
    });

    it("stores the tax id as digits only and accepts 15 or 16 of them, however it was typed", async () => {
      const org = await setupOrganization();
      const formatted = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Pajak A", phone: "08123456789", taxId: "01.234.567.8-901.000" } });
      expect(formatted.taxId).toBe("012345678901000");
      const long = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Pajak B", phone: "08123456789", taxId: "0123456789012345" } });
      expect(long.taxId).toBe("0123456789012345");
      const blank = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Pajak C", phone: "08123456789", taxId: "" } });
      expect(blank.taxId).toBeNull();
    });

    it("rejects a tax id that is not 15 or 16 digits", async () => {
      const org = await setupOrganization();
      for (const taxId of ["12345", "01234567890123", "01234567890123456", "ABCDEFGHIJKLMNO"]) {
        await expect(createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Pajak", phone: "08123456789", taxId } })).rejects.toThrow(/15 or 16 digits/);
      }
    });

    it("does not need a tax id for a deal or a quotation", async () => {
      const org = await setupOrganization();
      const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Tanpa NPWP", phone: "08123456789" } });
      const deal = await createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "CCTV", estimatedValue: "1000000", assignedToId: org.ownerUserId } });
      const quotation = await createQuotation({ headers: org.ownerHeaders, input: { dealId: deal.id, validUntil: orgDay(14), items: [{ description: "Kamera", quantity: "1", unit: "pcs", unitPrice: "1000000" }] } });
      expect(quotation.status).toBe("DRAFT");
    });
  });

  describe("updateCustomer", () => {
    it("edits the primary contact with the customer, bumping both versions", async () => {
      const org = await setupOrganization();
      const created = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Lama", contactPerson: "Budi", phone: "08123456789" } });

      const updated = await updateCustomer({
        headers: org.ownerHeaders,
        customerId: created.id,
        expectedVersion: created.version,
        input: { companyName: "PT Baru", contactPerson: "Siti", phone: "08111111111", email: "siti@baru.example", taxId: "012345678901234" },
      });
      expect(updated).toMatchObject({ companyName: "PT Baru", contactPerson: "Siti", phoneNormalized: "628111111111", email: "siti@baru.example", taxId: "012345678901234", version: 2 });

      const rows = await contactsOf(created.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: created.primaryContactId, name: "Siti", version: 2, updatedById: org.ownerUserId });
    });

    it("clears an email and a tax id when they are emptied", async () => {
      const org = await setupOrganization();
      const created = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Isi", phone: "08123456789", email: "a@b.example", taxId: "012345678901234" } });
      const updated = await updateCustomer({ headers: org.ownerHeaders, customerId: created.id, expectedVersion: created.version, input: { companyName: "PT Isi", phone: "08123456789", email: "", taxId: "" } });
      expect(updated).toMatchObject({ email: null, taxId: null });
    });

    it("rejects a stale version without touching the contact", async () => {
      const org = await setupOrganization();
      const created = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Basi", contactPerson: "Budi", phone: "08123456789" } });
      await expect(
        updateCustomer({ headers: org.ownerHeaders, customerId: created.id, expectedVersion: created.version + 5, input: { companyName: "PT Basi", contactPerson: "Orang Lain", phone: "08123456789" } }),
      ).rejects.toThrow(/modified by someone else/);
      expect((await contactsOf(created.id))[0]).toMatchObject({ name: "Budi", version: 1 });
    });
  });

  describe("reading", () => {
    it("returns the primary contact in the customer, the list and the option picker", async () => {
      const org = await setupOrganization();
      const created = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Baca", contactPerson: "Dewi", phone: "08123456789" } });

      expect(await getCustomer({ headers: org.ownerHeaders, customerId: created.id })).toMatchObject({ contactPerson: "Dewi", phoneNormalized: "628123456789" });
      const list = await listCustomers({ headers: org.ownerHeaders });
      expect(list.items.find((item) => item.id === created.id)).toMatchObject({ contactPerson: "Dewi", primaryContactId: created.primaryContactId });
      expect(await searchCustomerOptions({ headers: org.ownerHeaders, query: "Baca" })).toEqual([{ id: created.id, companyName: "PT Baca", contactPerson: "Dewi" }]);
    });

    it("finds a customer through any of its contacts and through its tax id (SEARCH-01)", async () => {
      const org = await setupOrganization();
      const created = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Cari", contactPerson: "Rahmat Hidayat", phone: "0812 9999 000", email: "rahmat@cari.example", taxId: "012345678901234" } });
      // A second contact, written directly: the contact operations arrive in the next change.
      await db.insert(contacts).values({ organizationId: org.organizationId, customerId: created.id, name: "Lestari Finance", phoneRaw: "0877 1234 5678", phoneNormalized: "6287712345678", email: "lestari@cari.example", createdById: org.ownerUserId });

      const find = async (query: string) => (await listCustomers({ headers: org.ownerHeaders, query })).items.map((item) => item.id);
      for (const query of ["Rahmat", "rahmat@cari", "0812 9999", "Lestari", "lestari@cari", "0877 1234", "012345678901234"]) {
        expect(await find(query), query).toEqual([created.id]);
      }
      expect(await find("tidak ada")).toEqual([]);
    });

    it("warns about a customer that shares a phone number with any contact, not only the primary one", async () => {
      const org = await setupOrganization();
      const created = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Kembar", contactPerson: "Budi", phone: "08123456789" } });
      await db.insert(contacts).values({ organizationId: org.organizationId, customerId: created.id, name: "Finance", phoneRaw: "0877 1234 5678", phoneNormalized: "6287712345678", createdById: org.ownerUserId });

      const byPrimary = await findSimilarCustomers({ headers: org.ownerHeaders, phone: "0812-3456-789" });
      const bySecond = await findSimilarCustomers({ headers: org.ownerHeaders, phone: "+62 877 1234 5678" });
      expect(byPrimary.map((match) => match.id)).toEqual([created.id]);
      expect(bySecond).toEqual([{ id: created.id, companyName: "PT Kembar", contactPerson: "Budi" }]);
    });

    it("keeps customers and contacts inside the organization", async () => {
      const orgA = await setupOrganization();
      const orgB = await setupOrganization();
      const mine = await createCustomer({ headers: orgA.ownerHeaders, input: { companyName: "PT Milik A", phone: "08123456789" } });

      await expect(getCustomer({ headers: orgB.ownerHeaders, customerId: mine.id })).rejects.toThrow(/not found/i);
      expect((await listCustomers({ headers: orgB.ownerHeaders, query: "Milik A" })).items).toHaveLength(0);
      expect(await findSimilarCustomers({ headers: orgB.ownerHeaders, phone: "08123456789" })).toEqual([]);
    });

    it("lets Finance read a customer but not write one", async () => {
      const org = await setupOrganization();
      const finance = await addMember(org, "FINANCE", "Dewi");
      const created = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Finance", phone: "08123456789" } });
      expect((await getCustomer({ headers: finance.headers, customerId: created.id })).contactPerson).toBe("PT Finance");
      await expect(createCustomer({ headers: finance.headers, input: { companyName: "PT Baru", phone: "08123456789" } })).rejects.toThrow();
    });
  });

  describe("document snapshots", () => {
    it("freezes the primary contact and the tax id, and later edits do not reach the frozen quotation (CUS-03, CUS-04)", async () => {
      const org = await setupOrganization();
      const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Beku", contactPerson: "Budi Lama", phone: "08123456789", email: "budi@beku.example", taxId: "012345678901234" } });
      const deal = await createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "CCTV", estimatedValue: "2000000", assignedToId: org.ownerUserId } });
      const draft = await createQuotation({ headers: org.ownerHeaders, input: { dealId: deal.id, validUntil: orgDay(14), items: [{ description: "Kamera", quantity: "2", unit: "pcs", unitPrice: "1000000" }] } });
      const sent = await transitionQuotationStatus({ headers: org.ownerHeaders, quotationId: draft.id, expectedEditVersion: draft.editVersion, toStatus: "SENT" });

      expect(sent.customerSnapshot).toEqual({
        companyName: "PT Beku",
        contactPerson: "Budi Lama",
        phone: "628123456789",
        email: "budi@beku.example",
        address: null,
        taxId: "012345678901234",
      });

      await updateCustomer({ headers: org.ownerHeaders, customerId: customer.id, expectedVersion: customer.version, input: { companyName: "PT Beku Baru", contactPerson: "Budi Baru", phone: "08999999999", taxId: "" } });
      const reread = await getQuotation({ headers: org.ownerHeaders, quotationId: draft.id });
      expect(reread.customerSnapshot).toMatchObject({ companyName: "PT Beku", contactPerson: "Budi Lama", phone: "628123456789", taxId: "012345678901234" });
    });
  });

  describe("database constraints", () => {
    it("allows only one primary contact per customer", async () => {
      const org = await setupOrganization();
      const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Utama", phone: "08123456789" } });
      const second = { organizationId: org.organizationId, customerId: customer.id, name: "Kedua", phoneRaw: "08111111111", phoneNormalized: "628111111111", createdById: org.ownerUserId };

      await expect(db.insert(contacts).values({ ...second, isPrimary: true })).rejects.toMatchObject({ cause: { code: "23505" } });
      await db.insert(contacts).values({ ...second, isPrimary: false });
      expect(await contactsOf(customer.id)).toHaveLength(2);
    });

    it("refuses a contact without a phone or an email, and a half-stored phone", async () => {
      const org = await setupOrganization();
      const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Aturan", phone: "08123456789" } });
      const base = { organizationId: org.organizationId, customerId: customer.id, name: "Tanpa", createdById: org.ownerUserId };

      await expect(db.insert(contacts).values(base)).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(db.insert(contacts).values({ ...base, email: "a@b.example", phoneRaw: "0812" })).rejects.toMatchObject({ cause: { code: "23514" } });
    });

    it("refuses a contact that points at another organization's customer", async () => {
      const orgA = await setupOrganization();
      const orgB = await setupOrganization();
      const theirs = await createCustomer({ headers: orgB.ownerHeaders, input: { companyName: "PT Milik B", phone: "08123456789" } });

      await expect(
        db.insert(contacts).values({ organizationId: orgA.organizationId, customerId: theirs.id, name: "Penyusup", email: "x@y.example", createdById: orgA.ownerUserId }),
      ).rejects.toMatchObject({ cause: { code: "23503" } });
    });

    it("refuses a tax id that is not 15 or 16 digits, whoever writes it", async () => {
      const org = await setupOrganization();
      const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT NPWP", phone: "08123456789" } });
      await expect(db.update(customers).set({ taxId: "123" }).where(eq(customers.id, customer.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    });
  });
});
