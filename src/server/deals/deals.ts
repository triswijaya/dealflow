import { and, eq, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { customers, deals, member } from "@/server/db/schema";
import { moneyAmountSchema } from "@/server/money/amount";

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
 * DEAL-02: new deal always starts NEW; status transitions are a separate
 * function (a later commit), not settable here.
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
  }
  await assertActiveAssignee(actor.organizationId, assignedToId);
  await assertCustomerInOrganization(actor.organizationId, parsed.customerId);

  const [created] = await db
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
  return created;
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

  const [updated] = await db
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
  return updated;
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
