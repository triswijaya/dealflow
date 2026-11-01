import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { activities, billingItems, contacts, customers, deals, invoices, orderAmendments, orders, quotations } from "@/server/db/schema";
import { cancelOpenDealTasks } from "@/server/follow-ups/cancel";
import { paidAmountsFor } from "@/server/invoices/balance";
import { moneyAmountSchema } from "@/server/money/amount";
import { claimNextSequence, formatOrderNumber } from "@/server/quotations/document-number";
import { toDealDto } from "@/server/deals/dto";
import { buildDocumentSnapshots } from "@/server/shared/document-snapshots";
import { organizationClock } from "@/server/shared/organization-clock";
import { organizationYear } from "@/server/shared/organization-date";
import { buildPaginatedDto, resolvePagination } from "@/server/shared/pagination";
import { billingItemStatus, orderStatus, runningValue } from "./billing";
import { toAmendmentDto, toBillingItemDto, toOrderDto, type LiveInvoiceFacts, type OrderDto } from "./dto";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;

// ---------------------------------------------------------------------------
// Input contracts

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null);

const positiveMoney = moneyAmountSchema.refine((value) => value > 0n, { message: "Amount must be greater than zero" });

/** BIL-01. ON_DATE needs a due date; the other triggers must not carry one. */
const planItemSchema = z
  .object({
    id: z.string().uuid().optional(),
    label: z.string().trim().min(1).max(200),
    amount: positiveMoney,
    trigger: z.enum(["ON_ORDER", "ON_DATE", "ON_MILESTONE"]).default("ON_ORDER"),
    dueOn: isoDate.optional(),
    isRetention: z.boolean().default(false),
    milestoneRef: optionalText(200),
  })
  .refine((item) => (item.trigger === "ON_DATE") === (item.dueOn !== undefined), {
    message: "A due date goes with the ON_DATE trigger and only with it",
    path: ["dueOn"],
  });

type PlanItem = z.output<typeof planItemSchema>;

const COMMITMENT_TYPES = ["PURCHASE_ORDER", "CONTRACT", "WRITTEN_CONFIRMATION", "PAYMENT"] as const;

/** ORD-01. LEGACY is for migrated data only and cannot be chosen. */
const orderFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  scope: optionalText(5000),
  commitmentType: z.enum(COMMITMENT_TYPES),
  commitmentRef: optionalText(200),
  commitmentDate: isoDate.optional(),
  value: positiveMoney.optional(),
  sourceQuotationId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  billingItems: z.array(planItemSchema).min(1).max(24).optional(),
});

const directOrderSchema = orderFieldsSchema.extend({
  customerId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  value: positiveMoney,
});

const amendmentSchema = z.object({
  delta: moneyAmountSchema.or(z.string().regex(/^-[0-9]+$/).transform((value) => BigInt(value))).refine((value) => value !== 0n, { message: "An amendment must change the value" }),
  reason: z.string().trim().min(1).max(1000),
  reference: optionalText(200),
  effectiveDate: isoDate.optional(),
  billingItems: z.array(planItemSchema).min(1).max(24).optional(),
});

const rebalanceSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
  items: z.array(planItemSchema).min(1).max(24),
});

// ---------------------------------------------------------------------------
// Reading an order with its derived parts

type OrderRow = typeof orders.$inferSelect;

async function loadOrders(executor: Executor, organizationId: string, rows: OrderRow[], today: string): Promise<OrderDto[]> {
  if (rows.length === 0) return [];
  const orderIds = rows.map((row) => row.id);
  const [items, amendments, live, names] = await Promise.all([
    executor
      .select()
      .from(billingItems)
      .where(and(eq(billingItems.organizationId, organizationId), inArray(billingItems.orderId, orderIds)))
      .orderBy(asc(billingItems.sortOrder), asc(billingItems.createdAt), asc(billingItems.id)),
    executor
      .select()
      .from(orderAmendments)
      .where(and(eq(orderAmendments.organizationId, organizationId), inArray(orderAmendments.orderId, orderIds)))
      .orderBy(asc(orderAmendments.createdAt), asc(orderAmendments.id)),
    executor
      .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, billingItemId: invoices.billingItemId, orderId: invoices.orderId, total: invoices.total })
      .from(invoices)
      .where(and(eq(invoices.organizationId, organizationId), inArray(invoices.orderId, orderIds), isNull(invoices.voidedAt))),
    executor
      .select({ id: customers.id, companyName: customers.companyName })
      .from(customers)
      .where(and(eq(customers.organizationId, organizationId), inArray(customers.id, [...new Set(rows.map((row) => row.customerId))]))),
  ]);
  const customerName = new Map(names.map((row) => [row.id, row.companyName]));
  const settled = await paidAmountsFor(executor, { organizationId, invoiceIds: live.map((invoice) => invoice.id) });
  const liveByItem = new Map<string, LiveInvoiceFacts>(
    live.map((invoice) => [invoice.billingItemId, { ...invoice, settled: settled.get(invoice.id) ?? 0n }]),
  );

  return rows.map((row) => {
    const rowItems = items.filter((item) => item.orderId === row.id);
    const rowAmendments = amendments.filter((amendment) => amendment.orderId === row.id);
    const itemDtos = rowItems.map((item) => {
      const invoice = liveByItem.get(item.id);
      return toBillingItemDto(item, billingItemStatus({ ...item, hasLiveInvoice: Boolean(invoice) }, today), invoice);
    });
    const liveInvoices = live.filter((invoice) => invoice.orderId === row.id).map((invoice) => liveByItem.get(invoice.billingItemId)!);
    return toOrderDto(row, {
      currentValue: runningValue(row.originalValue, rowAmendments.map((amendment) => amendment.delta)),
      billedAmount: liveInvoices.reduce((sum, invoice) => sum + invoice.total, 0n),
      settledAmount: liveInvoices.reduce((sum, invoice) => sum + invoice.settled, 0n),
      customerName: customerName.get(row.customerId) ?? "",
      status: orderStatus({
        cancelledAt: row.cancelledAt,
        itemStatuses: itemDtos.map((item) => item.status),
        liveInvoicesPaid: liveInvoices.map((invoice) => invoice.settled >= invoice.total),
      }),
      items: itemDtos,
      amendments: rowAmendments.map(toAmendmentDto),
    });
  });
}

async function loadOrder(executor: Executor, organizationId: string, orderId: string, today: string): Promise<OrderDto> {
  const [row] = await executor.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.organizationId, organizationId)));
  if (!row) throw new APIError("NOT_FOUND", { message: "Order not found" });
  return (await loadOrders(executor, organizationId, [row], today))[0]!;
}

// ---------------------------------------------------------------------------
// Writing

async function logOrderEvent(
  tx: Tx,
  params: { organizationId: string; actorId: string; order: Pick<OrderRow, "id" | "dealId" | "orderNumber">; eventType: string; metadata?: Record<string, unknown> },
) {
  await tx.insert(activities).values({
    organizationId: params.organizationId,
    dealId: params.order.dealId,
    orderId: params.order.id,
    entityType: "order",
    eventType: params.eventType,
    actorId: params.actorId,
    metadata: { orderId: params.order.id, orderNumber: params.order.orderNumber, ...params.metadata },
    permissionCategory: "sales",
  });
}

const sumAmounts = (items: { amount: bigint }[]) => items.reduce((sum, item) => sum + item.amount, 0n);

/** ORD-01/BIL-01: the order, its number and its billing plan (default: one 100% ON_ORDER item) in one go. */
async function insertOrder(
  tx: Tx,
  params: {
    actor: { organizationId: string; userId: string };
    clock: { timezone: string; today: string; now: Date };
    customerId: string;
    dealId: string | null;
    contactId: string | null;
    title: string;
    input: z.output<typeof orderFieldsSchema>;
    value: bigint;
  },
) {
  const { actor, clock, input } = params;
  const commitmentDate = input.commitmentDate ?? clock.today;
  if (commitmentDate > clock.today) {
    throw new APIError("BAD_REQUEST", { message: "The commitment date cannot be in the future" });
  }
  const plan: PlanItem[] = input.billingItems ?? [{ label: "Tagihan 100%", amount: params.value, trigger: "ON_ORDER", isRetention: false, milestoneRef: null }];
  if (sumAmounts(plan) !== params.value) {
    throw new APIError("BAD_REQUEST", { message: "The billing plan must add up to the order value" });
  }

  if (params.contactId) {
    const contact = await tx.query.contacts.findFirst({
      where: and(eq(contacts.id, params.contactId), eq(contacts.customerId, params.customerId), eq(contacts.organizationId, actor.organizationId)),
      columns: { id: true },
    });
    if (!contact) throw new APIError("BAD_REQUEST", { message: "Contact not found for this customer" });
  }

  const year = organizationYear(clock.timezone, clock.now);
  const sequence = await claimNextSequence(tx, { organizationId: actor.organizationId, documentType: "SO", year });
  const [order] = await tx
    .insert(orders)
    .values({
      organizationId: actor.organizationId,
      customerId: params.customerId,
      dealId: params.dealId,
      contactId: params.contactId,
      orderNumber: formatOrderNumber(year, sequence),
      title: params.title,
      scope: input.scope,
      commitmentType: input.commitmentType,
      commitmentRef: input.commitmentRef,
      commitmentDate,
      originalValue: params.value,
      sourceQuotationId: input.sourceQuotationId ?? null,
      createdById: actor.userId,
    })
    .returning();
  await tx.insert(billingItems).values(
    plan.map((item, index) => ({
      organizationId: actor.organizationId,
      orderId: order.id,
      label: item.label,
      amount: item.amount,
      trigger: item.trigger,
      dueOn: item.dueOn ?? null,
      isRetention: item.isRetention,
      milestoneRef: item.milestoneRef,
      sortOrder: index,
      createdById: actor.userId,
    })),
  );
  return order;
}

/** Locks and checks the quotation chosen as the order's source, and freezes it when it is still a draft (DEAL-04). */
async function useSourceQuotation(tx: Tx, params: { organizationId: string; dealId: string; quotationId: string }) {
  const [quotation] = await tx
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, params.quotationId), eq(quotations.organizationId, params.organizationId)))
    .for("update");
  if (!quotation || quotation.dealId !== params.dealId) {
    throw new APIError("NOT_FOUND", { message: "Quotation not found" });
  }
  if (quotation.status === "REJECTED") {
    throw new APIError("BAD_REQUEST", { message: "A rejected quotation cannot be the source of an order" });
  }
  if (quotation.frozenAt === null) {
    const built = await buildDocumentSnapshots(tx, { organizationId: params.organizationId, customerId: quotation.customerId, dealId: params.dealId });
    await tx
      .update(quotations)
      .set({ frozenAt: sql`now()`, sellerSnapshot: built.seller, customerSnapshot: built.customer, editVersion: sql`${quotations.editVersion} + 1` })
      .where(eq(quotations.id, quotation.id));
  }
}

/**
 * DEAL-04 / ORD-02: winning a deal creates its first order, with the evidence
 * of the commitment and a billing plan (default one 100% item), freezes the
 * source quotation if one is named, cancels the deal's open tasks and writes
 * the event, all in one transaction. The order value is the deal's estimated
 * value unless the caller gives another; it becomes the deal's won value.
 * A quotation being ACCEPTED is neither required nor evidence.
 */
export async function confirmWon(params: { headers: Headers; dealId: string; expectedVersion: number; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["transition"] } });
  const input = orderFieldsSchema.parse(params.input);
  const clock = await organizationClock(actor.organizationId);

  return db.transaction(async (tx) => {
    const [deal] = await tx
      .select()
      .from(deals)
      .where(and(eq(deals.id, params.dealId), eq(deals.organizationId, actor.organizationId)))
      .for("no key update");
    if (!deal) throw new APIError("NOT_FOUND", { message: "Deal not found" });
    if (deal.status === "WON" || deal.status === "LOST") {
      throw new APIError("BAD_REQUEST", { message: "Only an open deal can be won" });
    }
    if (deal.version !== params.expectedVersion) {
      throw new APIError("CONFLICT", { message: "Deal was modified by someone else, reload and try again" });
    }
    const value = input.value ?? deal.estimatedValue;
    if (value <= 0n) {
      throw new APIError("BAD_REQUEST", { message: "Estimated value must be positive to mark a deal WON" });
    }
    if (input.sourceQuotationId) {
      await useSourceQuotation(tx, { organizationId: actor.organizationId, dealId: deal.id, quotationId: input.sourceQuotationId });
    }

    const order = await insertOrder(tx, {
      actor,
      clock,
      customerId: deal.customerId,
      dealId: deal.id,
      contactId: input.contactId ?? deal.contactId,
      title: input.title ?? deal.title,
      input,
      value,
    });

    const [won] = await tx
      .update(deals)
      .set({
        status: "WON",
        wonAt: clock.now,
        wonValue: value,
        onHoldUntil: null,
        onHoldReason: null,
        stageEnteredAt: clock.now,
        lastActivityAt: clock.now,
        updatedById: actor.userId,
        version: sql`${deals.version} + 1`,
      })
      .where(eq(deals.id, deal.id))
      .returning();

    const cancelledTasks = await cancelOpenDealTasks(tx, { organizationId: actor.organizationId, dealId: deal.id, actorId: actor.userId, at: clock.now });
    await tx.insert(activities).values({
      organizationId: actor.organizationId,
      dealId: deal.id,
      orderId: order.id,
      entityType: "deal",
      eventType: "won",
      actorId: actor.userId,
      metadata: {
        fromStatus: deal.status,
        toStatus: "WON",
        wonValue: value.toString(),
        orderId: order.id,
        orderNumber: order.orderNumber,
        commitmentType: order.commitmentType,
        ...(cancelledTasks > 0 ? { cancelledTasks } : {}),
      },
      permissionCategory: "sales",
    });

    return { deal: toDealDto(won), order: await loadOrder(tx, actor.organizationId, order.id, clock.today) };
  });
}

/** ORD-02: a further order for a deal that is already WON, for the same customer. The deal does not change. */
export async function addOrderToDeal(params: { headers: Headers; dealId: string; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["transition"] } });
  const input = orderFieldsSchema.extend({ value: positiveMoney }).parse(params.input);
  const clock = await organizationClock(actor.organizationId);

  return db.transaction(async (tx) => {
    const [deal] = await tx
      .select()
      .from(deals)
      .where(and(eq(deals.id, params.dealId), eq(deals.organizationId, actor.organizationId)))
      .for("no key update");
    if (!deal) throw new APIError("NOT_FOUND", { message: "Deal not found" });
    if (deal.status !== "WON") {
      throw new APIError("BAD_REQUEST", { message: "An order can only be added to a won deal" });
    }
    if (input.sourceQuotationId) {
      await useSourceQuotation(tx, { organizationId: actor.organizationId, dealId: deal.id, quotationId: input.sourceQuotationId });
    }
    const order = await insertOrder(tx, {
      actor,
      clock,
      customerId: deal.customerId,
      dealId: deal.id,
      contactId: input.contactId ?? deal.contactId,
      title: input.title ?? deal.title,
      input,
      value: input.value,
    });
    await logOrderEvent(tx, { organizationId: actor.organizationId, actorId: actor.userId, order, eventType: "created", metadata: { commitmentType: order.commitmentType } });
    return loadOrder(tx, actor.organizationId, order.id, clock.today);
  });
}

/** ORD-02: an order without a deal, for a buyer who never went through the pipeline. No synthetic deal is made. */
export async function createDirectOrder(params: { headers: Headers; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { order: ["write"] } });
  const input = directOrderSchema.parse(params.input);
  const clock = await organizationClock(actor.organizationId);
  if (input.sourceQuotationId) {
    throw new APIError("BAD_REQUEST", { message: "A direct order has no deal, so it has no source quotation" });
  }

  return db.transaction(async (tx) => {
    const order = await insertDirectOrder(tx, actor, clock, input);
    return loadOrder(tx, actor.organizationId, order.id, clock.today);
  });
}

/** Shared with the one-submit flow that also bills and collects (Fase 5). */
export async function insertDirectOrder(
  tx: Tx,
  actor: { organizationId: string; userId: string },
  clock: { timezone: string; today: string; now: Date },
  input: z.output<typeof directOrderSchema>,
) {
  const customer = await tx.query.customers.findFirst({
    where: (customer, { and, eq }) => and(eq(customer.id, input.customerId), eq(customer.organizationId, actor.organizationId)),
    columns: { id: true },
  });
  if (!customer) throw new APIError("BAD_REQUEST", { message: "Customer not found in this organization" });
  const order = await insertOrder(tx, {
    actor,
    clock,
    customerId: input.customerId,
    dealId: null,
    contactId: input.contactId ?? null,
    title: input.title,
    input,
    value: input.value,
  });
  await logOrderEvent(tx, { organizationId: actor.organizationId, actorId: actor.userId, order, eventType: "created", metadata: { commitmentType: order.commitmentType, direct: true } });
  return order;
}

export { directOrderSchema };

// ---------------------------------------------------------------------------
// Changing an order

/**
 * Locks follow one order everywhere: deal, order, billing items, invoice. The deal
 * lock is FOR NO KEY UPDATE, which excludes other writers of the deal but not the
 * key-share lock a foreign-key check takes when a transaction inserts an activity
 * that points at it. A stronger lock here deadlocked a rebalance (holding the order,
 * needing the deal for its activity) against an invoice issue (holding the deal,
 * waiting for the order).
 */
async function lockOrder(tx: Tx, organizationId: string, orderId: string, options: { allowCancelled?: boolean } = {}) {
  const [plain] = await tx
    .select({ dealId: orders.dealId })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.organizationId, organizationId)));
  if (!plain) throw new APIError("NOT_FOUND", { message: "Order not found" });
  if (plain.dealId) {
    await tx.select({ id: deals.id }).from(deals).where(and(eq(deals.id, plain.dealId), eq(deals.organizationId, organizationId))).for("no key update");
  }
  const [order] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.organizationId, organizationId)))
    .for("no key update");
  if (!order) throw new APIError("NOT_FOUND", { message: "Order not found" });
  if (order.cancelledAt && !options.allowCancelled) throw new APIError("BAD_REQUEST", { message: "The order is cancelled" });
  return order;
}

/** The items of an order that are not cancelled, locked in id order, with whether each has a live invoice. */
async function lockPlan(tx: Tx, organizationId: string, orderId: string) {
  const items = await tx
    .select()
    .from(billingItems)
    .where(and(eq(billingItems.organizationId, organizationId), eq(billingItems.orderId, orderId), isNull(billingItems.cancelledAt)))
    .orderBy(asc(billingItems.id))
    .for("update");
  const live = await tx
    .select({ billingItemId: invoices.billingItemId, total: invoices.total })
    .from(invoices)
    .where(and(eq(invoices.organizationId, organizationId), eq(invoices.orderId, orderId), isNull(invoices.voidedAt)));
  const lockedIds = new Set(live.map((invoice) => invoice.billingItemId));
  return {
    items: items.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime()),
    lockedIds,
    liveInvoiceTotal: live.reduce((sum, invoice) => sum + invoice.total, 0n),
  };
}

async function currentValueOf(tx: Tx, order: OrderRow) {
  const amendments = await tx.select({ delta: orderAmendments.delta }).from(orderAmendments).where(and(eq(orderAmendments.organizationId, order.organizationId), eq(orderAmendments.orderId, order.id)));
  return runningValue(order.originalValue, amendments.map((amendment) => amendment.delta));
}

/**
 * BIL-02: replaces the part of the plan that has no live invoice. Items with an
 * invoice are locked and keep their place; the rest are updated (given an id),
 * created (no id) or cancelled (left out). Afterwards the live items add up to
 * the target value, or nothing is changed.
 */
async function applyPlan(tx: Tx, params: { actor: { organizationId: string; userId: string }; order: OrderRow; plan: PlanItem[]; target: bigint; now: Date }) {
  const { actor, order, plan } = params;
  const { items, lockedIds } = await lockPlan(tx, actor.organizationId, order.id);
  const byId = new Map(items.map((item) => [item.id, item]));

  for (const entry of plan) {
    if (!entry.id) continue;
    const existing = byId.get(entry.id);
    if (!existing) throw new APIError("BAD_REQUEST", { message: "Billing item not found on this order" });
    if (lockedIds.has(existing.id)) throw new APIError("BAD_REQUEST", { message: "A billing item that is invoiced is locked" });
  }
  const keptIds = new Set(plan.flatMap((entry) => (entry.id ? [entry.id] : [])));
  const lockedTotal = sumAmounts(items.filter((item) => lockedIds.has(item.id)));
  if (lockedTotal + sumAmounts(plan) !== params.target) {
    throw new APIError("BAD_REQUEST", { message: "The billing plan must add up to the order value" });
  }

  for (const item of items) {
    if (!lockedIds.has(item.id) && !keptIds.has(item.id)) {
      await tx.update(billingItems).set({ cancelledAt: params.now }).where(eq(billingItems.id, item.id));
    }
  }
  const nextSort = items.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
  let created = 0;
  for (const entry of plan) {
    const values = {
      label: entry.label,
      amount: entry.amount,
      trigger: entry.trigger,
      dueOn: entry.dueOn ?? null,
      isRetention: entry.isRetention,
      milestoneRef: entry.milestoneRef,
    };
    if (entry.id) {
      await tx.update(billingItems).set(values).where(eq(billingItems.id, entry.id));
    } else {
      await tx.insert(billingItems).values({ organizationId: actor.organizationId, orderId: order.id, ...values, sortOrder: nextSort + created++, createdById: actor.userId });
    }
  }
}

/** BIL-02: change the plan of not-yet-invoiced items without changing the order's value. */
export async function rebalanceBillingItems(params: { headers: Headers; orderId: string; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { order: ["write"] } });
  const input = rebalanceSchema.parse(params.input);
  const clock = await organizationClock(actor.organizationId);

  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, actor.organizationId, params.orderId);
    await applyPlan(tx, { actor, order, plan: input.items, target: await currentValueOf(tx, order), now: clock.now });
    await logOrderEvent(tx, { organizationId: actor.organizationId, actorId: actor.userId, order, eventType: "plan_changed", metadata: { reason: input.reason } });
    return loadOrder(tx, actor.organizationId, order.id, clock.today);
  });
}

/**
 * ORD-03: a signed change of value (extra or reduced work). The running value
 * cannot fall below what is already invoiced, and the plan is balanced in the
 * same transaction: with a plan from the caller, otherwise by adding an item
 * for an increase or trimming not-yet-invoiced items from the end for a cut.
 */
export async function amendOrder(params: { headers: Headers; orderId: string; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { order: ["write"] } });
  const input = amendmentSchema.parse(params.input);
  const clock = await organizationClock(actor.organizationId);

  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, actor.organizationId, params.orderId);
    const before = await currentValueOf(tx, order);
    const after = before + input.delta;
    const { items, lockedIds, liveInvoiceTotal } = await lockPlan(tx, actor.organizationId, order.id);
    if (after <= 0n) {
      throw new APIError("BAD_REQUEST", { message: "The order value must stay above zero" });
    }
    if (after < liveInvoiceTotal) {
      throw new APIError("BAD_REQUEST", { message: "The order value cannot fall below what is already invoiced" });
    }

    let plan = input.billingItems;
    if (!plan) {
      const open = items.filter((item) => !lockedIds.has(item.id));
      if (input.delta > 0n) {
        plan = [
          ...open.map((item) => ({ id: item.id, label: item.label, amount: item.amount, trigger: item.trigger as PlanItem["trigger"], dueOn: item.dueOn ?? undefined, isRetention: item.isRetention, milestoneRef: item.milestoneRef })),
          { label: `Kerja tambah ${input.reference ?? ""}`.trim(), amount: input.delta, trigger: "ON_ORDER" as const, isRetention: false, milestoneRef: null },
        ];
      } else {
        // Trim not-yet-invoiced items from the end until the cut is absorbed.
        let toCut = -input.delta;
        const trimmed: PlanItem[] = [];
        for (const item of [...open].reverse()) {
          const cut = toCut < item.amount ? toCut : item.amount;
          toCut -= cut;
          if (item.amount - cut > 0n) {
            trimmed.unshift({ id: item.id, label: item.label, amount: item.amount - cut, trigger: item.trigger as PlanItem["trigger"], dueOn: item.dueOn ?? undefined, isRetention: item.isRetention, milestoneRef: item.milestoneRef });
          }
        }
        if (toCut > 0n) {
          throw new APIError("BAD_REQUEST", { message: "The reduction is larger than what is still to be billed" });
        }
        plan = trimmed;
      }
    }
    await applyPlan(tx, { actor, order, plan: plan.length > 0 ? plan : [], target: after, now: clock.now });

    await tx.insert(orderAmendments).values({
      organizationId: actor.organizationId,
      orderId: order.id,
      delta: input.delta,
      reason: input.reason,
      reference: input.reference,
      effectiveDate: input.effectiveDate ?? clock.today,
      createdById: actor.userId,
    });
    await tx.update(orders).set({ version: sql`${orders.version} + 1` }).where(eq(orders.id, order.id));
    await logOrderEvent(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      order,
      eventType: "amended",
      metadata: { delta: input.delta.toString(), reason: input.reason, valueAfter: after.toString() },
    });
    return loadOrder(tx, actor.organizationId, order.id, clock.today);
  });
}

/** BIL-01: marks the milestone of an ON_MILESTONE item as reached (e.g. BAST signed), which makes it ready to invoice. */
export async function markMilestone(params: { headers: Headers; billingItemId: string; input?: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { order: ["write"] } });
  const input = z.object({ milestoneRef: optionalText(200), doneAt: z.coerce.date().optional() }).parse(params.input ?? {});
  const clock = await organizationClock(actor.organizationId);

  return db.transaction(async (tx) => {
    const [plain] = await tx
      .select({ orderId: billingItems.orderId })
      .from(billingItems)
      .where(and(eq(billingItems.id, params.billingItemId), eq(billingItems.organizationId, actor.organizationId)));
    if (!plain) throw new APIError("NOT_FOUND", { message: "Billing item not found" });
    const order = await lockOrder(tx, actor.organizationId, plain.orderId);
    const [item] = await tx
      .select()
      .from(billingItems)
      .where(and(eq(billingItems.id, params.billingItemId), eq(billingItems.organizationId, actor.organizationId)))
      .for("update");
    if (item.cancelledAt) throw new APIError("BAD_REQUEST", { message: "The billing item is cancelled" });
    if (item.trigger !== "ON_MILESTONE") throw new APIError("BAD_REQUEST", { message: "Only a milestone billing item has a milestone to mark" });
    if (input.doneAt && input.doneAt.getTime() > clock.now.getTime() + 60_000) {
      throw new APIError("BAD_REQUEST", { message: "The milestone date cannot be in the future" });
    }
    if (!item.milestoneDoneAt) {
      await tx
        .update(billingItems)
        .set({ milestoneDoneAt: input.doneAt ?? clock.now, milestoneRef: input.milestoneRef ?? item.milestoneRef })
        .where(eq(billingItems.id, item.id));
      await logOrderEvent(tx, { organizationId: actor.organizationId, actorId: actor.userId, order, eventType: "milestone_done", metadata: { billingItemId: item.id, label: item.label, milestoneRef: input.milestoneRef ?? item.milestoneRef } });
    }
    return loadOrder(tx, actor.organizationId, order.id, clock.today);
  });
}

/** ORD-04: cancel an order that has no live invoice. Its remaining plan is cancelled; money already received stays as receipts. */
export async function cancelOrder(params: { headers: Headers; orderId: string; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { order: ["write"] } });
  const input = z.object({ reason: z.string().trim().min(1).max(1000) }).parse(params.input);
  const clock = await organizationClock(actor.organizationId);

  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, actor.organizationId, params.orderId, { allowCancelled: true });
    if (order.cancelledAt) return loadOrder(tx, actor.organizationId, order.id, clock.today);

    const { liveInvoiceTotal, items } = await lockPlan(tx, actor.organizationId, order.id);
    const [live] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.organizationId, actor.organizationId), eq(invoices.orderId, order.id), isNull(invoices.voidedAt)))
      .limit(1);
    if (live || liveInvoiceTotal > 0n) {
      throw new APIError("BAD_REQUEST", { message: "An order with invoices cannot be cancelled, void the invoices first" });
    }
    await tx.update(orders).set({ cancelledAt: clock.now, cancelReason: input.reason, version: sql`${orders.version} + 1` }).where(eq(orders.id, order.id));
    for (const item of items) {
      await tx.update(billingItems).set({ cancelledAt: clock.now }).where(eq(billingItems.id, item.id));
    }
    await logOrderEvent(tx, { organizationId: actor.organizationId, actorId: actor.userId, order, eventType: "cancelled", metadata: { reason: input.reason } });
    return loadOrder(tx, actor.organizationId, order.id, clock.today);
  });
}

// ---------------------------------------------------------------------------
// Reading

/** TENANT-04: a missing order and one of another organization are the same NOT_FOUND. */
export async function getOrder(params: { headers: Headers; orderId: string }): Promise<OrderDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { order: ["read"] } });
  const parsed = z.string().uuid().safeParse(params.orderId);
  if (!parsed.success) throw new APIError("NOT_FOUND", { message: "Order not found" });
  const clock = await organizationClock(actor.organizationId);
  return loadOrder(db, actor.organizationId, parsed.data, clock.today);
}

export async function listOrders(params: { headers: Headers; dealId?: string; customerId?: string; page?: number; pageSize?: number }) {
  const actor = await requirePermission({ headers: params.headers, permission: { order: ["read"] } });
  const clock = await organizationClock(actor.organizationId);
  const where = and(
    eq(orders.organizationId, actor.organizationId),
    params.dealId ? eq(orders.dealId, params.dealId) : undefined,
    params.customerId ? eq(orders.customerId, params.customerId) : undefined,
  );
  const { page, pageSize, limit, offset } = resolvePagination(params);
  const [rows, [{ count }]] = await Promise.all([
    db.select().from(orders).where(where).orderBy(desc(orders.createdAt), desc(orders.id)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(orders).where(where),
  ]);
  return buildPaginatedDto(await loadOrders(db, actor.organizationId, rows, clock.today), page, pageSize, count);
}
