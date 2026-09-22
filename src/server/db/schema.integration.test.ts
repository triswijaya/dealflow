import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "@/server/auth/auth";
import { registerOwner } from "@/server/auth/register-owner";
import { createCustomer } from "@/server/customers/customers";
import { createDeal } from "@/server/deals/deals";
import { createQuotation } from "@/server/quotations/quotations";
import { db } from "./client";
import { deals, quotationItems, quotations } from "./schema";

// MONEY-06: "Database check constraint melindungi nonnegative/range." These
// tests bypass every service function and Zod schema on purpose, writing
// directly through the Drizzle client, to prove the database itself refuses
// an out-of-range value -- not just the application layer in front of it.
// A prior audit found zero CHECK constraints anywhere in the schema; this
// file exists so that gap cannot silently reopen.

async function sessionCookieFor(email: string, password: string): Promise<string> {
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("sign-in did not return a session cookie");
  }
  return setCookie.split(";")[0];
}

describe("database CHECK constraints (MONEY-06)", () => {
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

  async function setupOwnerWithDealAndQuotation() {
    const ownerEmail = `owner-${Date.now()}-${Math.random()}@example.test`;
    const password = "correct-horse-battery-staple";
    const { userId } = await registerOwner({
      email: ownerEmail,
      password,
      name: "Owner",
      companyName: `Check Co ${Date.now()}`,
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
    const quotation = await createQuotation({
      headers: new Headers({ cookie: ownerCookie }),
      input: {
        dealId: deal.id,
        validUntil: "2026-12-31",
        items: [{ description: "CCTV Camera 4MP", quantity: "4", unit: "pcs", unitPrice: "1500000" }],
      },
    });
    const item = await db.query.quotationItems.findFirst({ where: (i, { eq: eqOp }) => eqOp(i.quotationId, quotation.id) });
    // quotation.subtotal is a DTO string (MONEY-01); this helper's callers
    // do raw bigint arithmetic against the database column directly.
    return { dealId: deal.id, quotationId: quotation.id, itemId: item!.id, subtotal: BigInt(quotation.subtotal) };
  }

  it("rejects a negative deals.estimated_value at the database layer", async () => {
    const { dealId } = await setupOwnerWithDealAndQuotation();
    await expect(db.update(deals).set({ estimatedValue: -1n }).where(eq(deals.id, dealId))).rejects.toThrow();
  });

  it("rejects deals.estimated_value over the MONEY-04 ceiling at the database layer", async () => {
    const { dealId } = await setupOwnerWithDealAndQuotation();
    await expect(
      db.update(deals).set({ estimatedValue: 1_000_000_000_000_001n }).where(eq(deals.id, dealId)),
    ).rejects.toThrow();
  });

  it("rejects a non-positive quotations.total at the database layer", async () => {
    const { quotationId } = await setupOwnerWithDealAndQuotation();
    await expect(db.update(quotations).set({ total: 0n }).where(eq(quotations.id, quotationId))).rejects.toThrow();
  });

  it("rejects quotations.total over the MONEY-04 ceiling at the database layer", async () => {
    const { quotationId } = await setupOwnerWithDealAndQuotation();
    await expect(
      db.update(quotations).set({ total: 1_000_000_000_000_001n }).where(eq(quotations.id, quotationId)),
    ).rejects.toThrow();
  });

  it("rejects quotations.discount greater than subtotal at the database layer", async () => {
    const { quotationId, subtotal } = await setupOwnerWithDealAndQuotation();
    await expect(
      db.update(quotations).set({ discount: subtotal + 1n }).where(eq(quotations.id, quotationId)),
    ).rejects.toThrow();
  });

  it("rejects a negative quotations.tax at the database layer", async () => {
    const { quotationId } = await setupOwnerWithDealAndQuotation();
    await expect(db.update(quotations).set({ tax: -1n }).where(eq(quotations.id, quotationId))).rejects.toThrow();
  });

  it("rejects a zero or negative quotation_items.quantity at the database layer", async () => {
    const { itemId } = await setupOwnerWithDealAndQuotation();
    await expect(
      db.update(quotationItems).set({ quantity: "0.000" }).where(eq(quotationItems.id, itemId)),
    ).rejects.toThrow();
  });

  it("rejects quotation_items.quantity over the MONEY-04 ceiling at the database layer", async () => {
    const { itemId } = await setupOwnerWithDealAndQuotation();
    await expect(
      db.update(quotationItems).set({ quantity: "1000000.001" }).where(eq(quotationItems.id, itemId)),
    ).rejects.toThrow();
  });

  it("rejects a negative quotation_items.unit_price at the database layer", async () => {
    const { itemId } = await setupOwnerWithDealAndQuotation();
    await expect(db.update(quotationItems).set({ unitPrice: -1n }).where(eq(quotationItems.id, itemId))).rejects.toThrow();
  });
});
