import { and, eq, isNull, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { createHash } from "node:crypto";
import { recordAudit } from "@/server/audit/audit";
import { billingItemStatus } from "@/server/orders/billing";
import { activities, billingItems, deals, idempotencyRecords, invoiceItems, invoices, orders, quotations } from "@/server/db/schema";
import { type CalculationErrorCode, calculateDocumentTotals } from "@/server/money/calculation";
import { formatQuantityScaled } from "@/server/money/quantity";
import { claimNextSequence, formatInvoiceNumber } from "@/server/quotations/document-number";
import { MAX_DOCUMENT_ITEMS, documentItemSchema, optionalMoneyAmountSchema } from "@/server/shared/document-items";
import {
  type CustomerSnapshot,
  type SellerSnapshot,
  buildDocumentSnapshots,
} from "@/server/shared/document-snapshots";
import { organizationClock } from "@/server/shared/organization-clock";
import { organizationYear } from "@/server/shared/organization-date";
import { buildPaginatedDto, resolvePagination } from "@/server/shared/pagination";
import { paidAmountFor, paidAmountsFor } from "./balance";
import { toInvoiceDto } from "./dto";

// API-05: this operation type scopes the idempotency key namespace, the
// same table quotation revisions already use.
const CREATE_INVOICE_OPERATION = "INVOICE_CREATE";

function calculationErrorMessage(code: CalculationErrorCode): string {
  switch (code) {
    case "NO_ITEMS":
      return "An invoice must have at least one item";
    case "AMOUNT_OUT_OF_RANGE":
      return "An amount is outside the allowed range";
    case "DISCOUNT_EXCEEDS_SUBTOTAL":
      return "Discount cannot exceed the subtotal";
    case "TOTAL_NOT_POSITIVE":
      return "Invoice total must be greater than zero";
  }
}

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const notesLikeSchema = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null);

// §10.1 field contract. customer_id is deliberately absent: it is the order's.
// An invoice bills one billing item and its total must equal that item's amount
// (INV-03), so there is no amount to choose; to bill less, split the item first,
// to bill more, amend the order.
//
// `items` is always explicit even when sourcing from a quotation: INV-03
// lets the user review and change the copy before issuing, so what the
// client submits is the reviewed content, not a signal to blind-copy.
export const createInvoiceInputSchema = z.object({
  billingItemId: z.string().uuid(),
  quotationId: z.string().uuid().optional(),
  // A voided invoice of the same billing item that this one replaces (INV-08).
  replacesInvoiceId: z.string().uuid().optional(),
  // INV-03: "memeriksa expected source edit version dari preview". Required
  // whenever a source quotation is named, so a quotation edited between
  // preview and submit produces a conflict instead of silently issuing an
  // invoice from content the user never saw.
  expectedSourceEditVersion: z.number().int().positive().optional(),
  issueDate: isoDateSchema.optional(),
  dueDate: isoDateSchema,
  items: z.array(documentItemSchema).min(1).max(MAX_DOCUMENT_ITEMS),
  discount: optionalMoneyAmountSchema,
  tax: optionalMoneyAmountSchema,
  notes: notesLikeSchema(10_000),
  terms: notesLikeSchema(10_000),
  idempotencyKey: z.string().min(1).max(200),
});

type InvoiceItemRow = typeof invoiceItems.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function itemsOf(tx: Tx | typeof db, invoiceId: string): Promise<InvoiceItemRow[]> {
  // Fetched as its own top-level query rather than a nested `with`: the
  // same Drizzle relational-query bug getQuotation works around, where a
  // nested numeric(12,3) column loses its trailing zeros.
  return tx.query.invoiceItems.findMany({
    where: eq(invoiceItems.invoiceId, invoiceId),
    orderBy: (item, { asc }) => asc(item.sortOrder),
  });
}

/** INV-04: the fingerprint covers the whole normalized payload, so the same key with other content is a conflict. */
function payloadFingerprintOf(parsed: z.output<typeof createInvoiceInputSchema>, issueDate: string) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        parsed.billingItemId,
        parsed.quotationId ?? null,
        parsed.replacesInvoiceId ?? null,
        issueDate,
        parsed.dueDate,
        parsed.items.map((item) => [item.description, item.quantity.toString(), item.unit, item.unitPrice.toString()]),
        parsed.discount?.toString() ?? "0",
        parsed.tax?.toString() ?? "0",
        parsed.notes,
        parsed.terms,
      ]),
    )
    .digest("hex");
}

/**
 * INV-01 through INV-04, inside the caller's transaction. Locks are taken in
 * the fixed order deal, order, billing item, quotation; the billing item must
 * be READY with no live invoice, and the total must equal its amount. A named
 * source quotation is locked by its own id and, if not frozen yet, frozen here
 * (INV-03), which is what updateQuotation's frozenAt guard was written against.
 */
export async function createInvoiceInTx(
  tx: Tx,
  actor: { organizationId: string; userId: string },
  clock: { timezone: string; today: string; now: Date },
  parsed: z.output<typeof createInvoiceInputSchema>,
) {
  if (parsed.quotationId && parsed.expectedSourceEditVersion === undefined) {
    throw new APIError("BAD_REQUEST", {
      message: "expectedSourceEditVersion is required when creating an invoice from a quotation",
    });
  }

  const totalsResult = calculateDocumentTotals({
    items: parsed.items.map((item) => ({ quantityScaled: item.quantity, unitPrice: item.unitPrice })),
    discount: parsed.discount,
    tax: parsed.tax,
  });
  if (!totalsResult.ok) {
    throw new APIError("BAD_REQUEST", { message: calculationErrorMessage(totalsResult.code) });
  }
  const totals = totalsResult.totals;

  const issueDate = parsed.issueDate ?? clock.today;
  // §10.1: "due_date >= issue_date". Both are YYYY-MM-DD, so string
  // comparison is also chronological.
  if (parsed.dueDate < issueDate) {
    throw new APIError("BAD_REQUEST", { message: "dueDate cannot be before issueDate" });
  }
  const year = organizationYear(clock.timezone, clock.now);

  const newInvoiceId = crypto.randomUUID();
  const payloadFingerprint = payloadFingerprintOf(parsed, issueDate);

  // API-05: claim first, so a retry never re-runs the business rules
  // below and never produces a second invoice.
  const [claimed] = await tx
    .insert(idempotencyRecords)
    .values({
      organizationId: actor.organizationId,
      operationType: CREATE_INVOICE_OPERATION,
      idempotencyKey: parsed.idempotencyKey,
      payloadFingerprint,
      resultEntityId: newInvoiceId,
    })
    .onConflictDoNothing({
      target: [idempotencyRecords.organizationId, idempotencyRecords.operationType, idempotencyRecords.idempotencyKey],
    })
    .returning();

  if (!claimed) {
    const existingRecord = await tx.query.idempotencyRecords.findFirst({
      where: and(
        eq(idempotencyRecords.organizationId, actor.organizationId),
        eq(idempotencyRecords.operationType, CREATE_INVOICE_OPERATION),
        eq(idempotencyRecords.idempotencyKey, parsed.idempotencyKey),
      ),
    });
    if (existingRecord!.payloadFingerprint !== payloadFingerprint) {
      throw new APIError("CONFLICT", { message: "Idempotency key was already used with a different request" });
    }
    const previous = await tx.query.invoices.findFirst({
      where: and(eq(invoices.id, existingRecord!.resultEntityId), eq(invoices.organizationId, actor.organizationId)),
    });
    if (!previous) {
      throw new APIError("INTERNAL_SERVER_ERROR", { message: "Idempotency record points at a missing invoice" });
    }
    const paidAmount = await paidAmountFor(tx, { organizationId: actor.organizationId, invoiceId: previous.id });
    return toInvoiceDto(previous, await itemsOf(tx, previous.id), paidAmount, clock.today);
  }

  // Find the order first (a plain read) to know which deal to lock, then lock in order.
  const [lookup] = await tx
    .select({ orderId: billingItems.orderId, dealId: orders.dealId })
    .from(billingItems)
    .innerJoin(orders, and(eq(orders.id, billingItems.orderId), eq(orders.organizationId, billingItems.organizationId)))
    .where(and(eq(billingItems.id, parsed.billingItemId), eq(billingItems.organizationId, actor.organizationId)));
  if (!lookup) {
    throw new APIError("NOT_FOUND", { message: "Billing item not found" });
  }
  if (lookup.dealId) {
    await tx.select({ id: deals.id }).from(deals).where(and(eq(deals.id, lookup.dealId), eq(deals.organizationId, actor.organizationId))).for("update");
  }
  const [order] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.id, lookup.orderId), eq(orders.organizationId, actor.organizationId)))
    .for("update");
  const [item] = await tx
    .select()
    .from(billingItems)
    .where(and(eq(billingItems.id, parsed.billingItemId), eq(billingItems.organizationId, actor.organizationId)))
    .for("update");
  if (!order || !item) {
    throw new APIError("NOT_FOUND", { message: "Billing item not found" });
  }
  if (order.cancelledAt) {
    throw new APIError("BAD_REQUEST", { message: "The order is cancelled" });
  }

  // INV-04: one live invoice per item. Checked under the item lock, so two
  // concurrent creates cannot both pass; the partial unique index is the
  // database-level backstop behind this check, not the primary guard.
  const existingInvoice = await tx.query.invoices.findFirst({
    where: and(eq(invoices.billingItemId, item.id), eq(invoices.organizationId, actor.organizationId), isNull(invoices.voidedAt)),
    columns: { id: true, invoiceNumber: true },
  });
  if (existingInvoice) {
    throw new APIError("CONFLICT", { message: `This billing item already has invoice ${existingInvoice.invoiceNumber}` });
  }
  // INV-01: only a READY billing item can be invoiced.
  if (billingItemStatus({ ...item, hasLiveInvoice: false }, clock.today) !== "READY") {
    throw new APIError("BAD_REQUEST", { message: "This billing item is not ready to be invoiced" });
  }
  // INV-03: the invoice is exactly the billing item.
  if (totals.total !== item.amount) {
    throw new APIError("BAD_REQUEST", { message: `Invoice total must equal the billing item amount of ${item.amount.toString()}` });
  }

  if (parsed.replacesInvoiceId) {
    const replaced = await tx.query.invoices.findFirst({
      where: and(eq(invoices.id, parsed.replacesInvoiceId), eq(invoices.organizationId, actor.organizationId)),
      columns: { billingItemId: true, voidedAt: true },
    });
    if (!replaced || replaced.billingItemId !== item.id) {
      throw new APIError("NOT_FOUND", { message: "Invoice to replace not found" });
    }
    if (!replaced.voidedAt) {
      throw new APIError("BAD_REQUEST", { message: "Only a voided invoice can be replaced" });
    }
  }

  let snapshots: { seller: SellerSnapshot; customer: CustomerSnapshot };

  if (parsed.quotationId) {
    const [source] = await tx
      .select()
      .from(quotations)
      .where(and(eq(quotations.id, parsed.quotationId), eq(quotations.organizationId, actor.organizationId)))
      .for("update");
    if (!source || !order.dealId || source.dealId !== order.dealId) {
      // INV-01/INV-02: a source must be a version "dari deal yang sama".
      // Same NOT_FOUND for wrong-deal as for missing, so neither reveals
      // whether the other deal's quotation exists (TENANT-04's reasoning).
      throw new APIError("NOT_FOUND", { message: "Quotation not found" });
    }
    if (source.status === "REJECTED") {
      throw new APIError("BAD_REQUEST", { message: "A rejected quotation cannot be the source of an invoice" });
    }
    if (source.editVersion !== parsed.expectedSourceEditVersion) {
      throw new APIError("CONFLICT", {
        message: "This quotation changed since it was previewed, review it again",
      });
    }

    if (source.frozenAt === null) {
      // INV-03: freeze the draft being used as a source, and bump its
      // edit version in the same transaction so a concurrent
      // updateQuotation holding the old version loses its guarded UPDATE.
      const built = await buildDocumentSnapshots(tx, {
        organizationId: actor.organizationId,
        customerId: source.customerId,
        dealId: order.dealId,
      });
      await tx
        .update(quotations)
        .set({
          frozenAt: sql`now()`,
          sellerSnapshot: built.seller,
          customerSnapshot: built.customer,
          editVersion: sql`${quotations.editVersion} + 1`,
        })
        .where(eq(quotations.id, source.id));
      snapshots = built;
    } else {
      // INV-03: "Snapshot yang sudah frozen tidak dibekukan ulang dari
      // master data terbaru." Copy what the customer actually saw.
      snapshots = {
        seller: source.sellerSnapshot as SellerSnapshot,
        customer: source.customerSnapshot as CustomerSnapshot,
      };
    }
  } else {
    // INV-01: an order without a quotation is billed with manual items, so
    // the snapshot is built from current master data at issue time.
    snapshots = await buildDocumentSnapshots(tx, {
      organizationId: actor.organizationId,
      customerId: order.customerId,
      dealId: order.dealId,
    });
  }

  const sequence = await claimNextSequence(tx, {
    organizationId: actor.organizationId,
    documentType: "INVOICE",
    year,
  });

  const [created] = await tx
    .insert(invoices)
    .values({
      id: newInvoiceId,
      organizationId: actor.organizationId,
      dealId: order.dealId,
      orderId: order.id,
      billingItemId: item.id,
      replacesInvoiceId: parsed.replacesInvoiceId ?? null,
      customerId: order.customerId,
      invoiceNumber: formatInvoiceNumber(year, sequence),
      quotationId: parsed.quotationId ?? null,
      issueDate,
      dueDate: parsed.dueDate,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      calculationVersion: totals.calculationVersion,
      notes: parsed.notes,
      terms: parsed.terms,
      sellerSnapshot: snapshots.seller,
      customerSnapshot: snapshots.customer,
      createdById: actor.userId,
    })
    .returning();

  const items = await tx
    .insert(invoiceItems)
    .values(
      parsed.items.map((item, index) => ({
        organizationId: actor.organizationId,
        invoiceId: created.id,
        description: item.description,
        quantity: formatQuantityScaled(item.quantity),
        unit: item.unit,
        unitPrice: item.unitPrice,
        subtotal: totals.itemSubtotals[index],
        sortOrder: index,
      })),
    )
    .returning();

  // AUD-01: "invoice created" is a required minimum timeline event.
  // AUD-04 forbids leaking invoice totals through an activity payload, so
  // the metadata carries identifiers only, never the amount.
  await tx.insert(activities).values({
    organizationId: actor.organizationId,
    dealId: order.dealId,
    orderId: order.id,
    entityType: "invoice",
    eventType: "created",
    actorId: actor.userId,
    metadata: {
      invoiceId: created.id,
      invoiceNumber: created.invoiceNumber,
      orderNumber: order.orderNumber,
      billingItemId: item.id,
      sourceQuotationId: parsed.quotationId ?? null,
      ...(parsed.replacesInvoiceId ? { replacesInvoiceId: parsed.replacesInvoiceId } : {}),
    },
    permissionCategory: "finance",
  });

  // A brand-new invoice cannot have payments yet, so this is 0 by
  // construction rather than by query.
  return toInvoiceDto(created, items, 0n, clock.today);
}

export async function createInvoice(params: { headers: Headers; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { invoice: ["write"] } });
  const parsed = createInvoiceInputSchema.parse(params.input);
  const clock = await organizationClock(actor.organizationId);
  return db.transaction((tx) => createInvoiceInTx(tx, actor, clock, parsed));
}

/**
 * INV-08: void, not delete. Needs a reason and no live settlement (reverse the
 * payments first); keeps the invoice, its number and its content; frees the
 * billing item (READY again) so a replacement can be issued. Voiding twice is a
 * no-op. Locks follow the fixed order: deal, order, billing item, invoice.
 */
export async function voidInvoice(params: { headers: Headers; invoiceId: string; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { invoice: ["write"] } });
  const input = z.object({ reason: z.string().trim().min(1).max(1000) }).parse(params.input);
  const clock = await organizationClock(actor.organizationId);

  return db.transaction(async (tx) => {
    const plain = await tx.query.invoices.findFirst({
      where: and(eq(invoices.id, params.invoiceId), eq(invoices.organizationId, actor.organizationId)),
    });
    if (!plain) throw new APIError("NOT_FOUND", { message: "Invoice not found" });
    if (plain.dealId) {
      await tx.select({ id: deals.id }).from(deals).where(and(eq(deals.id, plain.dealId), eq(deals.organizationId, actor.organizationId))).for("update");
    }
    await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.id, plain.orderId), eq(orders.organizationId, actor.organizationId))).for("update");
    await tx.select({ id: billingItems.id }).from(billingItems).where(and(eq(billingItems.id, plain.billingItemId), eq(billingItems.organizationId, actor.organizationId))).for("update");
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, plain.id), eq(invoices.organizationId, actor.organizationId)))
      .for("update");

    if (invoice.voidedAt) {
      return toInvoiceDto(invoice, await itemsOf(tx, invoice.id), await paidAmountFor(tx, { organizationId: actor.organizationId, invoiceId: invoice.id }), clock.today);
    }
    const settled = await paidAmountFor(tx, { organizationId: actor.organizationId, invoiceId: invoice.id });
    if (settled > 0n) {
      throw new APIError("BAD_REQUEST", { message: "An invoice with payments cannot be voided, reverse them first" });
    }

    const [voided] = await tx
      .update(invoices)
      .set({ voidedAt: clock.now, voidedById: actor.userId, voidReason: input.reason })
      .where(eq(invoices.id, invoice.id))
      .returning();
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "invoice.voided",
      targetType: "invoice",
      targetId: invoice.id,
      metadata: { invoiceNumber: invoice.invoiceNumber, reason: input.reason },
    });
    await tx.insert(activities).values({
      organizationId: actor.organizationId,
      dealId: invoice.dealId,
      orderId: invoice.orderId,
      entityType: "invoice",
      eventType: "voided",
      actorId: actor.userId,
      metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, reason: input.reason },
      permissionCategory: "finance",
    });
    return toInvoiceDto(voided, await itemsOf(tx, voided.id), 0n, clock.today);
  });
}

/**
 * TENANT-04: a missing invoice and one belonging to another organization
 * produce the identical NOT_FOUND.
 */
export async function getInvoice(params: { headers: Headers; invoiceId: string }) {
  const actor = await requirePermission({ headers: params.headers, permission: { invoice: ["read"] } });
  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, params.invoiceId), eq(invoices.organizationId, actor.organizationId)),
  });
  if (!invoice) {
    throw new APIError("NOT_FOUND", { message: "Invoice not found" });
  }
  const clock = await organizationClock(actor.organizationId);
  const paidAmount = await paidAmountFor(db, {
    organizationId: actor.organizationId,
    invoiceId: invoice.id,
  });
  return toInvoiceDto(invoice, await itemsOf(db, invoice.id), paidAmount, clock.today);
}

export async function listInvoices(params: {
  headers: Headers;
  dealId?: string;
  customerId?: string;
  page?: number;
  pageSize?: number;
}) {
  const actor = await requirePermission({ headers: params.headers, permission: { invoice: ["read"] } });
  const where = and(
    eq(invoices.organizationId, actor.organizationId),
    params.dealId ? eq(invoices.dealId, params.dealId) : undefined,
    params.customerId ? eq(invoices.customerId, params.customerId) : undefined,
  );
  const { page, pageSize, limit, offset } = resolvePagination(params);

  const [rows, [{ count }]] = await Promise.all([
    db.query.invoices.findMany({
      where,
      // SEARCH-02: stable sort -- id as a tie-breaker.
      orderBy: (invoice, { desc }) => [desc(invoice.createdAt), desc(invoice.id)],
      limit,
      offset,
    }),
    db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(invoices).where(where),
  ]);
  const clock = await organizationClock(actor.organizationId);
  // One grouped query for every invoice in the page, rather than a sum per
  // row on top of the per-row item fetch.
  const paidAmounts = await paidAmountsFor(db, {
    organizationId: actor.organizationId,
    invoiceIds: rows.map((row) => row.id),
  });

  const items = await Promise.all(
    rows.map(async (row) =>
      toInvoiceDto(row, await itemsOf(db, row.id), paidAmounts.get(row.id) ?? 0n, clock.today),
    ),
  );
  return buildPaginatedDto(items, page, pageSize, count);
}
