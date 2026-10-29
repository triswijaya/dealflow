import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { activities, deals, followUps } from "@/server/db/schema";
import { buildPaginatedDto, resolvePagination } from "@/server/shared/pagination";
import { organizationClock } from "@/server/shared/organization-clock";
import { toActiveFollowUpDto, toFollowUpDto } from "./dto";
import { followUpBucket } from "./follow-up-bucket";

const FOLLOW_UP_TYPES = ["CALL", "WHATSAPP", "EMAIL", "MEETING", "OTHER"] as const;

// FUP-01 field contract. Input is untrusted (API-01): only dealId/type/
// note/followUpAt/completedAt are accepted, never created_by/version/
// organization directly.
const createFollowUpInputSchema = z.object({
  dealId: z.string().uuid(),
  type: z.enum(FOLLOW_UP_TYPES),
  note: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null),
  followUpAt: z.coerce.date(),
  // FUP-01: completedAt may be set at creation time, to log an interaction
  // that has already happened rather than schedule a future one.
  completedAt: z.coerce.date().optional(),
});

// FUP-02: type and dealId are fixed at creation and never appear here.
// Full-replace semantics, same convention as customers.ts's updateCustomer:
// an omitted note clears it, followUpAt is always resupplied.
const updateFollowUpInputSchema = z.object({
  note: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null),
  followUpAt: z.coerce.date(),
});

// completeFollowUp is a narrow state-transition action, not a full-record
// edit -- an omitted note means "leave as is" (Drizzle's undefined-means-
// unchanged), unlike updateFollowUp's full-replace schema above.
const completeFollowUpInputSchema = z.object({
  completedAt: z.coerce.date().optional(),
  note: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null)),
});

// FUP-02: completedAt logs an interaction that already happened, so it may
// be in the past but never in the future. A minute of slack absorbs clock
// skew between the browser that picked the time and this server.
const COMPLETED_AT_SLACK_MS = 60_000;

function assertNotFuture(completedAt: Date) {
  if (completedAt.getTime() > Date.now() + COMPLETED_AT_SLACK_MS) {
    throw new APIError("BAD_REQUEST", { message: "Completed time cannot be in the future" });
  }
}

/**
 * FUP-01/FUP-04. dealId is validated against the same organization scope
 * every other create function uses; a deal that is already WON/LOST
 * refuses a brand-new follow-up, but this is a plain read, not a lock --
 * unlike DEAL-02's hasQuotation race, there is no money/data-integrity
 * invariant at stake here. The worst case of losing a race against a
 * concurrent WON/LOST transition is one reminder that FUP-04 itself
 * already tolerates existing on a now-closed deal ("record follow-up lama
 * tetap tersedia").
 */
export async function createFollowUp(params: { headers: Headers; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { followUp: ["write"] } });
  const parsed = createFollowUpInputSchema.parse(params.input);
  if (parsed.completedAt) assertNotFuture(parsed.completedAt);

  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, parsed.dealId), eq(deals.organizationId, actor.organizationId)),
  });
  if (!deal) {
    throw new APIError("NOT_FOUND", { message: "Deal not found" });
  }
  if (deal.status === "WON" || deal.status === "LOST") {
    throw new APIError("BAD_REQUEST", { message: "Cannot create a follow-up on a WON or LOST deal" });
  }

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(followUps)
      .values({
        organizationId: actor.organizationId,
        dealId: parsed.dealId,
        type: parsed.type,
        note: parsed.note,
        followUpAt: parsed.followUpAt,
        completedAt: parsed.completedAt ?? null,
        createdById: actor.userId,
      })
      .returning();

    // AUD-01: "follow-up created" is a required minimum timeline event.
    await tx.insert(activities).values({
      organizationId: actor.organizationId,
      dealId: parsed.dealId,
      entityType: "follow_up",
      eventType: "created",
      actorId: actor.userId,
      metadata: { followUpId: created.id, type: created.type, followUpAt: created.followUpAt.toISOString() },
      permissionCategory: "sales",
    });

    return toFollowUpDto(created);
  });
}

/**
 * TENANT-04: identical NOT_FOUND for missing vs. cross-tenant.
 *
 * FUP-02: note/schedule can change any time before completion; blocked
 * once completedAt is set. Deliberately NOT blocked by the deal's own
 * status (FUP-04 only rejects creating a brand-new follow-up on a
 * WON/LOST deal -- old records "tetap tersedia", so editing one that
 * pre-dates the deal closing is still allowed).
 *
 * An activity is only logged when followUpAt actually changes
 * ("rescheduled", AUD-01); a note-only edit is cosmetic and must not
 * reset deal inactivity (§11.2 explicitly excludes "edit note kosmetik").
 */
export async function updateFollowUp(params: {
  headers: Headers;
  followUpId: string;
  expectedVersion: number;
  input: unknown;
}) {
  const actor = await requirePermission({ headers: params.headers, permission: { followUp: ["write"] } });
  const parsed = updateFollowUpInputSchema.parse(params.input);

  const existing = await db.query.followUps.findFirst({
    where: and(eq(followUps.id, params.followUpId), eq(followUps.organizationId, actor.organizationId)),
  });
  if (!existing) {
    throw new APIError("NOT_FOUND", { message: "Follow-up not found" });
  }
  if (existing.completedAt !== null) {
    throw new APIError("BAD_REQUEST", { message: "Cannot edit a follow-up that is already completed" });
  }
  if (existing.cancelledAt !== null) {
    throw new APIError("BAD_REQUEST", { message: "Cannot edit a follow-up that was cancelled" });
  }

  const scheduleChanged = existing.followUpAt.getTime() !== parsed.followUpAt.getTime();

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(followUps)
      .set({
        note: parsed.note,
        followUpAt: parsed.followUpAt,
        updatedById: actor.userId,
        version: sql`${followUps.version} + 1`,
      })
      .where(
        and(
          eq(followUps.id, params.followUpId),
          eq(followUps.organizationId, actor.organizationId),
          eq(followUps.version, params.expectedVersion),
        ),
      )
      .returning();

    if (!updated) {
      // existing was found above under the same tenant scope, so reaching
      // here means the version check failed, not a missing/cross-tenant row.
      throw new APIError("CONFLICT", { message: "Follow-up was modified by someone else, reload and try again" });
    }

    if (scheduleChanged) {
      // AUD-01: "follow-up ... rescheduled" is a required minimum event.
      await tx.insert(activities).values({
        organizationId: actor.organizationId,
        dealId: existing.dealId,
        entityType: "follow_up",
        eventType: "rescheduled",
        actorId: actor.userId,
        metadata: {
          followUpId: updated.id,
          previousFollowUpAt: existing.followUpAt.toISOString(),
          newFollowUpAt: updated.followUpAt.toISOString(),
        },
        permissionCategory: "sales",
      });
    }

    return toFollowUpDto(updated);
  });
}

/**
 * FUP-02: completion is idempotent. Re-completing an already-completed
 * follow-up is a no-op that returns the existing row as-is, without
 * checking expectedVersion at all -- same precedent as transitionDeal's
 * same-status no-op in deals.ts.
 *
 * RISK-01/11.2: follow-up completed is the one follow-up event that counts
 * as the deal's "last meaningful activity" (created/rescheduled do not),
 * so this bumps deals.lastActivityAt. GREATEST, not a blind set: FUP-02
 * allows completedAt to log an interaction that already happened, and a
 * retroactively-backdated completion must never rewind the deal's activity
 * clock behind whatever more recent activity is already recorded there.
 */
export async function completeFollowUp(params: {
  headers: Headers;
  followUpId: string;
  expectedVersion: number;
  input: unknown;
}) {
  const actor = await requirePermission({ headers: params.headers, permission: { followUp: ["write"] } });
  const parsed = completeFollowUpInputSchema.parse(params.input);

  const existing = await db.query.followUps.findFirst({
    where: and(eq(followUps.id, params.followUpId), eq(followUps.organizationId, actor.organizationId)),
  });
  if (!existing) {
    throw new APIError("NOT_FOUND", { message: "Follow-up not found" });
  }
  if (existing.completedAt !== null) {
    return toFollowUpDto(existing);
  }
  if (existing.cancelledAt !== null) {
    throw new APIError("BAD_REQUEST", { message: "Cannot complete a follow-up that was cancelled" });
  }

  const completedAt = parsed.completedAt ?? new Date();
  assertNotFuture(completedAt);

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(followUps)
      .set({
        completedAt,
        ...(parsed.note !== undefined ? { note: parsed.note } : {}),
        updatedById: actor.userId,
        version: sql`${followUps.version} + 1`,
      })
      .where(
        and(
          eq(followUps.id, params.followUpId),
          eq(followUps.organizationId, actor.organizationId),
          eq(followUps.version, params.expectedVersion),
        ),
      )
      .returning();

    if (!updated) {
      throw new APIError("CONFLICT", { message: "Follow-up was modified by someone else, reload and try again" });
    }

    // AUD-01: "follow-up ... completed" is a required minimum event.
    await tx.insert(activities).values({
      organizationId: actor.organizationId,
      dealId: existing.dealId,
      entityType: "follow_up",
      eventType: "completed",
      actorId: actor.userId,
      metadata: { followUpId: updated.id, completedAt: completedAt.toISOString() },
      permissionCategory: "sales",
    });

    await tx
      .update(deals)
      .set({
        // A raw sql`` fragment bypasses Drizzle's normal column-value
        // mapping (which stringifies a Date for a timestamp column before
        // handing it to postgres.js), so completedAt has to be stringified
        // here -- interpolating the Date directly makes postgres.js's
        // encoder reject it once the ::timestamptz cast forces a strict type.
        lastActivityAt: sql`GREATEST(${deals.lastActivityAt}, ${completedAt.toISOString()}::timestamptz)`,
        version: sql`${deals.version} + 1`,
      })
      .where(eq(deals.id, existing.dealId));

    return toFollowUpDto(updated);
  });
}

export async function getFollowUp(params: { headers: Headers; followUpId: string }) {
  const actor = await requirePermission({ headers: params.headers, permission: { followUp: ["read"] } });
  const followUp = await db.query.followUps.findFirst({
    where: and(eq(followUps.id, params.followUpId), eq(followUps.organizationId, actor.organizationId)),
  });
  if (!followUp) {
    throw new APIError("NOT_FOUND", { message: "Follow-up not found" });
  }
  return toFollowUpDto(followUp);
}

/**
 * Plain list: every follow-up on the deal (or the whole org), oldest
 * schedule first, no bucket annotation -- for a deal-detail-style view
 * that shows history including completed ones.
 */
export async function listFollowUps(params: { headers: Headers; dealId?: string; page?: number; pageSize?: number }) {
  const actor = await requirePermission({ headers: params.headers, permission: { followUp: ["read"] } });
  const where = and(
    eq(followUps.organizationId, actor.organizationId),
    params.dealId ? eq(followUps.dealId, params.dealId) : undefined,
  );
  const { page, pageSize, limit, offset } = resolvePagination(params);

  const [rows, [{ count }]] = await Promise.all([
    db.query.followUps.findMany({
      where,
      // SEARCH-02: stable sort -- id as a tie-breaker.
      orderBy: (row, { asc: ascOp }) => [ascOp(row.followUpAt), ascOp(row.id)],
      limit,
      offset,
    }),
    db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(followUps).where(where),
  ]);
  return buildPaginatedDto(rows.map(toFollowUpDto), page, pageSize, count);
}

/**
 * FUP-03/FUP-04: incomplete follow-ups on active (non-WON/LOST) deals
 * only, each annotated with its TODAY/OVERDUE/UPCOMING bucket -- the
 * dashboard reminder view. A query-builder join against `deals` is used
 * here instead of the relational `with:` API deliberately: getQuotation
 * hit a real Drizzle bug where nested numeric(12,3) columns lost trailing
 * zeros under `with:` (not applicable to any column here, but the explicit
 * join keeps every read in this module on the same, already-verified path).
 */
export async function listActiveFollowUps(params: { headers: Headers; dealId?: string; page?: number; pageSize?: number }) {
  const actor = await requirePermission({ headers: params.headers, permission: { followUp: ["read"] } });
  const clock = await organizationClock(actor.organizationId);
  const { page, pageSize, limit, offset } = resolvePagination(params);

  const where = and(
    eq(followUps.organizationId, actor.organizationId),
    isNull(followUps.completedAt),
    isNull(followUps.cancelledAt),
    ne(deals.status, "WON"),
    ne(deals.status, "LOST"),
    params.dealId ? eq(followUps.dealId, params.dealId) : undefined,
  );
  const joinCondition = and(eq(followUps.organizationId, deals.organizationId), eq(followUps.dealId, deals.id));

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({ followUp: followUps })
      .from(followUps)
      .innerJoin(deals, joinCondition)
      .where(where)
      // SEARCH-02: stable sort -- id as a tie-breaker.
      .orderBy(asc(followUps.followUpAt), asc(followUps.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(followUps)
      .innerJoin(deals, joinCondition)
      .where(where),
  ]);

  return buildPaginatedDto(
    rows.map(({ followUp }) => toActiveFollowUpDto(followUp, followUpBucket(followUp.followUpAt, clock.timezone, clock.today))),
    page,
    pageSize,
    count,
  );
}
