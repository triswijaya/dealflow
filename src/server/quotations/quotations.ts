import { and, eq, gte, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { activities, deals, idempotencyRecords, quotationItems, quotations } from "@/server/db/schema";
import { type CalculationErrorCode, calculateDocumentTotals } from "@/server/money/calculation";
import { formatQuantityScaled } from "@/server/money/quantity";
import { MAX_DOCUMENT_ITEMS, documentItemSchema, optionalMoneyAmountSchema } from "@/server/shared/document-items";
import {
  type CustomerSnapshot,
  type SellerSnapshot,
  buildDocumentSnapshots,
} from "@/server/shared/document-snapshots";
import { organizationYear } from "@/server/shared/organization-date";
import { organizationClock } from "@/server/shared/organization-clock";
import { claimNextSequence, formatQuotationNumber, formatRevisionNumber } from "./document-number";
import { effectiveQuotationStatus } from "./effective-status";

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
  items: z.array(documentItemSchema).min(1).max(MAX_DOCUMENT_ITEMS),
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
    //
    // RISK-01/11.2: "quotation created" is meaningful activity every time,
    // not only for the deal's first quotation, so lastActivityAt always
    // advances here even when hasQuotation was already true.
    await tx
      .update(deals)
      .set({
        ...(deal.hasQuotation ? {} : { hasQuotation: true }),
        lastActivityAt: clock.now,
        version: sql`${deals.version} + 1`,
      })
      .where(eq(deals.id, deal.id));

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
    // latest version." Lock the ORIGINAL row alone first -- a stable
    // identity (revisionNumber 1 always exists and never changes) -- as a
    // mutex for the whole family, rather than locking the family set
    // directly in one query. SELECT ... FOR UPDATE only locks/returns rows
    // matching its WHERE clause as of when the statement began: a single
    // query locking the whole family can miss a revision a concurrent
    // reviser inserts and commits while this transaction sits blocked
    // waiting on the lock, because that new row was never in this
    // statement's candidate set and stays invisible even after unblocking
    // (proven by two racing revisions leaving the loser's `family` one row
    // short, with no isLatest row in it at all). Re-reading the whole
    // family fresh in a second statement, after the mutex is held, gets a
    // new snapshot under READ COMMITTED that is guaranteed to include
    // anything committed before this point.
    await tx
      .select({ id: quotations.id })
      .from(quotations)
      .where(
        and(
          eq(quotations.familyId, sourceLookup.familyId),
          eq(quotations.organizationId, actor.organizationId),
          eq(quotations.revisionNumber, 1),
        ),
      )
      .for("update");

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
      const snapshots = await buildDocumentSnapshots(tx, {
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

    // RISK-01/11.2: "quotation ... direvisi" is meaningful activity.
    const now = new Date();
    await tx
      .update(deals)
      .set({ lastActivityAt: now, version: sql`${deals.version} + 1` })
      .where(eq(deals.id, source.dealId));

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
        const snapshots = await buildDocumentSnapshots(tx, {
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
    //
    // RISK-01/11.2: SENT/ACCEPTED/REJECTED are all meaningful activity
    // regardless of whether the stage itself also advances, so
    // lastActivityAt/version bump on every branch below; the stage-change
    // case folds that into its own guarded UPDATE instead of writing twice.
    if (parsed.toStatus === "SENT") {
      const [advancedDeal] = await tx
        .update(deals)
        .set({ status: "QUOTATION", lastActivityAt: now, version: sql`${deals.version} + 1` })
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
      } else {
        await tx
          .update(deals)
          .set({ lastActivityAt: now, version: sql`${deals.version} + 1` })
          .where(eq(deals.id, existing.dealId));
      }
    } else {
      await tx
        .update(deals)
        .set({ lastActivityAt: now, version: sql`${deals.version} + 1` })
        .where(eq(deals.id, existing.dealId));
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
          seller: quotation.sellerSnapshot as SellerSnapshot,
          customer: quotation.customerSnapshot as CustomerSnapshot,
        }
      : await buildDocumentSnapshots(db, { organizationId: actor.organizationId, customerId: quotation.customerId });

  return { quotation, items, seller: snapshots.seller, customer: snapshots.customer };
}
