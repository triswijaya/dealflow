import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { activities, invoices, receipts, settlements } from "@/server/db/schema";
import { moneyAmountSchema } from "@/server/money/amount";
import { claimIdempotencyKey } from "@/server/shared/idempotency";
import { organizationClock } from "@/server/shared/organization-clock";
import { buildPaginatedDto, resolvePagination } from "@/server/shared/pagination";
import { paidAmountFor } from "./balance";
import { toPaymentDto, toPaymentResultDto, type PaymentRow } from "./dto";
import { invoiceRemainingAmount } from "./effective-status";

// API-05/PAY-04: this operation type scopes the idempotency key namespace,
// sharing the same table as quotation revisions and invoice creation.
const RECORD_PAYMENT_OPERATION = "PAYMENT_RECORD";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

// PAY-01 field contract. PAY-02 requires a strictly positive amount, which
// moneyAmountSchema alone does not give (it allows zero), hence the refine.
export const recordPaymentInputSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: moneyAmountSchema.refine((value) => value > 0n, { message: "Payment amount must be greater than zero" }),
  paymentDate: isoDateSchema,
  paymentMethod: z.enum(["BANK_TRANSFER", "CASH", "OTHER"]),
  reference: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null),
  note: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null),
  idempotencyKey: z.string().min(1).max(200),
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The receipt-and-settlement of one payment, flattened for the screens. */
async function paymentRowOf(tx: Tx | typeof db, organizationId: string, receiptId: string, invoiceId: string): Promise<PaymentRow | null> {
  const [row] = await tx
    .select({ receipt: receipts, settlement: settlements })
    .from(receipts)
    .innerJoin(settlements, and(eq(settlements.receiptId, receipts.id), eq(settlements.organizationId, receipts.organizationId), eq(settlements.invoiceId, invoiceId)))
    .where(and(eq(receipts.id, receiptId), eq(receipts.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.receipt.id,
    organizationId,
    invoiceId,
    amount: row.settlement.amount,
    paymentDate: row.settlement.settledOn,
    paymentMethod: row.receipt.method,
    reference: row.receipt.reference,
    note: row.receipt.note,
    createdAt: row.receipt.createdAt,
    createdById: row.receipt.createdById,
  };
}

/**
 * PAY-01 through PAY-05, in the exact transaction order PAY-03 spells out:
 * validate access, lock the invoice row, check replay, compute the latest
 * balance and validate the new amount, insert, record activity, commit.
 *
 * This is the one-step path: it creates the receipt and its settlement on the
 * invoice together (ADR-0003), so the common case stays a single form. Money
 * that does not fit one invoice goes through recordReceipt and allocateReceipt.
 *
 * The replay check sits deliberately BEFORE the PAID/outstanding checks.
 * PAY-03: "Replay valid mengembalikan hasil awal sebelum pemeriksaan
 * invoice PAID/outstanding; retry pelunasan tidak boleh gagal hanya karena
 * invoice sekarang sudah PAID." A retry of the payment that settled the
 * invoice would otherwise be rejected by the very state it created.
 *
 * The row lock is what makes the balance check safe against two Finance
 * users submitting at the same time: the second transaction blocks until
 * the first commits, then re-sums the settlements and sees the real remaining
 * amount rather than the one it read before the race.
 */
export async function recordPayment(params: { headers: Headers; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { payment: ["write"] } });
  const parsed = recordPaymentInputSchema.parse(params.input);
  const clock = await organizationClock(actor.organizationId);
  return db.transaction((tx) => recordPaymentInTx(tx, actor, clock, parsed));
}

export async function recordPaymentInTx(
  tx: Tx,
  actor: { organizationId: string; userId: string },
  clock: { today: string },
  parsed: z.output<typeof recordPaymentInputSchema>,
) {
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, parsed.invoiceId), eq(invoices.organizationId, actor.organizationId)))
    .for("update");
  if (!invoice) {
    throw new APIError("NOT_FOUND", { message: "Invoice not found" });
  }

  const receiptId = crypto.randomUUID();
  const claim = await claimIdempotencyKey(tx, {
    organizationId: actor.organizationId,
    operation: RECORD_PAYMENT_OPERATION,
    key: parsed.idempotencyKey,
    fingerprint: createHash("sha256")
      .update(JSON.stringify([parsed.invoiceId, parsed.amount.toString(), parsed.paymentDate, parsed.paymentMethod, parsed.reference, parsed.note]))
      .digest("hex"),
    resultEntityId: receiptId,
  });
  if (claim.replay) {
    const previous = await paymentRowOf(tx, actor.organizationId, claim.replay.resultEntityId, invoice.id);
    if (!previous) {
      throw new APIError("INTERNAL_SERVER_ERROR", { message: "Idempotency record points at a missing payment" });
    }
    const paidAmount = await paidAmountFor(tx, { organizationId: actor.organizationId, invoiceId: invoice.id });
    return toPaymentResultDto(previous, invoice, paidAmount, clock.today);
  }

  const paidBefore = await paidAmountFor(tx, { organizationId: actor.organizationId, invoiceId: invoice.id });
  const remainingBefore = invoiceRemainingAmount(invoice.total, paidBefore);

  // PAY-02: payments on a voided invoice are refused.
  if (invoice.voidedAt) {
    throw new APIError("CONFLICT", { message: "This invoice is void" });
  }
  // PAY-02: "Pembayaran pada invoice PAID ditolak."
  if (remainingBefore === 0n) {
    throw new APIError("CONFLICT", { message: "This invoice is already fully paid" });
  }
  // PAY-01: on this path the amount stays within the invoice's remainder; an
  // overpayment is a receipt first, then an allocation.
  if (parsed.amount > remainingBefore) {
    throw new APIError("BAD_REQUEST", {
      message: `Payment exceeds the remaining balance of ${remainingBefore.toString()}`,
    });
  }
  // PAY-02: a business date between the invoice's issue date and today in
  // the organization's timezone. Backdating within that window is valid;
  // createdAt below still records when it was actually entered.
  if (parsed.paymentDate < invoice.issueDate) {
    throw new APIError("BAD_REQUEST", { message: "Payment date cannot be before the invoice issue date" });
  }
  if (parsed.paymentDate > clock.today) {
    throw new APIError("BAD_REQUEST", { message: "Payment date cannot be in the future" });
  }

  await tx.insert(receipts).values({
    id: receiptId,
    organizationId: actor.organizationId,
    customerId: invoice.customerId,
    amount: parsed.amount,
    receivedOn: parsed.paymentDate,
    method: parsed.paymentMethod,
    reference: parsed.reference,
    note: parsed.note,
    createdById: actor.userId,
  });
  await tx.insert(settlements).values({
    organizationId: actor.organizationId,
    invoiceId: invoice.id,
    kind: "RECEIPT",
    receiptId,
    amount: parsed.amount,
    settledOn: parsed.paymentDate,
    createdById: actor.userId,
  });

  // AUD-01: "payment recorded" is a required minimum timeline event.
  // AUD-04 forbids leaking payment detail through an activity payload, so
  // the metadata carries identifiers only, never the amount or the
  // resulting balance.
  await tx.insert(activities).values({
    organizationId: actor.organizationId,
    dealId: invoice.dealId,
    orderId: invoice.orderId,
    entityType: "payment",
    eventType: "recorded",
    actorId: actor.userId,
    metadata: {
      paymentId: receiptId,
      receiptId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      paymentMethod: parsed.paymentMethod,
    },
    permissionCategory: "finance",
  });

  const created = (await paymentRowOf(tx, actor.organizationId, receiptId, invoice.id))!;
  return toPaymentResultDto(created, invoice, paidBefore + parsed.amount, clock.today);
}

/** TENANT-04: identical NOT_FOUND for a missing and a cross-tenant invoice. The active receipts that settle it, oldest first. */
export async function listPayments(params: { headers: Headers; invoiceId: string; page?: number; pageSize?: number }) {
  const actor = await requirePermission({ headers: params.headers, permission: { payment: ["read"] } });
  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, params.invoiceId), eq(invoices.organizationId, actor.organizationId)),
    columns: { id: true },
  });
  if (!invoice) {
    throw new APIError("NOT_FOUND", { message: "Invoice not found" });
  }
  const where = and(
    eq(settlements.invoiceId, invoice.id),
    eq(settlements.organizationId, actor.organizationId),
    eq(settlements.kind, "RECEIPT"),
    isNull(settlements.reversedAt),
  );
  const { page, pageSize, limit, offset } = resolvePagination(params);

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({ settlement: settlements, receipt: receipts })
      .from(settlements)
      .innerJoin(receipts, and(eq(receipts.id, settlements.receiptId), eq(receipts.organizationId, settlements.organizationId)))
      .where(where)
      // SEARCH-02: stable sort -- id as a final tie-breaker.
      .orderBy(settlements.settledOn, receipts.createdAt, receipts.id)
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(settlements).where(where),
  ]);
  return buildPaginatedDto(
    rows.map(({ settlement, receipt }) =>
      toPaymentDto({
        id: receipt.id,
        organizationId: actor.organizationId,
        invoiceId: invoice.id,
        amount: settlement.amount,
        paymentDate: settlement.settledOn,
        paymentMethod: receipt.method,
        reference: receipt.reference,
        note: receipt.note,
        createdAt: receipt.createdAt,
        createdById: receipt.createdById,
      }),
    ),
    page,
    pageSize,
    count,
  );
}
