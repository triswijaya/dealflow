import { and, eq, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { activities, customers, deals, member } from "@/server/db/schema";
import { moneyAmountSchema } from "@/server/money/amount";

// DEAL-03: the only transitions the server accepts. WON/LOST are terminal,
// no outgoing edges.
const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  NEW: ["CONTACTED", "LOST"],
  CONTACTED: ["QUOTATION", "LOST"],
  QUOTATION: ["NEGOTIATION", "LOST"],
  NEGOTIATION: ["WON", "LOST"],
  WON: [],
  LOST: [],
};

// DEAL-05.
const LOST_REASONS = [
  "PRICE_TOO_HIGH",
  "LOST_TO_COMPETITOR",
  "NO_RESPONSE",
  "PROJECT_CANCELLED",
  "BUDGET_UNAVAILABLE",
  "OTHER",
] as const;

const transitionInputSchema = z.discriminatedUnion("toStatus", [
  z.object({ toStatus: z.literal("CONTACTED") }),
  z.object({ toStatus: z.literal("QUOTATION") }),
  z.object({ toStatus: z.literal("NEGOTIATION") }),
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

/**
 * DEAL-02: new deal always starts NEW. AUD-01/AUD-03: the "deal created"
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

    return created;
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

  if (parsed.assignedToId !== existing.assignedToId) {
    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new APIError("FORBIDDEN", { message: "Only an owner or admin can reassign a deal" });
    }
    await assertActiveAssignee(actor.organizationId, parsed.assignedToId);
  }

  if (parsed.customerId !== existing.customerId) {
    // DEAL-02: reassigning to a different customer is only locked once a
    // quotation exists; quotations don't exist yet (M2), so no lock check
    // here yet. Revisit this function when quotations land.
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

    return updated;
  });
}

/**
 * DEAL-03: only the transitions in VALID_TRANSITIONS are accepted; a
 * request for the deal's current status is an idempotent no-op (no error,
 * no new activity), not treated as invalid. DEAL-04: WON requires a
 * positive estimated value and freezes it into wonValue. DEAL-05: LOST
 * requires one of the fixed reasons. DATA-06/AUD-03: the status update and
 * the activity row are written in one transaction; a version conflict rolls
 * both back, never leaving an activity for a transition that didn't apply.
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
    return existing;
  }

  const allowedNext = VALID_TRANSITIONS[existing.status] ?? [];
  if (!allowedNext.includes(parsed.toStatus)) {
    throw new APIError("BAD_REQUEST", {
      message: `Cannot transition a deal from ${existing.status} to ${parsed.toStatus}`,
    });
  }

  const now = new Date();
  const statusFields: Record<string, unknown> = {
    status: parsed.toStatus,
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
  }

  if (parsed.toStatus === "LOST") {
    statusFields.lostAt = now;
    statusFields.lostReason = parsed.lostReason;
    statusFields.lostNote = parsed.lostNote;
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

    const eventType = parsed.toStatus === "WON" ? "won" : parsed.toStatus === "LOST" ? "lost" : "stage_changed";
    // AUD-01 ("simpan lost_at dan event alasan") / AUD-02: the reason is
    // part of the event, not just a column on the deal row. wonValue is
    // bigint, stringified for the same reason as updateDeal's metadata.
    const metadata: Record<string, unknown> = { fromStatus: existing.status, toStatus: parsed.toStatus };
    if (parsed.toStatus === "WON") {
      metadata.wonValue = existing.estimatedValue.toString();
    }
    if (parsed.toStatus === "LOST") {
      metadata.lostReason = parsed.lostReason;
      metadata.lostNote = parsed.lostNote;
    }
    await tx.insert(activities).values({
      organizationId: actor.organizationId,
      dealId: params.dealId,
      entityType: "deal",
      eventType,
      actorId: actor.userId,
      metadata,
      permissionCategory: "sales",
    });

    return updated;
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
  return deal;
}

export async function listDeals(params: { headers: Headers }) {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["read"] } });
  const scope =
    actor.role === "FINANCE"
      ? and(eq(deals.organizationId, actor.organizationId), eq(deals.status, "WON"))
      : eq(deals.organizationId, actor.organizationId);

  return db.query.deals.findMany({
    where: scope,
    orderBy: (deal, { desc }) => desc(deal.createdAt),
  });
}
