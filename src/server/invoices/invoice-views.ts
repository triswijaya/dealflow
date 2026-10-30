import { and, asc, desc, eq, ilike, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { activities, billingItems, customers, deals, invoiceItems, invoices, orders, organizationSettings, payments, quotationItems, quotations, user } from "@/server/db/schema";
import { billingItemStatus } from "@/server/orders/billing";
import { toIsoDto, toMoneyDto } from "@/server/shared/dto";
import type { CustomerSnapshot, SellerSnapshot } from "@/server/shared/document-snapshots";
import { organizationClock } from "@/server/shared/organization-clock";
import { buildPaginatedDto, resolvePagination } from "@/server/shared/pagination";
import { effectiveQuotationStatus } from "@/server/quotations/effective-status";
import { invoiceEffectiveStatus, invoiceRemainingAmount } from "./effective-status";

// Read models for the invoice screens. Creating an invoice and recording a
// payment stay in invoices.ts / payments.ts; this file joins what a screen
// needs (customer, deal, payments, who did what) and does the list filtering
// on the derived status in SQL, so a page of results is a page of the filter.

const STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"] as const;
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const filterSchema = z.object({
  query: z.string().trim().max(200).optional(),
  customerId: z.string().uuid().optional(),
  status: z.enum(STATUSES).optional(),
  dueFrom: dateOnly.optional(),
  dueTo: dateOnly.optional(),
});

export type InvoiceFilters = z.input<typeof filterSchema>;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (match) => `\\${match}`);

function paidSubquery(organizationId: string) {
  return db
    .select({
      invoiceId: payments.invoiceId,
      paid: sql<string>`sum(${payments.amount})`.as("paid_amount"),
      lastPaidOn: sql<string>`max(${payments.paymentDate})`.as("last_paid_on"),
    })
    .from(payments)
    .where(eq(payments.organizationId, organizationId))
    .groupBy(payments.invoiceId)
    .as("paid_sub");
}

type PaidSub = ReturnType<typeof paidSubquery>;

/** §10.2's derived status, as a SQL condition (so filtering and paging agree with what the row shows). */
function statusCondition(status: (typeof STATUSES)[number], paid: PaidSub, today: string): SQL {
  // INV-06: VOID is above everything; every other status is for live invoices only.
  if (status === "VOID") return sql`${invoices.voidedAt} is not null`;
  return sql`${invoices.voidedAt} is null and (${liveStatusCondition(status, paid, today)})`;
}

function liveStatusCondition(status: Exclude<(typeof STATUSES)[number], "VOID">, paid: PaidSub, today: string): SQL {
  const paidAmount = sql`coalesce(${paid.paid}, 0)`;
  switch (status) {
    case "PAID":
      return sql`${paidAmount} >= ${invoices.total}`;
    case "OVERDUE":
      return sql`${paidAmount} < ${invoices.total} and ${invoices.dueDate} < ${today}::date`;
    case "PARTIALLY_PAID":
      return sql`${paidAmount} > 0 and ${paidAmount} < ${invoices.total} and ${invoices.dueDate} >= ${today}::date`;
    case "UNPAID":
      return sql`${paidAmount} = 0 and ${paidAmount} < ${invoices.total} and ${invoices.dueDate} >= ${today}::date`;
  }
}

export type InvoiceRowDto = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  dealId: string | null;
  orderId: string;
  orderNumber: string;
  dealTitle: string;
  issueDate: string;
  dueDate: string;
  total: string;
  paidAmount: string;
  remainingAmount: string;
  status: string;
};

export async function listInvoiceRows(params: { headers: Headers; page?: number; pageSize?: number; filters?: InvoiceFilters }) {
  const actor = await requirePermission({ headers: params.headers, permission: { invoice: ["read"] } });
  const { page, pageSize, limit, offset } = resolvePagination(params);
  const filters = filterSchema.parse(params.filters ?? {});
  if (filters.dueFrom && filters.dueTo && filters.dueFrom > filters.dueTo) {
    throw new APIError("BAD_REQUEST", { message: "Invalid date range: dueFrom is after dueTo" });
  }
  const { today } = await organizationClock(actor.organizationId);
  const paid = paidSubquery(actor.organizationId);

  const conditions: (SQL | undefined)[] = [eq(invoices.organizationId, actor.organizationId)];
  if (filters.customerId) conditions.push(eq(invoices.customerId, filters.customerId));
  if (filters.status) conditions.push(statusCondition(filters.status, paid, today));
  if (filters.dueFrom) conditions.push(sql`${invoices.dueDate} >= ${filters.dueFrom}::date`);
  if (filters.dueTo) conditions.push(sql`${invoices.dueDate} <= ${filters.dueTo}::date`);
  if (filters.query) {
    const pattern = `%${escapeLike(filters.query)}%`;
    conditions.push(or(ilike(invoices.invoiceNumber, pattern), ilike(deals.title, pattern), ilike(orders.title, pattern), ilike(orders.orderNumber, pattern), ilike(customers.companyName, pattern)));
  }
  const where = and(...conditions);

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        invoice: invoices,
        dealTitle: sql<string>`coalesce(${deals.title}, ${orders.title})`,
        orderNumber: orders.orderNumber,
        customerName: customers.companyName,
        paid: sql<string>`coalesce(${paid.paid}, 0)::text`,
      })
      .from(invoices)
      .innerJoin(orders, and(eq(orders.id, invoices.orderId), eq(orders.organizationId, invoices.organizationId)))
      .leftJoin(deals, and(eq(deals.id, invoices.dealId), eq(deals.organizationId, invoices.organizationId)))
      .innerJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.organizationId, invoices.organizationId)))
      .leftJoin(paid, eq(paid.invoiceId, invoices.id))
      .where(where)
      // SEARCH-02: stable sort, newest issued first, the id breaking ties.
      .orderBy(desc(invoices.issueDate), desc(invoices.createdAt), desc(invoices.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(invoices)
      .innerJoin(orders, and(eq(orders.id, invoices.orderId), eq(orders.organizationId, invoices.organizationId)))
      .leftJoin(deals, and(eq(deals.id, invoices.dealId), eq(deals.organizationId, invoices.organizationId)))
      .innerJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.organizationId, invoices.organizationId)))
      .leftJoin(paid, eq(paid.invoiceId, invoices.id))
      .where(where),
  ]);

  const items: InvoiceRowDto[] = rows.map(({ invoice, dealTitle, orderNumber, customerName, paid: paidText }) => {
    const paidAmount = BigInt(paidText);
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName,
      dealId: invoice.dealId,
      orderId: invoice.orderId,
      orderNumber,
      dealTitle,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      total: toMoneyDto(invoice.total),
      paidAmount: toMoneyDto(paidAmount),
      remainingAmount: toMoneyDto(invoiceRemainingAmount(invoice.total, paidAmount, invoice.voidedAt !== null)),
      status: invoiceEffectiveStatus({ total: invoice.total, paidAmount, dueDate: invoice.dueDate, voided: invoice.voidedAt !== null }, today),
    };
  });
  return buildPaginatedDto(items, page, pageSize, count);
}

export type InvoiceSummaryDto = {
  outstandingTotal: string;
  outstandingCount: number;
  overdueTotal: string;
  overdueCount: number;
  paidThisMonth: number;
};

/**
 * The three tiles above the list: what is still owed, how much of that is
 * late, and how many invoices were settled this month. One grouped read over
 * the invoices, never a sum of a joined list (DASH-02: no doubled totals).
 */
export async function getInvoiceSummary(params: { headers: Headers }): Promise<InvoiceSummaryDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { invoice: ["read"] } });
  const { today } = await organizationClock(actor.organizationId);
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const paid = paidSubquery(actor.organizationId);
  const paidAmount = sql`coalesce(${paid.paid}, 0)`;

  const [row] = await db
    .select({
      outstandingTotal: sql<string>`coalesce(sum(${invoices.total} - ${paidAmount}) filter (where ${paidAmount} < ${invoices.total}), 0)::text`,
      outstandingCount: sql<number>`count(*) filter (where ${paidAmount} < ${invoices.total})`.mapWith(Number),
      overdueTotal: sql<string>`coalesce(sum(${invoices.total} - ${paidAmount}) filter (where ${paidAmount} < ${invoices.total} and ${invoices.dueDate} < ${today}::date), 0)::text`,
      overdueCount: sql<number>`count(*) filter (where ${paidAmount} < ${invoices.total} and ${invoices.dueDate} < ${today}::date)`.mapWith(Number),
      paidThisMonth: sql<number>`count(*) filter (where ${paidAmount} >= ${invoices.total} and ${paid.lastPaidOn} >= ${monthStart}::date and ${paid.lastPaidOn} < ${nextMonth}::date)`.mapWith(Number),
    })
    .from(invoices)
    .leftJoin(paid, eq(paid.invoiceId, invoices.id))
    .where(and(eq(invoices.organizationId, actor.organizationId), isNull(invoices.voidedAt)));

  return {
    outstandingTotal: row?.outstandingTotal ?? "0",
    outstandingCount: row?.outstandingCount ?? 0,
    overdueTotal: row?.overdueTotal ?? "0",
    overdueCount: row?.overdueCount ?? 0,
    paidThisMonth: row?.paidThisMonth ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Detail

const creator = alias(user, "creator");
const recorder = alias(user, "recorder");

export type InvoicePaymentDto = {
  id: string;
  amount: string;
  paymentDate: string;
  paymentMethod: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
};

export type InvoiceDetailDto = {
  id: string;
  invoiceNumber: string;
  dealId: string | null;
  dealTitle: string;
  orderId: string;
  orderNumber: string;
  billingItemId: string;
  billingItemLabel: string;
  voidedAt: string | null;
  voidReason: string | null;
  replacesInvoiceId: string | null;
  customerId: string;
  issueDate: string;
  dueDate: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  notes: string | null;
  terms: string | null;
  status: string;
  paidAmount: string;
  remainingAmount: string;
  createdByName: string | null;
  seller: SellerSnapshot;
  customer: CustomerSnapshot;
  items: { id: string; description: string; quantity: string; unit: string; unitPrice: string; subtotal: string }[];
  payments: InvoicePaymentDto[];
  /** The quotation this invoice was issued from; null for manual items. */
  sourceQuotation: { id: string; quotationNumber: string } | null;
};

/** TENANT-04: a missing and a cross-tenant invoice are the same NOT_FOUND. */
export async function getInvoiceDetail(params: { headers: Headers; invoiceId: string }): Promise<InvoiceDetailDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { invoice: ["read"] } });
  const id = z.string().uuid().safeParse(params.invoiceId);
  if (!id.success) throw new APIError("NOT_FOUND", { message: "Invoice not found" });

  const [row] = await db
    .select({ invoice: invoices, dealTitle: sql<string>`coalesce(${deals.title}, ${orders.title})`, orderNumber: orders.orderNumber, billingItemLabel: billingItems.label, createdByName: creator.name })
    .from(invoices)
    .innerJoin(orders, and(eq(orders.id, invoices.orderId), eq(orders.organizationId, invoices.organizationId)))
    .innerJoin(billingItems, and(eq(billingItems.id, invoices.billingItemId), eq(billingItems.organizationId, invoices.organizationId)))
    .leftJoin(deals, and(eq(deals.id, invoices.dealId), eq(deals.organizationId, invoices.organizationId)))
    .leftJoin(creator, eq(creator.id, invoices.createdById))
    .where(and(eq(invoices.id, id.data), eq(invoices.organizationId, actor.organizationId)))
    .limit(1);
  if (!row) throw new APIError("NOT_FOUND", { message: "Invoice not found" });
  const { invoice } = row;
  const { today } = await organizationClock(actor.organizationId);

  // Separate top-level queries, not nested `with`: drizzle drops trailing
  // zeros on numeric columns read through a relation (MONEY-02).
  const items = await db.query.invoiceItems.findMany({
    where: eq(invoiceItems.invoiceId, invoice.id),
    orderBy: (item, { asc: ascOp }) => ascOp(item.sortOrder),
  });
  const paymentRows = await db
    .select({ payment: payments, createdByName: recorder.name })
    .from(payments)
    .leftJoin(recorder, eq(recorder.id, payments.createdById))
    .where(and(eq(payments.organizationId, actor.organizationId), eq(payments.invoiceId, invoice.id)))
    .orderBy(asc(payments.paymentDate), asc(payments.createdAt), asc(payments.id));

  const paidAmount = paymentRows.reduce((sum, { payment }) => sum + payment.amount, 0n);
  let sourceQuotation: InvoiceDetailDto["sourceQuotation"] = null;
  if (invoice.quotationId && (actor.role === "OWNER" || actor.role === "ADMIN")) {
    const [source] = await db
      .select({ id: quotations.id, quotationNumber: quotations.quotationNumber })
      .from(quotations)
      .where(and(eq(quotations.id, invoice.quotationId), eq(quotations.organizationId, actor.organizationId)))
      .limit(1);
    sourceQuotation = source ?? null;
  }

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    dealId: invoice.dealId,
    dealTitle: row.dealTitle,
    orderId: invoice.orderId,
    orderNumber: row.orderNumber,
    billingItemId: invoice.billingItemId,
    billingItemLabel: row.billingItemLabel,
    voidedAt: invoice.voidedAt ? toIsoDto(invoice.voidedAt) : null,
    voidReason: invoice.voidReason,
    replacesInvoiceId: invoice.replacesInvoiceId,
    customerId: invoice.customerId,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    subtotal: toMoneyDto(invoice.subtotal),
    discount: toMoneyDto(invoice.discount),
    tax: toMoneyDto(invoice.tax),
    total: toMoneyDto(invoice.total),
    notes: invoice.notes,
    terms: invoice.terms,
    status: invoiceEffectiveStatus({ total: invoice.total, paidAmount, dueDate: invoice.dueDate, voided: invoice.voidedAt !== null }, today),
    paidAmount: toMoneyDto(paidAmount),
    remainingAmount: toMoneyDto(invoiceRemainingAmount(invoice.total, paidAmount, invoice.voidedAt !== null)),
    createdByName: row.createdByName,
    seller: invoice.sellerSnapshot as SellerSnapshot,
    customer: invoice.customerSnapshot as CustomerSnapshot,
    items: items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: toMoneyDto(item.unitPrice),
      subtotal: toMoneyDto(item.subtotal),
    })),
    payments: paymentRows.map(({ payment, createdByName }) => ({
      id: payment.id,
      amount: toMoneyDto(payment.amount),
      paymentDate: payment.paymentDate,
      paymentMethod: payment.paymentMethod,
      reference: payment.reference,
      note: payment.note,
      createdAt: toIsoDto(payment.createdAt),
      createdByName,
    })),
    sourceQuotation,
  };
}

/** The finance trail of one invoice: issued, and each payment recorded (AUD-04: identifiers only). */
export async function listInvoiceActivities(params: { headers: Headers; invoiceId: string }) {
  const actor = await requirePermission({ headers: params.headers, permission: { invoice: ["read"] } });
  const id = z.string().uuid().safeParse(params.invoiceId);
  if (!id.success) throw new APIError("NOT_FOUND", { message: "Invoice not found" });
  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, id.data), eq(invoices.organizationId, actor.organizationId)),
    columns: { id: true, orderId: true },
  });
  if (!invoice) throw new APIError("NOT_FOUND", { message: "Invoice not found" });

  const actorUser = alias(user, "actor_user");
  const rows = await db
    .select({ activity: activities, actorName: actorUser.name })
    .from(activities)
    .leftJoin(actorUser, eq(actorUser.id, activities.actorId))
    .where(
      and(
        eq(activities.organizationId, actor.organizationId),
        eq(activities.orderId, invoice.orderId),
        eq(activities.permissionCategory, "finance"),
        sql`${activities.metadata}->>'invoiceId' = ${invoice.id}`,
      ),
    )
    .orderBy(desc(activities.createdAt), desc(activities.id));

  return rows.map(({ activity, actorName }) => ({
    id: activity.id,
    entityType: activity.entityType,
    eventType: activity.eventType,
    actorId: activity.actorId,
    actorName,
    createdAt: toIsoDto(activity.createdAt),
    metadata: (activity.metadata as Record<string, unknown> | null) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Creating an invoice (I-02): which billing items qualify and what a source offers

export type InvoiceableItemDto = {
  /** The billing item's id. */
  id: string;
  label: string;
  /** "Order title · billing item label", for pickers. */
  title: string;
  orderId: string;
  orderNumber: string;
  dealId: string | null;
  customerName: string;
  amount: string;
  commitmentDate: string;
};

/** INV-01: a billing item whose trigger is met and that has no live invoice, on an order that is not cancelled. */
function readyItemCondition(organizationId: string, today: string): SQL {
  return sql`${billingItems.organizationId} = ${organizationId}
    and ${billingItems.cancelledAt} is null
    and ${orders.cancelledAt} is null
    and (${billingItems.trigger} = 'ON_ORDER'
      or (${billingItems.trigger} = 'ON_DATE' and ${billingItems.dueOn} <= ${today}::date)
      or (${billingItems.trigger} = 'ON_MILESTONE' and ${billingItems.milestoneDoneAt} is not null))
    and not exists (select 1 from ${invoices} where ${invoices.billingItemId} = ${billingItems.id} and ${invoices.voidedAt} is null)`;
}

export async function listInvoiceableItems(params: { headers: Headers; query?: string }): Promise<InvoiceableItemDto[]> {
  const actor = await requirePermission({ headers: params.headers, permission: { invoice: ["write"] } });
  const query = z.string().trim().max(200).optional().parse(params.query);
  const pattern = query ? `%${escapeLike(query)}%` : undefined;
  const { today } = await organizationClock(actor.organizationId);
  const rows = await db
    .select({ item: billingItems, order: orders, customerName: customers.companyName })
    .from(billingItems)
    .innerJoin(orders, and(eq(orders.id, billingItems.orderId), eq(orders.organizationId, billingItems.organizationId)))
    .innerJoin(customers, and(eq(customers.id, orders.customerId), eq(customers.organizationId, orders.organizationId)))
    .where(and(readyItemCondition(actor.organizationId, today), pattern ? or(ilike(orders.title, pattern), ilike(orders.orderNumber, pattern), ilike(billingItems.label, pattern), ilike(customers.companyName, pattern)) : undefined))
    .orderBy(desc(orders.commitmentDate), asc(orders.id), asc(billingItems.sortOrder), asc(billingItems.id))
    .limit(25);
  return rows.map(({ item, order, customerName }) => ({
    id: item.id,
    label: item.label,
    title: `${order.title} · ${item.label}`,
    orderId: order.id,
    orderNumber: order.orderNumber,
    dealId: order.dealId,
    customerName,
    amount: toMoneyDto(item.amount),
    commitmentDate: order.commitmentDate,
  }));
}

export type InvoiceSourceOptionDto = {
  id: string;
  quotationNumber: string;
  status: string;
  isLatest: boolean;
  total: string;
  issueDate: string;
  editVersion: number;
  /** WA-02-style hint: the newest accepted version is the natural source. */
  recommended: boolean;
};

export type InvoiceDraftContextDto = {
  /** The billing item being invoiced; its amount is the invoice total (INV-03). */
  target: InvoiceableItemDto;
  /** Set when the item already has a live invoice: the wizard opens that one instead. */
  existingInvoice: { id: string; invoiceNumber: string } | null;
  sources: InvoiceSourceOptionDto[];
  defaultTerms: string | null;
  today: string;
};

/**
 * What the wizard needs about a billing item before it asks anything: that it
 * is ready, whether it was already billed, and which quotations of the order's
 * deal could be the source. Finance reaches quotations only through here (§6.2:
 * read access to the source of a won deal's invoice, not general quotation access).
 */
export async function getInvoiceDraftContext(params: { headers: Headers; billingItemId: string }): Promise<InvoiceDraftContextDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { invoice: ["write"] } });
  const id = z.string().uuid().safeParse(params.billingItemId);
  if (!id.success) throw new APIError("NOT_FOUND", { message: "Billing item not found" });
  const { today } = await organizationClock(actor.organizationId);

  const [row] = await db
    .select({ item: billingItems, order: orders, customerName: customers.companyName })
    .from(billingItems)
    .innerJoin(orders, and(eq(orders.id, billingItems.orderId), eq(orders.organizationId, billingItems.organizationId)))
    .innerJoin(customers, and(eq(customers.id, orders.customerId), eq(customers.organizationId, orders.organizationId)))
    .where(and(eq(billingItems.id, id.data), eq(billingItems.organizationId, actor.organizationId)))
    .limit(1);
  if (!row) throw new APIError("NOT_FOUND", { message: "Billing item not found" });
  if (row.order.cancelledAt || row.item.cancelledAt) {
    throw new APIError("BAD_REQUEST", { message: "The order is cancelled" });
  }

  const [existing] = await db
    .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(and(eq(invoices.billingItemId, row.item.id), eq(invoices.organizationId, actor.organizationId), isNull(invoices.voidedAt)))
    .limit(1);
  if (!existing && billingItemStatus({ ...row.item, hasLiveInvoice: false }, today) !== "READY") {
    throw new APIError("BAD_REQUEST", { message: "This billing item is not ready to be invoiced" });
  }

  const quotationRows = row.order.dealId
    ? await db
        .select()
        .from(quotations)
        .where(and(eq(quotations.organizationId, actor.organizationId), eq(quotations.dealId, row.order.dealId), ne(quotations.status, "REJECTED")))
        .orderBy(desc(quotations.createdAt), desc(quotations.id))
    : [];
  const recommended = quotationRows.find((quotation) => quotation.isLatest && quotation.status === "ACCEPTED") ?? quotationRows.find((quotation) => quotation.isLatest && quotation.status === "SENT");

  const settings = await db.query.organizationSettings.findFirst({
    where: eq(organizationSettings.organizationId, actor.organizationId),
    columns: { defaultQuotationTerms: true },
  });

  return {
    target: {
      id: row.item.id,
      label: row.item.label,
      title: `${row.order.title} · ${row.item.label}`,
      orderId: row.order.id,
      orderNumber: row.order.orderNumber,
      dealId: row.order.dealId,
      customerName: row.customerName,
      amount: toMoneyDto(row.item.amount),
      commitmentDate: row.order.commitmentDate,
    },
    existingInvoice: existing ?? null,
    sources: quotationRows.map((quotation) => ({
      id: quotation.id,
      quotationNumber: quotation.quotationNumber,
      status: effectiveQuotationStatus(quotation, today),
      isLatest: quotation.isLatest,
      total: toMoneyDto(quotation.total),
      issueDate: quotation.issueDate,
      editVersion: quotation.editVersion,
      recommended: quotation.id === recommended?.id,
    })),
    defaultTerms: settings?.defaultQuotationTerms ?? null,
    today,
  };
}

export type InvoiceSourceContentDto = {
  quotationId: string;
  editVersion: number;
  items: { description: string; quantity: string; unit: string; unitPrice: string }[];
  discount: string;
  tax: string;
  notes: string | null;
  terms: string | null;
};

/** INV-03: the content to review, with the edit version the later issue call must present. */
export async function getInvoiceSourceContent(params: { headers: Headers; dealId: string; quotationId: string }): Promise<InvoiceSourceContentDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { invoice: ["write"] } });
  const ids = z.object({ dealId: z.string().uuid(), quotationId: z.string().uuid() }).safeParse(params);
  if (!ids.success) throw new APIError("NOT_FOUND", { message: "Quotation not found" });
  const quotation = await db.query.quotations.findFirst({
    where: and(eq(quotations.id, ids.data.quotationId), eq(quotations.organizationId, actor.organizationId), eq(quotations.dealId, ids.data.dealId)),
  });
  if (!quotation) throw new APIError("NOT_FOUND", { message: "Quotation not found" });
  const items = await db.query.quotationItems.findMany({
    where: eq(quotationItems.quotationId, quotation.id),
    orderBy: (item, { asc: ascOp }) => ascOp(item.sortOrder),
  });
  return {
    quotationId: quotation.id,
    editVersion: quotation.editVersion,
    items: items.map((item) => ({ description: item.description, quantity: item.quantity, unit: item.unit, unitPrice: toMoneyDto(item.unitPrice) })),
    discount: toMoneyDto(quotation.discount),
    tax: toMoneyDto(quotation.tax),
    notes: quotation.notes,
    terms: quotation.terms,
  };
}


// ---------------------------------------------------------------------------
// Finance dashboard widgets

export type NearestDueInvoiceDto = Pick<InvoiceRowDto, "id" | "invoiceNumber" | "customerName" | "remainingAmount" | "dueDate" | "status">;

/** The unsettled invoices closest to (or furthest past) their due date. */
export async function listNearestDueInvoices(params: { headers: Headers; limit?: number }): Promise<NearestDueInvoiceDto[]> {
  const actor = await requirePermission({ headers: params.headers, permission: { invoice: ["read"] } });
  const limit = z.number().int().min(1).max(20).default(5).parse(params.limit);
  const { today } = await organizationClock(actor.organizationId);
  const paid = paidSubquery(actor.organizationId);
  const rows = await db
    .select({ invoice: invoices, customerName: customers.companyName, paid: sql<string>`coalesce(${paid.paid}, 0)::text` })
    .from(invoices)
    .innerJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.organizationId, invoices.organizationId)))
    .leftJoin(paid, eq(paid.invoiceId, invoices.id))
    .where(and(eq(invoices.organizationId, actor.organizationId), sql`coalesce(${paid.paid}, 0) < ${invoices.total}`))
    .orderBy(asc(invoices.dueDate), asc(invoices.id))
    .limit(limit);
  return rows.map(({ invoice, customerName, paid: paidText }) => {
    const paidAmount = BigInt(paidText);
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerName,
      remainingAmount: toMoneyDto(invoiceRemainingAmount(invoice.total, paidAmount, invoice.voidedAt !== null)),
      dueDate: invoice.dueDate,
      status: invoiceEffectiveStatus({ total: invoice.total, paidAmount, dueDate: invoice.dueDate, voided: invoice.voidedAt !== null }, today),
    };
  });
}

export type RecentPaymentDto = { id: string; invoiceId: string; invoiceNumber: string; customerName: string; amount: string; paymentDate: string; paymentMethod: string };

export async function listRecentPayments(params: { headers: Headers; limit?: number }): Promise<RecentPaymentDto[]> {
  const actor = await requirePermission({ headers: params.headers, permission: { payment: ["read"] } });
  const limit = z.number().int().min(1).max(20).default(5).parse(params.limit);
  const rows = await db
    .select({ payment: payments, invoiceNumber: invoices.invoiceNumber, customerName: customers.companyName })
    .from(payments)
    .innerJoin(invoices, and(eq(invoices.id, payments.invoiceId), eq(invoices.organizationId, payments.organizationId)))
    .innerJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.organizationId, invoices.organizationId)))
    .where(eq(payments.organizationId, actor.organizationId))
    .orderBy(desc(payments.paymentDate), desc(payments.createdAt), desc(payments.id))
    .limit(limit);
  return rows.map(({ payment, invoiceNumber, customerName }) => ({
    id: payment.id,
    invoiceId: payment.invoiceId,
    invoiceNumber,
    customerName,
    amount: toMoneyDto(payment.amount),
    paymentDate: payment.paymentDate,
    paymentMethod: payment.paymentMethod,
  }));
}

/** Money received in the current calendar month, by payment date (DASH-03's half-open month). */
export async function getReceivedThisMonth(params: { headers: Headers }): Promise<{ total: string; count: number }> {
  const actor = await requirePermission({ headers: params.headers, permission: { payment: ["read"] } });
  const { today } = await organizationClock(actor.organizationId);
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)::text`, count: sql<number>`count(*)`.mapWith(Number) })
    .from(payments)
    .where(and(eq(payments.organizationId, actor.organizationId), sql`${payments.paymentDate} >= ${monthStart}::date`, sql`${payments.paymentDate} < ${nextMonth}::date`));
  return { total: row?.total ?? "0", count: row?.count ?? 0 };
}

/** The deal page's "Buat invoice" button: the first billing item of the deal's orders that is ready to be invoiced. */
export async function findReadyBillingItemOfDeal(params: { headers: Headers; dealId: string }): Promise<string | null> {
  const actor = await requirePermission({ headers: params.headers, permission: { invoice: ["write"] } });
  const dealId = z.string().uuid().safeParse(params.dealId);
  if (!dealId.success) return null;
  const { today } = await organizationClock(actor.organizationId);
  const [row] = await db
    .select({ id: billingItems.id })
    .from(billingItems)
    .innerJoin(orders, and(eq(orders.id, billingItems.orderId), eq(orders.organizationId, billingItems.organizationId)))
    .where(and(readyItemCondition(actor.organizationId, today), eq(orders.dealId, dealId.data)))
    .orderBy(asc(orders.createdAt), asc(billingItems.sortOrder), asc(billingItems.id))
    .limit(1);
  return row?.id ?? null;
}

/** INV-05: everything the invoice PDF needs, from the frozen snapshots (the invoice is immutable once issued). */
export async function getInvoiceForPdf(params: { headers: Headers; invoiceId: string }) {
  const actor = await requirePermission({ headers: params.headers, permission: { invoice: ["read"] } });
  const id = z.string().uuid().safeParse(params.invoiceId);
  if (!id.success) throw new APIError("NOT_FOUND", { message: "Invoice not found" });
  const [row] = await db
    .select({ invoice: invoices, orderNumber: orders.orderNumber })
    .from(invoices)
    .innerJoin(orders, and(eq(orders.id, invoices.orderId), eq(orders.organizationId, invoices.organizationId)))
    .where(and(eq(invoices.id, id.data), eq(invoices.organizationId, actor.organizationId)))
    .limit(1);
  if (!row) throw new APIError("NOT_FOUND", { message: "Invoice not found" });
  const { invoice } = row;
  const items = await db.query.invoiceItems.findMany({
    where: eq(invoiceItems.invoiceId, invoice.id),
    orderBy: (item, { asc: ascOp }) => ascOp(item.sortOrder),
  });
  return {
    invoiceNumber: invoice.invoiceNumber,
    orderNumber: row.orderNumber,
    dueDate: invoice.dueDate,
    voided: invoice.voidedAt !== null,
    issueDate: invoice.issueDate,
    seller: invoice.sellerSnapshot as SellerSnapshot,
    customer: invoice.customerSnapshot as CustomerSnapshot,
    items: items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    })),
    subtotal: invoice.subtotal,
    discount: invoice.discount,
    tax: invoice.tax,
    total: invoice.total,
    notes: invoice.notes,
    terms: invoice.terms,
  };
}
