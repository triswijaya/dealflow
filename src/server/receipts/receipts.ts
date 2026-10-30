import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { recordAudit } from "@/server/audit/audit";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { activities, customers, invoices, organizationSettings, receipts, refunds, settlements } from "@/server/db/schema";
import { paidAmountsFor } from "@/server/invoices/balance";
import { moneyAmountSchema } from "@/server/money/amount";
import { toMoneyDto } from "@/server/shared/dto";
import { claimIdempotencyKey } from "@/server/shared/idempotency";
import { organizationClock } from "@/server/shared/organization-clock";
import { buildPaginatedDto, resolvePagination } from "@/server/shared/pagination";
import { toReceiptDto, type ReceiptDto } from "./dto";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;
type ReceiptRow = typeof receipts.$inferSelect;
type Actor = { organizationId: string; userId: string; role: string };

// PAY-04: each money operation has its own idempotency namespace per tenant.
const OPERATIONS = {
  receipt: "RECEIPT_RECORD",
  allocate: "RECEIPT_ALLOCATE",
  settle: "SETTLEMENT_RECORD",
  refund: "REFUND_RECORD",
} as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const positiveMoney = moneyAmountSchema.refine((value) => value > 0n, { message: "Amount must be greater than zero" });
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null);
const requiredText = (max: number, message: string) => z.string().trim().min(1, message).max(max);
const idempotencyKey = z.string().min(1).max(200);

const fingerprintOf = (...parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");

// ---------------------------------------------------------------------------
// Reading

/** RCP-05 / SET-02: what is allocated and refunded, per receipt, and the customer's name. */
async function loadReceipts(executor: Executor, organizationId: string, rows: ReceiptRow[]): Promise<ReceiptDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [allocated, refunded, names] = await Promise.all([
    executor
      .select({ receiptId: settlements.receiptId, total: sql<string>`sum(${settlements.amount})` })
      .from(settlements)
      .where(and(eq(settlements.organizationId, organizationId), inArray(settlements.receiptId, ids), isNull(settlements.reversedAt)))
      .groupBy(settlements.receiptId),
    executor
      .select({ receiptId: refunds.receiptId, total: sql<string>`sum(${refunds.amount})` })
      .from(refunds)
      .where(and(eq(refunds.organizationId, organizationId), inArray(refunds.receiptId, ids)))
      .groupBy(refunds.receiptId),
    executor
      .select({ id: customers.id, name: customers.companyName })
      .from(customers)
      .where(and(eq(customers.organizationId, organizationId), inArray(customers.id, rows.flatMap((row) => (row.customerId ? [row.customerId] : []))))),
  ]);
  const allocatedBy = new Map(allocated.map((row) => [row.receiptId!, BigInt(row.total)]));
  const refundedBy = new Map(refunded.map((row) => [row.receiptId, BigInt(row.total)]));
  const nameBy = new Map(names.map((row) => [row.id, row.name]));
  return rows.map((row) =>
    toReceiptDto(row, {
      customerName: row.customerId ? (nameBy.get(row.customerId) ?? null) : null,
      allocated: allocatedBy.get(row.id) ?? 0n,
      refunded: refundedBy.get(row.id) ?? 0n,
    }),
  );
}

async function loadReceipt(executor: Executor, organizationId: string, receiptId: string): Promise<ReceiptDto> {
  const [row] = await executor.select().from(receipts).where(and(eq(receipts.id, receiptId), eq(receipts.organizationId, organizationId)));
  if (!row) throw new APIError("NOT_FOUND", { message: "Receipt not found" });
  return (await loadReceipts(executor, organizationId, [row]))[0]!;
}

/** TENANT-04: a missing receipt and one of another organization are the same NOT_FOUND. */
export async function getReceipt(params: { headers: Headers; receiptId: string }): Promise<ReceiptDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { payment: ["read"] } });
  const id = z.string().uuid().safeParse(params.receiptId);
  if (!id.success) throw new APIError("NOT_FOUND", { message: "Receipt not found" });
  return loadReceipt(db, actor.organizationId, id.data);
}

/**
 * Receipts, newest first. `open` keeps those with something left to allocate
 * (the "uang belum dialokasikan" queue, TASK-01), including unidentified ones.
 */
export async function listReceipts(params: { headers: Headers; customerId?: string; open?: boolean; page?: number; pageSize?: number }) {
  const actor = await requirePermission({ headers: params.headers, permission: { payment: ["read"] } });
  const { page, pageSize, limit, offset } = resolvePagination(params);
  const left = sql`${receipts.amount}
    - coalesce((select sum(s.amount) from ${settlements} s where s.receipt_id = ${receipts.id} and s.reversed_at is null), 0)
    - coalesce((select sum(r.amount) from ${refunds} r where r.receipt_id = ${receipts.id}), 0)`;
  const where = and(
    eq(receipts.organizationId, actor.organizationId),
    params.customerId ? eq(receipts.customerId, params.customerId) : undefined,
    params.open ? and(isNull(receipts.reversedAt), sql`${left} > 0`) : undefined,
  );
  const [rows, [{ count }]] = await Promise.all([
    db.select().from(receipts).where(where).orderBy(desc(receipts.receivedOn), desc(receipts.createdAt), desc(receipts.id)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(receipts).where(where),
  ]);
  return buildPaginatedDto(await loadReceipts(db, actor.organizationId, rows), page, pageSize, count);
}

/** RCP-05: the customer's credit is the sum of what is left on its active receipts. It is not extra revenue. */
export async function getCustomerCredit(params: { headers: Headers; customerId: string }): Promise<{ customerId: string; credit: string; receipts: number }> {
  const actor = await requirePermission({ headers: params.headers, permission: { payment: ["read"] } });
  const rows = await db
    .select()
    .from(receipts)
    .where(and(eq(receipts.organizationId, actor.organizationId), eq(receipts.customerId, params.customerId), isNull(receipts.reversedAt)));
  const dtos = await loadReceipts(db, actor.organizationId, rows);
  const open = dtos.filter((receipt) => BigInt(receipt.availableAmount) > 0n);
  return { customerId: params.customerId, credit: toMoneyDto(open.reduce((sum, receipt) => sum + BigInt(receipt.availableAmount), 0n)), receipts: open.length };
}

// ---------------------------------------------------------------------------
// Locking helpers (order: invoices by id, then the receipt)

async function lockReceipt(tx: Tx, organizationId: string, receiptId: string): Promise<ReceiptRow> {
  const [receipt] = await tx
    .select()
    .from(receipts)
    .where(and(eq(receipts.id, receiptId), eq(receipts.organizationId, organizationId)))
    .for("update");
  if (!receipt) throw new APIError("NOT_FOUND", { message: "Receipt not found" });
  return receipt;
}

async function availableOf(tx: Tx, receipt: ReceiptRow): Promise<bigint> {
  const rows = await tx.execute<{ allocated: string; refunded: string }>(sql`
    select
      coalesce((select sum(s.amount) from settlements s where s.receipt_id = ${receipt.id} and s.reversed_at is null), 0)::text as allocated,
      coalesce((select sum(r.amount) from refunds r where r.receipt_id = ${receipt.id}), 0)::text as refunded`);
  return receipt.amount - BigInt(rows[0]!.allocated) - BigInt(rows[0]!.refunded);
}

async function lockInvoices(tx: Tx, organizationId: string, ids: string[]) {
  const sorted = [...ids].sort();
  const rows = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.organizationId, organizationId), inArray(invoices.id, sorted)))
    .orderBy(asc(invoices.id))
    .for("update");
  if (rows.length !== sorted.length) throw new APIError("NOT_FOUND", { message: "Invoice not found" });
  return rows;
}

function remainingOf(invoice: { total: bigint }, settled: bigint) {
  const remaining = invoice.total - settled;
  return remaining > 0n ? remaining : 0n;
}

async function logPayment(tx: Tx, actor: Actor, invoice: typeof invoices.$inferSelect, extra: Record<string, unknown>) {
  await tx.insert(activities).values({
    organizationId: actor.organizationId,
    dealId: invoice.dealId,
    orderId: invoice.orderId,
    entityType: "payment",
    eventType: "recorded",
    actorId: actor.userId,
    metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, ...extra },
    permissionCategory: "finance",
  });
}

// ---------------------------------------------------------------------------
// Recording money

const recordReceiptSchema = z.object({
  amount: positiveMoney,
  receivedOn: isoDate,
  method: z.enum(["BANK_TRANSFER", "CASH", "OTHER"]),
  reference: text(200),
  note: text(5000),
  customerId: z.string().uuid().optional(),
  idempotencyKey,
});

/**
 * RCP-01: money that came in, before it is known what it pays for. It may be
 * recorded without a customer (an unrecognized transfer) and before any invoice
 * exists (an advance). It is never edited or deleted; see the reversals below.
 */
export async function recordReceipt(params: { headers: Headers; input: unknown }): Promise<ReceiptDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { payment: ["write"] } });
  const input = recordReceiptSchema.parse(params.input);
  const clock = await organizationClock(actor.organizationId);
  if (input.receivedOn > clock.today) {
    throw new APIError("BAD_REQUEST", { message: "The received date cannot be in the future" });
  }

  return db.transaction(async (tx) => {
    const receiptId = crypto.randomUUID();
    const claim = await claimIdempotencyKey(tx, {
      organizationId: actor.organizationId,
      operation: OPERATIONS.receipt,
      key: input.idempotencyKey,
      fingerprint: fingerprintOf(input.amount.toString(), input.receivedOn, input.method, input.reference, input.note, input.customerId ?? null),
      resultEntityId: receiptId,
    });
    if (claim.replay) return loadReceipt(tx, actor.organizationId, claim.replay.resultEntityId);

    if (input.customerId) {
      const customer = await tx.query.customers.findFirst({
        where: and(eq(customers.id, input.customerId), eq(customers.organizationId, actor.organizationId)),
        columns: { id: true },
      });
      if (!customer) throw new APIError("BAD_REQUEST", { message: "Customer not found in this organization" });
    }
    await tx.insert(receipts).values({
      id: receiptId,
      organizationId: actor.organizationId,
      customerId: input.customerId ?? null,
      amount: input.amount,
      receivedOn: input.receivedOn,
      method: input.method,
      reference: input.reference,
      note: input.note,
      createdById: actor.userId,
    });
    return loadReceipt(tx, actor.organizationId, receiptId);
  });
}

const identifySchema = z.object({ customerId: z.string().uuid(), basis: requiredText(1000, "A basis for the identification is required") });

/**
 * RCP-02: names the customer of an unrecognized receipt, with the basis, audited.
 * A wrong identification is corrected the same way, but only while the receipt
 * has nothing allocated (reverse those first) and nothing refunded.
 */
export async function identifyReceipt(params: { headers: Headers; receiptId: string; input: unknown }): Promise<ReceiptDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { payment: ["write"] } });
  const input = identifySchema.parse(params.input);
  const clock = await organizationClock(actor.organizationId);

  return db.transaction(async (tx) => {
    const receipt = await lockReceipt(tx, actor.organizationId, params.receiptId);
    if (receipt.reversedAt) throw new APIError("BAD_REQUEST", { message: "The receipt is reversed" });
    if (receipt.customerId === input.customerId) return loadReceipt(tx, actor.organizationId, receipt.id);

    const customer = await tx.query.customers.findFirst({
      where: and(eq(customers.id, input.customerId), eq(customers.organizationId, actor.organizationId)),
      columns: { id: true },
    });
    if (!customer) throw new APIError("BAD_REQUEST", { message: "Customer not found in this organization" });
    if (receipt.customerId) {
      const current = await loadReceipt(tx, actor.organizationId, receipt.id);
      if (BigInt(current.allocatedAmount) > 0n || BigInt(current.refundedAmount) > 0n) {
        throw new APIError("BAD_REQUEST", { message: "A receipt with allocations or refunds cannot change customer, reverse the allocations first" });
      }
    }

    await tx
      .update(receipts)
      .set({ customerId: input.customerId, identifiedAt: clock.now, identifiedById: actor.userId, identificationNote: input.basis })
      .where(eq(receipts.id, receipt.id));
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "receipt.identified",
      targetType: "receipt",
      targetId: receipt.id,
      metadata: { customerId: input.customerId, previousCustomerId: receipt.customerId, basis: input.basis },
    });
    return loadReceipt(tx, actor.organizationId, receipt.id);
  });
}

const allocateSchema = z.object({
  allocations: z
    .array(z.object({ invoiceId: z.string().uuid(), amount: positiveMoney }))
    .min(1)
    .max(50)
    .refine((list) => new Set(list.map((entry) => entry.invoiceId)).size === list.length, { message: "An invoice can appear once in an allocation" }),
  idempotencyKey,
});

/**
 * SET-02: divides what is left of one receipt over one or more invoices of the
 * same customer. Invoices are locked by id, then the receipt; nothing is
 * allocated beyond what an invoice still owes or the receipt still has.
 */
export async function allocateReceipt(params: { headers: Headers; receiptId: string; input: unknown }): Promise<ReceiptDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { payment: ["write"] } });
  const input = allocateSchema.parse(params.input);
  const clock = await organizationClock(actor.organizationId);

  return db.transaction(async (tx) => {
    const claim = await claimIdempotencyKey(tx, {
      organizationId: actor.organizationId,
      operation: OPERATIONS.allocate,
      key: input.idempotencyKey,
      fingerprint: fingerprintOf(params.receiptId, input.allocations.map((entry) => [entry.invoiceId, entry.amount.toString()])),
      resultEntityId: params.receiptId,
    });
    if (claim.replay) return loadReceipt(tx, actor.organizationId, claim.replay.resultEntityId);

    const lockedInvoices = await lockInvoices(tx, actor.organizationId, input.allocations.map((entry) => entry.invoiceId));
    const receipt = await lockReceipt(tx, actor.organizationId, params.receiptId);
    if (receipt.reversedAt) throw new APIError("BAD_REQUEST", { message: "The receipt is reversed" });
    if (!receipt.customerId) throw new APIError("BAD_REQUEST", { message: "Identify the customer of the receipt before allocating it" });

    const settled = await paidAmountsFor(tx, { organizationId: actor.organizationId, invoiceIds: lockedInvoices.map((invoice) => invoice.id) });
    let total = 0n;
    for (const entry of input.allocations) {
      const invoice = lockedInvoices.find((candidate) => candidate.id === entry.invoiceId)!;
      if (invoice.customerId !== receipt.customerId) {
        throw new APIError("BAD_REQUEST", { message: "A receipt can only settle invoices of its own customer" });
      }
      if (invoice.voidedAt) throw new APIError("BAD_REQUEST", { message: "This invoice is void" });
      if (entry.amount > remainingOf(invoice, settled.get(invoice.id) ?? 0n)) {
        throw new APIError("BAD_REQUEST", { message: `Allocation exceeds the remaining balance of invoice ${invoice.invoiceNumber}` });
      }
      total += entry.amount;
    }
    if (total > (await availableOf(tx, receipt))) {
      throw new APIError("BAD_REQUEST", { message: "Allocation exceeds what is left of the receipt" });
    }

    for (const entry of input.allocations) {
      const invoice = lockedInvoices.find((candidate) => candidate.id === entry.invoiceId)!;
      await tx.insert(settlements).values({
        organizationId: actor.organizationId,
        invoiceId: invoice.id,
        kind: "RECEIPT",
        receiptId: receipt.id,
        amount: entry.amount,
        // A deposit can pre-date its invoice; the settlement never does.
        settledOn: receipt.receivedOn > invoice.issueDate ? receipt.receivedOn : invoice.issueDate,
        createdById: actor.userId,
      });
      await logPayment(tx, actor, invoice, { receiptId: receipt.id, kind: "RECEIPT" });
    }
    void clock;
    return loadReceipt(tx, actor.organizationId, receipt.id);
  });
}

const settleSchema = z.object({
  kind: z.enum(["WITHHOLDING", "WRITE_OFF"]),
  amount: positiveMoney,
  settledOn: isoDate.optional(),
  reference: text(200),
  note: text(5000),
  idempotencyKey,
});

/**
 * SET-01: settles part of an invoice without cash. WITHHOLDING is tax the customer
 * kept back and needs the withholding slip's number; WRITE_OFF is a small
 * difference, needs a note, and above the limit in the settings only Owner or
 * Admin may post it. Neither counts as cash received.
 */
export async function settleInvoice(params: { headers: Headers; invoiceId: string; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { payment: ["write"] } });
  const input = settleSchema.parse(params.input);
  const clock = await organizationClock(actor.organizationId);
  if (input.kind === "WITHHOLDING" && !input.reference) {
    throw new APIError("BAD_REQUEST", { message: "A withholding settlement needs the number of the withholding slip" });
  }
  if (input.kind === "WRITE_OFF" && !input.note) {
    throw new APIError("BAD_REQUEST", { message: "A write-off needs a note" });
  }

  return db.transaction(async (tx) => {
    const settlementId = crypto.randomUUID();
    const claim = await claimIdempotencyKey(tx, {
      organizationId: actor.organizationId,
      operation: OPERATIONS.settle,
      key: input.idempotencyKey,
      fingerprint: fingerprintOf(params.invoiceId, input.kind, input.amount.toString(), input.settledOn ?? null, input.reference, input.note),
      resultEntityId: settlementId,
    });
    if (claim.replay) {
      const previous = await tx.query.settlements.findFirst({ where: and(eq(settlements.id, claim.replay.resultEntityId), eq(settlements.organizationId, actor.organizationId)) });
      return { settlementId: previous!.id, kind: previous!.kind, amount: toMoneyDto(previous!.amount) };
    }

    const [invoice] = await lockInvoices(tx, actor.organizationId, [params.invoiceId]);
    if (invoice.voidedAt) throw new APIError("BAD_REQUEST", { message: "This invoice is void" });
    const settled = (await paidAmountsFor(tx, { organizationId: actor.organizationId, invoiceIds: [invoice.id] })).get(invoice.id) ?? 0n;
    if (input.amount > remainingOf(invoice, settled)) {
      throw new APIError("BAD_REQUEST", { message: `Settlement exceeds the remaining balance of ${remainingOf(invoice, settled).toString()}` });
    }
    const settledOn = input.settledOn ?? clock.today;
    if (settledOn > clock.today) throw new APIError("BAD_REQUEST", { message: "The settlement date cannot be in the future" });
    if (settledOn < invoice.issueDate) throw new APIError("BAD_REQUEST", { message: "The settlement date cannot be before the invoice issue date" });

    if (input.kind === "WRITE_OFF" && actor.role !== "OWNER" && actor.role !== "ADMIN") {
      const settings = await tx.query.organizationSettings.findFirst({ where: eq(organizationSettings.organizationId, actor.organizationId), columns: { writeOffLimit: true } });
      if (input.amount > (settings?.writeOffLimit ?? 0n)) {
        throw new APIError("FORBIDDEN", { message: "A write-off above the limit can only be posted by an owner or an admin" });
      }
    }

    await tx.insert(settlements).values({
      id: settlementId,
      organizationId: actor.organizationId,
      invoiceId: invoice.id,
      kind: input.kind,
      amount: input.amount,
      settledOn,
      reference: input.reference,
      note: input.note,
      createdById: actor.userId,
    });
    if (input.kind === "WRITE_OFF") {
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "settlement.written_off",
        targetType: "settlement",
        targetId: settlementId,
        metadata: { invoiceNumber: invoice.invoiceNumber, amount: input.amount.toString(), note: input.note },
      });
    }
    await logPayment(tx, actor, invoice, { settlementId, kind: input.kind });
    return { settlementId, kind: input.kind, amount: toMoneyDto(input.amount) };
  });
}

// ---------------------------------------------------------------------------
// Corrections (RCP-04): append-only, with a reason and an audit event

const reasonSchema = z.object({ reason: requiredText(1000, "A reason is required") });

/** A wrong allocation: the settlement stops counting, the invoice owes again and the receipt has the money back. */
export async function reverseSettlement(params: { headers: Headers; settlementId: string; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { payment: ["write"] } });
  const input = reasonSchema.parse(params.input);
  const clock = await organizationClock(actor.organizationId);

  return db.transaction(async (tx) => {
    const plain = await tx.query.settlements.findFirst({ where: and(eq(settlements.id, params.settlementId), eq(settlements.organizationId, actor.organizationId)) });
    if (!plain) throw new APIError("NOT_FOUND", { message: "Settlement not found" });
    await lockInvoices(tx, actor.organizationId, [plain.invoiceId]);
    if (plain.receiptId) await lockReceipt(tx, actor.organizationId, plain.receiptId);
    const [settlement] = await tx.select().from(settlements).where(eq(settlements.id, plain.id)).for("update");
    if (settlement.reversedAt) return { settlementId: settlement.id, reversedAt: settlement.reversedAt.toISOString() };

    await tx.update(settlements).set({ reversedAt: clock.now, reversedById: actor.userId, reversalReason: input.reason }).where(eq(settlements.id, settlement.id));
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "settlement.reversed",
      targetType: "settlement",
      targetId: settlement.id,
      metadata: { invoiceId: settlement.invoiceId, kind: settlement.kind, amount: settlement.amount.toString(), reason: input.reason },
    });
    return { settlementId: settlement.id, reversedAt: clock.now.toISOString() };
  });
}

/** A failed or mis-recorded transfer. Only a receipt with nothing allocated and nothing refunded can be reversed. */
export async function reverseReceipt(params: { headers: Headers; receiptId: string; input: unknown }): Promise<ReceiptDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { payment: ["write"] } });
  const input = reasonSchema.parse(params.input);
  const clock = await organizationClock(actor.organizationId);

  return db.transaction(async (tx) => {
    const receipt = await lockReceipt(tx, actor.organizationId, params.receiptId);
    if (receipt.reversedAt) return loadReceipt(tx, actor.organizationId, receipt.id);
    const current = await loadReceipt(tx, actor.organizationId, receipt.id);
    if (BigInt(current.allocatedAmount) > 0n) {
      throw new APIError("BAD_REQUEST", { message: "A receipt with active allocations cannot be reversed, reverse the allocations first" });
    }
    if (BigInt(current.refundedAmount) > 0n) {
      throw new APIError("BAD_REQUEST", { message: "A receipt that was refunded cannot be reversed" });
    }
    await tx.update(receipts).set({ reversedAt: clock.now, reversedById: actor.userId, reversalReason: input.reason }).where(eq(receipts.id, receipt.id));
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "receipt.reversed",
      targetType: "receipt",
      targetId: receipt.id,
      metadata: { amount: receipt.amount.toString(), reason: input.reason },
    });
    return loadReceipt(tx, actor.organizationId, receipt.id);
  });
}

const refundSchema = z.object({
  amount: positiveMoney,
  refundedOn: isoDate,
  reason: requiredText(1000, "A reason is required"),
  reference: text(200),
  note: text(5000),
  idempotencyKey,
});

/** Money handed back out of what is left of an identified, active receipt; never more than is left. */
export async function recordRefund(params: { headers: Headers; receiptId: string; input: unknown }): Promise<ReceiptDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { payment: ["write"] } });
  const input = refundSchema.parse(params.input);
  const clock = await organizationClock(actor.organizationId);
  if (input.refundedOn > clock.today) throw new APIError("BAD_REQUEST", { message: "The refund date cannot be in the future" });

  return db.transaction(async (tx) => {
    const refundId = crypto.randomUUID();
    const claim = await claimIdempotencyKey(tx, {
      organizationId: actor.organizationId,
      operation: OPERATIONS.refund,
      key: input.idempotencyKey,
      fingerprint: fingerprintOf(params.receiptId, input.amount.toString(), input.refundedOn, input.reason, input.reference, input.note),
      resultEntityId: refundId,
    });
    if (claim.replay) return loadReceipt(tx, actor.organizationId, params.receiptId);

    const receipt = await lockReceipt(tx, actor.organizationId, params.receiptId);
    if (receipt.reversedAt) throw new APIError("BAD_REQUEST", { message: "The receipt is reversed" });
    if (!receipt.customerId) throw new APIError("BAD_REQUEST", { message: "Identify the customer of the receipt before refunding it" });
    if (input.refundedOn < receipt.receivedOn) throw new APIError("BAD_REQUEST", { message: "The refund date cannot be before the received date" });
    if (input.amount > (await availableOf(tx, receipt))) {
      throw new APIError("BAD_REQUEST", { message: "A refund cannot exceed what is left of the receipt" });
    }
    await tx.insert(refunds).values({
      id: refundId,
      organizationId: actor.organizationId,
      receiptId: receipt.id,
      amount: input.amount,
      refundedOn: input.refundedOn,
      reason: input.reason,
      reference: input.reference,
      note: input.note,
      createdById: actor.userId,
    });
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "refund.recorded",
      targetType: "refund",
      targetId: refundId,
      metadata: { receiptId: receipt.id, amount: input.amount.toString(), reason: input.reason },
    });
    return loadReceipt(tx, actor.organizationId, receipt.id);
  });
}
