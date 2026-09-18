import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "@/server/auth/auth";
import { inviteMember, acceptInvitation } from "@/server/auth/members";
import { registerOwner } from "@/server/auth/register-owner";
import { createCustomer } from "@/server/customers/customers";
import { createDeal, transitionDeal, updateDeal } from "@/server/deals/deals";
import { db } from "@/server/db/client";
import { activities, deals, organizationSettings } from "@/server/db/schema";
import { organizationDateString } from "@/server/shared/organization-date";
import { createQuotation, getQuotation, listQuotations, updateQuotation } from "./quotations";

async function sessionCookieFor(email: string, password: string): Promise<string> {
  // signIn.token (the JSON body) is not the same value the cookie needs; see
  // deals.integration.test.ts for the full explanation. Duplicated here
  // deliberately, matching every other integration test file.
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("sign-in did not return a session cookie");
  }
  return setCookie.split(";")[0];
}

describe("quotations", () => {
  let migrationClient: ReturnType<typeof postgres>;

  beforeAll(async () => {
    const migrationUrl = process.env.DATABASE_MIGRATION_URL;
    if (!migrationUrl) {
      throw new Error("DATABASE_MIGRATION_URL must be set to run integration tests");
    }
    migrationClient = postgres(migrationUrl, { max: 1 });
    await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });
  });

  afterAll(async () => {
    await migrationClient.end();
  });

  async function setupOwner() {
    const ownerEmail = `owner-${Date.now()}-${Math.random()}@example.test`;
    const password = "correct-horse-battery-staple";
    const { organizationId, userId } = await registerOwner({
      email: ownerEmail,
      password,
      name: "Owner",
      companyName: `Quote Co ${Date.now()}`,
    });
    const cookie = await sessionCookieFor(ownerEmail, password);
    return { organizationId, ownerUserId: userId, ownerCookie: cookie };
  }

  async function setupMember(owner: { organizationId: string; ownerCookie: string }, role: "SALES" | "FINANCE") {
    const memberEmail = `${role.toLowerCase()}-${Date.now()}-${Math.random()}@example.test`;
    const memberPassword = "correct-horse-battery-staple";
    const invite = await inviteMember({
      email: memberEmail,
      role,
      organizationId: owner.organizationId,
      headers: new Headers({ cookie: owner.ownerCookie }),
    });
    await auth.api.signUpEmail({ body: { email: memberEmail, password: memberPassword, name: "Invitee" } });
    const cookie = await sessionCookieFor(memberEmail, memberPassword);
    const memberUser = await db.query.user.findFirst({ where: (u, { eq: eqOp }) => eqOp(u.email, memberEmail) });
    await acceptInvitation({ invitationId: invite.id, userId: memberUser!.id, headers: new Headers({ cookie }) });
    return { memberCookie: cookie, memberUserId: memberUser!.id };
  }

  async function setupOwnerWithDeal(overrides: Record<string, unknown> = {}) {
    const owner = await setupOwner();
    const customer = await createCustomer({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: { companyName: "PT Maju Jaya", contactPerson: "Budi Santoso", phone: "08123456789" },
    });
    const deal = await createDeal({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: {
        customerId: customer.id,
        title: "CCTV Installation - Bekasi",
        estimatedValue: "30000000",
        assignedToId: owner.ownerUserId,
        ...overrides,
      },
    });
    return { ...owner, customerId: customer.id, dealId: deal.id };
  }

  const oneItem = (overrides: Record<string, unknown> = {}) => [
    { description: "CCTV Camera 4MP", quantity: "4", unit: "pcs", unitPrice: "1500000", ...overrides },
  ];

  const quotationInput = (dealId: string, overrides: Record<string, unknown> = {}) => ({
    dealId,
    validUntil: "2026-12-31",
    items: oneItem(),
    ...overrides,
  });

  it("creates a DRAFT quotation with a server-computed total, ignoring any client-sent total (MONEY-06)", async () => {
    const { ownerCookie, dealId, customerId } = await setupOwnerWithDeal();
    const created = await createQuotation({
      headers: new Headers({ cookie: ownerCookie }),
      input: quotationInput(dealId, { total: "999999999" }),
    });

    expect(created.status).toBe("DRAFT");
    expect(created.customerId).toBe(customerId);
    expect(created.subtotal).toBe(6_000_000n);
    expect(created.total).toBe(6_000_000n);
    expect(created.discount).toBe(0n);
    expect(created.tax).toBe(0n);
    expect(created.calculationVersion).toBe(1);
    expect(created.editVersion).toBe(1);
    expect(created.revisionNumber).toBe(1);
    expect(created.isLatest).toBe(true);
    expect(created.familyId).toBe(created.id);
    expect(created.items).toHaveLength(1);
    expect(created.items[0].subtotal).toBe(6_000_000n);
  });

  it("round-trips a fractional quantity through the real numeric(12,3) column exactly (MONEY-02/MONEY-03)", async () => {
    // Every other test in this file uses whole-number quantities. This is
    // the one case that actually exercises quantity.ts's scaled-bigint
    // encoding against a real Postgres numeric column instead of just the
    // in-memory calculation slice 1 already unit-tests -- it proves the
    // value Postgres stores and returns on a fresh SELECT still matches,
    // not just what the same INSERT's .returning() echoed back.
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    const created = await createQuotation({
      headers: new Headers({ cookie: ownerCookie }),
      input: quotationInput(dealId, { items: oneItem({ quantity: "0.333", unitPrice: "1001" }) }),
    });
    expect(created.items[0].subtotal).toBe(333n);

    const reread = await getQuotation({ headers: new Headers({ cookie: ownerCookie }), quotationId: created.id });
    expect(reread.items[0].quantity).toBe("0.333");
    expect(reread.items[0].subtotal).toBe(333n);
    expect(reread.subtotal).toBe(333n);
  });

  it("derives customerId from the deal rather than accepting it as input (DATA-02)", async () => {
    const { ownerCookie, dealId, customerId } = await setupOwnerWithDeal();
    const created = await createQuotation({
      headers: new Headers({ cookie: ownerCookie }),
      // A caller cannot smuggle a mismatched customerId in: the schema has
      // no such field, so an extra key is simply ignored by Zod's default
      // (non-strict) object parsing.
      input: quotationInput(dealId, { customerId: "not-a-real-customer" }),
    });
    expect(created.customerId).toBe(customerId);
  });

  it("numbers quotations sequentially within an organization and year (QUO-04)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    const first = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
    const second = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });

    expect(first.quotationNumber).toMatch(/^QT-\d{4}-00001$/);
    expect(second.quotationNumber).toMatch(/^QT-\d{4}-00002$/);
    expect(first.quotationNumber).not.toBe(second.quotationNumber);
  });

  it("keeps numbering counters separate per organization", async () => {
    const orgA = await setupOwnerWithDeal();
    const orgB = await setupOwnerWithDeal();

    const a = await createQuotation({ headers: new Headers({ cookie: orgA.ownerCookie }), input: quotationInput(orgA.dealId) });
    const b = await createQuotation({ headers: new Headers({ cookie: orgB.ownerCookie }), input: quotationInput(orgB.dealId) });

    expect(a.quotationNumber).toMatch(/^QT-\d{4}-00001$/);
    expect(b.quotationNumber).toMatch(/^QT-\d{4}-00001$/);
  });

  it("rejects a deal from a different organization with NOT_FOUND (TENANT-04)", async () => {
    const orgA = await setupOwnerWithDeal();
    const orgB = await setupOwnerWithDeal();

    await expect(
      createQuotation({ headers: new Headers({ cookie: orgA.ownerCookie }), input: quotationInput(orgB.dealId) }),
    ).rejects.toThrow(/not found/i);
  });

  it("rejects a quotation for a WON or LOST deal (QUO-01: deal aktif)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    // NEGOTIATION is required before WON per DEAL-03's transition table.
    const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
    await transitionDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId,
      expectedVersion: deal!.version,
      input: { toStatus: "CONTACTED" },
    });
    const afterContacted = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
    await transitionDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId,
      expectedVersion: afterContacted!.version,
      input: { toStatus: "QUOTATION" },
    });
    const afterQuotation = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
    await transitionDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId,
      expectedVersion: afterQuotation!.version,
      input: { toStatus: "NEGOTIATION" },
    });
    const afterNegotiation = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
    await transitionDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId,
      expectedVersion: afterNegotiation!.version,
      input: { toStatus: "WON" },
    });

    await expect(
      createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) }),
    ).rejects.toThrow(/closed deal/);
  });

  it("rejects FINANCE creating a quotation", async () => {
    const owner = await setupOwnerWithDeal();
    const { memberCookie } = await setupMember(owner, "FINANCE");
    await expect(
      createQuotation({ headers: new Headers({ cookie: memberCookie }), input: quotationInput(owner.dealId) }),
    ).rejects.toThrow();
  });

  it("allows SALES to create a quotation for a deal assigned to someone else (§6.2)", async () => {
    const owner = await setupOwnerWithDeal();
    const { memberCookie } = await setupMember(owner, "SALES");
    const created = await createQuotation({
      headers: new Headers({ cookie: memberCookie }),
      input: quotationInput(owner.dealId),
    });
    expect(created.status).toBe("DRAFT");
  });

  it("rejects more than 200 items (QUO-02/API-04)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    const items = Array.from({ length: 201 }, (_, i) => ({
      description: `Item ${i}`,
      quantity: "1",
      unit: "pcs",
      unitPrice: "1000",
    }));
    await expect(
      createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId, { items }) }),
    ).rejects.toThrow();
  });

  it("rejects a document whose total is zero (MONEY-05)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    await expect(
      createQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: quotationInput(dealId, { items: oneItem({ unitPrice: "0" }) }),
      }),
    ).rejects.toThrow(/greater than zero/);
  });

  it("rejects validUntil before issueDate", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    await expect(
      createQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: quotationInput(dealId, { issueDate: "2026-06-15", validUntil: "2026-06-01" }),
      }),
    ).rejects.toThrow(/validUntil/);
  });

  it("defaults issueDate to the organization's local today when omitted (QUO-01/DATA-04)", async () => {
    const { ownerCookie, dealId, organizationId } = await setupOwnerWithDeal();
    const settings = await db.query.organizationSettings.findFirst({
      where: eq(organizationSettings.organizationId, organizationId),
    });
    const created = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });

    expect(created.issueDate).toBe(organizationDateString(settings!.timezone, new Date()));
  });

  it("records a 'quotation created' activity on the deal (AUD-01)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    const created = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });

    const log = await db.query.activities.findMany({
      where: and(eq(activities.dealId, dealId), eq(activities.entityType, "quotation")),
    });
    expect(log).toHaveLength(1);
    expect(log[0].eventType).toBe("created");
    const metadata = log[0].metadata as { quotationId: string; total: string };
    expect(metadata.quotationId).toBe(created.id);
    expect(metadata.total).toBe("6000000");
  });

  describe("DEAL-02 customer lock", () => {
    it("allows changing a deal's customer before any quotation exists", async () => {
      const { ownerCookie, dealId, customerId, ownerUserId } = await setupOwnerWithDeal();
      const otherCustomer = await createCustomer({
        headers: new Headers({ cookie: ownerCookie }),
        input: { companyName: "PT Sejahtera", contactPerson: "Siti", phone: "08129876543" },
      });
      const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });

      const updated = await updateDeal({
        headers: new Headers({ cookie: ownerCookie }),
        dealId,
        expectedVersion: deal!.version,
        input: {
          customerId: otherCustomer.id,
          title: "CCTV Installation - Bekasi",
          estimatedValue: "30000000",
          assignedToId: ownerUserId,
        },
      });
      expect(updated.customerId).toBe(otherCustomer.id);
      expect(updated.customerId).not.toBe(customerId);
    });

    it("blocks changing a deal's customer once a quotation exists", async () => {
      const { ownerCookie, dealId, customerId, ownerUserId } = await setupOwnerWithDeal();
      await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });

      const otherCustomer = await createCustomer({
        headers: new Headers({ cookie: ownerCookie }),
        input: { companyName: "PT Sejahtera", contactPerson: "Siti", phone: "08129876543" },
      });
      const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
      expect(deal!.hasQuotation).toBe(true);

      await expect(
        updateDeal({
          headers: new Headers({ cookie: ownerCookie }),
          dealId,
          expectedVersion: deal!.version,
          input: {
            customerId: otherCustomer.id,
            title: "CCTV Installation - Bekasi",
            estimatedValue: "30000000",
            assignedToId: ownerUserId,
          },
        }),
      ).rejects.toThrow(/customer/i);

      // The customer must still be the original -- the rejected call must
      // not have partially applied.
      const untouched = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
      expect(untouched!.customerId).toBe(customerId);
    });

    it("still allows editing other deal fields once a quotation exists, as long as the customer stays the same", async () => {
      const { ownerCookie, dealId, customerId, ownerUserId } = await setupOwnerWithDeal();
      await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });

      const updated = await updateDeal({
        headers: new Headers({ cookie: ownerCookie }),
        dealId,
        expectedVersion: deal!.version,
        input: {
          customerId,
          title: "CCTV Installation - Bekasi (revised)",
          estimatedValue: "35000000",
          assignedToId: ownerUserId,
        },
      });
      expect(updated.title).toBe("CCTV Installation - Bekasi (revised)");
    });
  });

  describe("updateQuotation", () => {
    it("edits a draft and recomputes totals, bumping editVersion (QUO-03)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const created = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });

      const updated = await updateQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        quotationId: created.id,
        expectedEditVersion: created.editVersion,
        input: quotationInput(dealId, { items: oneItem({ quantity: "10" }) }),
      });

      expect(updated.editVersion).toBe(2);
      expect(updated.total).toBe(15_000_000n);
      expect(updated.items).toHaveLength(1);
      expect(updated.items[0].subtotal).toBe(15_000_000n);
    });

    it("actually clears notes when the update omits them, not silently keeping the old value", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const created = await createQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: quotationInput(dealId, { notes: "Diskusi awal" }),
      });
      expect(created.notes).toBe("Diskusi awal");

      const updated = await updateQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        quotationId: created.id,
        expectedEditVersion: created.editVersion,
        input: quotationInput(dealId),
      });
      expect(updated.notes).toBeNull();
    });

    it("rejects an update with a stale editVersion (DATA-07)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const created = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      await updateQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        quotationId: created.id,
        expectedEditVersion: created.editVersion,
        input: quotationInput(dealId, { items: oneItem({ quantity: "2" }) }),
      });

      await expect(
        updateQuotation({
          headers: new Headers({ cookie: ownerCookie }),
          quotationId: created.id,
          expectedEditVersion: created.editVersion, // stale: already consumed above
          input: quotationInput(dealId, { items: oneItem({ quantity: "3" }) }),
        }),
      ).rejects.toThrow(/modified by someone else/);
    });

    it("rejects editing a quotation belonging to a different organization (TENANT-04)", async () => {
      const orgA = await setupOwnerWithDeal();
      const orgB = await setupOwnerWithDeal();
      const created = await createQuotation({ headers: new Headers({ cookie: orgA.ownerCookie }), input: quotationInput(orgA.dealId) });

      await expect(
        updateQuotation({
          headers: new Headers({ cookie: orgB.ownerCookie }),
          quotationId: created.id,
          expectedEditVersion: created.editVersion,
          input: quotationInput(orgB.dealId),
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("getQuotation / listQuotations", () => {
    it("returns items in sortOrder", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const created = await createQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: quotationInput(dealId, {
          items: [
            { description: "Second", quantity: "1", unit: "pcs", unitPrice: "1000" },
            { description: "First", quantity: "1", unit: "pcs", unitPrice: "2000" },
          ],
        }),
      });

      const fetched = await getQuotation({ headers: new Headers({ cookie: ownerCookie }), quotationId: created.id });
      expect(fetched.items.map((i) => i.description)).toEqual(["Second", "First"]);
    });

    it("hides a quotation from a different organization behind NOT_FOUND (TENANT-04)", async () => {
      const orgA = await setupOwnerWithDeal();
      const orgB = await setupOwnerWithDeal();
      const created = await createQuotation({ headers: new Headers({ cookie: orgA.ownerCookie }), input: quotationInput(orgA.dealId) });

      await expect(
        getQuotation({ headers: new Headers({ cookie: orgB.ownerCookie }), quotationId: created.id }),
      ).rejects.toThrow(/not found/i);
    });

    it("rejects FINANCE reading a quotation (§6.2: not a WON-sourcing read yet)", async () => {
      const owner = await setupOwnerWithDeal();
      const created = await createQuotation({ headers: new Headers({ cookie: owner.ownerCookie }), input: quotationInput(owner.dealId) });
      const { memberCookie } = await setupMember(owner, "FINANCE");

      await expect(
        getQuotation({ headers: new Headers({ cookie: memberCookie }), quotationId: created.id }),
      ).rejects.toThrow();
    });

    it("scopes listQuotations to a single deal when dealId is given", async () => {
      const { ownerCookie, dealId, ownerUserId } = await setupOwnerWithDeal();
      const customer2 = await createCustomer({
        headers: new Headers({ cookie: ownerCookie }),
        input: { companyName: "PT Lain", contactPerson: "Andi", phone: "08111222333" },
      });
      const deal2 = await createDeal({
        headers: new Headers({ cookie: ownerCookie }),
        input: { customerId: customer2.id, title: "Other deal", estimatedValue: "1000000", assignedToId: ownerUserId },
      });

      await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(deal2.id) });

      const list = await listQuotations({ headers: new Headers({ cookie: ownerCookie }), dealId });
      expect(list).toHaveLength(1);
      expect(list[0].dealId).toBe(dealId);
    });

    it("does not leak another organization's quotations into an unscoped list (TENANT-04)", async () => {
      const orgA = await setupOwnerWithDeal();
      const orgB = await setupOwnerWithDeal();
      await createQuotation({ headers: new Headers({ cookie: orgA.ownerCookie }), input: quotationInput(orgA.dealId) });
      await createQuotation({ headers: new Headers({ cookie: orgB.ownerCookie }), input: quotationInput(orgB.dealId) });

      const listA = await listQuotations({ headers: new Headers({ cookie: orgA.ownerCookie }) });
      expect(listA).toHaveLength(1);
    });
  });
});
