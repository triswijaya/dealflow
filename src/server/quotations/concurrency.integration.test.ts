import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "@/server/auth/auth";
import { registerOwner } from "@/server/auth/register-owner";
import { createCustomer } from "@/server/customers/customers";
import { createDeal, transitionDeal, updateDeal } from "@/server/deals/deals";
import { db } from "@/server/db/client";
import { completeFollowUp, createFollowUp } from "@/server/follow-ups/follow-ups";
import { createQuotation, reviseQuotation, transitionQuotationStatus } from "./quotations";

// AT-07/AT-22: race scenarios the acceptance table requires and nothing
// else in the suite exercised -- every other integration test calls these
// functions sequentially. `Promise.allSettled` fires two calls against the
// same row/family truly concurrently (both hit Postgres before either
// commits), which is what actually exercises SELECT...FOR UPDATE contention
// and optimistic-concurrency WHERE clauses instead of just their code paths.

async function sessionCookieFor(email: string, password: string): Promise<string> {
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("sign-in did not return a session cookie");
  }
  return setCookie.split(";")[0];
}

describe("concurrency", () => {
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

  async function setupOwnerWithDeal() {
    const ownerEmail = `owner-${Date.now()}-${Math.random()}@example.test`;
    const password = "correct-horse-battery-staple";
    const { organizationId, userId } = await registerOwner({
      email: ownerEmail,
      password,
      name: "Owner",
      companyName: `Race Co ${Date.now()}`,
    });
    const ownerCookie = await sessionCookieFor(ownerEmail, password);
    const customer = await createCustomer({
      headers: new Headers({ cookie: ownerCookie }),
      input: { companyName: "PT Maju Jaya", contactPerson: "Budi Santoso", phone: "08123456789" },
    });
    const deal = await createDeal({
      headers: new Headers({ cookie: ownerCookie }),
      input: {
        customerId: customer.id,
        title: "CCTV Installation - Bekasi",
        estimatedValue: "30000000",
        assignedToId: userId,
      },
    });
    return { organizationId, ownerUserId: userId, ownerCookie, customerId: customer.id, dealId: deal.id };
  }

  const quotationInput = (dealId: string) => ({
    dealId,
    validUntil: "2026-12-31",
    items: [{ description: "CCTV Camera 4MP", quantity: "4", unit: "pcs", unitPrice: "1500000" }],
  });

  it("AT-07: two concurrent createQuotation calls on the same deal never share a number", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();

    const results = await Promise.allSettled([
      createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) }),
      createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) }),
    ]);

    // Both are expected to succeed: nothing in QUO-01/QUO-04 limits a deal
    // to one quotation, only numbering has to stay collision-free.
    const numbers = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<{ quotationNumber: string }>).value.quotationNumber);
    expect(numbers).toHaveLength(2);
    expect(new Set(numbers).size).toBe(2);
  });

  it("AT-22/DEAL-02: concurrent createQuotation and updateDeal never both win against the customer lock", async () => {
    const owner = await setupOwnerWithDeal();
    const otherCustomer = await createCustomer({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: { companyName: "PT Lain", contactPerson: "Siti", phone: "08129999999" },
    });
    const deal = await db.query.deals.findFirst({ where: (d, { eq }) => eq(d.id, owner.dealId) });

    await Promise.allSettled([
      createQuotation({ headers: new Headers({ cookie: owner.ownerCookie }), input: quotationInput(owner.dealId) }),
      updateDeal({
        headers: new Headers({ cookie: owner.ownerCookie }),
        dealId: owner.dealId,
        expectedVersion: deal!.version,
        input: {
          customerId: otherCustomer.id,
          title: "Moved to another customer",
          estimatedValue: "30000000",
          assignedToId: owner.ownerUserId,
        },
      }),
    ]);

    const after = await db.query.deals.findFirst({ where: (d, { eq }) => eq(d.id, owner.dealId) });
    // The invariant DEAL-02 protects: a quotation must never end up on a
    // deal whose customer moved out from under it, regardless of which of
    // the two racing calls happened to commit first.
    if (after!.hasQuotation) {
      expect(after!.customerId).toBe(owner.customerId);
    }
  });

  it("QUO-05: two concurrent revisions of the same family produce exactly one winner and one clean CONFLICT, never a crash", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    const original = await createQuotation({
      headers: new Headers({ cookie: ownerCookie }),
      input: quotationInput(dealId),
    });

    const results = await Promise.allSettled([
      reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: {
          sourceQuotationId: original.id,
          expectedLatestQuotationId: original.id,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
      reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: {
          sourceQuotationId: original.id,
          expectedLatestQuotationId: original.id,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The loser must see a business-state CONFLICT (API-02), never an
    // unhandled TypeError from reading `.id` off an undefined `isLatest`
    // row -- that was the actual bug: a SELECT...FOR UPDATE on the whole
    // family, issued in one statement, only locks/returns rows matching
    // its WHERE clause as of when the statement began, so it can miss a
    // revision a concurrent transaction commits while this one sits
    // blocked on the lock.
    expect(String(rejected[0].reason)).toMatch(/newer version, reload and try again/);

    const family = await db.query.quotations.findMany({ where: (q, { eq }) => eq(q.familyId, original.familyId) });
    expect(family).toHaveLength(2);
    expect(family.filter((q) => q.isLatest)).toHaveLength(1);
  });

  it("API-05: two concurrent revisions with the SAME idempotency key still create only one quotation", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    const original = await createQuotation({
      headers: new Headers({ cookie: ownerCookie }),
      input: quotationInput(dealId),
    });
    const sharedKey = crypto.randomUUID();

    const results = await Promise.allSettled([
      reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: { sourceQuotationId: original.id, expectedLatestQuotationId: original.id, idempotencyKey: sharedKey },
      }),
      reviseQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        input: { sourceQuotationId: original.id, expectedLatestQuotationId: original.id, idempotencyKey: sharedKey },
      }),
    ]);

    // Both calls are expected to succeed and agree on the same new row:
    // the second is a replay, not a race loser.
    const ids = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(1);

    const family = await db.query.quotations.findMany({ where: (q, { eq }) => eq(q.familyId, original.familyId) });
    expect(family).toHaveLength(2);
    expect(family.filter((q) => q.isLatest)).toHaveLength(1);
  });

  it("QUO-08: two concurrent SENT transitions on the same quotation yield exactly one winner and one clean CONFLICT", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    const deal = await db.query.deals.findFirst({ where: (d, { eq }) => eq(d.id, dealId) });
    await transitionDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId,
      expectedVersion: deal!.version,
      input: { toStatus: "CONTACTED" },
    });
    const created = await createQuotation({
      headers: new Headers({ cookie: ownerCookie }),
      input: quotationInput(dealId),
    });

    const results = await Promise.allSettled([
      transitionQuotationStatus({
        headers: new Headers({ cookie: ownerCookie }),
        quotationId: created.id,
        expectedEditVersion: created.editVersion,
        toStatus: "SENT",
      }),
      transitionQuotationStatus({
        headers: new Headers({ cookie: ownerCookie }),
        quotationId: created.id,
        expectedEditVersion: created.editVersion,
        toStatus: "SENT",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason)).toMatch(/modified by someone else/);
  });

  it("FUP-02: two concurrent completions of the same follow-up log exactly one 'completed' activity (AUD-03)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    const followUp = await createFollowUp({
      headers: new Headers({ cookie: ownerCookie }),
      input: { dealId, type: "CALL", followUpAt: new Date(Date.now() + 86_400_000).toISOString() },
    });

    const results = await Promise.allSettled([
      completeFollowUp({
        headers: new Headers({ cookie: ownerCookie }),
        followUpId: followUp.id,
        expectedVersion: followUp.version,
        input: {},
      }),
      completeFollowUp({
        headers: new Headers({ cookie: ownerCookie }),
        followUpId: followUp.id,
        expectedVersion: followUp.version,
        input: {},
      }),
    ]);

    // Both calls read `completedAt: null` before either commits, so the
    // idempotent-no-op shortcut (for a call arriving AFTER completion
    // already happened) does not apply to either -- this is the same
    // one-winner-one-CONFLICT shape as the other version-guarded races
    // above, not two successes.
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason)).toMatch(/modified by someone else/);

    const log = await db.query.activities.findMany({
      where: (a, { and: andOp, eq: eqOp }) => andOp(eqOp(a.dealId, dealId), eqOp(a.eventType, "completed")),
    });
    // AUD-03: "Duplicate request tidak boleh menghasilkan dua activity
    // untuk satu aksi yang sama."
    expect(log).toHaveLength(1);
  });
});
