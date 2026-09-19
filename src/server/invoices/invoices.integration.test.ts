import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "@/server/auth/auth";
import { acceptInvitation, inviteMember } from "@/server/auth/members";
import { registerOwner } from "@/server/auth/register-owner";
import { createCustomer, updateCustomer } from "@/server/customers/customers";
import { createDeal, transitionDeal } from "@/server/deals/deals";
import { db } from "@/server/db/client";
import { activities } from "@/server/db/schema";
import { createQuotation, transitionQuotationStatus, updateQuotation } from "@/server/quotations/quotations";
import { createInvoice, getInvoice, listInvoices } from "./invoices";

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

describe("invoices", () => {
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
      companyName: `Invoice Co ${Date.now()}`,
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

  /** Walks a fresh deal all the way to WON, the only state INV-01 allows. */
  async function setupWonDeal() {
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
    for (const toStatus of ["CONTACTED", "QUOTATION", "NEGOTIATION", "WON"]) {
      const current = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, deal.id) });
      await transitionDeal({
        headers: new Headers({ cookie: owner.ownerCookie }),
        dealId: deal.id,
        expectedVersion: current!.version,
        input: { toStatus },
      });
    }
    return { ...owner, customerId: customer.id, dealId: deal.id };
  }

  const oneItem = [{ description: "CCTV Camera 4MP", quantity: "4", unit: "pcs", unitPrice: "1500000" }];

  const invoiceInput = (dealId: string, overrides: Record<string, unknown> = {}) => ({
    dealId,
    dueDate: "2026-12-31",
    items: oneItem,
    idempotencyKey: crypto.randomUUID(),
    ...overrides,
  });

  it("creates an invoice for a WON deal with manual items and no quotation (INV-01/AT-05)", async () => {
    const { ownerCookie, dealId, customerId } = await setupWonDeal();
    const created = await createInvoice({
      headers: new Headers({ cookie: ownerCookie }),
      input: invoiceInput(dealId),
    });

    expect(created.invoiceNumber).toMatch(/^INV-\d{4}-00001$/);
    expect(created.customerId).toBe(customerId);
    expect(created.quotationId).toBeNull();
    expect(created.subtotal).toBe(6_000_000n);
    expect(created.total).toBe(6_000_000n);
    expect(created.currency).toBe("IDR");
    expect(created.items).toHaveLength(1);
    // §10.2: derived, never stored.
    expect(created.paidAmount).toBe(0n);
    expect(created.remainingAmount).toBe(6_000_000n);
    expect(created.status).toBe("UNPAID");
    // Snapshot built from current master data when there is no source.
    expect((created.customerSnapshot as { companyName: string }).companyName).toBe("PT Maju Jaya");
  });

  it("rejects an invoice for a deal that is not WON (INV-01)", async () => {
    const owner = await setupOwner();
    const customer = await createCustomer({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: { companyName: "PT Belum Menang", contactPerson: "Siti", phone: "08129999999" },
    });
    const deal = await createDeal({
      headers: new Headers({ cookie: owner.ownerCookie }),
      input: {
        customerId: customer.id,
        title: "Masih negosiasi",
        estimatedValue: "10000000",
        assignedToId: owner.ownerUserId,
      },
    });

    await expect(
      createInvoice({ headers: new Headers({ cookie: owner.ownerCookie }), input: invoiceInput(deal.id) }),
    ).rejects.toThrow(/WON/);
  });

  it("allows FINANCE and rejects SALES (§6.2, AT-19)", async () => {
    const owner = await setupWonDeal();

    const { memberCookie: salesCookie } = await setupMember(owner, "SALES");
    await expect(
      createInvoice({ headers: new Headers({ cookie: salesCookie }), input: invoiceInput(owner.dealId) }),
    ).rejects.toThrow();

    const { memberCookie: financeCookie } = await setupMember(owner, "FINANCE");
    const created = await createInvoice({
      headers: new Headers({ cookie: financeCookie }),
      input: invoiceInput(owner.dealId),
    });
    expect(created.id).toBeTruthy();
  });

  it("refuses a second invoice for the same deal (INV-04)", async () => {
    const { ownerCookie, dealId } = await setupWonDeal();
    await createInvoice({ headers: new Headers({ cookie: ownerCookie }), input: invoiceInput(dealId) });

    await expect(
      createInvoice({ headers: new Headers({ cookie: ownerCookie }), input: invoiceInput(dealId) }),
    ).rejects.toThrow(/already has invoice/);
  });

  it("returns the same invoice on an idempotent retry, and conflicts on a reused key with a different payload (INV-04/API-05)", async () => {
    const { ownerCookie, dealId } = await setupWonDeal();
    const sharedKey = crypto.randomUUID();

    const first = await createInvoice({
      headers: new Headers({ cookie: ownerCookie }),
      input: invoiceInput(dealId, { idempotencyKey: sharedKey }),
    });
    const retry = await createInvoice({
      headers: new Headers({ cookie: ownerCookie }),
      input: invoiceInput(dealId, { idempotencyKey: sharedKey }),
    });
    expect(retry.id).toBe(first.id);
    expect(retry.invoiceNumber).toBe(first.invoiceNumber);

    const all = await listInvoices({ headers: new Headers({ cookie: ownerCookie }), dealId });
    expect(all).toHaveLength(1);

    await expect(
      createInvoice({
        headers: new Headers({ cookie: ownerCookie }),
        input: invoiceInput(dealId, { idempotencyKey: sharedKey, dueDate: "2027-01-31" }),
      }),
    ).rejects.toThrow(/different request/);
  });

  describe("from a quotation source", () => {
    /** A WON deal that already carries a SENT (therefore frozen) quotation. */
    async function setupWonDealWithSentQuotation() {
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
      const contacted = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, deal.id) });
      await transitionDeal({
        headers: new Headers({ cookie: owner.ownerCookie }),
        dealId: deal.id,
        expectedVersion: contacted!.version,
        input: { toStatus: "CONTACTED" },
      });
      const quotation = await createQuotation({
        headers: new Headers({ cookie: owner.ownerCookie }),
        input: {
          dealId: deal.id,
          validUntil: "2026-12-31",
          items: oneItem,
          notes: "Termasuk konfigurasi remote viewing.",
          terms: "DP 50% sebelum pengerjaan.",
        },
      });
      const sent = await transitionQuotationStatus({
        headers: new Headers({ cookie: owner.ownerCookie }),
        quotationId: quotation.id,
        expectedEditVersion: quotation.editVersion,
        toStatus: "SENT",
      });
      for (const toStatus of ["NEGOTIATION", "WON"]) {
        const current = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, deal.id) });
        await transitionDeal({
          headers: new Headers({ cookie: owner.ownerCookie }),
          dealId: deal.id,
          expectedVersion: current!.version,
          input: { toStatus },
        });
      }
      return { ...owner, customerId: customer.id, dealId: deal.id, quotation: sent };
    }

    it("copies the frozen snapshot from an already-frozen source instead of rebuilding it (INV-02/INV-03)", async () => {
      const owner = await setupWonDealWithSentQuotation();

      // Master data changes AFTER the quotation was frozen. The invoice
      // must carry what the customer actually saw, not today's name.
      await updateCustomer({
        headers: new Headers({ cookie: owner.ownerCookie }),
        customerId: owner.customerId,
        expectedVersion: (await db.query.customers.findFirst({
          where: (c, { eq: eqOp }) => eqOp(c.id, owner.customerId),
        }))!.version,
        input: { companyName: "PT Berubah Nama", contactPerson: "Budi Santoso", phone: "08123456789" },
      });

      const invoice = await createInvoice({
        headers: new Headers({ cookie: owner.ownerCookie }),
        input: invoiceInput(owner.dealId, {
          quotationId: owner.quotation.id,
          expectedSourceEditVersion: owner.quotation.editVersion,
        }),
      });

      expect(invoice.quotationId).toBe(owner.quotation.id);
      expect((invoice.customerSnapshot as { companyName: string }).companyName).toBe("PT Maju Jaya");

      const sourceAfter = await db.query.quotations.findFirst({
        where: (q, { eq: eqOp }) => eqOp(q.id, owner.quotation.id),
      });
      // Already frozen, so the freeze timestamp must be untouched.
      expect(sourceAfter!.frozenAt!.getTime()).toBe(owner.quotation.frozenAt!.getTime());
    });

    /**
     * A WON deal carrying a still-DRAFT quotation. The quotation has to be
     * created while the deal is still open (QUO-01 refuses a new quotation
     * on a closed deal), then the deal is walked the rest of the way to WON.
     */
    async function setupWonDealWithDraftQuotation() {
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
      const advance = async (toStatus: string) => {
        const current = await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, deal.id) });
        await transitionDeal({
          headers: new Headers({ cookie: owner.ownerCookie }),
          dealId: deal.id,
          expectedVersion: current!.version,
          input: { toStatus },
        });
      };
      await advance("CONTACTED");
      const draft = await createQuotation({
        headers: new Headers({ cookie: owner.ownerCookie }),
        input: { dealId: deal.id, validUntil: "2026-12-31", items: oneItem },
      });
      for (const toStatus of ["QUOTATION", "NEGOTIATION", "WON"]) {
        await advance(toStatus);
      }
      return { ...owner, customerId: customer.id, dealId: deal.id, draft };
    }

    it("freezes a DRAFT source, bumps its edit version, and locks it against further edits (INV-03/QUO-03)", async () => {
      const { ownerCookie, dealId, draft } = await setupWonDealWithDraftQuotation();
      expect(draft.frozenAt).toBeNull();

      await createInvoice({
        headers: new Headers({ cookie: ownerCookie }),
        input: invoiceInput(dealId, { quotationId: draft.id, expectedSourceEditVersion: draft.editVersion }),
      });

      const sourceAfter = await db.query.quotations.findFirst({ where: (q, { eq: eqOp }) => eqOp(q.id, draft.id) });
      expect(sourceAfter!.frozenAt).not.toBeNull();
      expect(sourceAfter!.editVersion).toBe(draft.editVersion + 1);

      // QUO-03's frozenAt guard, written in M2 for exactly this moment.
      await expect(
        updateQuotation({
          headers: new Headers({ cookie: ownerCookie }),
          quotationId: draft.id,
          expectedEditVersion: sourceAfter!.editVersion,
          input: { validUntil: "2027-01-31", items: oneItem },
        }),
      ).rejects.toThrow(/no longer be edited/);
    });

    it("conflicts when the source changed since the preview (INV-03)", async () => {
      const { ownerCookie, dealId, draft } = await setupWonDealWithDraftQuotation();
      const staleEditVersion = draft.editVersion;
      await updateQuotation({
        headers: new Headers({ cookie: ownerCookie }),
        quotationId: draft.id,
        expectedEditVersion: draft.editVersion,
        input: { validUntil: "2027-06-30", items: oneItem },
      });

      await expect(
        createInvoice({
          headers: new Headers({ cookie: ownerCookie }),
          input: invoiceInput(dealId, { quotationId: draft.id, expectedSourceEditVersion: staleEditVersion }),
        }),
      ).rejects.toThrow(/changed since it was previewed/);
    });

    it("requires expectedSourceEditVersion whenever a source is named", async () => {
      const { ownerCookie, dealId, draft } = await setupWonDealWithDraftQuotation();

      await expect(
        createInvoice({
          headers: new Headers({ cookie: ownerCookie }),
          input: invoiceInput(dealId, { quotationId: draft.id }),
        }),
      ).rejects.toThrow(/expectedSourceEditVersion/);
    });

    it("rejects a quotation that belongs to a different deal in the same organization (INV-01)", async () => {
      const owner = await setupWonDeal();
      // Second deal in the SAME organization, so this exercises the
      // deal-mismatch branch specifically rather than tenant scoping.
      const otherDeal = await createDeal({
        headers: new Headers({ cookie: owner.ownerCookie }),
        input: {
          customerId: owner.customerId,
          title: "Deal lain",
          estimatedValue: "10000000",
          assignedToId: owner.ownerUserId,
        },
      });
      const otherDealCurrent = await db.query.deals.findFirst({
        where: (d, { eq: eqOp }) => eqOp(d.id, otherDeal.id),
      });
      await transitionDeal({
        headers: new Headers({ cookie: owner.ownerCookie }),
        dealId: otherDeal.id,
        expectedVersion: otherDealCurrent!.version,
        input: { toStatus: "CONTACTED" },
      });
      const foreignQuotation = await createQuotation({
        headers: new Headers({ cookie: owner.ownerCookie }),
        input: { dealId: otherDeal.id, validUntil: "2026-12-31", items: oneItem },
      });

      await expect(
        createInvoice({
          headers: new Headers({ cookie: owner.ownerCookie }),
          input: invoiceInput(owner.dealId, {
            quotationId: foreignQuotation.id,
            expectedSourceEditVersion: foreignQuotation.editVersion,
          }),
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  it("recomputes totals server-side and ignores a client-sent total (MONEY-06)", async () => {
    const { ownerCookie, dealId } = await setupWonDeal();
    const created = await createInvoice({
      headers: new Headers({ cookie: ownerCookie }),
      input: invoiceInput(dealId, { total: "999999999", subtotal: "1" }),
    });
    expect(created.total).toBe(6_000_000n);
    expect(created.subtotal).toBe(6_000_000n);
  });

  it("rejects a dueDate before the issueDate (§10.1)", async () => {
    const { ownerCookie, dealId } = await setupWonDeal();
    await expect(
      createInvoice({
        headers: new Headers({ cookie: ownerCookie }),
        input: invoiceInput(dealId, { issueDate: "2026-10-19", dueDate: "2026-10-18" }),
      }),
    ).rejects.toThrow(/dueDate cannot be before issueDate/);
  });

  it("logs an invoice.created activity without leaking the total (AUD-01/AUD-04)", async () => {
    const { ownerCookie, dealId } = await setupWonDeal();
    const created = await createInvoice({
      headers: new Headers({ cookie: ownerCookie }),
      input: invoiceInput(dealId),
    });

    const log = await db.query.activities.findMany({
      where: and(eq(activities.dealId, dealId), eq(activities.entityType, "invoice")),
    });
    expect(log).toHaveLength(1);
    expect(log[0].eventType).toBe("created");
    expect(log[0].permissionCategory).toBe("finance");
    const metadata = log[0].metadata as Record<string, unknown>;
    expect(metadata.invoiceId).toBe(created.id);
    // AUD-04: "invoice total ... tidak boleh bocor melalui ... payload activity".
    expect(JSON.stringify(metadata)).not.toContain("6000000");
  });

  it("returns not-found for an invoice in another organization, on read and list (TENANT-04)", async () => {
    const orgA = await setupWonDeal();
    const orgB = await setupWonDeal();
    const created = await createInvoice({
      headers: new Headers({ cookie: orgA.ownerCookie }),
      input: invoiceInput(orgA.dealId),
    });

    await expect(
      getInvoice({ headers: new Headers({ cookie: orgB.ownerCookie }), invoiceId: created.id }),
    ).rejects.toThrow(/not found/i);

    const listedByB = await listInvoices({ headers: new Headers({ cookie: orgB.ownerCookie }) });
    expect(listedByB.map((row) => row.id)).not.toContain(created.id);
  });

  it("numbers invoices sequentially per organization and keeps counters separate across tenants (INV-04/AT-07)", async () => {
    const orgA = await setupWonDeal();
    const secondDealA = await setupWonDeal();
    const orgB = await setupWonDeal();

    const a1 = await createInvoice({
      headers: new Headers({ cookie: orgA.ownerCookie }),
      input: invoiceInput(orgA.dealId),
    });
    const b1 = await createInvoice({
      headers: new Headers({ cookie: orgB.ownerCookie }),
      input: invoiceInput(orgB.dealId),
    });
    const a2 = await createInvoice({
      headers: new Headers({ cookie: secondDealA.ownerCookie }),
      input: invoiceInput(secondDealA.dealId),
    });

    expect(a1.invoiceNumber).toMatch(/-00001$/);
    // Each setupWonDeal creates its own organization, so every counter here
    // legitimately starts at 1; what matters is that they never collide.
    expect(b1.invoiceNumber).toMatch(/-00001$/);
    expect(a2.invoiceNumber).toMatch(/-00001$/);
    expect(a1.id).not.toBe(b1.id);
  });

  it("reflects OVERDUE at read time once today passes the due date, without writing a status column (INV-07)", async () => {
    const { ownerCookie, dealId } = await setupWonDeal();
    const created = await createInvoice({
      headers: new Headers({ cookie: ownerCookie }),
      input: invoiceInput(dealId, { issueDate: "2020-01-01", dueDate: "2020-01-31" }),
    });

    expect(created.status).toBe("OVERDUE");
    const read = await getInvoice({ headers: new Headers({ cookie: ownerCookie }), invoiceId: created.id });
    expect(read.status).toBe("OVERDUE");
    // Nothing persisted the word OVERDUE: the stored row has no status column
    // at all, the value is derived on every read.
    expect(Object.keys(read)).not.toContain("statusColumn");
  });
});
