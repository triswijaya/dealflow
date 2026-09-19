import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "@/server/auth/auth";
import { inviteMember, acceptInvitation } from "@/server/auth/members";
import { registerOwner } from "@/server/auth/register-owner";
import { createCustomer } from "@/server/customers/customers";
import { createDeal, transitionDeal } from "@/server/deals/deals";
import { db } from "@/server/db/client";
import { activities } from "@/server/db/schema";
import { createQuotation, transitionQuotationStatus } from "@/server/quotations/quotations";
import { buildFollowUpWhatsAppMessage, recordWhatsAppOpened } from "./whatsapp";

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

describe("whatsapp", () => {
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
      companyName: `WA Co ${Date.now()}`,
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

  async function setupOwnerWithDeal() {
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
      },
    });
    return { ...owner, customerId: customer.id, dealId: deal.id };
  }

  async function advanceDealToContacted(ownerCookie: string, dealId: string) {
    const deal = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) });
    await transitionDeal({
      headers: new Headers({ cookie: ownerCookie }),
      dealId,
      expectedVersion: deal!.version,
      input: { toStatus: "CONTACTED" },
    });
  }

  const quotationInput = (dealId: string, overrides: Record<string, unknown> = {}) => ({
    dealId,
    validUntil: "2026-12-31",
    items: [{ description: "CCTV Camera 4MP", quantity: "4", unit: "pcs", unitPrice: "1500000" }],
    ...overrides,
  });

  it("allows OWNER/SALES to build the message, but rejects FINANCE (§6.2, WA-01)", async () => {
    const owner = await setupOwnerWithDeal();
    const built = await buildFollowUpWhatsAppMessage({
      headers: new Headers({ cookie: owner.ownerCookie }),
      dealId: owner.dealId,
    });
    expect(built.phoneInternational).toBe("628123456789");
    expect(built.deepLink).toBe(`https://wa.me/628123456789?text=${encodeURIComponent(built.message)}`);

    const { memberCookie } = await setupMember(owner, "SALES");
    await expect(
      buildFollowUpWhatsAppMessage({ headers: new Headers({ cookie: memberCookie }), dealId: owner.dealId }),
    ).resolves.toBeDefined();

    const { memberCookie: financeCookie } = await setupMember(owner, "FINANCE");
    await expect(
      buildFollowUpWhatsAppMessage({ headers: new Headers({ cookie: financeCookie }), dealId: owner.dealId }),
    ).rejects.toThrow();
  });

  it("falls back to the deal-only template when the deal has no quotation at all (WA-02)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    const built = await buildFollowUpWhatsAppMessage({ headers: new Headers({ cookie: ownerCookie }), dealId });

    expect(built.quotationId).toBeNull();
    expect(built.message).not.toContain("quotation");
    expect(built.message).toContain("CCTV Installation - Bekasi");
  });

  it("falls back to the deal-only template when the only quotation is still DRAFT (WA-02)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });

    const built = await buildFollowUpWhatsAppMessage({ headers: new Headers({ cookie: ownerCookie }), dealId });
    expect(built.quotationId).toBeNull();
    expect(built.message).not.toContain("quotation");
  });

  it("defaults to the most recently SENT quotation on the deal (WA-02)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    await advanceDealToContacted(ownerCookie, dealId);
    const draft = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });
    const sent = await transitionQuotationStatus({
      headers: new Headers({ cookie: ownerCookie }),
      quotationId: draft.id,
      expectedEditVersion: draft.editVersion,
      toStatus: "SENT",
    });

    const built = await buildFollowUpWhatsAppMessage({ headers: new Headers({ cookie: ownerCookie }), dealId });
    expect(built.quotationId).toBe(sent.id);
    expect(built.message).toContain(sent.quotationNumber);
    expect(built.message).toContain("sudah sempat direview");
  });

  it("respects an explicit quotationId override even when it is still DRAFT (WA-02)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    const draft = await createQuotation({ headers: new Headers({ cookie: ownerCookie }), input: quotationInput(dealId) });

    const built = await buildFollowUpWhatsAppMessage({
      headers: new Headers({ cookie: ownerCookie }),
      dealId,
      quotationId: draft.id,
    });
    expect(built.quotationId).toBe(draft.id);
    expect(built.message).toContain(draft.quotationNumber);
  });

  it("rejects a quotationId that belongs to a different deal (WA-02)", async () => {
    const owner = await setupOwnerWithDeal();
    const otherDeal = await createDeal({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: {
        customerId: owner.customerId,
        title: "Second deal",
        estimatedValue: "10000000",
        assignedToId: owner.ownerUserId,
      },
    });
    const quotationOnOtherDeal = await createQuotation({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: quotationInput(otherDeal.id),
    });

    await expect(
      buildFollowUpWhatsAppMessage({
        headers: new Headers({ cookie: owner.ownerCookie }),
        dealId: owner.dealId,
        quotationId: quotationOnOtherDeal.id,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("returns not-found for a deal in a different organization (TENANT-04)", async () => {
    const orgA = await setupOwnerWithDeal();
    const orgB = await setupOwnerWithDeal();

    await expect(
      buildFollowUpWhatsAppMessage({ headers: new Headers({ cookie: orgB.ownerCookie }), dealId: orgA.dealId }),
    ).rejects.toThrow(/not found/i);
  });

  it("logs a whatsapp.opened activity without touching deals.lastActivityAt (WA-03/§11.2)", async () => {
    const { ownerCookie, dealId } = await setupOwnerWithDeal();
    const before = (await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) }))!;

    await recordWhatsAppOpened({ headers: new Headers({ cookie: ownerCookie }), dealId });

    const after = (await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, dealId) }))!;
    expect(after.lastActivityAt.getTime()).toBe(before.lastActivityAt.getTime());

    const log = await db.query.activities.findMany({
      where: and(eq(activities.dealId, dealId), eq(activities.entityType, "whatsapp")),
    });
    expect(log).toHaveLength(1);
    expect(log[0].eventType).toBe("opened");
  });

  it("rejects recordWhatsAppOpened from FINANCE, same scoping as building the message", async () => {
    const owner = await setupOwnerWithDeal();
    const { memberCookie: financeCookie } = await setupMember(owner, "FINANCE");

    await expect(
      recordWhatsAppOpened({ headers: new Headers({ cookie: financeCookie }), dealId: owner.dealId }),
    ).rejects.toThrow();
  });
});
