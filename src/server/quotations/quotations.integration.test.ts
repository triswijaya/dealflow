import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "@/server/auth/auth";
import { inviteMember, acceptInvitation } from "@/server/auth/members";
import { registerOwner } from "@/server/auth/register-owner";
import { createCustomer } from "@/server/customers/customers";
import { createDeal, putDealOnHold, reopenDeal, transitionDeal, updateDeal } from "@/server/deals/deals";
import { db } from "@/server/db/client";
import { activities, customers, deals, organizationSettings, quotations } from "@/server/db/schema";
import { organizationDateString } from "@/server/shared/organization-date";
import {
  createQuotation,
  getQuotation,
  getQuotationForPdf,
  listQuotations,
  reviseQuotation,
  transitionQuotationStatus,
  updateQuotation,
} from "./quotations";

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
    expect(created.subtotal).toBe("6000000");
    expect(created.total).toBe("6000000");
    expect(created.discount).toBe("0");
    expect(created.tax).toBe("0");
    expect(created.editVersion).toBe(1);
    expect(created.revisionNumber).toBe(1);
    expect(created.isLatest).toBe(true);
    expect(created.familyId).toBe(created.id);
    expect(created.items).toHaveLength(1);
    expect(created.items[0].subtotal).toBe("6000000");
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
    expect(created.items[0].subtotal).toBe("333");

    const reread = await getQuotation({ headers: new Headers({ cookie: ownerCookie }), quotationId: created.id });
    expect(reread.items[0].quantity).toBe("0.333");
    expect(reread.items[0].subtotal).toBe("333");
    expect(reread.subtotal).toBe("333");
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
    const won = await setupOwnerWithDeal();
    const wonDeal = await db.query.deals.findFirst({ where: eq(deals.id, won.dealId) });
    await transitionDeal({ headers: new Headers({ cookie: won.ownerCookie }), dealId: won.dealId, expectedVersion: wonDeal!.version, input: { toStatus: "WON" } });
    await expect(
      createQuotation({ headers: new Headers({ cookie: won.ownerCookie }), input: quotationInput(won.dealId) }),
    ).rejects.toThrow(/closed deal/);

    const lost = await setupOwnerWithDeal();
    const lostDeal = await db.query.deals.findFirst({ where: eq(deals.id, lost.dealId) });
    await transitionDeal({ headers: new Headers({ cookie: lost.ownerCookie }), dealId: lost.dealId, expectedVersion: lostDeal!.version, input: { toStatus: "LOST", lostReason: "NO_NEED" } });
    await expect(
      createQuotation({ headers: new Headers({ cookie: lost.ownerCookie }), input: quotationInput(lost.dealId) }),
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
      expect(updated.total).toBe("15000000");
      expect(updated.items).toHaveLength(1);
      expect(updated.items[0].subtotal).toBe("15000000");
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

    it("preserves trailing zeros on quantity exactly as stored (MONEY-02)", async () => {
      // Regression test: drizzle's relational query API silently drops
      // trailing zeros on a numeric column when it's read through a nested
      // `with` relation ("1.500" comes back "1.5"), even though the exact
      // same column read as its own top-level query is unaffected. Whole
      // numbers hide this ("4" and "4.000" are numerically identical, easy
      // to not notice), so this specifically checks a value where a
      // trimmed and an exact reading would visibly differ.
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const created = await createQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: quotationInput(dealId, { items: oneItem({ quantity: "1.500" }) }),
      });

      const fetched = await getQuotation({ headers: new Headers({ cookie: ownerCookie }), quotationId: created.id });
      expect(fetched.items[0].quantity).toBe("1.500");
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
      expect(list.items).toHaveLength(1);
      expect(list.items[0].dealId).toBe(dealId);
    });

    it("does not leak another organization's quotations into an unscoped list (TENANT-04)", async () => {
      const orgA = await setupOwnerWithDeal();
      const orgB = await setupOwnerWithDeal();
      await createQuotation({ headers: new Headers({ cookie: orgA.ownerCookie }), input: quotationInput(orgA.dealId) });
      await createQuotation({ headers: new Headers({ cookie: orgB.ownerCookie }), input: quotationInput(orgB.dealId) });

      const listA = await listQuotations({ headers: new Headers({ cookie: orgA.ownerCookie }) });
      expect(listA.items).toHaveLength(1);
      // TENANT-04: the paginated count itself must not leak org B's row
      // into org A's total, not just the returned items array.
      expect(listA.totalItems).toBe(1);
    });

    it("scopes listQuotations to a revision family, ordered by revisionNumber", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const r1 = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      await reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: { sourceQuotationId: r1.id, expectedLatestQuotationId: r1.id, idempotencyKey: crypto.randomUUID() },
      });

      const family = await listQuotations({ headers: new Headers({ cookie: ownerCookie }), familyId: r1.familyId });
      expect(family.items.map((q) => q.revisionNumber)).toEqual([1, 2]);
    });

    it("paginates listQuotations scoped to a deal: correct slice and totalItems (SEARCH-02)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      for (let i = 0; i < 5; i++) {
        await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      }

      const pageOne = await listQuotations({ headers: new Headers({ cookie: ownerCookie }), dealId, page: 1, pageSize: 2 });
      expect(pageOne.items).toHaveLength(2);
      expect(pageOne.totalItems).toBe(5);
      expect(pageOne.totalPages).toBe(3);

      const pageThree = await listQuotations({ headers: new Headers({ cookie: ownerCookie }), dealId, page: 3, pageSize: 2 });
      expect(pageThree.items).toHaveLength(1);
    });
  });

  describe("reviseQuotation", () => {
    it("creates a DRAFT -R1 revision from the current latest and freezes the source (QUO-05/QUO-06)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const original = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      expect(original.frozenAt).toBeNull();

      const revision = await reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: {
          sourceQuotationId: original.id,
          expectedLatestQuotationId: original.id,
          idempotencyKey: crypto.randomUUID(),
        },
      });

      expect(revision.status).toBe("DRAFT");
      expect(revision.isLatest).toBe(true);
      expect(revision.revisionNumber).toBe(2); // family position: original=1, this revision=2
      expect(revision.familyId).toBe(original.familyId);
      expect(revision.previousRevisionId).toBe(original.id);
      expect(revision.quotationNumber).toBe(`${original.quotationNumber}-R1`); // display suffix counts revisions only
      expect(revision.frozenAt).toBeNull();
      expect(revision.editVersion).toBe(1);
      expect(revision.total).toBe(original.total);
      expect(revision.items).toHaveLength(1);

      const sourceAfter = await db.query.quotations.findFirst({ where: (q, { eq: eqOp }) => eqOp(q.id, original.id) });
      expect(sourceAfter?.isLatest).toBe(false);
      expect(sourceAfter?.frozenAt).not.toBeNull();
    });

    it("numbers the very first revision -R1, matching QUO-04's example format", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const original = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      const revision = await reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: {
          sourceQuotationId: original.id,
          expectedLatestQuotationId: original.id,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      expect(revision.quotationNumber).toMatch(/^QT-\d{4}-\d{5}-R1$/);
    });

    it("freezes the demoted current-latest even when revising from an older historical version, and keeps the original base number (QUO-05/QUO-06)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const r1 = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      const r2 = await reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: { sourceQuotationId: r1.id, expectedLatestQuotationId: r1.id, idempotencyKey: crypto.randomUUID() },
      });
      // r2 is now latest, DRAFT, never frozen. Revise from r1 (the old,
      // already-frozen version) instead of r2.
      const r2Before = await db.query.quotations.findFirst({ where: (q, { eq: eqOp }) => eqOp(q.id, r2.id) });
      expect(r2Before?.frozenAt).toBeNull();

      const r3 = await reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: { sourceQuotationId: r1.id, expectedLatestQuotationId: r2.id, idempotencyKey: crypto.randomUUID() },
      });

      expect(r3.revisionNumber).toBe(3); // family position: r1=1, r2=2, r3=3
      expect(r3.previousRevisionId).toBe(r1.id);
      expect(r3.quotationNumber).toBe(`${r1.quotationNumber}-R2`); // this is the family's 2nd revision

      // r2 was never the source of this revision, but it must still end up
      // frozen and demoted -- the whole family must be read-only except r3.
      const r2After = await db.query.quotations.findFirst({ where: (q, { eq: eqOp }) => eqOp(q.id, r2.id) });
      expect(r2After?.isLatest).toBe(false);
      expect(r2After?.frozenAt).not.toBeNull();
    });

    it("captures a frozen snapshot that a later organization settings change cannot alter (PDF-02)", async () => {
      const { ownerCookie, dealId, organizationId } = await setupOwnerWithDeal();
      const original = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      await reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: {
          sourceQuotationId: original.id,
          expectedLatestQuotationId: original.id,
          idempotencyKey: crypto.randomUUID(),
        },
      });

      const frozen = await db.query.quotations.findFirst({ where: (q, { eq: eqOp }) => eqOp(q.id, original.id) });
      const snapshotBefore = frozen?.sellerSnapshot as { address: string | null };

      await db
        .update(organizationSettings)
        .set({ address: "Jl. Berubah No. 999" })
        .where(eq(organizationSettings.organizationId, organizationId));

      const stillFrozen = await db.query.quotations.findFirst({ where: (q, { eq: eqOp }) => eqOp(q.id, original.id) });
      expect((stillFrozen?.sellerSnapshot as { address: string | null }).address).toBe(snapshotBefore.address);
      expect((stillFrozen?.sellerSnapshot as { address: string | null }).address).not.toBe("Jl. Berubah No. 999");
    });

    it("replays an identical retry through the same idempotency key without creating a second row (API-05)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const original = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      const key = crypto.randomUUID();
      const input = { sourceQuotationId: original.id, expectedLatestQuotationId: original.id, idempotencyKey: key };

      const first = await reviseQuotation({ headers: new Headers({ cookie: ownerCookie }), input });
      const second = await reviseQuotation({ headers: new Headers({ cookie: ownerCookie }), input });

      expect(second.id).toBe(first.id);
      const family = await listQuotations({ headers: new Headers({ cookie: ownerCookie }), familyId: original.familyId });
      expect(family.items).toHaveLength(2); // original + exactly one revision, not two
    });

    it("rejects reusing an idempotency key with a different payload (API-05)", async () => {
      const { ownerCookie, dealId, customerId, ownerUserId } = await setupOwnerWithDeal();
      const original = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      const other = await createDeal({
        headers: new Headers({ cookie: ownerCookie }),
        input: { customerId, title: "Other", estimatedValue: "1000000", assignedToId: ownerUserId },
      });
      const otherQuotation = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(other.id) });
      const key = crypto.randomUUID();

      await reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: { sourceQuotationId: original.id, expectedLatestQuotationId: original.id, idempotencyKey: key },
      });

      await expect(
        reviseQuotation({
          headers: new Headers({ cookie: ownerCookie }),
          input: { sourceQuotationId: otherQuotation.id, expectedLatestQuotationId: otherQuotation.id, idempotencyKey: key },
        }),
      ).rejects.toThrow(/different request/);
    });

    it("rejects a stale expectedLatestQuotationId when someone else already revised the family (DATA-07)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const original = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      await reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: {
          sourceQuotationId: original.id,
          expectedLatestQuotationId: original.id,
          idempotencyKey: crypto.randomUUID(),
        },
      });

      await expect(
        reviseQuotation({
          headers: new Headers({ cookie: ownerCookie }),
          input: {
            sourceQuotationId: original.id,
            expectedLatestQuotationId: original.id, // stale: no longer the latest
            idempotencyKey: crypto.randomUUID(),
          },
        }),
      ).rejects.toThrow(/newer version/);
    });

    it("rejects a source quotation from a different organization with NOT_FOUND (TENANT-04)", async () => {
      const orgA = await setupOwnerWithDeal();
      const orgB = await setupOwnerWithDeal();
      const quotationB = await createQuotation({ headers: new Headers({ cookie: orgB.ownerCookie }), input: quotationInput(orgB.dealId) });

      await expect(
        reviseQuotation({
          headers: new Headers({ cookie: orgA.ownerCookie }),
          input: {
            sourceQuotationId: quotationB.id,
            expectedLatestQuotationId: quotationB.id,
            idempotencyKey: crypto.randomUUID(),
          },
        }),
      ).rejects.toThrow(/not found/i);
    });

    it("allows revising a quotation family on a WON deal (QUO-07)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const original = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });

      let deal = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
      for (const toStatus of ["PROPOSAL", "NEGOTIATION", "COMMITMENT", "WON"] as const) {
        await transitionDeal({
          headers: new Headers({ cookie: ownerCookie }),
          dealId,
          expectedVersion: deal!.version,
          input: { toStatus },
        });
        deal = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
      }
      expect(deal!.status).toBe("WON");

      const revision = await reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: {
          sourceQuotationId: original.id,
          expectedLatestQuotationId: original.id,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      expect(revision.status).toBe("DRAFT");

      const dealAfter = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
      expect(dealAfter!.status).toBe("WON"); // revising never reopens the deal
    });

    it("copies items independently: editing the new revision does not touch the frozen source's items", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const original = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      const revision = await reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: {
          sourceQuotationId: original.id,
          expectedLatestQuotationId: original.id,
          idempotencyKey: crypto.randomUUID(),
        },
      });

      await updateQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        quotationId: revision.id,
        expectedEditVersion: revision.editVersion,
        input: quotationInput(dealId, { items: oneItem({ quantity: "99" }) }),
      });

      // "4.000", not "4": also the regression test for getQuotation's fix
      // to a real drizzle relational-query bug found while writing this
      // test, where a numeric column read through a nested `with` relation
      // silently dropped trailing zeros.
      const sourceItems = await getQuotation({ headers: new Headers({ cookie: ownerCookie }), quotationId: original.id });
      expect(sourceItems.items[0].quantity).toBe("4.000");
    });

    it("records a 'revised' activity on the deal (AUD-01)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const original = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      const revision = await reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: {
          sourceQuotationId: original.id,
          expectedLatestQuotationId: original.id,
          idempotencyKey: crypto.randomUUID(),
        },
      });

      const log = await db.query.activities.findMany({
        where: and(eq(activities.dealId, dealId), eq(activities.eventType, "revised")),
      });
      expect(log).toHaveLength(1);
      const metadata = log[0].metadata as { newQuotationId: string; sourceQuotationId: string };
      expect(metadata.newQuotationId).toBe(revision.id);
      expect(metadata.sourceQuotationId).toBe(original.id);
    });

    it("rejects FINANCE revising a quotation", async () => {
      const owner = await setupOwnerWithDeal();
      const original = await createQuotation({ headers: new Headers({ cookie: owner.ownerCookie }), input: quotationInput(owner.dealId) });
      const { memberCookie } = await setupMember(owner, "FINANCE");

      await expect(
        reviseQuotation({
          headers: new Headers({ cookie: memberCookie }),
          input: {
            sourceQuotationId: original.id,
            expectedLatestQuotationId: original.id,
            idempotencyKey: crypto.randomUUID(),
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe("transitionQuotationStatus", () => {
    // Fixed dates far from "now" in either direction, so expiry tests
    // never depend on which real calendar day the suite happens to run.
    const PAST = { issueDate: "2020-01-01", validUntil: "2020-01-02" };
    const FUTURE_VALID_UNTIL = "2099-12-31";

    async function advanceDealToProposal(ownerCookie: string, dealId: string) {
      const deal = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
      await transitionDeal({
        headers: new Headers({ cookie: ownerCookie }),
        dealId,
        expectedVersion: deal!.version,
        input: { toStatus: "PROPOSAL" },
      });
    }

    it("sends a DRAFT, freezes it, and advances a PROSPECT deal to PROPOSAL (QUO-08)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const created = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      expect(created.frozenAt).toBeNull();

      const sent = await transitionQuotationStatus({
        headers: new Headers({ cookie: ownerCookie }),
        quotationId: created.id,
        expectedEditVersion: created.editVersion,
        toStatus: "SENT",
      });

      expect(sent.status).toBe("SENT");
      expect(sent.sentAt).not.toBeNull();
      expect(sent.frozenAt).not.toBeNull();
      expect(sent.sellerSnapshot).not.toBeNull();
      expect(sent.customerSnapshot).not.toBeNull();
      expect(sent.editVersion).toBe(2);

      const dealAfter = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
      expect(dealAfter!.status).toBe("PROPOSAL");
      expect(dealAfter!.stageEnteredAt.getTime()).toBeGreaterThan(dealAfter!.createdAt.getTime());

      const log = await db.query.activities.findMany({ where: eq(activities.dealId, dealId) });
      expect(log.map((a) => a.eventType)).toContain("sent");
      const stageChangeEvent = log.find((a) => a.eventType === "stage_changed");
      expect(stageChangeEvent?.metadata).toEqual({ fromStatus: "PROSPECT", toStatus: "PROPOSAL", reason: "quotation_sent" });
    });

    it("fills an empty estimated value with the quotation total when it advances the deal (QUO-08)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal({ estimatedValue: "0" });
      const created = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      const sent = await transitionQuotationStatus({ headers: new Headers({ cookie: ownerCookie }), quotationId: created.id, expectedEditVersion: created.editVersion, toStatus: "SENT" });

      const dealAfter = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
      expect(dealAfter!.status).toBe("PROPOSAL");
      expect(dealAfter!.estimatedValue).toBe(6_000_000n);
      expect(sent.total).toBe("6000000");
    });

    it("keeps an estimated value the deal already has when it advances (QUO-08)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const created = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      await transitionQuotationStatus({ headers: new Headers({ cookie: ownerCookie }), quotationId: created.id, expectedEditVersion: created.editVersion, toStatus: "SENT" });

      const dealAfter = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
      expect(dealAfter!.estimatedValue).toBe(30_000_000n);
    });

    it("rejects SENT once the deal is LOST (QUO-08, QUO-11)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      await advanceDealToProposal(ownerCookie, dealId);
      const created = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });

      const deal = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
      await transitionDeal({
        headers: new Headers({ cookie: ownerCookie }),
        dealId,
        expectedVersion: deal!.version,
        input: { toStatus: "LOST", lostReason: "NO_RESPONSE" },
      });

      await expect(
        transitionQuotationStatus({
          headers: new Headers({ cookie: ownerCookie }),
          quotationId: created.id,
          expectedEditVersion: created.editVersion,
          toStatus: "SENT",
        }),
      ).rejects.toThrow(/read-only/);
    });

    describe("deal rules (QUO-09, QUO-11)", () => {
      const lose = async (ownerCookie: string, dealId: string) => {
        const deal = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
        await transitionDeal({ headers: new Headers({ cookie: ownerCookie }), dealId, expectedVersion: deal!.version, input: { toStatus: "LOST", lostReason: "NO_RESPONSE" } });
      };
      const dealOf = (dealId: string) => db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
      const accept = (ownerCookie: string, quotation: { id: string; editVersion: number }) =>
        transitionQuotationStatus({ headers: new Headers({ cookie: ownerCookie }), quotationId: quotation.id, expectedEditVersion: quotation.editVersion, toStatus: "ACCEPTED" });

      it("moves a PROPOSAL deal to COMMITMENT when its quotation is accepted, and never to WON", async () => {
        const { ownerCookie, dealId } = await setupOwnerWithDeal();
        const sent = await sendQuotation(ownerCookie, dealId, { validUntil: FUTURE_VALID_UNTIL });
        expect((await dealOf(dealId))!.status).toBe("PROPOSAL");

        await accept(ownerCookie, sent);
        const after = await dealOf(dealId);
        expect(after!.status).toBe("COMMITMENT");
        expect(after!.stageEnteredAt.getTime()).toBeGreaterThan(after!.createdAt.getTime());
        const log = await db.query.activities.findMany({ where: eq(activities.dealId, dealId) });
        expect(log.filter((event) => event.eventType === "stage_changed").map((event) => event.metadata)).toContainEqual({
          fromStatus: "PROPOSAL",
          toStatus: "COMMITMENT",
          reason: "quotation_accepted",
        });
      });

      it("moves a NEGOTIATION deal to COMMITMENT, but leaves a COMMITMENT, WON or held deal where it is", async () => {
        const negotiating = await setupOwnerWithDeal();
        const sent = await sendQuotation(negotiating.ownerCookie, negotiating.dealId, { validUntil: FUTURE_VALID_UNTIL });
        const deal = await dealOf(negotiating.dealId);
        await transitionDeal({ headers: new Headers({ cookie: negotiating.ownerCookie }), dealId: negotiating.dealId, expectedVersion: deal!.version, input: { toStatus: "NEGOTIATION" } });
        await accept(negotiating.ownerCookie, sent);
        expect((await dealOf(negotiating.dealId))!.status).toBe("COMMITMENT");

        const won = await setupOwnerWithDeal();
        const wonSent = await sendQuotation(won.ownerCookie, won.dealId, { validUntil: FUTURE_VALID_UNTIL });
        const wonDeal = await dealOf(won.dealId);
        await transitionDeal({ headers: new Headers({ cookie: won.ownerCookie }), dealId: won.dealId, expectedVersion: wonDeal!.version, input: { toStatus: "WON" } });
        await accept(won.ownerCookie, wonSent);
        expect((await dealOf(won.dealId))!.status).toBe("WON");

        const held = await setupOwnerWithDeal();
        const heldSent = await sendQuotation(held.ownerCookie, held.dealId, { validUntil: FUTURE_VALID_UNTIL });
        const heldDeal = await dealOf(held.dealId);
        await putDealOnHold({ headers: new Headers({ cookie: held.ownerCookie }), dealId: held.dealId, expectedVersion: heldDeal!.version, input: { reason: "Tunggu", reviewDate: "2099-01-01" } });
        await accept(held.ownerCookie, heldSent);
        expect((await dealOf(held.dealId))!.status).toBe("PROPOSAL");
      });

      it("does not move the deal when a quotation is rejected", async () => {
        const { ownerCookie, dealId } = await setupOwnerWithDeal();
        const sent = await sendQuotation(ownerCookie, dealId, { validUntil: FUTURE_VALID_UNTIL });
        await transitionQuotationStatus({ headers: new Headers({ cookie: ownerCookie }), quotationId: sent.id, expectedEditVersion: sent.editVersion, toStatus: "REJECTED" });
        expect((await dealOf(dealId))!.status).toBe("PROPOSAL");
      });

      it("makes every quotation action read-only once the deal is LOST, then writable again after reopen", async () => {
        const { ownerCookie, dealId } = await setupOwnerWithDeal();
        const headers = new Headers({ cookie: ownerCookie });
        const draftQuotation = await createQuotation({ headers, input: quotationInput(dealId, { validUntil: FUTURE_VALID_UNTIL }) });
        const sent = await sendQuotation(ownerCookie, dealId, { validUntil: FUTURE_VALID_UNTIL });
        await lose(ownerCookie, dealId);

        const readOnly = /read-only/;
        await expect(
          updateQuotation({ headers, quotationId: draftQuotation.id, expectedEditVersion: draftQuotation.editVersion, input: quotationInput(dealId, { notes: "ubah" }) }),
        ).rejects.toThrow(readOnly);
        await expect(
          reviseQuotation({ headers, input: { sourceQuotationId: sent.id, expectedLatestQuotationId: sent.id, idempotencyKey: crypto.randomUUID() } }),
        ).rejects.toThrow(readOnly);
        await expect(accept(ownerCookie, sent)).rejects.toThrow(readOnly);
        await expect(
          transitionQuotationStatus({ headers, quotationId: sent.id, expectedEditVersion: sent.editVersion, toStatus: "REJECTED" }),
        ).rejects.toThrow(readOnly);
        expect((await db.query.quotations.findFirst({ where: eq(quotations.id, sent.id) }))!.status).toBe("SENT");

        const lost = await dealOf(dealId);
        await reopenDeal({ headers, dealId, expectedVersion: lost!.version, input: { toStatus: "NEGOTIATION", reason: "Customer kembali" } });
        expect((await accept(ownerCookie, sent)).status).toBe("ACCEPTED");
        expect((await dealOf(dealId))!.status).toBe("COMMITMENT");
      });

      it("keeps revising allowed on a WON deal (QUO-07)", async () => {
        const { ownerCookie, dealId } = await setupOwnerWithDeal();
        const sent = await sendQuotation(ownerCookie, dealId, { validUntil: FUTURE_VALID_UNTIL });
        const deal = await dealOf(dealId);
        await transitionDeal({ headers: new Headers({ cookie: ownerCookie }), dealId, expectedVersion: deal!.version, input: { toStatus: "WON" } });

        const revised = await reviseQuotation({
          headers: new Headers({ cookie: ownerCookie }),
          input: { sourceQuotationId: sent.id, expectedLatestQuotationId: sent.id, idempotencyKey: crypto.randomUUID() },
        });
        expect(revised.revisionNumber).toBe(2);
      });
    });

    it("rejects SENT on an already-expired draft, without a warning bypass (QUO-10)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      await advanceDealToProposal(ownerCookie, dealId);
      const created = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId, PAST) });

      await expect(
        transitionQuotationStatus({
          headers: new Headers({ cookie: ownerCookie }),
          quotationId: created.id,
          expectedEditVersion: created.editVersion,
          toStatus: "SENT",
        }),
      ).rejects.toThrow(/expired/);
    });

    it("does not change the deal stage again once it is already past PROSPECT", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const deal = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
      await transitionDeal({
        headers: new Headers({ cookie: ownerCookie }),
        dealId,
        expectedVersion: deal!.version,
        input: { toStatus: "NEGOTIATION" },
      });
      const created = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      // Captured after createQuotation, not before: createQuotation itself
      // bumps deals.version once (the DEAL-02 hasQuotation lock from
      // slice 2), so "before send" has to mean right before the SENT call.
      const versionBeforeSend = (await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) }))!.version;
      await transitionQuotationStatus({
        headers: new Headers({ cookie: ownerCookie }),
        quotationId: created.id,
        expectedEditVersion: created.editVersion,
        toStatus: "SENT",
      });

      const dealAfter = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
      expect(dealAfter!.status).toBe("NEGOTIATION");
      // version advances by exactly 1, for the lastActivityAt bump
      // (RISK-01/11.2) -- a redundant stage_changed side effect would have
      // advanced it by 2.
      expect(dealAfter!.version).toBe(versionBeforeSend + 1);
    });

    it("bumps deals.lastActivityAt on quotation created, revised, and SENT (RISK-01/11.2)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const beforeCreate = (await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) }))!
        .lastActivityAt;

      const created = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      const afterCreate = (await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) }))!
        .lastActivityAt;
      expect(afterCreate.getTime()).toBeGreaterThan(beforeCreate.getTime());

      const revision = await reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: { sourceQuotationId: created.id, expectedLatestQuotationId: created.id, idempotencyKey: crypto.randomUUID() },
      });
      const afterRevise = (await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) }))!
        .lastActivityAt;
      expect(afterRevise.getTime()).toBeGreaterThan(afterCreate.getTime());

      await transitionQuotationStatus({
        headers: new Headers({ cookie: ownerCookie }),
        quotationId: revision.id,
        expectedEditVersion: revision.editVersion,
        toStatus: "SENT",
      });
      const afterSent = (await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) }))!
        .lastActivityAt;
      expect(afterSent.getTime()).toBeGreaterThan(afterRevise.getTime());
    });

    it("still allows SENT on a WON deal, for record purposes, without reopening it (QUO-08)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      // createQuotation (slice 2) already refuses to create a fresh
      // original on a closed deal, so the draft has to exist BEFORE the
      // deal reaches WON -- this proves transitionQuotationStatus's own
      // check doesn't additionally block SENT once it gets there, not
      // that a brand new quotation can be created after the fact.
      const created = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });

      let deal = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
      for (const toStatus of ["PROPOSAL", "NEGOTIATION", "COMMITMENT", "WON"] as const) {
        await transitionDeal({
          headers: new Headers({ cookie: ownerCookie }),
          dealId,
          expectedVersion: deal!.version,
          input: { toStatus },
        });
        deal = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
      }
      expect(deal!.status).toBe("WON");

      const sent = await transitionQuotationStatus({
        headers: new Headers({ cookie: ownerCookie }),
        quotationId: created.id,
        expectedEditVersion: created.editVersion,
        toStatus: "SENT",
      });
      expect(sent.status).toBe("SENT");

      const dealAfter = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
      expect(dealAfter!.status).toBe("WON");
    });

    it("rejects transitioning a non-latest (historical) version (QUO-05/QUO-06)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const original = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      await reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: { sourceQuotationId: original.id, expectedLatestQuotationId: original.id, idempotencyKey: crypto.randomUUID() },
      });

      await advanceDealToProposal(ownerCookie, dealId);
      await expect(
        transitionQuotationStatus({
          headers: new Headers({ cookie: ownerCookie }),
          quotationId: original.id,
          expectedEditVersion: original.editVersion,
          toStatus: "SENT",
        }),
      ).rejects.toThrow(/latest/);
    });

    async function sendQuotation(ownerCookie: string, dealId: string, overrides: Record<string, unknown> = {}) {
      const created = await createQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: quotationInput(dealId, { validUntil: FUTURE_VALID_UNTIL, ...overrides }),
      });
      return transitionQuotationStatus({
        headers: new Headers({ cookie: ownerCookie }),
        quotationId: created.id,
        expectedEditVersion: created.editVersion,
        toStatus: "SENT",
      });
    }

    // A quotation can only ever be SENT while still valid (proven above),
    // so "sent, and now expired" can't be constructed by dating it in the
    // past up front -- it has to start valid and then lapse. Nothing in
    // this test suite can make real time pass, so this simulates it the
    // same way the PDF-02 snapshot test simulates a later master-data
    // edit: a direct write to the row, bypassing the service layer.
    async function backdateValidUntil(quotationId: string, validUntil: string) {
      await db.update(quotations).set({ validUntil }).where(eq(quotations.id, quotationId));
    }

    it("accepts a SENT quotation, recording actor and timestamp (QUO-09)", async () => {
      const { ownerCookie, dealId, ownerUserId } = await setupOwnerWithDeal();
      const sent = await sendQuotation(ownerCookie, dealId, { validUntil: FUTURE_VALID_UNTIL });

      const accepted = await transitionQuotationStatus({
        headers: new Headers({ cookie: ownerCookie }),
        quotationId: sent.id,
        expectedEditVersion: sent.editVersion,
        toStatus: "ACCEPTED",
      });
      expect(accepted.status).toBe("ACCEPTED");
      expect(accepted.acceptedAt).not.toBeNull();
      expect(accepted.acceptedById).toBe(ownerUserId);

      const dealAfter = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
      expect(dealAfter!.status).not.toBe("WON"); // QUO-09: ACCEPTED never auto-WONs the deal
    });

    it("rejects ACCEPTED on an expired SENT quotation (QUO-10)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const sent = await sendQuotation(ownerCookie, dealId);
      await backdateValidUntil(sent.id, "2020-06-01");

      await expect(
        transitionQuotationStatus({
          headers: new Headers({ cookie: ownerCookie }),
          quotationId: sent.id,
          expectedEditVersion: sent.editVersion,
          toStatus: "ACCEPTED",
        }),
      ).rejects.toThrow(/expired/);
    });

    it("still accepts REJECTED on an expired SENT quotation -- the asymmetry QUO-10's table states (QUO-10)", async () => {
      const { ownerCookie, dealId, ownerUserId } = await setupOwnerWithDeal();
      const sent = await sendQuotation(ownerCookie, dealId);
      await backdateValidUntil(sent.id, "2020-06-01");

      const rejected = await transitionQuotationStatus({
        headers: new Headers({ cookie: ownerCookie }),
        quotationId: sent.id,
        expectedEditVersion: sent.editVersion,
        toStatus: "REJECTED",
      });
      expect(rejected.status).toBe("REJECTED");
      expect(rejected.rejectedById).toBe(ownerUserId);
    });

    it("treats ACCEPTED and REJECTED as terminal -- no further transition is accepted", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const sent = await sendQuotation(ownerCookie, dealId, { validUntil: FUTURE_VALID_UNTIL });
      const accepted = await transitionQuotationStatus({
        headers: new Headers({ cookie: ownerCookie }),
        quotationId: sent.id,
        expectedEditVersion: sent.editVersion,
        toStatus: "ACCEPTED",
      });

      await expect(
        transitionQuotationStatus({
          headers: new Headers({ cookie: ownerCookie }),
          quotationId: accepted.id,
          expectedEditVersion: accepted.editVersion,
          toStatus: "REJECTED",
        }),
      ).rejects.toThrow(/Cannot transition/);
    });

    it("treats a request for the current status as an idempotent no-op", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const sent = await sendQuotation(ownerCookie, dealId, { validUntil: FUTURE_VALID_UNTIL });

      const again = await transitionQuotationStatus({
        headers: new Headers({ cookie: ownerCookie }),
        quotationId: sent.id,
        expectedEditVersion: sent.editVersion,
        toStatus: "SENT",
      });
      expect(again.editVersion).toBe(sent.editVersion); // no write happened
    });

    it("rejects a stale editVersion (DATA-07)", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const created = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });

      await expect(
        transitionQuotationStatus({
          headers: new Headers({ cookie: ownerCookie }),
          quotationId: created.id,
          expectedEditVersion: created.editVersion + 1, // never actually current
          toStatus: "SENT",
        }),
      ).rejects.toThrow(/modified by someone else/);
    });

    it("rejects a quotation from a different organization with NOT_FOUND (TENANT-04)", async () => {
      const orgA = await setupOwnerWithDeal();
      const orgB = await setupOwnerWithDeal();
      const quotationB = await createQuotation({ headers: new Headers({ cookie: orgB.ownerCookie }), input: quotationInput(orgB.dealId) });

      await expect(
        transitionQuotationStatus({
          headers: new Headers({ cookie: orgA.ownerCookie }),
          quotationId: quotationB.id,
          expectedEditVersion: quotationB.editVersion,
          toStatus: "SENT",
        }),
      ).rejects.toThrow(/not found/i);
    });

    it("rejects FINANCE transitioning a quotation", async () => {
      const owner = await setupOwnerWithDeal();
      await advanceDealToProposal(owner.ownerCookie, owner.dealId);
      const created = await createQuotation({ headers: new Headers({ cookie: owner.ownerCookie }), input: quotationInput(owner.dealId) });
      const { memberCookie } = await setupMember(owner, "FINANCE");

      await expect(
        transitionQuotationStatus({
          headers: new Headers({ cookie: memberCookie }),
          quotationId: created.id,
          expectedEditVersion: created.editVersion,
          toStatus: "SENT",
        }),
      ).rejects.toThrow();
    });

    describe("effective status on read (QUO-10)", () => {
      it("shows EXPIRED through getQuotation/listQuotations without ever writing it to the row", async () => {
        const { ownerCookie, dealId } = await setupOwnerWithDeal();
        const sent = await sendQuotation(ownerCookie, dealId);
        await backdateValidUntil(sent.id, "2020-01-02");

        const fetched = await getQuotation({ headers: new Headers({ cookie: ownerCookie }), quotationId: sent.id });
        expect(fetched.status).toBe("EXPIRED");

        const list = await listQuotations({ headers: new Headers({ cookie: ownerCookie }), dealId });
        expect(list.items.find((q) => q.id === sent.id)!.status).toBe("EXPIRED");

        // The stored column itself is untouched -- a raw read confirms it.
        const raw = await db.query.quotations.findFirst({ where: (q, { eq: eqOp }) => eqOp(q.id, sent.id) });
        expect(raw!.status).toBe("SENT");
      });

      it("does not show EXPIRED for a DRAFT past its own validUntil (QUO-10: stays DRAFT with a warning, not EXPIRED)", async () => {
        const { ownerCookie, dealId } = await setupOwnerWithDeal();
        const created = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId, PAST) });

        const fetched = await getQuotation({ headers: new Headers({ cookie: ownerCookie }), quotationId: created.id });
        expect(fetched.status).toBe("DRAFT");
      });
    });
  });

  describe("getQuotationForPdf", () => {
    it("resolves seller/customer from current master data for a DRAFT that was never frozen (QUO-08: download itself never freezes)", async () => {
      const { ownerCookie, dealId, organizationId } = await setupOwnerWithDeal();
      const created = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });

      const forPdf = await getQuotationForPdf({ headers: new Headers({ cookie: ownerCookie }), quotationId: created.id });
      expect(forPdf.quotation.frozenAt).toBeNull();
      expect(forPdf.customer.companyName).toBe("PT Maju Jaya");

      // Change the customer's live master data, then fetch for PDF again:
      // an unfrozen DRAFT has no snapshot to protect, so it must reflect
      // the change -- and the row itself must still show no frozenAt,
      // proving the read alone never freezes it.
      await db.update(customers).set({ companyName: "PT Berubah Nama" }).where(eq(customers.organizationId, organizationId));
      const again = await getQuotationForPdf({ headers: new Headers({ cookie: ownerCookie }), quotationId: created.id });
      expect(again.customer.companyName).toBe("PT Berubah Nama");
      const rawAfter = await db.query.quotations.findFirst({ where: (q, { eq: eqOp }) => eqOp(q.id, created.id) });
      expect(rawAfter!.frozenAt).toBeNull();
    });

    it("resolves seller/customer from the frozen snapshot once SENT, immune to a later master-data change (PDF-02)", async () => {
      const { ownerCookie, dealId, organizationId } = await setupOwnerWithDeal();
      const created = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      const sent = await transitionQuotationStatus({
        headers: new Headers({ cookie: ownerCookie }),
        quotationId: created.id,
        expectedEditVersion: created.editVersion,
        toStatus: "SENT",
      });
      expect(sent.frozenAt).not.toBeNull();

      const beforeChange = await getQuotationForPdf({ headers: new Headers({ cookie: ownerCookie }), quotationId: created.id });
      expect(beforeChange.customer.companyName).toBe("PT Maju Jaya");

      await db.update(customers).set({ companyName: "PT Berubah Nama" }).where(eq(customers.organizationId, organizationId));

      const afterChange = await getQuotationForPdf({ headers: new Headers({ cookie: ownerCookie }), quotationId: created.id });
      expect(afterChange.customer.companyName).toBe("PT Maju Jaya"); // unchanged: frozen snapshot, not live data
    });

    it("hides a quotation from a different organization behind NOT_FOUND (TENANT-04)", async () => {
      const orgA = await setupOwnerWithDeal();
      const orgB = await setupOwnerWithDeal();
      const quotationB = await createQuotation({ headers: new Headers({ cookie: orgB.ownerCookie }), input: quotationInput(orgB.dealId) });

      await expect(
        getQuotationForPdf({ headers: new Headers({ cookie: orgA.ownerCookie }), quotationId: quotationB.id }),
      ).rejects.toThrow(/not found/i);
    });

    it("rejects FINANCE, who has no quotation permission at all (§6.2)", async () => {
      const owner = await setupOwnerWithDeal();
      const created = await createQuotation({ headers: new Headers({ cookie: owner.ownerCookie }), input: quotationInput(owner.dealId) });
      const { memberCookie } = await setupMember(owner, "FINANCE");

      await expect(
        getQuotationForPdf({ headers: new Headers({ cookie: memberCookie }), quotationId: created.id }),
      ).rejects.toThrow();
    });
  });
});
