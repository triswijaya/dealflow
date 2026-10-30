import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { findWhatsAppContact } from "@/server/customers/contacts";
import { db } from "@/server/db/client";
import { activities, billingItems, customers, deals, followUps, invoices, orders, receipts, refunds, settlements } from "@/server/db/schema";
import { paidAmountFor } from "@/server/invoices/balance";
import { readyItemCondition } from "@/server/invoices/invoice-views";
import { formatRupiah } from "@/server/money/amount";
import { formatIndonesianDate } from "@/server/pdf/format-date";
import { toMoneyDto } from "@/server/shared/dto";
import { organizationClock } from "@/server/shared/organization-clock";
import { buildWhatsAppDeepLink, renderCollectionMessage } from "@/server/whatsapp/message";
import { toFollowUpDto, type FollowUpDto } from "@/server/follow-ups/dto";

// FUP-01..FUP-04 / TASK-01 / WA-04: the finance side of tasks. A collection task
// belongs to an invoice, not a deal, so it survives the deal closing, and it is
// the finance team's to work (Sales can read it). The queues are derived from the
// data each time they are asked for: nothing stores "to do", and a queue shrinks
// only when the domain action that resolves it is saved.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const TYPES = ["CALL", "WHATSAPP", "EMAIL", "MEETING", "VISIT", "OTHER", "PROMISE_TO_PAY"] as const;
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null);

const createSchema = z.object({
  invoiceId: z.string().uuid(),
  type: z.enum(TYPES),
  note: text(5000),
  // For PROMISE_TO_PAY this is the date the customer promised to pay.
  followUpAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
});

async function liveInvoice(tx: Tx, organizationId: string, invoiceId: string) {
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)))
    .for("update");
  if (!invoice) throw new APIError("NOT_FOUND", { message: "Invoice not found" });
  return invoice;
}

async function logTask(tx: Tx, actor: { organizationId: string; userId: string }, invoice: typeof invoices.$inferSelect, eventType: string, metadata: Record<string, unknown>) {
  await tx.insert(activities).values({
    organizationId: actor.organizationId,
    dealId: invoice.dealId,
    orderId: invoice.orderId,
    entityType: "collection_task",
    eventType,
    actorId: actor.userId,
    metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, ...metadata },
    permissionCategory: "finance",
  });
}

/** FUP-01: a collection task on an invoice that is still owed. A promise to pay can only be made on an invoice. */
export async function createCollectionTask(params: { headers: Headers; input: unknown }): Promise<FollowUpDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { collection: ["write"] } });
  const input = createSchema.parse(params.input);
  if (input.completedAt && input.completedAt.getTime() > Date.now() + 60_000) {
    throw new APIError("BAD_REQUEST", { message: "Completed time cannot be in the future" });
  }
  if (input.type === "PROMISE_TO_PAY" && input.completedAt) {
    throw new APIError("BAD_REQUEST", { message: "A promise to pay cannot be logged as already done" });
  }

  return db.transaction(async (tx) => {
    const invoice = await liveInvoice(tx, actor.organizationId, input.invoiceId);
    if (invoice.voidedAt) throw new APIError("BAD_REQUEST", { message: "This invoice is void" });
    const paid = await paidAmountFor(tx, { organizationId: actor.organizationId, invoiceId: invoice.id });
    if (paid >= invoice.total) throw new APIError("BAD_REQUEST", { message: "This invoice is already paid" });

    const [created] = await tx
      .insert(followUps)
      .values({
        organizationId: actor.organizationId,
        invoiceId: invoice.id,
        type: input.type,
        note: input.note,
        followUpAt: input.followUpAt,
        completedAt: input.completedAt ?? null,
        createdById: actor.userId,
      })
      .returning();
    await logTask(tx, actor, invoice, "created", { followUpId: created.id, type: input.type, followUpAt: input.followUpAt.toISOString() });
    return toFollowUpDto(created);
  });
}

async function findTask(tx: Tx, organizationId: string, followUpId: string) {
  const [task] = await tx
    .select()
    .from(followUps)
    .where(and(eq(followUps.id, followUpId), eq(followUps.organizationId, organizationId)))
    .for("update");
  if (!task || !task.invoiceId) throw new APIError("NOT_FOUND", { message: "Collection task not found" });
  return task;
}

/** FUP-02: reschedule or reword a task that is neither done nor cancelled. */
export async function updateCollectionTask(params: { headers: Headers; followUpId: string; expectedVersion: number; input: unknown }): Promise<FollowUpDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { collection: ["write"] } });
  const input = z.object({ note: text(5000), followUpAt: z.coerce.date() }).parse(params.input);

  return db.transaction(async (tx) => {
    const task = await findTask(tx, actor.organizationId, params.followUpId);
    if (task.completedAt) throw new APIError("BAD_REQUEST", { message: "Cannot edit a follow-up that is already completed" });
    if (task.cancelledAt) throw new APIError("BAD_REQUEST", { message: "Cannot edit a follow-up that was cancelled" });
    if (task.version !== params.expectedVersion) {
      throw new APIError("CONFLICT", { message: "Follow-up was modified by someone else, reload and try again" });
    }
    const [updated] = await tx
      .update(followUps)
      .set({ note: input.note, followUpAt: input.followUpAt, updatedById: actor.userId, version: sql`${followUps.version} + 1` })
      .where(eq(followUps.id, task.id))
      .returning();
    if (task.followUpAt.getTime() !== input.followUpAt.getTime()) {
      const invoice = await liveInvoice(tx, actor.organizationId, task.invoiceId!);
      await logTask(tx, actor, invoice, "rescheduled", { followUpId: task.id, previousFollowUpAt: task.followUpAt.toISOString(), newFollowUpAt: input.followUpAt.toISOString() });
    }
    return toFollowUpDto(updated);
  });
}

/** FUP-02: completing is idempotent; a cancelled task cannot be completed. */
export async function completeCollectionTask(params: { headers: Headers; followUpId: string; expectedVersion: number; input?: unknown }): Promise<FollowUpDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { collection: ["write"] } });
  const input = z.object({ completedAt: z.coerce.date().optional(), note: text(5000).optional() }).parse(params.input ?? {});
  const completedAt = input.completedAt ?? new Date();
  if (completedAt.getTime() > Date.now() + 60_000) {
    throw new APIError("BAD_REQUEST", { message: "Completed time cannot be in the future" });
  }

  return db.transaction(async (tx) => {
    const task = await findTask(tx, actor.organizationId, params.followUpId);
    if (task.completedAt) return toFollowUpDto(task);
    if (task.cancelledAt) throw new APIError("BAD_REQUEST", { message: "Cannot complete a follow-up that was cancelled" });
    if (task.version !== params.expectedVersion) {
      throw new APIError("CONFLICT", { message: "Follow-up was modified by someone else, reload and try again" });
    }
    const [updated] = await tx
      .update(followUps)
      .set({ completedAt, ...(input.note ? { note: input.note } : {}), updatedById: actor.userId, version: sql`${followUps.version} + 1` })
      .where(eq(followUps.id, task.id))
      .returning();
    const invoice = await liveInvoice(tx, actor.organizationId, task.invoiceId!);
    await logTask(tx, actor, invoice, "completed", { followUpId: task.id, type: task.type });
    return toFollowUpDto(updated);
  });
}

/** FUP-02: a task that no longer matters is cancelled with a reason, not deleted. A done task cannot be cancelled. */
export async function cancelCollectionTask(params: { headers: Headers; followUpId: string; input: unknown }): Promise<FollowUpDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { collection: ["write"] } });
  const input = z.object({ reason: text(1000) }).parse(params.input ?? {});

  return db.transaction(async (tx) => {
    const task = await findTask(tx, actor.organizationId, params.followUpId);
    if (task.cancelledAt) return toFollowUpDto(task);
    if (task.completedAt) throw new APIError("BAD_REQUEST", { message: "A completed follow-up cannot be cancelled" });
    const [updated] = await tx
      .update(followUps)
      .set({ cancelledAt: new Date(), cancelReason: input.reason, updatedById: actor.userId, version: sql`${followUps.version} + 1` })
      .where(eq(followUps.id, task.id))
      .returning();
    const invoice = await liveInvoice(tx, actor.organizationId, task.invoiceId!);
    await logTask(tx, actor, invoice, "cancelled", { followUpId: task.id, reason: input.reason });
    return toFollowUpDto(updated);
  });
}

/** The tasks of one invoice, open ones first by schedule, then the finished and cancelled ones by recency. */
export async function listCollectionTasks(params: { headers: Headers; invoiceId: string }): Promise<FollowUpDto[]> {
  const actor = await requirePermission({ headers: params.headers, permission: { collection: ["read"] } });
  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, params.invoiceId), eq(invoices.organizationId, actor.organizationId)),
    columns: { id: true },
  });
  if (!invoice) throw new APIError("NOT_FOUND", { message: "Invoice not found" });
  const rows = await db
    .select()
    .from(followUps)
    .where(and(eq(followUps.organizationId, actor.organizationId), eq(followUps.invoiceId, invoice.id)))
    .orderBy(asc(sql`(${followUps.completedAt} is not null or ${followUps.cancelledAt} is not null)`), asc(followUps.followUpAt), desc(followUps.id));
  return rows.map(toFollowUpDto);
}

// ---------------------------------------------------------------------------
// TASK-01: the work queues

const QUEUE_LIMIT = 20;
/** An invoice due within this many days is chased before it is late. */
const DUE_SOON_DAYS = 7;

export type CollectionReason = "PROMISE_BROKEN" | "OVERDUE" | "DUE_SOON";

export type WorkQueuesDto = {
  /** Termin READY without a live invoice. */
  readyToBill: {
    count: number;
    total: string;
    items: { billingItemId: string; label: string; amount: string; orderId: string; orderNumber: string; dealId: string | null; customerName: string }[];
  } | null;
  /** Invoices to chase: a broken promise, overdue, or due within a week, with no open task (a broken promise always shows). */
  collection: {
    count: number;
    items: { invoiceId: string; invoiceNumber: string; customerName: string; remaining: string; dueDate: string; reason: CollectionReason; promisedOn: string | null }[];
  } | null;
  /** Receipts with something left to allocate, identified or not. */
  unallocatedMoney: { count: number; total: string; items: { receiptId: string; customerName: string | null; available: string; receivedOn: string }[] } | null;
  /** Deals on hold whose review date has come. */
  reviewDue: { count: number; items: { dealId: string; title: string; customerName: string; onHoldUntil: string }[] } | null;
};

async function readyToBill(organizationId: string, today: string): Promise<NonNullable<WorkQueuesDto["readyToBill"]>> {
  const where = readyItemCondition(organizationId, today);
  const [totals] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number), total: sql<string>`coalesce(sum(${billingItems.amount}), 0)::text` })
    .from(billingItems)
    .innerJoin(orders, and(eq(orders.id, billingItems.orderId), eq(orders.organizationId, billingItems.organizationId)))
    .where(where);
  const rows = await db
    .select({ item: billingItems, order: orders, customerName: customers.companyName })
    .from(billingItems)
    .innerJoin(orders, and(eq(orders.id, billingItems.orderId), eq(orders.organizationId, billingItems.organizationId)))
    .innerJoin(customers, and(eq(customers.id, orders.customerId), eq(customers.organizationId, orders.organizationId)))
    .where(where)
    .orderBy(asc(orders.commitmentDate), asc(billingItems.id))
    .limit(QUEUE_LIMIT);
  return {
    count: totals?.count ?? 0,
    total: totals?.total ?? "0",
    items: rows.map(({ item, order, customerName }) => ({
      billingItemId: item.id,
      label: item.label,
      amount: toMoneyDto(item.amount),
      orderId: order.id,
      orderNumber: order.orderNumber,
      dealId: order.dealId,
      customerName,
    })),
  };
}

async function collectionQueue(organizationId: string, today: string, timezone: string): Promise<NonNullable<WorkQueuesDto["collection"]>> {
  const settled = sql`coalesce((select sum(s.amount) from settlements s where s.invoice_id = ${invoices.id} and s.reversed_at is null), 0)`;
  const startOfToday = sql`(date_trunc('day', now() AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone})`;
  const openTask = sql`${followUps.invoiceId} = ${invoices.id} and ${followUps.completedAt} is null and ${followUps.cancelledAt} is null`;
  const brokenPromise = sql`exists (select 1 from ${followUps} where ${openTask} and ${followUps.type} = 'PROMISE_TO_PAY' and ${followUps.followUpAt} < ${startOfToday})`;
  const anyOpenTask = sql`exists (select 1 from ${followUps} where ${openTask})`;
  const dueSoonBy = sql`(${today}::date + ${DUE_SOON_DAYS})`;
  const where = and(
    eq(invoices.organizationId, organizationId),
    isNull(invoices.voidedAt),
    sql`${invoices.total} > ${settled}`,
    sql`(${brokenPromise} or (${invoices.dueDate} <= ${dueSoonBy} and not ${anyOpenTask}))`,
  );
  const [count] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(invoices).where(where);
  const rows = await db
    .select({
      invoice: invoices,
      customerName: customers.companyName,
      remaining: sql<string>`(${invoices.total} - ${settled})::text`,
      broken: sql<boolean>`${brokenPromise}`,
      promisedOn: sql<string | null>`(select min(${followUps.followUpAt} AT TIME ZONE ${timezone})::date::text from ${followUps} where ${openTask} and ${followUps.type} = 'PROMISE_TO_PAY')`,
    })
    .from(invoices)
    .innerJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.organizationId, invoices.organizationId)))
    .where(where)
    .orderBy(asc(invoices.dueDate), asc(invoices.id))
    .limit(QUEUE_LIMIT);
  return {
    count: count?.count ?? 0,
    items: rows.map((row) => ({
      invoiceId: row.invoice.id,
      invoiceNumber: row.invoice.invoiceNumber,
      customerName: row.customerName,
      remaining: row.remaining,
      dueDate: row.invoice.dueDate,
      reason: row.broken ? "PROMISE_BROKEN" : row.invoice.dueDate < today ? "OVERDUE" : "DUE_SOON",
      promisedOn: row.broken ? row.promisedOn : null,
    })),
  };
}

async function unallocatedMoney(organizationId: string): Promise<NonNullable<WorkQueuesDto["unallocatedMoney"]>> {
  const available = sql`(${receipts.amount}
    - coalesce((select sum(s.amount) from ${settlements} s where s.receipt_id = ${receipts.id} and s.reversed_at is null), 0)
    - coalesce((select sum(r.amount) from ${refunds} r where r.receipt_id = ${receipts.id}), 0))`;
  const where = and(eq(receipts.organizationId, organizationId), isNull(receipts.reversedAt), sql`${available} > 0`);
  const [totals] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number), total: sql<string>`coalesce(sum(${available}), 0)::text` })
    .from(receipts)
    .where(where);
  const rows = await db
    .select({ receipt: receipts, customerName: customers.companyName, available: sql<string>`${available}::text` })
    .from(receipts)
    .leftJoin(customers, and(eq(customers.id, receipts.customerId), eq(customers.organizationId, receipts.organizationId)))
    .where(where)
    .orderBy(asc(receipts.receivedOn), asc(receipts.id))
    .limit(QUEUE_LIMIT);
  return {
    count: totals?.count ?? 0,
    total: totals?.total ?? "0",
    items: rows.map((row) => ({ receiptId: row.receipt.id, customerName: row.customerName, available: row.available, receivedOn: row.receipt.receivedOn })),
  };
}

async function reviewDue(organizationId: string, today: string): Promise<NonNullable<WorkQueuesDto["reviewDue"]>> {
  const where = and(eq(deals.organizationId, organizationId), sql`${deals.onHoldUntil} <= ${today}::date`);
  const [count] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(deals).where(where);
  const rows = await db
    .select({ deal: deals, customerName: customers.companyName })
    .from(deals)
    .innerJoin(customers, and(eq(customers.id, deals.customerId), eq(customers.organizationId, deals.organizationId)))
    .where(where)
    .orderBy(asc(deals.onHoldUntil), asc(deals.id))
    .limit(QUEUE_LIMIT);
  return {
    count: count?.count ?? 0,
    items: rows.map(({ deal, customerName }) => ({ dealId: deal.id, title: deal.title, customerName, onHoldUntil: deal.onHoldUntil! })),
  };
}

/**
 * TASK-01: what needs doing now, computed from the data. Finance sees the money
 * queues, Sales the deals to review, Owner and Admin both; a queue the role may
 * not see is `null`, not empty.
 */
export async function getWorkQueues(params: { headers: Headers }): Promise<WorkQueuesDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["read"] } });
  const { today, timezone } = await organizationClock(actor.organizationId);
  const money = actor.role === "OWNER" || actor.role === "ADMIN" || actor.role === "FINANCE";
  const sales = actor.role === "OWNER" || actor.role === "ADMIN" || actor.role === "SALES";
  const [ready, collection, unallocated, review] = await Promise.all([
    money ? readyToBill(actor.organizationId, today) : null,
    money ? collectionQueue(actor.organizationId, today, timezone) : null,
    money ? unallocatedMoney(actor.organizationId) : null,
    sales ? reviewDue(actor.organizationId, today) : null,
  ]);
  return { readyToBill: ready, collection, unallocatedMoney: unallocated, reviewDue: review };
}

// ---------------------------------------------------------------------------
// WA-04: WhatsApp from an invoice

/**
 * The collection message for an invoice, to the invoice's contact (the order's,
 * else the customer's primary) that has a phone. Only opens WhatsApp: nothing is
 * sent, marked or claimed (WA-03).
 */
export async function buildCollectionWhatsAppMessage(params: { headers: Headers; invoiceId: string }) {
  const actor = await requirePermission({ headers: params.headers, permission: { collection: ["write"] } });
  const clock = await organizationClock(actor.organizationId);
  const [row] = await db
    .select({ invoice: invoices, order: orders })
    .from(invoices)
    .innerJoin(orders, and(eq(orders.id, invoices.orderId), eq(orders.organizationId, invoices.organizationId)))
    .where(and(eq(invoices.id, params.invoiceId), eq(invoices.organizationId, actor.organizationId)));
  if (!row) throw new APIError("NOT_FOUND", { message: "Invoice not found" });
  if (row.invoice.voidedAt) throw new APIError("BAD_REQUEST", { message: "This invoice is void" });

  const paid = await paidAmountFor(db, { organizationId: actor.organizationId, invoiceId: row.invoice.id });
  const remaining = row.invoice.total > paid ? row.invoice.total - paid : 0n;
  if (remaining === 0n) throw new APIError("BAD_REQUEST", { message: "This invoice is already paid" });

  const contact = await findWhatsAppContact(actor.organizationId, { customerId: row.invoice.customerId, contactId: row.order.contactId });
  if (!contact?.phoneNormalized) {
    throw new APIError("BAD_REQUEST", { message: "The contact has no phone number for WhatsApp" });
  }
  const message = renderCollectionMessage({
    contactName: contact.name,
    invoiceNumber: row.invoice.invoiceNumber,
    remaining: formatRupiah(remaining),
    dueDate: formatIndonesianDate(row.invoice.dueDate),
    overdue: row.invoice.dueDate < clock.today,
  });
  return { contactId: contact.id, contactName: contact.name, phoneInternational: contact.phoneNormalized, message, deepLink: buildWhatsAppDeepLink(contact.phoneNormalized, message) };
}

/** Cancel a sales task (FUP-02), with the permission that goes with it. Lives here to sit beside its finance twin. */
export async function cancelDealTask(params: { headers: Headers; followUpId: string; input: unknown }): Promise<FollowUpDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { followUp: ["write"] } });
  const input = z.object({ reason: text(1000) }).parse(params.input ?? {});
  return db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(followUps)
      .where(and(eq(followUps.id, params.followUpId), eq(followUps.organizationId, actor.organizationId)))
      .for("update");
    if (!task || !task.dealId) throw new APIError("NOT_FOUND", { message: "Follow-up not found" });
    if (task.cancelledAt) return toFollowUpDto(task);
    if (task.completedAt) throw new APIError("BAD_REQUEST", { message: "A completed follow-up cannot be cancelled" });
    const [updated] = await tx
      .update(followUps)
      .set({ cancelledAt: new Date(), cancelReason: input.reason, updatedById: actor.userId, version: sql`${followUps.version} + 1` })
      .where(eq(followUps.id, task.id))
      .returning();
    await tx.insert(activities).values({
      organizationId: actor.organizationId,
      dealId: task.dealId,
      entityType: "follow_up",
      eventType: "cancelled",
      actorId: actor.userId,
      metadata: { followUpId: task.id, reason: input.reason },
      permissionCategory: "sales",
    });
    return toFollowUpDto(updated);
  });
}

