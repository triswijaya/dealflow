import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type postgres from "postgres";

const sent: { to: string; subject: string; text: string; attachments?: { filename: string; content: Buffer }[] }[] = [];
let failWith: unknown = null;
vi.mock("@/server/email/send-email", async () => {
  const actual = await vi.importActual<typeof import("@/server/email/send-email")>("@/server/email/send-email");
  return {
    ...actual,
    sendEmail: vi.fn(async (message: (typeof sent)[number]) => {
      if (failWith) throw failWith;
      sent.push(message);
    }),
  };
});

const { createCustomer } = await import("@/server/customers/customers");
const { createContact } = await import("@/server/customers/contacts");
const { db } = await import("@/server/db/client");
const { activities, outboxEvents } = await import("@/server/db/schema");
const { createDeal, transitionDeal } = await import("@/server/deals/deals");
const { createInvoice, voidInvoice } = await import("@/server/invoices/invoices");
const { createDirectOrder } = await import("@/server/orders/orders");
const { createQuotation } = await import("@/server/quotations/quotations");
const { EmailDeliveryError } = await import("@/server/email/send-email");
const { orgDay } = await import("@/server/testing/dates");
const { addMember, migrateTestDatabase, setupOrganization } = await import("@/server/testing/org-helpers");
const { enqueueDailySummaries } = await import("./daily-summary");
const { sendInvoiceEmail, sendQuotationEmail } = await import("./documents");
const { DAILY_SUMMARY_EMAIL } = await import("./handlers");
const { enqueueOutbox, listDeadOutboxEvents, MAX_ATTEMPTS, processOutbox, registerOutboxHandler } = await import("./outbox");

type Org = Awaited<ReturnType<typeof setupOrganization>>;

describe("transactional outbox (ADR-0004)", () => {
  let migrationClient: ReturnType<typeof postgres>;
  beforeAll(async () => {
    migrationClient = await migrateTestDatabase();
  });
  afterAll(async () => {
    await migrationClient.end();
  });
  beforeEach(() => {
    sent.length = 0;
    failWith = null;
  });

  const key = () => crypto.randomUUID();
  const row = (id: string) => db.query.outboxEvents.findFirst({ where: eq(outboxEvents.id, id) });
  const enqueue = (org: Org, type: string, overrides: Record<string, unknown> = {}) =>
    db.transaction((tx) => enqueueOutbox(tx, { organizationId: org.organizationId, type, payload: {}, dedupeKey: key(), ...overrides }));
  /** Makes a failed row due again (the real wait is minutes to hours). */
  const makeDue = (id: string) => db.update(outboxEvents).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(outboxEvents.id, id));

  describe("the queue", () => {
    it("writes a row inside the transaction, and rolls it back with the business change", async () => {
      const org = await setupOrganization();
      const dedupeKey = key();
      await expect(
        db.transaction(async (tx) => {
          await enqueueOutbox(tx, { organizationId: org.organizationId, type: "test.rollback", payload: {}, dedupeKey });
          throw new Error("business change failed");
        }),
      ).rejects.toThrow("business change failed");
      expect(await db.query.outboxEvents.findMany({ where: and(eq(outboxEvents.organizationId, org.organizationId), eq(outboxEvents.dedupeKey, dedupeKey)) })).toHaveLength(0);
    });

    it("makes a repeated trigger a no-op per organization, not across organizations", async () => {
      const orgA = await setupOrganization();
      const orgB = await setupOrganization();
      const dedupeKey = key();
      expect(await enqueue(orgA, "test.dedupe", { dedupeKey })).not.toBeNull();
      expect(await enqueue(orgA, "test.dedupe", { dedupeKey })).toBeNull();
      expect(await enqueue(orgB, "test.dedupe", { dedupeKey })).not.toBeNull();
    });

    it("sends once, marks the row SENT, and never picks it again", async () => {
      const org = await setupOrganization();
      const calls: string[] = [];
      registerOutboxHandler("test.once", async (event) => void calls.push(event.id));
      const id = (await enqueue(org, "test.once"))!;

      expect(await processOutbox({ ids: [id] })).toMatchObject({ claimed: 1, sent: 1 });
      expect(await row(id)).toMatchObject({ status: "SENT", attempts: 1, lastError: null });
      expect((await row(id))!.sentAt).not.toBeNull();
      expect(await processOutbox({ ids: [id] })).toMatchObject({ claimed: 0 });
      expect(calls).toEqual([id]);
    });
  });

  describe("failure and retry", () => {
    it("keeps a failed row for a later try with a growing wait, records only the category, then succeeds", async () => {
      const org = await setupOrganization();
      let attempt = 0;
      registerOutboxHandler("test.flaky", async () => {
        attempt += 1;
        if (attempt < 3) throw new EmailDeliveryError("NETWORK", true);
      });
      const id = (await enqueue(org, "test.flaky", { payload: { to: "secret@example.test" } }))!;

      expect(await processOutbox({ ids: [id] })).toMatchObject({ failed: 1 });
      const first = (await row(id))!;
      expect(first).toMatchObject({ status: "FAILED", attempts: 1, lastError: "NETWORK" });
      expect(first.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30_000);
      expect(first.lastError).not.toContain("secret");
      // Not due yet: another sweep leaves it alone.
      expect(await processOutbox({ ids: [id] })).toMatchObject({ claimed: 0 });

      await makeDue(id);
      expect(await processOutbox({ ids: [id] })).toMatchObject({ failed: 1 });
      expect((await row(id))!.nextAttemptAt.getTime()).toBeGreaterThan(first.nextAttemptAt.getTime());
      await makeDue(id);
      expect(await processOutbox({ ids: [id] })).toMatchObject({ sent: 1 });
      expect(await row(id)).toMatchObject({ status: "SENT", attempts: 3, lastError: null });
    });

    it("goes DEAD after the last attempt, and at once when waiting cannot help", async () => {
      const org = await setupOrganization();
      registerOutboxHandler("test.always", async () => {
        throw new EmailDeliveryError("PROVIDER_ERROR", true);
      });
      registerOutboxHandler("test.rejected", async () => {
        throw new EmailDeliveryError("REJECTED", false);
      });
      const tired = (await enqueue(org, "test.always"))!;
      for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
        await processOutbox({ ids: [tired] });
        expect((await row(tired))!.status).toBe("FAILED");
        await makeDue(tired);
      }
      expect(await processOutbox({ ids: [tired] })).toMatchObject({ dead: 1 });
      expect(await row(tired)).toMatchObject({ status: "DEAD", attempts: MAX_ATTEMPTS, lastError: "PROVIDER_ERROR" });
      await makeDue(tired);
      expect(await processOutbox({ ids: [tired] })).toMatchObject({ claimed: 0 });

      const rejected = (await enqueue(org, "test.rejected"))!;
      expect(await processOutbox({ ids: [rejected] })).toMatchObject({ dead: 1 });
      expect(await row(rejected)).toMatchObject({ status: "DEAD", attempts: 1, lastError: "REJECTED" });
    });

    it("gives up on a type nobody handles, and shows dead events to Owner and Admin only", async () => {
      const org = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const id = (await enqueue(org, "test.unknown"))!;
      expect(await processOutbox({ ids: [id] })).toMatchObject({ dead: 1 });

      const dead = await listDeadOutboxEvents({ headers: org.ownerHeaders });
      expect(dead.map((event) => event.id)).toEqual([id]);
      expect(dead[0]).toMatchObject({ type: "test.unknown", lastError: "Error" });
      await expect(listDeadOutboxEvents({ headers: sales.headers })).rejects.toThrow();
      expect(await listDeadOutboxEvents({ headers: (await setupOrganization()).ownerHeaders })).toEqual([]);
    });
  });

  describe("concurrency", () => {
    it("lets two sweeps share the work without running a row twice", async () => {
      const org = await setupOrganization();
      const seen: string[] = [];
      registerOutboxHandler("test.parallel", async (event) => {
        seen.push(event.id);
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      const ids = await Promise.all(Array.from({ length: 12 }, () => enqueue(org, "test.parallel")));

      const [a, b] = await Promise.all([processOutbox({ ids: ids as string[], limit: 12 }), processOutbox({ ids: ids as string[], limit: 12 })]);
      expect(a.sent + b.sent).toBe(12);
      expect(seen).toHaveLength(12);
      expect(new Set(seen).size).toBe(12);
    });

    it("skips a row that another worker holds, until its lock runs out", async () => {
      const org = await setupOrganization();
      registerOutboxHandler("test.locked", async () => {});
      const id = (await enqueue(org, "test.locked"))!;
      await db.update(outboxEvents).set({ lockedUntil: new Date(Date.now() + 60_000) }).where(eq(outboxEvents.id, id));
      expect(await processOutbox({ ids: [id] })).toMatchObject({ claimed: 0 });
      await db.update(outboxEvents).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(outboxEvents.id, id));
      expect(await processOutbox({ ids: [id] })).toMatchObject({ sent: 1 });
    });
  });

  describe("mailing a quotation", () => {
    async function quotationFor(org: Org, email = "budi@pelanggan.example") {
      const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Pelanggan", contactPerson: "Budi", phone: "08123456789", email } });
      const deal = await createDeal({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "CCTV", estimatedValue: "3000000", assignedToId: org.ownerUserId } });
      const quotation = await createQuotation({ headers: org.ownerHeaders, input: { dealId: deal.id, validUntil: orgDay(14), items: [{ description: "Kamera", quantity: "1", unit: "pcs", unitPrice: "3000000" }] } });
      return { customer, deal, quotation };
    }

    it("queues the mail with the PDF, sends it at once, and records it on the timeline without marking the quotation SENT", async () => {
      const org = await setupOrganization();
      const { deal, quotation } = await quotationFor(org);
      const result = await sendQuotationEmail({ headers: org.ownerHeaders, quotationId: quotation.id, input: { idempotencyKey: key() } });

      expect(result.queued).toBe(true);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ to: "budi@pelanggan.example" });
      expect(sent[0]!.subject).toContain(quotation.quotationNumber);
      expect(sent[0]!.attachments![0]!.filename).toBe(`${quotation.quotationNumber}.pdf`);
      expect(sent[0]!.attachments![0]!.content.subarray(0, 4).toString()).toBe("%PDF");
      expect((await row(result.outboxId!))!.status).toBe("SENT");
      const event = await db.query.activities.findFirst({ where: and(eq(activities.dealId, deal.id), eq(activities.eventType, "emailed")) });
      expect(event!.metadata).toEqual({ quotationId: quotation.id, quotationNumber: quotation.quotationNumber });
      expect((await db.query.quotations.findFirst({ where: (q, { eq: eqOp }) => eqOp(q.id, quotation.id) }))!.status).toBe("DRAFT");
    });

    it("sends once for a repeated request with the same key, and again for a new key", async () => {
      const org = await setupOrganization();
      const { quotation } = await quotationFor(org);
      const same = key();
      await sendQuotationEmail({ headers: org.ownerHeaders, quotationId: quotation.id, input: { idempotencyKey: same } });
      const repeat = await sendQuotationEmail({ headers: org.ownerHeaders, quotationId: quotation.id, input: { idempotencyKey: same } });
      expect(repeat.queued).toBe(false);
      expect(sent).toHaveLength(1);
      await sendQuotationEmail({ headers: org.ownerHeaders, quotationId: quotation.id, input: { idempotencyKey: key() } });
      expect(sent).toHaveLength(2);
    });

    it("leaves the business change in place when the provider is down, and the sweep sends it later", async () => {
      const org = await setupOrganization();
      const { deal, quotation } = await quotationFor(org);
      failWith = new EmailDeliveryError("PROVIDER_ERROR", true);
      const result = await sendQuotationEmail({ headers: org.ownerHeaders, quotationId: quotation.id, input: { idempotencyKey: key() } });

      expect(result.queued).toBe(true);
      expect(await row(result.outboxId!)).toMatchObject({ status: "FAILED", lastError: "PROVIDER_ERROR" });
      expect(await db.query.activities.findFirst({ where: and(eq(activities.dealId, deal.id), eq(activities.eventType, "emailed")) })).toBeDefined();
      expect(sent).toHaveLength(0);

      failWith = null;
      await makeDue(result.outboxId!);
      expect(await processOutbox({ ids: [result.outboxId!] })).toMatchObject({ sent: 1 });
      expect(sent).toHaveLength(1);
    });

    it("needs an address, takes one from the contact of the deal, and refuses a lost deal", async () => {
      const org = await setupOrganization();
      const { customer, deal, quotation } = await quotationFor(org, "");
      const noAddress = customer.email;
      expect(noAddress).toBeNull();
      await expect(sendQuotationEmail({ headers: org.ownerHeaders, quotationId: quotation.id, input: { idempotencyKey: key() } })).rejects.toThrow(/no email address/);
      await expect(sendQuotationEmail({ headers: org.ownerHeaders, quotationId: quotation.id, input: { idempotencyKey: key(), to: "not-an-email" } })).rejects.toThrow();

      await sendQuotationEmail({ headers: org.ownerHeaders, quotationId: quotation.id, input: { idempotencyKey: key(), to: "manual@pelanggan.example" } });
      expect(sent.at(-1)!.to).toBe("manual@pelanggan.example");

      const finance = await createContact({ headers: org.ownerHeaders, customerId: customer.id, input: { name: "Sari", email: "sari@pelanggan.example" } });
      await db.update((await import("@/server/db/schema")).deals).set({ contactId: finance.id }).where(eq((await import("@/server/db/schema")).deals.id, deal.id));
      await sendQuotationEmail({ headers: org.ownerHeaders, quotationId: quotation.id, input: { idempotencyKey: key() } });
      expect(sent.at(-1)!.to).toBe("sari@pelanggan.example");

      await transitionDeal({ headers: org.ownerHeaders, dealId: deal.id, expectedVersion: (await db.query.deals.findFirst({ where: (d, { eq: eqOp }) => eqOp(d.id, deal.id) }))!.version, input: { toStatus: "LOST", lostReason: "NO_NEED" } });
      await expect(sendQuotationEmail({ headers: org.ownerHeaders, quotationId: quotation.id, input: { idempotencyKey: key() } })).rejects.toThrow(/read-only/);
    });

    it("is for people who can write quotations", async () => {
      const org = await setupOrganization();
      const finance = await addMember(org, "FINANCE", "Dewi");
      const { quotation } = await quotationFor(org);
      await expect(sendQuotationEmail({ headers: finance.headers, quotationId: quotation.id, input: { idempotencyKey: key() } })).rejects.toThrow();
      await expect(sendQuotationEmail({ headers: (await setupOrganization()).ownerHeaders, quotationId: quotation.id, input: { idempotencyKey: key() } })).rejects.toThrow(/not found/i);
    });
  });

  describe("mailing an invoice", () => {
    async function invoiceFor(org: Org) {
      const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Tagih", contactPerson: "Budi", phone: "08123456789", email: "keuangan@tagih.example" } });
      const order = await createDirectOrder({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "Pesanan", commitmentType: "PURCHASE_ORDER", value: "2000000" } });
      return createInvoice({
        headers: org.ownerHeaders,
        input: { billingItemId: order.billingItems[0]!.id, issueDate: orgDay(-1), dueDate: orgDay(20), items: [{ description: "Jasa", quantity: "1", unit: "paket", unitPrice: "2000000" }], idempotencyKey: key() },
      });
    }

    it("sends the invoice PDF, and the invoice stays issued when the provider is down", async () => {
      const org = await setupOrganization();
      const invoice = await invoiceFor(org);
      failWith = new EmailDeliveryError("NETWORK", true);
      const queued = await sendInvoiceEmail({ headers: org.ownerHeaders, invoiceId: invoice.id, input: { idempotencyKey: key() } });
      expect(await row(queued.outboxId!)).toMatchObject({ status: "FAILED" });
      expect((await db.query.invoices.findFirst({ where: (i, { eq: eqOp }) => eqOp(i.id, invoice.id) }))!.voidedAt).toBeNull();

      failWith = null;
      await makeDue(queued.outboxId!);
      await processOutbox({ ids: [queued.outboxId!] });
      expect(sent[0]).toMatchObject({ to: "keuangan@tagih.example" });
      expect(sent[0]!.subject).toContain(invoice.invoiceNumber);
      expect(sent[0]!.attachments![0]!.filename).toBe(`${invoice.invoiceNumber}.pdf`);
    });

    it("refuses a void invoice and a Sales user", async () => {
      const org = await setupOrganization();
      const sales = await addMember(org, "SALES", "Andi");
      const invoice = await invoiceFor(org);
      await expect(sendInvoiceEmail({ headers: sales.headers, invoiceId: invoice.id, input: { idempotencyKey: key() } })).rejects.toThrow();
      await voidInvoice({ headers: org.ownerHeaders, invoiceId: invoice.id, input: { reason: "Salah" } });
      await expect(sendInvoiceEmail({ headers: org.ownerHeaders, invoiceId: invoice.id, input: { idempotencyKey: key() } })).rejects.toThrow(/void/);
    });
  });

  describe("daily summary", () => {
    it("mails each active Owner and Admin once a day, only when there is something to do", async () => {
      const org = await setupOrganization();
      const admin = await addMember(org, "ADMIN", "Maya");
      const sales = await addMember(org, "SALES", "Andi");
      void sales;
      const quiet = await enqueueDailySummaries();
      expect(quiet.organizations).toBeGreaterThan(0);
      expect(await db.query.outboxEvents.findMany({ where: and(eq(outboxEvents.organizationId, org.organizationId), eq(outboxEvents.type, DAILY_SUMMARY_EMAIL)) })).toHaveLength(0);

      const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Siap", phone: "08123456789" } });
      await createDirectOrder({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "Siap tagih", commitmentType: "CONTRACT", value: "5000000" } });

      await enqueueDailySummaries();
      const queued = await db.query.outboxEvents.findMany({ where: and(eq(outboxEvents.organizationId, org.organizationId), eq(outboxEvents.type, DAILY_SUMMARY_EMAIL)) });
      expect(queued).toHaveLength(2);
      expect(queued.map((event) => (event.payload as { to: string }).to).sort()).toHaveLength(2);
      expect((queued[0]!.payload as { text: string }).text).toContain("1 termin siap ditagih");

      // The cron may run twice in a day: nobody is mailed twice.
      const again = await enqueueDailySummaries();
      expect(again.enqueued).toBe(0);
      expect(await db.query.outboxEvents.findMany({ where: and(eq(outboxEvents.organizationId, org.organizationId), eq(outboxEvents.type, DAILY_SUMMARY_EMAIL)) })).toHaveLength(2);

      await processOutbox({ ids: queued.map((event) => event.id) });
      expect(sent.map((message) => message.subject).every((subject) => subject.startsWith("Ringkasan harian"))).toBe(true);
      void admin;
    });

    it("skips a deactivated Owner or Admin", async () => {
      const org = await setupOrganization();
      const admin = await addMember(org, "ADMIN", "Maya");
      const { deactivateMember } = await import("@/server/auth/members");
      await deactivateMember({ memberId: admin.memberId, headers: org.ownerHeaders });
      const customer = await createCustomer({ headers: org.ownerHeaders, input: { companyName: "PT Siap", phone: "08123456789" } });
      await createDirectOrder({ headers: org.ownerHeaders, input: { customerId: customer.id, title: "Siap tagih", commitmentType: "CONTRACT", value: "5000000" } });
      await enqueueDailySummaries();
      const queued = await db.query.outboxEvents.findMany({ where: and(eq(outboxEvents.organizationId, org.organizationId), eq(outboxEvents.type, DAILY_SUMMARY_EMAIL)) });
      expect(queued).toHaveLength(1);
    });
  });

  it("answers the cron endpoints with 401 when no secret is configured", async () => {
    const { GET: sweep } = await import("@/app/api/cron/outbox/route");
    const { GET: summary } = await import("@/app/api/cron/daily-summary/route");
    for (const handler of [sweep, summary]) {
      expect((await handler(new Request("https://example.test/api/cron", { headers: { authorization: "Bearer anything-at-all-here" } }))).status).toBe(401);
      expect((await handler(new Request("https://example.test/api/cron"))).status).toBe(401);
    }
  });
});
