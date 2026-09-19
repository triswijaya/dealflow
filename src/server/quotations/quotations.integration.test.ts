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
import { createQuotation, getQuotation, listQuotations, reviseQuotation, updateQuotation } from "./quotations";

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

    it("scopes listQuotations to a revision family, ordered by revisionNumber", async () => {
      const { ownerCookie, dealId } = await setupOwnerWithDeal();
      const r1 = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
      await reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: { sourceQuotationId: r1.id, expectedLatestQuotationId: r1.id, idempotencyKey: crypto.randomUUID() },
      });

      const family = await listQuotations({ headers: new Headers({ cookie: ownerCookie }), familyId: r1.familyId });
      expect(family.map((q) => q.revisionNumber)).toEqual([1, 2]);
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
      expect(family).toHaveLength(2); // original + exactly one revision, not two
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
      for (const toStatus of ["CONTACTED", "QUOTATION", "NEGOTIATION", "WON"] as const) {
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
});
