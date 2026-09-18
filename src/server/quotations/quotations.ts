import { and, eq, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { activities, deals, organizationSettings, quotationItems, quotations } from "@/server/db/schema";
import { moneyAmountSchema } from "@/server/money/amount";
import { type CalculationErrorCode, calculateDocumentTotals } from "@/server/money/calculation";
import { formatQuantityScaled, quantitySchema } from "@/server/money/quantity";
import { organizationDateString, organizationYear } from "@/server/shared/organization-date";
import { claimNextSequence, formatQuotationNumber } from "./document-number";

// QUO-02/API-04: MVP item-count ceiling.
const MAX_ITEMS = 200;

function calculationErrorMessage(code: CalculationErrorCode): string {
  switch (code) {
    case "NO_ITEMS":
      return "A quotation must have at least one item";
    case "AMOUNT_OUT_OF_RANGE":
      return "An amount is outside the allowed range";
    case "DISCOUNT_EXCEEDS_SUBTOTAL":
      return "Discount cannot exceed the subtotal";
    case "TOTAL_NOT_POSITIVE":
      return "Quotation total must be greater than zero";
  }
}

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

// QUO-02 field contract, shared by create and update.
const itemInputSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  quantity: quantitySchema,
  unit: z.string().trim().min(1).max(50),
  unitPrice: moneyAmountSchema,
});

// discount/tax are optional nominal amounts (MONEY-03), defaulting to "0"
// before moneyAmountSchema ever sees them, so an omitted field and an
// explicit "0" behave identically.
const optionalMoneyAmountSchema = z.string().default("0").pipe(moneyAmountSchema);

// null (not undefined) on empty/missing notes/terms, matching the
// customers/deals precedent: Drizzle's .set() treats undefined as "leave
// this column alone", so clearing a previously-set value on update needs
// an explicit null.
const notesLikeSchema = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null);

const quotationFieldsSchema = {
  issueDate: isoDateSchema.optional(),
  validUntil: isoDateSchema,
  items: z.array(itemInputSchema).min(1).max(MAX_ITEMS),
  discount: optionalMoneyAmountSchema,
  tax: optionalMoneyAmountSchema,
  notes: notesLikeSchema(10_000),
  terms: notesLikeSchema(10_000),
};

const quotationCreateInputSchema = z.object({
  dealId: z.string().min(1),
  ...quotationFieldsSchema,
});

const quotationUpdateInputSchema = z.object(quotationFieldsSchema);

function computeTotalsOrThrow(parsed: {
  items: readonly { quantity: bigint; unitPrice: bigint }[];
  discount: bigint;
  tax: bigint;
}) {
  const result = calculateDocumentTotals({
    items: parsed.items.map((item) => ({ quantityScaled: item.quantity, unitPrice: item.unitPrice })),
    discount: parsed.discount,
    tax: parsed.tax,
  });
  if (!result.ok) {
    throw new APIError("BAD_REQUEST", { message: calculationErrorMessage(result.code) });
  }
  return result.totals;
}

/**
 * QUO-01/QUO-02/QUO-04. customer_id is deliberately not a client input: it
 * is always read from the deal itself (DATA-02: "customer harus berasal
 * dari deal yang benar"), which also removes an entire class of
 * "customerId doesn't match this deal" validation.
 *
 * DEAL-02/DATA-06: the deal row is locked with SELECT ... FOR UPDATE for
 * the whole transaction, not just read. Locking (rather than an
 * expected-version check, the pattern deals.ts uses elsewhere) is what a
 * multi-step transaction needs here: the customerId this function captures
 * for the quotation must still be current by the time the insert happens,
 * and a plain version check only protects a single UPDATE statement, not
 * everything that happens after the read. Any concurrent updateDeal
 * targeting the same row blocks until this transaction commits or rolls
 * back, then re-evaluates its own version check against whatever this
 * transaction left behind.
 */
export async function createQuotation(params: { headers: Headers; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { quotation: ["write"] } });
  const parsed = quotationCreateInputSchema.parse(params.input);
  const totals = computeTotalsOrThrow(parsed);

  const settings = await db.query.organizationSettings.findFirst({
    where: eq(organizationSettings.organizationId, actor.organizationId),
  });
  if (!settings) {
    // Every organization gets a settings row at registration (AUTH-02);
    // reaching here means that invariant broke, not a normal user error.
    throw new APIError("INTERNAL_SERVER_ERROR", { message: "Organization settings not found" });
  }

  const now = new Date();
  const issueDate = parsed.issueDate ?? organizationDateString(settings.timezone, now);
  // Field contract (§8.1): valid_until wajib, tidak sebelum issue_date.
  // Both are YYYY-MM-DD, so a plain string comparison is also a correct
  // chronological comparison.
  if (parsed.validUntil < issueDate) {
    throw new APIError("BAD_REQUEST", { message: "validUntil cannot be before issueDate" });
  }
  // QUO-04: the year comes from the server's creation instant in the
  // organization's timezone, never a client-editable date.
  const year = organizationYear(settings.timezone, now);

  // Generated in application code (not defaultRandom()) because familyId
  // must equal this row's own id, and a self-referencing value has to be
  // known before the insert.
  const quotationId = crypto.randomUUID();

  return db.transaction(async (tx) => {
    const [deal] = await tx
      .select()
      .from(deals)
      .where(and(eq(deals.id, parsed.dealId), eq(deals.organizationId, actor.organizationId)))
      .for("update");
    if (!deal) {
      throw new APIError("NOT_FOUND", { message: "Deal not found" });
    }
    // QUO-01: "dari deal aktif". DEAL-06 already locks a WON/LOST deal
    // against general edits; this is the equivalent lock for new
    // quotations against it.
    if (deal.status === "WON" || deal.status === "LOST") {
      throw new APIError("BAD_REQUEST", { message: "Cannot create a quotation for a closed deal" });
    }

    const sequence = await claimNextSequence(tx, {
      organizationId: actor.organizationId,
      documentType: "QUOTATION",
      year,
    });
    const quotationNumber = formatQuotationNumber(year, sequence);

    const [created] = await tx
      .insert(quotations)
      .values({
        id: quotationId,
        organizationId: actor.organizationId,
        dealId: deal.id,
        customerId: deal.customerId,
        quotationNumber,
        familyId: quotationId,
        issueDate,
        validUntil: parsed.validUntil,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        calculationVersion: totals.calculationVersion,
        notes: parsed.notes,
        terms: parsed.terms,
        createdById: actor.userId,
      })
      .returning();

    const items = await tx
      .insert(quotationItems)
      .values(
        parsed.items.map((item, index) => ({
          organizationId: actor.organizationId,
          quotationId: created.id,
          description: item.description,
          quantity: formatQuantityScaled(item.quantity),
          unit: item.unit,
          unitPrice: item.unitPrice,
          subtotal: totals.itemSubtotals[index],
          sortOrder: index,
        })),
      )
      .returning();

    // DEAL-02: flip the lock once, bumping version so a concurrent
    // updateDeal blocked on this row's lock (see function doc above) fails
    // its own version check after we commit, rather than silently
    // succeeding against a customerId this quotation already captured.
    if (!deal.hasQuotation) {
      await tx
        .update(deals)
        .set({ hasQuotation: true, version: sql`${deals.version} + 1` })
        .where(eq(deals.id, deal.id));
    }

    // AUD-01: "quotation created" is a required minimum timeline event.
    await tx.insert(activities).values({
      organizationId: actor.organizationId,
      dealId: deal.id,
      entityType: "quotation",
      eventType: "created",
      actorId: actor.userId,
      metadata: { quotationId: created.id, quotationNumber, total: totals.total.toString() },
      permissionCategory: "sales",
    });

    return { ...created, items };
  });
}

/**
 * QUO-03: a draft can be edited while it is still the family's latest
 * version and not yet frozen (frozen covers both "used as a revision
 * source" and "used as an invoice source", neither of which exists until
 * later M2/M3 slices, so this guard is currently only ever checking
 * status/isLatest in practice -- it is written against the full rule now
 * so it does not need to change when revision/freeze lands).
 *
 * dealId/customerId are not editable here: nothing in the requirement
 * allows moving a quotation to a different deal after creation.
 */
export async function updateQuotation(params: {
  headers: Headers;
  quotationId: string;
  expectedEditVersion: number;
  input: unknown;
}) {
  const actor = await requirePermission({ headers: params.headers, permission: { quotation: ["write"] } });
  const parsed = quotationUpdateInputSchema.parse(params.input);
  const totals = computeTotalsOrThrow(parsed);

  const existing = await db.query.quotations.findFirst({
    where: and(eq(quotations.id, params.quotationId), eq(quotations.organizationId, actor.organizationId)),
  });
  if (!existing) {
    throw new APIError("NOT_FOUND", { message: "Quotation not found" });
  }
  if (existing.status !== "DRAFT" || !existing.isLatest || existing.frozenAt !== null) {
    throw new APIError("BAD_REQUEST", { message: "This quotation can no longer be edited" });
  }

  const issueDate = parsed.issueDate ?? existing.issueDate;
  if (parsed.validUntil < issueDate) {
    throw new APIError("BAD_REQUEST", { message: "validUntil cannot be before issueDate" });
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(quotations)
      .set({
        issueDate,
        validUntil: parsed.validUntil,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        calculationVersion: totals.calculationVersion,
        notes: parsed.notes,
        terms: parsed.terms,
        updatedById: actor.userId,
        editVersion: sql`${quotations.editVersion} + 1`,
      })
      .where(
        and(
          eq(quotations.id, params.quotationId),
          eq(quotations.organizationId, actor.organizationId),
          eq(quotations.editVersion, params.expectedEditVersion),
        ),
      )
      .returning();

    if (!updated) {
      // existing was found above under the same tenant/draft scope, so
      // reaching here means the edit-version check failed (DATA-07), not a
      // missing/cross-tenant row (TENANT-04).
      throw new APIError("CONFLICT", { message: "Quotation was modified by someone else, reload and try again" });
    }

    // Items are fully replaced rather than diffed: simpler and still
    // correct for MVP, and the delete-then-insert happens inside this same
    // transaction so the (quotationId, sortOrder) unique index never sees
    // a transient conflict.
    await tx.delete(quotationItems).where(eq(quotationItems.quotationId, updated.id));
    const items = await tx
      .insert(quotationItems)
      .values(
        parsed.items.map((item, index) => ({
          organizationId: actor.organizationId,
          quotationId: updated.id,
          description: item.description,
          quantity: formatQuantityScaled(item.quantity),
          unit: item.unit,
          unitPrice: item.unitPrice,
          subtotal: totals.itemSubtotals[index],
          sortOrder: index,
        })),
      )
      .returning();

    return { ...updated, items };
  });
}

/**
 * TENANT-04: a quotation that doesn't exist and one that belongs to a
 * different organization produce the identical NOT_FOUND.
 */
export async function getQuotation(params: { headers: Headers; quotationId: string }) {
  const actor = await requirePermission({ headers: params.headers, permission: { quotation: ["read"] } });
  const quotation = await db.query.quotations.findFirst({
    where: and(eq(quotations.id, params.quotationId), eq(quotations.organizationId, actor.organizationId)),
    with: { items: { orderBy: (item, { asc }) => asc(item.sortOrder) } },
  });
  if (!quotation) {
    throw new APIError("NOT_FOUND", { message: "Quotation not found" });
  }
  return quotation;
}

/** Optionally scoped to one deal; otherwise every quotation in the tenant. */
export async function listQuotations(params: { headers: Headers; dealId?: string }) {
  const actor = await requirePermission({ headers: params.headers, permission: { quotation: ["read"] } });
  const scope = params.dealId
    ? and(eq(quotations.organizationId, actor.organizationId), eq(quotations.dealId, params.dealId))
    : eq(quotations.organizationId, actor.organizationId);

  return db.query.quotations.findMany({
    where: scope,
    orderBy: (quotation, { desc }) => desc(quotation.createdAt),
  });
}
