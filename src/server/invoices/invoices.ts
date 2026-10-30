import { and, eq, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { activities, deals, idempotencyRecords, invoiceItems, invoices, quotations } from "@/server/db/schema";
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

// §10.1 field contract. customer_id is deliberately absent: INV-01 says it
// "wajib sama dengan deal", so it is read from the deal rather than
// accepted and then validated, the same choice createQuotation makes.
//
// `items` is always explicit even when sourcing from a quotation: INV-03
// lets the user review and change the copy before issuing, so what the
// client submits is the reviewed content, not a signal to blind-copy.
const createInvoiceInputSchema = z.object({
  dealId: z.string().uuid(),
  quotationId: z.string().uuid().optional(),
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

async function itemsOf(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db,
  invoiceId: string,
): Promise<InvoiceItemRow[]> {
  // Fetched as its own top-level query rather than a nested `with`: the
  // same Drizzle relational-query bug getQuotation works around, where a
  // nested numeric(12,3) column loses its trailing zeros.
  return tx.query.invoiceItems.findMany({
    where: eq(invoiceItems.invoiceId, invoiceId),
    orderBy: (item, { asc }) => asc(item.sortOrder),
  });
}

/**
 * INV-01 through INV-04.
 *
 * The deal row is locked for the whole transaction, the same way
 * createQuotation locks it: the WON check, the "this deal has no invoice
 * yet" check, and the insert all have to see one consistent picture, and a
 * plain read would let two concurrent creates both pass their checks
 * before either commits. The UNIQUE(organization_id, deal_id) index stays
 * as the database-level backstop behind that lock.
 *
 * A named source quotation is locked by its own id (a single, stable row,
 * so unlike a family-wide scan it cannot miss a concurrently inserted
 * sibling) and, if it is not frozen yet, frozen here: INV-03's "Quotation
 * draft yang dipakai invoice dibekukan sebagai source", which is exactly
 * the condition updateQuotation's frozenAt guard was written against back
 * in M2.
 */
export async function createInvoice(params: { headers: Headers; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { invoice: ["write"] } });
  const parsed = createInvoiceInputSchema.parse(params.input);

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

  const clock = await organizationClock(actor.organizationId);
  const issueDate = parsed.issueDate ?? clock.today;
  // §10.1: "due_date >= issue_date". Both are YYYY-MM-DD, so string
  // comparison is also chronological.
  if (parsed.dueDate < issueDate) {
    throw new APIError("BAD_REQUEST", { message: "dueDate cannot be before issueDate" });
  }
  const year = organizationYear(clock.timezone, clock.now);

  const newInvoiceId = crypto.randomUUID();
  const payloadFingerprint = `${parsed.dealId}|${parsed.quotationId ?? ""}|${issueDate}|${parsed.dueDate}|${totals.total.toString()}`;

  return db.transaction(async (tx) => {
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
        where: and(
          eq(invoices.id, existingRecord!.resultEntityId),
          eq(invoices.organizationId, actor.organizationId),
        ),
      });
      if (!previous) {
        throw new APIError("INTERNAL_SERVER_ERROR", { message: "Idempotency record points at a missing invoice" });
      }
      const paidAmount = await paidAmountFor(tx, {
        organizationId: actor.organizationId,
        invoiceId: previous.id,
      });
      return toInvoiceDto(previous, await itemsOf(tx, previous.id), paidAmount, clock.today);
    }

    const [deal] = await tx
      .select()
      .from(deals)
      .where(and(eq(deals.id, parsed.dealId), eq(deals.organizationId, actor.organizationId)))
      .for("update");
    if (!deal) {
      throw new APIError("NOT_FOUND", { message: "Deal not found" });
    }
    // INV-01: "hanya dapat membuat invoice untuk deal WON".
    if (deal.status !== "WON") {
      throw new APIError("BAD_REQUEST", { message: "An invoice can only be created for a WON deal" });
    }

    // INV-04: one invoice per deal. Checked under the deal lock above, so
    // two concurrent creates cannot both pass; the unique index is the
    // database-level backstop behind this check, not the primary guard.
    const existingInvoice = await tx.query.invoices.findFirst({
      where: and(eq(invoices.dealId, deal.id), eq(invoices.organizationId, actor.organizationId)),
      columns: { id: true, invoiceNumber: true },
    });
    if (existingInvoice) {
      throw new APIError("CONFLICT", {
        message: `This deal already has invoice ${existingInvoice.invoiceNumber}`,
      });
    }

    let snapshots: { seller: SellerSnapshot; customer: CustomerSnapshot };

    if (parsed.quotationId) {
      const [source] = await tx
        .select()
        .from(quotations)
        .where(and(eq(quotations.id, parsed.quotationId), eq(quotations.organizationId, actor.organizationId)))
        .for("update");
      if (!source || source.dealId !== deal.id) {
        // INV-01/INV-02: a source must be a version "dari deal yang sama".
        // Same NOT_FOUND for wrong-deal as for missing, so neither reveals
        // whether the other deal's quotation exists (TENANT-04's reasoning).
        throw new APIError("NOT_FOUND", { message: "Quotation not found" });
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
          dealId: deal.id,
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
      // INV-01: "Deal tanpa quotation harus tetap bisa dibuat invoice
      // dengan input item manual" -- no source to copy, so the snapshot is
      // built from current master data at issue time.
      snapshots = await buildDocumentSnapshots(tx, {
        organizationId: actor.organizationId,
        customerId: deal.customerId,
        dealId: deal.id,
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
        dealId: deal.id,
        customerId: deal.customerId,
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
    // the metadata carries identifiers only, never the amount -- the
    // permissionCategory below is what hides finance events from Sales, and
    // that read-side filter does not exist yet.
    await tx.insert(activities).values({
      organizationId: actor.organizationId,
      dealId: deal.id,
      entityType: "invoice",
      eventType: "created",
      actorId: actor.userId,
      metadata: {
        invoiceId: created.id,
        invoiceNumber: created.invoiceNumber,
        sourceQuotationId: parsed.quotationId ?? null,
      },
      permissionCategory: "finance",
    });

    // A brand-new invoice cannot have payments yet, so this is 0 by
    // construction rather than by query.
    return toInvoiceDto(created, items, 0n, clock.today);
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
