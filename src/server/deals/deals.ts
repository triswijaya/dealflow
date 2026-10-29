import { and, eq, isNull, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { activities, customers, deals, followUps, member } from "@/server/db/schema";
import { moneyAmountSchema } from "@/server/money/amount";
import { organizationClock } from "@/server/shared/organization-clock";
import { buildPaginatedDto, resolvePagination } from "@/server/shared/pagination";
import { toDealDto } from "./dto";
import { ACTIVE_STAGES, LOST_REASONS, stageNeedsValue } from "./stages";

const transitionInputSchema = z.discriminatedUnion("toStatus", [
  // DEAL-03: any active stage, in any direction. The note says why (optional).
  z.object({
    toStatus: z.enum(ACTIVE_STAGES),
    note: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .or(z.literal(""))
      .transform((value) => value || null),
  }),
  z.object({ toStatus: z.literal("WON") }),
  z.object({
    toStatus: z.literal("LOST"),
    lostReason: z.enum(LOST_REASONS),
    lostNote: z
      .string()
      .trim()
      .max(5000)
      .optional()
      .or(z.literal(""))
      .transform((value) => value || null),
  }),
]);

// DEAL-01 field contract, shared by create and update (they differ only on
// whether assignedToId is required, see below).
const dealFieldsSchema = {
  customerId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  description: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .transform((value) => value ?? ""),
  // null (not undefined) on empty/missing: Drizzle's .set() treats an
  // undefined value as "leave this column alone", so clearing a
  // previously-set value via updateDeal requires an explicit null, not a
  // value that gets silently skipped.
  notes: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null),
  estimatedValue: moneyAmountSchema,
  expectedCloseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected close date must be YYYY-MM-DD")
    .optional()
    .transform((value) => value ?? null),
};

const dealCreateInputSchema = z.object({
  ...dealFieldsSchema,
  // DEAL-02: PROSPECT unless the sale is already further along (e.g. a repeat order).
  stage: z.enum(ACTIVE_STAGES).default("PROSPECT"),
  // §6.2: Sales defaults to themselves if omitted; Owner/Admin must choose
  // explicitly (there's no sensible default for them).
  assignedToId: z.string().min(1).optional(),
});

const dealUpdateInputSchema = z.object({
  ...dealFieldsSchema,
  assignedToId: z.string().min(1),
});

// RBAC-03: assigned sales must be an active member of the same org with
// role Sales, Owner, or Admin. Not expressible as a database FK (role and
// active status are both mutable independent of the deal row), so this is
// checked here on every write that sets or changes the assignment.
async function assertActiveAssignee(organizationId: string, userId: string) {
  const membership = await db.query.member.findFirst({
    where: and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
  });
  if (!membership || membership.deactivatedAt) {
    throw new APIError("BAD_REQUEST", { message: "Assignee must be an active member of this organization" });
  }
  if (membership.role !== "SALES" && membership.role !== "OWNER" && membership.role !== "ADMIN") {
    throw new APIError("BAD_REQUEST", { message: "Assignee must have the Sales, Owner, or Admin role" });
  }
}

async function assertCustomerInOrganization(organizationId: string, customerId: string) {
  const customer = await db.query.customers.findFirst({
    where: and(eq(customers.id, customerId), eq(customers.organizationId, organizationId)),
  });
  if (!customer) {
    throw new APIError("BAD_REQUEST", { message: "Customer not found in this organization" });
  }
}

// §7.3 "Data wajib": the same rule the deals_stageValue_chk constraint enforces,
// raised here first so the caller gets a message instead of a constraint error.
function assertStageValue(stage: string, estimatedValue: bigint) {
  if (stageNeedsValue(stage) && estimatedValue <= 0n) {
    throw new APIError("BAD_REQUEST", { message: `Estimated value must be positive for a deal in ${stage}` });
  }
}

/**
 * DEAL-02: a new deal starts at PROSPECT unless a later active stage is
 * chosen, which then needs a positive value (§7.3). AUD-01/AUD-03: the "deal created"
 * activity is written in the same transaction as the insert, not as a
 * best-effort side effect after the fact.
 */
export async function createDeal(params: { headers: Headers; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["write"] } });
  const parsed = dealCreateInputSchema.parse(params.input);

  let assignedToId = parsed.assignedToId;
  if (!assignedToId) {
    if (actor.role !== "SALES") {
      throw new APIError("BAD_REQUEST", { message: "assignedToId is required" });
    }
    assignedToId = actor.userId;
  } else if (actor.role === "SALES" && assignedToId !== actor.userId) {
    // §6.2: Sales creating a deal can only assign it to themselves, never
    // explicitly hand it to someone else -- the omitted-defaults-to-self
    // path above isn't the only way this could have been set.
    throw new APIError("FORBIDDEN", { message: "Sales can only assign a new deal to themselves" });
  }
  assertStageValue(parsed.stage, parsed.estimatedValue);
  await assertActiveAssignee(actor.organizationId, assignedToId);
  await assertCustomerInOrganization(actor.organizationId, parsed.customerId);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(deals)
      .values({
        organizationId: actor.organizationId,
        customerId: parsed.customerId,
        title: parsed.title,
        description: parsed.description,
        notes: parsed.notes,
        estimatedValue: parsed.estimatedValue,
        status: parsed.stage,
        assignedToId,
        expectedCloseDate: parsed.expectedCloseDate,
        createdById: actor.userId,
      })
      .returning();

    await tx.insert(activities).values({
      organizationId: actor.organizationId,
      dealId: created.id,
      entityType: "deal",
      eventType: "created",
      actorId: actor.userId,
      metadata: { status: created.status },
      permissionCategory: "sales",
    });

    return toDealDto(created);
  });
}

/**
 * Non-status fields only (title/description/notes/estimatedValue/
 * expectedCloseDate/customerId). DATA-07: expectedVersion must match the
 * row's current version or this throws CONFLICT, distinct from NOT_FOUND,
 * so a caller can tell "reload, someone else edited this" apart from
 * "this deal doesn't exist" (TENANT-04 also relies on that same NOT_FOUND
 * shape for the cross-tenant case).
 *
 * §6.2: reassignment (changing assignedToId) is Owner/Admin only, even
 * though Sales otherwise has deal.write -- checked here, not by the
 * permission gate, since ac/roles can't express "this field, but only
 * sometimes."
 */
export async function updateDeal(params: {
  headers: Headers;
  dealId: string;
  expectedVersion: number;
  input: unknown;
}) {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["write"] } });
  const parsed = dealUpdateInputSchema.parse(params.input);

  const existing = await db.query.deals.findFirst({
    where: and(eq(deals.id, params.dealId), eq(deals.organizationId, actor.organizationId)),
  });
  if (!existing) {
    throw new APIError("NOT_FOUND", { message: "Deal not found" });
  }

  // DEAL-06: a terminal deal is fully locked to general edits, not just its
  // value/customer/assignment fields. Adding further context to a closed
  // deal is a different, not-yet-built feature (an activity note), not this
  // function.
  if (existing.status === "WON" || existing.status === "LOST") {
    throw new APIError("BAD_REQUEST", { message: "A won or lost deal cannot be edited" });
  }

  assertStageValue(existing.status, parsed.estimatedValue);

  if (parsed.assignedToId !== existing.assignedToId) {
    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new APIError("FORBIDDEN", { message: "Only an owner or admin can reassign a deal" });
    }
    await assertActiveAssignee(actor.organizationId, parsed.assignedToId);
  }

  if (parsed.customerId !== existing.customerId) {
    // DEAL-02: once a quotation exists, the deal's customer is locked.
    // hasQuotation is set inside createQuotation's own transaction, in the
    // same statement that also bumps `version`, so a customerId change
    // racing a concurrent createQuotation is caught by the version check
    // below, not by this flag alone -- see the hasQuotation column comment
    // in schema.ts for the full race argument.
    if (existing.hasQuotation) {
      throw new APIError("BAD_REQUEST", { message: "Cannot change the customer once a quotation exists" });
    }
    await assertCustomerInOrganization(actor.organizationId, parsed.customerId);
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(deals)
      .set({
        customerId: parsed.customerId,
        title: parsed.title,
        description: parsed.description,
        notes: parsed.notes,
        estimatedValue: parsed.estimatedValue,
        assignedToId: parsed.assignedToId,
        expectedCloseDate: parsed.expectedCloseDate,
        updatedById: actor.userId,
        version: sql`${deals.version} + 1`,
      })
      .where(
        and(
          eq(deals.id, params.dealId),
          eq(deals.organizationId, actor.organizationId),
          eq(deals.version, params.expectedVersion),
        ),
      )
      .returning();

    if (!updated) {
      // existing was found above with the same tenant scope, so reaching
      // here means the version check failed, not a missing/cross-tenant row.
      throw new APIError("CONFLICT", { message: "Deal was modified by someone else, reload and try again" });
    }

    // AUD-01: "deal updated" is a required minimum event, not just stage
    // changes. estimatedValue is bigint and jsonb can't serialize that
    // directly (JSON.stringify throws on a raw BigInt), so it's stringified
    // before going into metadata.
    await tx.insert(activities).values({
      organizationId: actor.organizationId,
      dealId: params.dealId,
      entityType: "deal",
      eventType: "updated",
      actorId: actor.userId,
      metadata: {
        before: {
          title: existing.title,
          estimatedValue: existing.estimatedValue.toString(),
          customerId: existing.customerId,
          assignedToId: existing.assignedToId,
        },
        after: {
          title: parsed.title,
          estimatedValue: parsed.estimatedValue.toString(),
          customerId: parsed.customerId,
          assignedToId: parsed.assignedToId,
        },
      },
      permissionCategory: "sales",
    });

    return toDealDto(updated);
  });
}

/**
 * DEAL-03: an active deal moves to any other active stage, forward, skipping
 * or back; the target stage's required data applies. WON and LOST can be
 * reached from any active stage and have no way out here (reopen comes
 * later). A request for the current status is an idempotent no-op (no
 * error, no new activity). DEAL-04: WON requires a positive estimated value
 * and freezes it into wonValue. DEAL-05: LOST requires one of the fixed
 * reasons. DATA-06/AUD-03: the status update and the activity row are
 * written in one transaction; a version conflict rolls both back, never
 * leaving an activity for a transition that didn't apply.
 */
export async function transitionDeal(params: {
  headers: Headers;
  dealId: string;
  expectedVersion: number;
  input: unknown;
}) {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["transition"] } });
  const parsed = transitionInputSchema.parse(params.input);

  const existing = await db.query.deals.findFirst({
    where: and(eq(deals.id, params.dealId), eq(deals.organizationId, actor.organizationId)),
  });
  if (!existing) {
    throw new APIError("NOT_FOUND", { message: "Deal not found" });
  }

  if (existing.status === parsed.toStatus) {
    return toDealDto(existing);
  }

  if (existing.status === "WON" || existing.status === "LOST") {
    throw new APIError("BAD_REQUEST", {
      message: `Cannot transition a deal from ${existing.status} to ${parsed.toStatus}`,
    });
  }

  // DEAL-03: a deal on hold stays where it is until resumed; closing it is still allowed.
  if (existing.onHoldUntil && parsed.toStatus !== "WON" && parsed.toStatus !== "LOST") {
    throw new APIError("BAD_REQUEST", { message: "The deal is on hold, resume it before changing its stage" });
  }

  const now = new Date();
  const statusFields: Record<string, unknown> = {
    status: parsed.toStatus,
    onHoldUntil: null,
    onHoldReason: null,
    stageEnteredAt: now,
    lastActivityAt: now,
    updatedById: actor.userId,
    version: sql`${deals.version} + 1`,
  };

  if (parsed.toStatus === "WON") {
    if (existing.estimatedValue <= 0n) {
      throw new APIError("BAD_REQUEST", { message: "Estimated value must be positive to mark a deal WON" });
    }
    statusFields.wonAt = now;
    statusFields.wonValue = existing.estimatedValue;
  } else if (parsed.toStatus === "LOST") {
    statusFields.lostAt = now;
    statusFields.lostReason = parsed.lostReason;
    statusFields.lostNote = parsed.lostNote;
  } else {
    assertStageValue(parsed.toStatus, existing.estimatedValue);
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(deals)
      .set(statusFields)
      .where(
        and(
          eq(deals.id, params.dealId),
          eq(deals.organizationId, actor.organizationId),
          eq(deals.version, params.expectedVersion),
        ),
      )
      .returning();

    if (!updated) {
      throw new APIError("CONFLICT", { message: "Deal was modified by someone else, reload and try again" });
    }

    // FUP-04: closing the deal cancels its open tasks in the same transaction.
    const cancelled =
      parsed.toStatus === "WON" || parsed.toStatus === "LOST"
        ? await tx
            .update(followUps)
            .set({ cancelledAt: now, updatedById: actor.userId, version: sql`${followUps.version} + 1` })
            .where(
              and(
                eq(followUps.organizationId, actor.organizationId),
                eq(followUps.dealId, params.dealId),
                isNull(followUps.completedAt),
                isNull(followUps.cancelledAt),
              ),
            )
            .returning({ id: followUps.id })
        : [];

    const eventType = parsed.toStatus === "WON" ? "won" : parsed.toStatus === "LOST" ? "lost" : "stage_changed";
    // AUD-01 ("simpan lost_at dan event alasan") / AUD-02: the reason is
    // part of the event, not just a column on the deal row. wonValue is
    // bigint, stringified for the same reason as updateDeal's metadata.
    const metadata: Record<string, unknown> = { fromStatus: existing.status, toStatus: parsed.toStatus };
    if (parsed.toStatus === "WON") {
      metadata.wonValue = existing.estimatedValue.toString();
    } else if (parsed.toStatus === "LOST") {
      metadata.lostReason = parsed.lostReason;
      metadata.lostNote = parsed.lostNote;
    } else if (parsed.note) {
      metadata.note = parsed.note;
    }
    if (cancelled.length > 0) metadata.cancelledTasks = cancelled.length;
    await tx.insert(activities).values({
      organizationId: actor.organizationId,
      dealId: params.dealId,
      entityType: "deal",
      eventType,
      actorId: actor.userId,
      metadata,
      permissionCategory: "sales",
    });

    return toDealDto(updated);
  });
}

const reasonSchema = z.string().trim().min(1, "A reason is required").max(1000);

const onHoldInputSchema = z.object({
  reason: reasonSchema,
  reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Review date must be YYYY-MM-DD"),
});

const reopenInputSchema = z.object({
  toStatus: z.enum(ACTIVE_STAGES),
  reason: reasonSchema,
});

async function findDealForUpdate(organizationId: string, dealId: string) {
  const existing = await db.query.deals.findFirst({
    where: and(eq(deals.id, dealId), eq(deals.organizationId, organizationId)),
  });
  if (!existing) {
    throw new APIError("NOT_FOUND", { message: "Deal not found" });
  }
  return existing;
}

/** Guarded UPDATE + activity in one transaction, shared by the on hold, resume and reopen operations. */
async function applyDealChange(params: {
  actor: { userId: string; organizationId: string };
  existing: typeof deals.$inferSelect;
  expectedVersion: number;
  fields: Partial<typeof deals.$inferInsert>;
  eventType: string;
  metadata: Record<string, unknown>;
}) {
  const { actor, existing } = params;
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(deals)
      .set({
        ...params.fields,
        lastActivityAt: new Date(),
        updatedById: actor.userId,
        version: sql`${deals.version} + 1`,
      })
      .where(
        and(eq(deals.id, existing.id), eq(deals.organizationId, actor.organizationId), eq(deals.version, params.expectedVersion)),
      )
      .returning();
    if (!updated) {
      throw new APIError("CONFLICT", { message: "Deal was modified by someone else, reload and try again" });
    }
    await tx.insert(activities).values({
      organizationId: actor.organizationId,
      dealId: existing.id,
      entityType: "deal",
      eventType: params.eventType,
      actorId: actor.userId,
      metadata: params.metadata,
      permissionCategory: "sales",
    });
    return toDealDto(updated);
  });
}

/**
 * DEAL-03: an open deal can be put on hold with a reason and a review date
 * (today or later, in the organization's calendar). The stage does not
 * change. Calling it again on a deal already on hold replaces the reason and
 * date, which is how a hold is extended.
 */
export async function putDealOnHold(params: { headers: Headers; dealId: string; expectedVersion: number; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["transition"] } });
  const parsed = onHoldInputSchema.parse(params.input);
  const existing = await findDealForUpdate(actor.organizationId, params.dealId);

  if (existing.status === "WON" || existing.status === "LOST") {
    throw new APIError("BAD_REQUEST", { message: "Only an open deal can be put on hold" });
  }
  const { today } = await organizationClock(actor.organizationId);
  if (parsed.reviewDate < today) {
    throw new APIError("BAD_REQUEST", { message: "The review date cannot be in the past" });
  }

  return applyDealChange({
    actor,
    existing,
    expectedVersion: params.expectedVersion,
    fields: { onHoldUntil: parsed.reviewDate, onHoldReason: parsed.reason },
    eventType: "on_hold",
    metadata: {
      stage: existing.status,
      reason: parsed.reason,
      reviewDate: parsed.reviewDate,
      ...(existing.onHoldUntil ? { previousReviewDate: existing.onHoldUntil } : {}),
    },
  });
}

/** DEAL-03: resume clears the hold and leaves the stage as it was. A deal that is not on hold is returned unchanged. */
export async function resumeDeal(params: { headers: Headers; dealId: string; expectedVersion: number }) {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["transition"] } });
  const existing = await findDealForUpdate(actor.organizationId, params.dealId);
  if (!existing.onHoldUntil) {
    return toDealDto(existing);
  }

  return applyDealChange({
    actor,
    existing,
    expectedVersion: params.expectedVersion,
    fields: { onHoldUntil: null, onHoldReason: null },
    eventType: "resumed",
    metadata: { stage: existing.status, previousReviewDate: existing.onHoldUntil },
  });
}

/**
 * DEAL-03: a LOST deal returns to the active stage of the caller's choice,
 * with a reason. Owner and Admin can reopen any deal, Sales only their own.
 * The lost fields are cleared on the deal; the lost event stays in the
 * timeline and the previous reason is copied into the reopen event.
 */
export async function reopenDeal(params: { headers: Headers; dealId: string; expectedVersion: number; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["transition"] } });
  const parsed = reopenInputSchema.parse(params.input);
  const existing = await findDealForUpdate(actor.organizationId, params.dealId);

  if (existing.status !== "LOST") {
    throw new APIError("BAD_REQUEST", { message: "Only a lost deal can be reopened" });
  }
  if (actor.role === "SALES" && existing.assignedToId !== actor.userId) {
    throw new APIError("FORBIDDEN", { message: "Only an owner, an admin or the assigned sales can reopen this deal" });
  }
  assertStageValue(parsed.toStatus, existing.estimatedValue);

  return applyDealChange({
    actor,
    existing,
    expectedVersion: params.expectedVersion,
    fields: { status: parsed.toStatus, stageEnteredAt: new Date(), lostAt: null, lostReason: null, lostNote: null },
    eventType: "reopened",
    metadata: {
      fromStatus: "LOST",
      toStatus: parsed.toStatus,
      reason: parsed.reason,
      previousLostReason: existing.lostReason,
    },
  });
}

/**
 * §6.2: Finance can only read WON deals. A non-WON deal gets the identical
 * NOT_FOUND a cross-tenant or nonexistent deal would, not a message
 * revealing an active deal exists (AUD-04's "hidden from Sales" pattern
 * applied to Finance's narrower deal visibility).
 */
export async function getDeal(params: { headers: Headers; dealId: string }) {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["read"] } });
  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, params.dealId), eq(deals.organizationId, actor.organizationId)),
  });
  if (!deal || (actor.role === "FINANCE" && deal.status !== "WON")) {
    throw new APIError("NOT_FOUND", { message: "Deal not found" });
  }
  return toDealDto(deal);
}

export async function listDeals(params: { headers: Headers; page?: number; pageSize?: number }) {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["read"] } });
  const scope =
    actor.role === "FINANCE"
      ? and(eq(deals.organizationId, actor.organizationId), eq(deals.status, "WON"))
      : eq(deals.organizationId, actor.organizationId);
  const { page, pageSize, limit, offset } = resolvePagination(params);

  const [rows, [{ count }]] = await Promise.all([
    db.query.deals.findMany({
      where: scope,
      // SEARCH-02: stable sort -- id as a tie-breaker.
      orderBy: (deal, { desc }) => [desc(deal.createdAt), desc(deal.id)],
      limit,
      offset,
    }),
    db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(deals).where(scope),
  ]);

  return buildPaginatedDto(rows.map(toDealDto), page, pageSize, count);
}
