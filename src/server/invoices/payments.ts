import { and, eq, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { activities, idempotencyRecords, invoices, payments } from "@/server/db/schema";
import { moneyAmountSchema } from "@/server/money/amount";
import { organizationClock } from "@/server/shared/organization-clock";
import { buildPaginatedDto, resolvePagination } from "@/server/shared/pagination";
import { paidAmountFor } from "./balance";
import { toPaymentDto, toPaymentResultDto } from "./dto";
import { invoiceRemainingAmount } from "./effective-status";

// API-05/PAY-04: this operation type scopes the idempotency key namespace,
// sharing the same table as quotation revisions and invoice creation.
const RECORD_PAYMENT_OPERATION = "PAYMENT_RECORD";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

// PAY-01 field contract. PAY-02 requires a strictly positive amount, which
// moneyAmountSchema alone does not give (it allows zero), hence the refine.
const recordPaymentInputSchema = z.object({
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

/**
 * PAY-01 through PAY-05, in the exact transaction order PAY-03 spells out:
 * validate access, lock the invoice row, check replay, compute the latest
 * balance and validate the new amount, insert, record activity, commit.
 *
 * The replay check sits deliberately BEFORE the PAID/outstanding checks.
 * PAY-03: "Replay valid mengembalikan hasil awal sebelum pemeriksaan
 * invoice PAID/outstanding; retry pelunasan tidak boleh gagal hanya karena
 * invoice sekarang sudah PAID." A retry of the payment that settled the
 * invoice would otherwise be rejected by the very state it created.
 *
 * The row lock is what makes the balance check safe against two Finance
 * users submitting at the same time: the second transaction blocks until
 * the first commits, then re-sums the payments and sees the real remaining
 * amount rather than the one it read before the race.
 */
export async function recordPayment(params: { headers: Headers; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { payment: ["write"] } });
  const parsed = recordPaymentInputSchema.parse(params.input);
  const clock = await organizationClock(actor.organizationId);

  const newPaymentId = crypto.randomUUID();
  const payloadFingerprint = [
    parsed.invoiceId,
    parsed.amount.toString(),
    parsed.paymentDate,
    parsed.paymentMethod,
    parsed.reference ?? "",
    parsed.note ?? "",
  ].join("|");

  return db.transaction(async (tx) => {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, parsed.invoiceId), eq(invoices.organizationId, actor.organizationId)))
      .for("update");
    if (!invoice) {
      throw new APIError("NOT_FOUND", { message: "Invoice not found" });
    }

    const [claimed] = await tx
      .insert(idempotencyRecords)
      .values({
        organizationId: actor.organizationId,
        operationType: RECORD_PAYMENT_OPERATION,
        idempotencyKey: parsed.idempotencyKey,
        payloadFingerprint,
        resultEntityId: newPaymentId,
      })
      .onConflictDoNothing({
        target: [idempotencyRecords.organizationId, idempotencyRecords.operationType, idempotencyRecords.idempotencyKey],
      })
      .returning();

    if (!claimed) {
      const existingRecord = await tx.query.idempotencyRecords.findFirst({
        where: and(
          eq(idempotencyRecords.organizationId, actor.organizationId),
          eq(idempotencyRecords.operationType, RECORD_PAYMENT_OPERATION),
          eq(idempotencyRecords.idempotencyKey, parsed.idempotencyKey),
        ),
      });
      // PAY-04: same key with a different payload is a client bug, not a
      // retry.
      if (existingRecord!.payloadFingerprint !== payloadFingerprint) {
        throw new APIError("CONFLICT", { message: "Idempotency key was already used with a different request" });
      }
      const previous = await tx.query.payments.findFirst({
        where: and(
          eq(payments.id, existingRecord!.resultEntityId),
          eq(payments.organizationId, actor.organizationId),
        ),
      });
      if (!previous) {
        throw new APIError("INTERNAL_SERVER_ERROR", { message: "Idempotency record points at a missing payment" });
      }
      const paidAmount = await paidAmountFor(tx, {
        organizationId: actor.organizationId,
        invoiceId: invoice.id,
      });
      return toPaymentResultDto(previous, invoice, paidAmount, clock.today);
    }

    const paidBefore = await paidAmountFor(tx, {
      organizationId: actor.organizationId,
      invoiceId: invoice.id,
    });
    const remainingBefore = invoiceRemainingAmount(invoice.total, paidBefore);

    // PAY-02: payments on a voided invoice are refused.
    if (invoice.voidedAt) {
      throw new APIError("CONFLICT", { message: "This invoice is void" });
    }
    // PAY-02: "Pembayaran pada invoice PAID ditolak."
    if (remainingBefore === 0n) {
      throw new APIError("CONFLICT", { message: "This invoice is already fully paid" });
    }
    // PAY-02 / §3: "Pembayaran baru melebihi outstanding ditolak."
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

    const [created] = await tx
      .insert(payments)
      .values({
        id: newPaymentId,
        organizationId: actor.organizationId,
        invoiceId: invoice.id,
        amount: parsed.amount,
        paymentDate: parsed.paymentDate,
        paymentMethod: parsed.paymentMethod,
        reference: parsed.reference,
        note: parsed.note,
        createdById: actor.userId,
      })
      .returning();

    // AUD-01: "payment recorded" is a required minimum timeline event.
    // AUD-04 forbids leaking payment detail through an activity payload, so
    // the metadata carries identifiers only, never the amount or the
    // resulting balance.
    await tx.insert(activities).values({
      organizationId: actor.organizationId,
      dealId: invoice.dealId,
      entityType: "payment",
      eventType: "recorded",
      actorId: actor.userId,
      metadata: {
        paymentId: created.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paymentMethod: created.paymentMethod,
      },
      permissionCategory: "finance",
    });

    return toPaymentResultDto(created, invoice, paidBefore + parsed.amount, clock.today);
  });
}

/** TENANT-04: identical NOT_FOUND for a missing and a cross-tenant invoice. */
export async function listPayments(params: { headers: Headers; invoiceId: string; page?: number; pageSize?: number }) {
  const actor = await requirePermission({ headers: params.headers, permission: { payment: ["read"] } });
  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, params.invoiceId), eq(invoices.organizationId, actor.organizationId)),
    columns: { id: true },
  });
  if (!invoice) {
    throw new APIError("NOT_FOUND", { message: "Invoice not found" });
  }
  const where = and(eq(payments.invoiceId, invoice.id), eq(payments.organizationId, actor.organizationId));
  const { page, pageSize, limit, offset } = resolvePagination(params);

  const [rows, [{ count }]] = await Promise.all([
    db.query.payments.findMany({
      where,
      // SEARCH-02: stable sort -- id as a final tie-breaker.
      orderBy: (payment, { asc }) => [asc(payment.paymentDate), asc(payment.createdAt), asc(payment.id)],
      limit,
      offset,
    }),
    db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(payments).where(where),
  ]);
  return buildPaginatedDto(rows.map(toPaymentDto), page, pageSize, count);
}
