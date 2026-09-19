import { and, eq, gte, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import {
  activities,
  customers,
  deals,
  idempotencyRecords,
  organization,
  organizationSettings,
  quotationItems,
  quotations,
} from "@/server/db/schema";
import { moneyAmountSchema } from "@/server/money/amount";
import { type CalculationErrorCode, calculateDocumentTotals } from "@/server/money/calculation";
import { formatQuantityScaled, quantitySchema } from "@/server/money/quantity";
import { organizationDateString, organizationYear } from "@/server/shared/organization-date";
import { claimNextSequence, formatQuotationNumber, formatRevisionNumber } from "./document-number";
import { effectiveQuotationStatus } from "./effective-status";

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
 * QUO-04/QUO-10: several operations need "today" in the organization's own
 * timezone -- issueDate defaulting and the numbering year at creation,
 * expiry at read time and at status transition. Centralized here so all
 * of them read the settings row the same way and agree on what "today" is
 * within one request.
 */
async function organizationClock(organizationId: string): Promise<{ timezone: string; today: string; now: Date }> {
  const settings = await db.query.organizationSettings.findFirst({
    where: eq(organizationSettings.organizationId, organizationId),
  });
  if (!settings) {
    // Every organization gets a settings row at registration (AUTH-02);
    // reaching here means that invariant broke, not a normal user error.
    throw new APIError("INTERNAL_SERVER_ERROR", { message: "Organization settings not found" });
  }
  const now = new Date();
  return { timezone: settings.timezone, today: organizationDateString(settings.timezone, now), now };
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

  const clock = await organizationClock(actor.organizationId);
  const issueDate = parsed.issueDate ?? clock.today;
  // Field contract (§8.1): valid_until wajib, tidak sebelum issue_date.
  // Both are YYYY-MM-DD, so a plain string comparison is also a correct
  // chronological comparison.
  if (parsed.validUntil < issueDate) {
    throw new APIError("BAD_REQUEST", { message: "validUntil cannot be before issueDate" });
  }
  // QUO-04: the year comes from the server's creation instant in the
  // organization's timezone, never a client-editable date.
  const year = organizationYear(clock.timezone, clock.now);

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
 *
 * QUO-10: the returned `status` is the effective one (SENT past
 * validUntil displays as EXPIRED), computed here at read time -- the
 * stored column is never overwritten just because a day passed.
 */
export async function getQuotation(params: { headers: Headers; quotationId: string }) {
  const actor = await requirePermission({ headers: params.headers, permission: { quotation: ["read"] } });
  const quotation = await db.query.quotations.findFirst({
    where: and(eq(quotations.id, params.quotationId), eq(quotations.organizationId, actor.organizationId)),
  });
  if (!quotation) {
    throw new APIError("NOT_FOUND", { message: "Quotation not found" });
  }
  // Deliberately not `with: { items: ... }` on the query above: drizzle's
  // relational query API silently drops trailing zeros on a nested
  // numeric-mode-string column ("1.500" comes back "1.5"), while a plain,
  // separate query on the same column does not. A top-level query (this
  // one) is unaffected too -- the bug is specific to numeric columns
  // reached through a nested `with` relation. MONEY-02 requires the exact
  // stored string, so items are fetched as their own query instead.
  const items = await db.query.quotationItems.findMany({
    where: eq(quotationItems.quotationId, quotation.id),
    orderBy: (item, { asc }) => asc(item.sortOrder),
  });
  const clock = await organizationClock(actor.organizationId);
  return { ...quotation, status: effectiveQuotationStatus(quotation, clock.today), items };
}

/**
 * Optionally scoped to one deal or one revision family; otherwise every
 * quotation in the tenant. The familyId filter is what QUO-06's "UI selalu
 * dapat membuka versi lama dan membandingkan nomor/tanggal/totalnya" reads
 * through: every version of a family, old and new, is just a normal row
 * with isLatest telling the caller which one is current.
 *
 * QUO-10: same effective-status overlay as getQuotation, applied per row.
 */
export async function listQuotations(params: { headers: Headers; dealId?: string; familyId?: string }) {
  const actor = await requirePermission({ headers: params.headers, permission: { quotation: ["read"] } });
  const conditions = [eq(quotations.organizationId, actor.organizationId)];
  if (params.dealId) {
    conditions.push(eq(quotations.dealId, params.dealId));
  }
  if (params.familyId) {
    conditions.push(eq(quotations.familyId, params.familyId));
  }

  const rows = await db.query.quotations.findMany({
    where: and(...conditions),
    orderBy: (quotation, { asc }) => asc(quotation.revisionNumber),
  });
  const clock = await organizationClock(actor.organizationId);
  return rows.map((row) => ({ ...row, status: effectiveQuotationStatus(row, clock.today) }));
}

// API-05: this operation type scopes the idempotency key namespace.
// Invoice/payment (M3) will add their own values into the same table.
const REVISE_QUOTATION_OPERATION = "QUOTATION_REVISION";

const reviseQuotationInputSchema = z.object({
  sourceQuotationId: z.string().min(1),
  // API-01's "expected family version": the id of whichever quotation the
  // caller currently believes is the family's latest version. The
  // requirement never names a separate family-version counter column in
  // §14.1's field list, and checking "is this row still the latest" is
  // exactly equivalent in what it protects against, since the only thing
  // that ever changes a family's latest row is this same function.
  expectedLatestQuotationId: z.string().min(1),
  idempotencyKey: z.string().trim().min(1).max(200),
});

/**
 * Builds the point-in-time company/customer snapshot a freeze captures.
 * Reads current master data; the caller decides whether that's appropriate
 * (only ever call this for a row that is about to be frozen for the first
 * time -- see the frozenAt-is-null guard in reviseQuotation).
 */
// PDF-01/PDF-02: named and exported so both the freeze call sites (inside
// a transaction) and getQuotationForPdf (a plain read, no transaction
// needed since nothing is written) can share one shape, and so
// quotation-document.tsx has a real type for its props instead of `any`.
export type QuotationSellerSnapshot = {
  name: string | null;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};
export type QuotationCustomerSnapshot = {
  companyName: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

async function buildQuotationSnapshots(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db,
  params: { organizationId: string; customerId: string },
): Promise<{ seller: QuotationSellerSnapshot; customer: QuotationCustomerSnapshot }> {
  const [org] = await tx.select().from(organization).where(eq(organization.id, params.organizationId));
  const settings = await tx.query.organizationSettings.findFirst({
    where: eq(organizationSettings.organizationId, params.organizationId),
  });
  const customer = await tx.query.customers.findFirst({
    where: and(eq(customers.id, params.customerId), eq(customers.organizationId, params.organizationId)),
  });

  return {
    seller: {
      name: org?.name ?? null,
      address: settings?.address ?? null,
      contactEmail: settings?.contactEmail ?? null,
      contactPhone: settings?.contactPhone ?? null,
    },
    customer: {
      companyName: customer?.companyName ?? null,
      contactPerson: customer?.contactPerson ?? null,
      phone: customer?.phoneNormalized ?? null,
      email: customer?.email ?? null,
      address: customer?.address ?? null,
    },
  };
}

/**
 * QUO-05/QUO-06: creates a new DRAFT version in the same revision family,
 * copying its content from `sourceQuotationId` (which may be the family's
 * current latest version, or an older, already-frozen one). Nothing about
 * commercial content is accepted as input here -- API-01 lists this
 * operation's inputs as only the source id, expected family version, and
 * idempotency key, unlike create/edit quotation's full field list. A
 * caller changes the new draft's content afterward through updateQuotation.
 *
 * Whichever row is currently the family's latest is frozen (if it isn't
 * already) and demoted, regardless of whether it is also the source: a
 * historical source is always already frozen by induction (the only way a
 * row stops being latest is through this same function, which always
 * freezes it in the same step), so in practice this always freezes exactly
 * the row that was latest, never the source specifically.
 *
 * QUO-07: no deal-status check here. That belongs to createQuotation (the
 * first attachment point); a family's deal association is fixed at
 * original-creation and revising never touches it, so a revision on a WON
 * (or LOST) deal is simply never blocked.
 *
 * API-05: the whole operation, including the idempotency claim, is one
 * transaction, so a thrown validation error rolls the claim back too --
 * a failed attempt never permanently consumes the caller's key.
 */
export async function reviseQuotation(params: { headers: Headers; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { quotation: ["write"] } });
  const parsed = reviseQuotationInputSchema.parse(params.input);

  // Small, fixed-shape payload (two UUIDs) -- a plain delimited string is
  // already a deterministic, normalized fingerprint; hashing it would add
  // a dependency for no real benefit at this size.
  const payloadFingerprint = `${parsed.sourceQuotationId}|${parsed.expectedLatestQuotationId}`;
  const newQuotationId = crypto.randomUUID();

  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .insert(idempotencyRecords)
      .values({
        organizationId: actor.organizationId,
        operationType: REVISE_QUOTATION_OPERATION,
        idempotencyKey: parsed.idempotencyKey,
        payloadFingerprint,
        resultEntityId: newQuotationId,
      })
      .onConflictDoNothing({
        target: [idempotencyRecords.organizationId, idempotencyRecords.operationType, idempotencyRecords.idempotencyKey],
      })
      .returning();

    if (!claimed) {
      const existing = await tx.query.idempotencyRecords.findFirst({
        where: and(
          eq(idempotencyRecords.organizationId, actor.organizationId),
          eq(idempotencyRecords.operationType, REVISE_QUOTATION_OPERATION),
          eq(idempotencyRecords.idempotencyKey, parsed.idempotencyKey),
        ),
      });
      // existing cannot be missing: the conflict that got us here means a
      // row with this exact key already exists in this same table.
      if (existing!.payloadFingerprint !== payloadFingerprint) {
        throw new APIError("CONFLICT", { message: "Idempotency key was already used with a different request" });
      }
      const previous = await tx.query.quotations.findFirst({
        where: and(eq(quotations.id, existing!.resultEntityId), eq(quotations.organizationId, actor.organizationId)),
      });
      if (!previous) {
        throw new APIError("INTERNAL_SERVER_ERROR", { message: "Idempotency record points at a missing quotation" });
      }
      // Same nested-`with` numeric-truncation issue as getQuotation: items
      // fetched as their own top-level query, not nested.
      const previousItems = await tx.query.quotationItems.findMany({
        where: eq(quotationItems.quotationId, previous.id),
        orderBy: (item, { asc }) => asc(item.sortOrder),
      });
      return { ...previous, items: previousItems };
    }

    const sourceLookup = await tx.query.quotations.findFirst({
      where: and(eq(quotations.id, parsed.sourceQuotationId), eq(quotations.organizationId, actor.organizationId)),
      columns: { familyId: true },
    });
    if (!sourceLookup) {
      throw new APIError("NOT_FOUND", { message: "Quotation not found" });
    }

    // QUO-05: "satu transaksi mengunci family dan memastikan hanya satu
    // latest version." The whole family, not just one row: scenario B
    // below needs to read and update two different rows (the source and
    // the current latest) consistently.
    const family = await tx
      .select()
      .from(quotations)
      .where(and(eq(quotations.familyId, sourceLookup.familyId), eq(quotations.organizationId, actor.organizationId)))
      .for("update");

    const source = family.find((row) => row.id === parsed.sourceQuotationId)!;
    const currentLatest = family.find((row) => row.isLatest)!;
    const original = family.find((row) => row.revisionNumber === 1)!;

    if (currentLatest.id !== parsed.expectedLatestQuotationId) {
      throw new APIError("CONFLICT", {
        message: "This quotation family already has a newer version, reload and try again",
      });
    }

    // QUO-06: freeze the row that is about to lose latest status, using
    // its own current content -- never the source's, and never re-freezing
    // a row that already has a snapshot (that would let today's master
    // data leak into what must stay historical, PDF-02).
    if (currentLatest.frozenAt === null) {
      const snapshots = await buildQuotationSnapshots(tx, {
        organizationId: actor.organizationId,
        customerId: currentLatest.customerId,
      });
      await tx
        .update(quotations)
        .set({
          frozenAt: sql`now()`,
          sellerSnapshot: snapshots.seller,
          customerSnapshot: snapshots.customer,
          isLatest: false,
        })
        .where(eq(quotations.id, currentLatest.id));
    } else {
      await tx.update(quotations).set({ isLatest: false }).where(eq(quotations.id, currentLatest.id));
    }

    // revisionNumber is the row's 1-indexed position in the family
    // (original = 1), so the Nth revision is at position N+1. QUO-04's
    // display suffix counts revisions only ("-R1" for the first revision,
    // never for the original), which is one less than that position.
    const nextRevisionNumber = Math.max(...family.map((row) => row.revisionNumber)) + 1;
    const displayRevisionNumber = nextRevisionNumber - 1;
    const sourceItems = await tx.query.quotationItems.findMany({
      where: eq(quotationItems.quotationId, source.id),
      orderBy: (item, { asc }) => asc(item.sortOrder),
    });

    const [created] = await tx
      .insert(quotations)
      .values({
        id: newQuotationId,
        organizationId: actor.organizationId,
        dealId: source.dealId,
        customerId: source.customerId,
        quotationNumber: formatRevisionNumber(original.quotationNumber, displayRevisionNumber),
        familyId: source.familyId,
        revisionNumber: nextRevisionNumber,
        previousRevisionId: source.id,
        isLatest: true,
        issueDate: source.issueDate,
        validUntil: source.validUntil,
        subtotal: source.subtotal,
        discount: source.discount,
        tax: source.tax,
        total: source.total,
        calculationVersion: source.calculationVersion,
        notes: source.notes,
        terms: source.terms,
        createdById: actor.userId,
      })
      .returning();

    const items = await tx
      .insert(quotationItems)
      .values(
        sourceItems.map((item) => ({
          organizationId: actor.organizationId,
          quotationId: created.id,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          sortOrder: item.sortOrder,
        })),
      )
      .returning();

    // AUD-01: "quotation ... revised" is a required minimum timeline event.
    await tx.insert(activities).values({
      organizationId: actor.organizationId,
      dealId: source.dealId,
      entityType: "quotation",
      eventType: "revised",
      actorId: actor.userId,
      metadata: {
        newQuotationId: created.id,
        newQuotationNumber: created.quotationNumber,
        sourceQuotationId: source.id,
        sourceQuotationNumber: source.quotationNumber,
      },
      permissionCategory: "sales",
    });

    return { ...created, items };
  });
}

// QUO-08/QUO-09: DRAFT can only ever become SENT; SENT can become ACCEPTED
// or REJECTED; ACCEPTED and REJECTED are terminal (their own forward path
// is a new revision -- reviseQuotation -- not a status change on this
// same row). EXPIRED never appears here: it is never a stored status,
// only a read-time overlay (effective-status.ts).
const VALID_QUOTATION_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ["SENT"],
  SENT: ["ACCEPTED", "REJECTED"],
  ACCEPTED: [],
  REJECTED: [],
};

const transitionQuotationStatusInputSchema = z.object({
  toStatus: z.enum(["SENT", "ACCEPTED", "REJECTED"]),
});

/**
 * QUO-08/QUO-09/QUO-10. A request for the quotation's current status is an
 * idempotent no-op (no error, no write, no version bump), matching
 * transitionDeal's pattern in deals.ts.
 *
 * SENT and ACCEPTED both require the quotation not be expired (today_org
 * <= validUntil); REJECTED deliberately does not -- the transition table
 * only lists the expiry check for ACCEPTED, not REJECTED. A customer can
 * still say no after the window closed; they just can't say yes to an
 * offer that already lapsed.
 */
export async function transitionQuotationStatus(params: {
  headers: Headers;
  quotationId: string;
  expectedEditVersion: number;
  toStatus: unknown;
}) {
  const actor = await requirePermission({ headers: params.headers, permission: { quotation: ["write"] } });
  const parsed = transitionQuotationStatusInputSchema.parse({ toStatus: params.toStatus });

  const existing = await db.query.quotations.findFirst({
    where: and(eq(quotations.id, params.quotationId), eq(quotations.organizationId, actor.organizationId)),
  });
  if (!existing) {
    throw new APIError("NOT_FOUND", { message: "Quotation not found" });
  }
  if (existing.status === parsed.toStatus) {
    return existing;
  }

  const allowedNext = VALID_QUOTATION_STATUS_TRANSITIONS[existing.status] ?? [];
  if (!allowedNext.includes(parsed.toStatus)) {
    throw new APIError("BAD_REQUEST", {
      message: `Cannot transition a quotation from ${existing.status} to ${parsed.toStatus}`,
    });
  }
  // QUO-05/QUO-06/§8.3 table: every row in the transition table above is
  // "versi terbaru" -- a historical version cannot change status at all.
  if (!existing.isLatest) {
    throw new APIError("BAD_REQUEST", { message: "Only the latest version of a quotation can change status" });
  }

  const clock = await organizationClock(actor.organizationId);
  if (parsed.toStatus !== "REJECTED" && clock.today > existing.validUntil) {
    throw new APIError("CONFLICT", {
      message: "This quotation has expired and can no longer be sent or accepted",
    });
  }

  if (parsed.toStatus === "SENT") {
    // QUO-08: "deal bukan NEW/LOST". A plain read, not a lock -- the same
    // pattern deals.ts uses for assertActiveAssignee/
    // assertCustomerInOrganization, validating a related row without
    // needing to hold it: the actual side effect below is itself guarded
    // by a conditional UPDATE, not by trusting this read.
    const deal = await db.query.deals.findFirst({
      where: and(eq(deals.id, existing.dealId), eq(deals.organizationId, actor.organizationId)),
    });
    if (!deal || deal.status === "NEW" || deal.status === "LOST") {
      throw new APIError("BAD_REQUEST", {
        message: "The deal must be at least CONTACTED and not LOST before a quotation can be sent",
      });
    }
  }

  return db.transaction(async (tx) => {
    const now = new Date();
    const statusFields: Record<string, unknown> = {
      status: parsed.toStatus,
      editVersion: sql`${quotations.editVersion} + 1`,
    };

    if (parsed.toStatus === "SENT") {
      statusFields.sentAt = now;
      // QUO-08: freeze only if not already frozen (e.g. by a future M3
      // invoice-sourcing freeze on this same draft) -- never re-freeze,
      // which would let today's master data leak into what must stay
      // historical (PDF-02).
      if (existing.frozenAt === null) {
        const snapshots = await buildQuotationSnapshots(tx, {
          organizationId: actor.organizationId,
          customerId: existing.customerId,
        });
        statusFields.frozenAt = sql`now()`;
        statusFields.sellerSnapshot = snapshots.seller;
        statusFields.customerSnapshot = snapshots.customer;
      }
    } else if (parsed.toStatus === "ACCEPTED") {
      statusFields.acceptedAt = now;
      statusFields.acceptedById = actor.userId;
    } else {
      statusFields.rejectedAt = now;
      statusFields.rejectedById = actor.userId;
    }

    const whereConditions = [
      eq(quotations.id, params.quotationId),
      eq(quotations.organizationId, actor.organizationId),
      eq(quotations.editVersion, params.expectedEditVersion),
    ];
    // QUO-10: "diperiksa kembali di dalam transaksi acceptance" -- the
    // expiry condition rides along in the same guarded UPDATE that
    // performs the write, not just the read-side check above.
    if (parsed.toStatus !== "REJECTED") {
      whereConditions.push(gte(quotations.validUntil, clock.today));
    }

    const [updated] = await tx
      .update(quotations)
      .set(statusFields)
      .where(and(...whereConditions))
      .returning();

    if (!updated) {
      // existing was found under the same tenant/latest scope above, so
      // reaching here means either the edit-version check failed
      // (DATA-07) or the expiry re-check just failed -- both are
      // legitimate "someone else changed the picture" conflicts.
      throw new APIError("CONFLICT", { message: "Quotation was modified by someone else, reload and try again" });
    }

    // QUO-08: CONTACTED -> QUOTATION happens only on SENT, only if the
    // deal is still CONTACTED, in the same transaction. The UPDATE's own
    // WHERE status='CONTACTED' is the race guard: two concurrent SENT
    // actions on different quotations of the same deal both attempt this,
    // and only whichever commits first actually changes anything -- the
    // second affects 0 rows and is simply skipped, not an error.
    if (parsed.toStatus === "SENT") {
      const [advancedDeal] = await tx
        .update(deals)
        .set({ status: "QUOTATION", version: sql`${deals.version} + 1` })
        .where(and(eq(deals.id, existing.dealId), eq(deals.status, "CONTACTED")))
        .returning();
      if (advancedDeal) {
        // AUD-01: "deal updated/stage changed" is a required minimum event.
        await tx.insert(activities).values({
          organizationId: actor.organizationId,
          dealId: existing.dealId,
          entityType: "deal",
          eventType: "stage_changed",
          actorId: actor.userId,
          metadata: { fromStatus: "CONTACTED", toStatus: "QUOTATION", reason: "quotation_sent" },
          permissionCategory: "sales",
        });
      }
    }

    // AUD-01: "quotation ... SENT/ACCEPTED/REJECTED" is a required minimum
    // timeline event.
    const eventType = parsed.toStatus === "SENT" ? "sent" : parsed.toStatus === "ACCEPTED" ? "accepted" : "rejected";
    await tx.insert(activities).values({
      organizationId: actor.organizationId,
      dealId: existing.dealId,
      entityType: "quotation",
      eventType,
      actorId: actor.userId,
      metadata: { quotationId: updated.id, quotationNumber: updated.quotationNumber },
      permissionCategory: "sales",
    });

    return updated;
  });
}

/**
 * PDF-01/PDF-02/PDF-04: everything the PDF route needs, already resolved.
 * A plain read like getQuotation -- no transaction, since nothing is
 * written (QUO-08: "Download PDF sendiri tidak mengubah status", and by
 * extension, never freezes anything either).
 *
 * Seller/customer come from the frozen snapshot when one exists; a DRAFT
 * that has never been frozen has no snapshot to fall back to, so its PDF
 * reflects current master data instead, built fresh on every call and
 * never persisted here.
 */
export async function getQuotationForPdf(params: { headers: Headers; quotationId: string }) {
  const actor = await requirePermission({ headers: params.headers, permission: { quotation: ["read"] } });
  const quotation = await db.query.quotations.findFirst({
    where: and(eq(quotations.id, params.quotationId), eq(quotations.organizationId, actor.organizationId)),
  });
  if (!quotation) {
    throw new APIError("NOT_FOUND", { message: "Quotation not found" });
  }
  const items = await db.query.quotationItems.findMany({
    where: eq(quotationItems.quotationId, quotation.id),
    orderBy: (item, { asc }) => asc(item.sortOrder),
  });

  const snapshots =
    quotation.frozenAt !== null
      ? {
          seller: quotation.sellerSnapshot as QuotationSellerSnapshot,
          customer: quotation.customerSnapshot as QuotationCustomerSnapshot,
        }
      : await buildQuotationSnapshots(db, { organizationId: actor.organizationId, customerId: quotation.customerId });

  return { quotation, items, seller: snapshots.seller, customer: snapshots.customer };
}
