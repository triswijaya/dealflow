import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { activities, customers, deals, followUps, member, user } from "@/server/db/schema";
import { toIsoDto, toMoneyDto } from "@/server/shared/dto";
import { organizationClock } from "@/server/shared/organization-clock";
import { buildPaginatedDto, resolvePagination } from "@/server/shared/pagination";
import { organizationDateString } from "@/server/shared/organization-date";
import { dealSignals, type DealSignal } from "./deal-health";
import { ACTIVE_STAGES, DEAL_STATUSES } from "./stages";

// Read models for the deal screens. Mutations stay in deals.ts; this file
// only joins what a screen needs (customer and people names, follow-up
// flags, stage history) so a page never has to stitch rows together.

const ALL_STAGES = DEAL_STATUSES;
export const PIPELINE_COLUMN_LIMIT = 10;
const ACTIVITY_LIMIT = 100;

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const filterSchema = z.object({
  query: z.string().trim().max(200).optional(),
  status: z.enum(ALL_STAGES).optional(),
  assignedToId: z.string().min(1).max(100).optional(),
  customerId: z.string().uuid().optional(),
  createdFrom: dateOnly.optional(),
  createdTo: dateOnly.optional(),
});

export type DealFilters = z.input<typeof filterSchema>;

const SORTS = ["createdAt", "estimatedValue", "expectedCloseDate", "lastActivityAt"] as const;
export type DealSort = (typeof SORTS)[number];

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * FILTER-01: status, assigned sales, customer and a created-date range, all
 * combinable. The range is inclusive of both days in the organization's own
 * calendar (DATA-04), expressed as [from 00:00, to+1 00:00) in its timezone,
 * and an inverted range is rejected instead of silently returning nothing.
 */
function filterConditions(filters: z.output<typeof filterSchema>, timezone: string): SQL[] {
  const conditions: SQL[] = [];
  if (filters.query) {
    const pattern = `%${escapeLike(filters.query)}%`;
    const match = or(ilike(deals.title, pattern), ilike(customers.companyName, pattern));
    if (match) conditions.push(match);
  }
  if (filters.status) conditions.push(eq(deals.status, filters.status));
  if (filters.assignedToId) conditions.push(eq(deals.assignedToId, filters.assignedToId));
  if (filters.customerId) conditions.push(eq(deals.customerId, filters.customerId));
  if (filters.createdFrom && filters.createdTo && filters.createdFrom > filters.createdTo) {
    throw new APIError("BAD_REQUEST", { message: "Invalid date range: createdFrom is after createdTo" });
  }
  if (filters.createdFrom) {
    conditions.push(sql`${deals.createdAt} >= (${filters.createdFrom}::date)::timestamp AT TIME ZONE ${timezone}`);
  }
  if (filters.createdTo) {
    conditions.push(sql`${deals.createdAt} < ((${filters.createdTo}::date + 1)::timestamp AT TIME ZONE ${timezone})`);
  }
  return conditions;
}

const assignee = alias(user, "assignee");

export type DealRowDto = {
  id: string;
  title: string;
  status: string;
  estimatedValue: string;
  wonValue: string | null;
  customerId: string;
  customerName: string;
  assignedToId: string;
  assignedToName: string;
  expectedCloseDate: string | null;
  lastActivityAt: string;
  createdAt: string;
  onHoldUntil: string | null;
  hasQuotation: boolean;
  version: number;
};

function toRow(row: {
  deal: typeof deals.$inferSelect;
  customerName: string;
  assignedToName: string;
}): DealRowDto {
  const { deal } = row;
  return {
    id: deal.id,
    title: deal.title,
    status: deal.status,
    estimatedValue: toMoneyDto(deal.estimatedValue),
    wonValue: deal.wonValue !== null ? toMoneyDto(deal.wonValue) : null,
    customerId: deal.customerId,
    customerName: row.customerName,
    assignedToId: deal.assignedToId,
    assignedToName: row.assignedToName,
    expectedCloseDate: deal.expectedCloseDate,
    lastActivityAt: toIsoDto(deal.lastActivityAt),
    createdAt: toIsoDto(deal.createdAt),
    onHoldUntil: deal.onHoldUntil,
    hasQuotation: deal.hasQuotation,
    version: deal.version,
  };
}

/** §6.2: Finance can only ever see WON deals, in every read below. */
function scope(role: string, organizationId: string): SQL {
  const base = eq(deals.organizationId, organizationId);
  return role === "FINANCE" ? and(base, eq(deals.status, "WON"))! : base;
}

export async function listDealRows(params: {
  headers: Headers;
  page?: number;
  pageSize?: number;
  sort?: DealSort;
  direction?: "asc" | "desc";
  filters?: DealFilters;
}) {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["read"] } });
  const { page, pageSize, limit, offset } = resolvePagination(params);
  const sort = z.enum(SORTS).default("createdAt").parse(params.sort);
  const direction = z.enum(["asc", "desc"]).default("desc").parse(params.direction);
  const { timezone } = await organizationClock(actor.organizationId);
  const filters = filterSchema.parse(params.filters ?? {});
  const where = and(scope(actor.role, actor.organizationId), ...filterConditions(filters, timezone));

  const column = { createdAt: deals.createdAt, estimatedValue: deals.estimatedValue, expectedCloseDate: deals.expectedCloseDate, lastActivityAt: deals.lastActivityAt }[sort];
  const order = direction === "asc" ? asc(column) : desc(column);

  const base = () =>
    db
      .select({ deal: deals, customerName: customers.companyName, assignedToName: assignee.name })
      .from(deals)
      .innerJoin(customers, and(eq(customers.id, deals.customerId), eq(customers.organizationId, deals.organizationId)))
      .innerJoin(assignee, eq(assignee.id, deals.assignedToId))
      .where(where);

  const [rows, [{ count }]] = await Promise.all([
    // SEARCH-02: stable sort. A null target-closing date always sorts last
    // and the id breaks every remaining tie so pages never reorder.
    base()
      .orderBy(sort === "expectedCloseDate" ? sql`${order} nulls last` : order, desc(deals.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(deals)
      .innerJoin(customers, and(eq(customers.id, deals.customerId), eq(customers.organizationId, deals.organizationId)))
      .where(where),
  ]);
  return buildPaginatedDto(rows.map(toRow), page, pageSize, count);
}

// ---------------------------------------------------------------------------
// Pipeline board

export type PipelineCardDto = {
  id: string;
  title: string;
  status: string;
  estimatedValue: string;
  customerName: string;
  assignedToId: string;
  assignedToName: string;
  lastActivityAt: string;
  hasQuotation: boolean;
  followUpOverdue: boolean;
  /** DEAL-09: computed when read. */
  signals: DealSignal[];
  version: number;
};

export type PipelineStageDto = {
  status: (typeof ACTIVE_STAGES)[number];
  count: number;
  totalValue: string;
  items: PipelineCardDto[];
};

type Clock = { timezone: string; today: string };

/** Open tasks of a deal, and how many of them are dated before the organization's today (FUP-03). */
function taskCounts(organizationId: string, timezone: string) {
  const open = sql`${followUps.dealId} = ${deals.id} and ${followUps.organizationId} = ${organizationId} and ${followUps.completedAt} is null and ${followUps.cancelledAt} is null`;
  const openTasks = sql<number>`(select count(*)::int from ${followUps} where ${open})`.mapWith(Number);
  const overdueTasks = sql<number>`(select count(*)::int from ${followUps} where ${open} and ${followUps.followUpAt} < (date_trunc('day', now() AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone}))`.mapWith(Number);
  return { openTasks, overdueTasks };
}

function signalsOf(deal: typeof deals.$inferSelect, counts: { openTasks: number; overdueTasks: number }, clock: Clock): DealSignal[] {
  return dealSignals({
    status: deal.status,
    onHoldUntil: deal.onHoldUntil,
    stageEnteredOn: organizationDateString(clock.timezone, deal.stageEnteredAt),
    expectedCloseDate: deal.expectedCloseDate,
    ...counts,
    today: clock.today,
  });
}

function cardQuery(organizationId: string, timezone: string, where: SQL | undefined) {
  return db
    .select({ deal: deals, customerName: customers.companyName, assignedToName: assignee.name, ...taskCounts(organizationId, timezone) })
    .from(deals)
    .innerJoin(customers, and(eq(customers.id, deals.customerId), eq(customers.organizationId, deals.organizationId)))
    .innerJoin(assignee, eq(assignee.id, deals.assignedToId))
    .where(where);
}

function toCard(row: Awaited<ReturnType<typeof cardQuery>>[number], clock: Clock): PipelineCardDto {
  return {
    id: row.deal.id,
    title: row.deal.title,
    status: row.deal.status,
    estimatedValue: toMoneyDto(row.deal.estimatedValue),
    customerName: row.customerName,
    assignedToId: row.deal.assignedToId,
    assignedToName: row.assignedToName,
    lastActivityAt: toIsoDto(row.deal.lastActivityAt),
    hasQuotation: row.deal.hasQuotation,
    followUpOverdue: row.overdueTasks > 0,
    signals: signalsOf(row.deal, row, clock),
    version: row.deal.version,
  };
}

async function pipelineActor(headers: Headers) {
  const actor = await requirePermission({ headers, permission: { deal: ["read"] } });
  if (actor.role === "FINANCE") {
    // The board is a sales tool; Finance's only deal view is the won list.
    throw new APIError("FORBIDDEN", { message: "Insufficient permission" });
  }
  return actor;
}

/**
 * P-01: the four active stages (deals on hold are not on the board, DEAL-07), each with its total count and value and the
 * first PIPELINE_COLUMN_LIMIT cards, most recently active first. Counts and
 * values come from the whole stage, not from the visible cards.
 */
export async function getPipelineBoard(params: { headers: Headers; filters?: Omit<DealFilters, "status" | "createdFrom" | "createdTo"> }) {
  const actor = await pipelineActor(params.headers);
  const clock = await organizationClock(actor.organizationId);
  const { timezone } = clock;
  const filters = filterSchema.omit({ status: true, createdFrom: true, createdTo: true }).parse(params.filters ?? {});
  const common = [eq(deals.organizationId, actor.organizationId), isNull(deals.onHoldUntil), ...filterConditions(filters, timezone)];

  const totals = await db
    .select({
      status: deals.status,
      count: sql<number>`count(*)`.mapWith(Number),
      total: sql<string>`coalesce(sum(${deals.estimatedValue}), 0)::text`,
    })
    .from(deals)
    .innerJoin(customers, and(eq(customers.id, deals.customerId), eq(customers.organizationId, deals.organizationId)))
    .where(and(...common, inArray(deals.status, [...ACTIVE_STAGES])))
    .groupBy(deals.status);

  const stages = await Promise.all(
    ACTIVE_STAGES.map(async (status): Promise<PipelineStageDto> => {
      const rows = await cardQuery(actor.organizationId, timezone, and(...common, eq(deals.status, status)))
        .orderBy(desc(deals.lastActivityAt), desc(deals.id))
        .limit(PIPELINE_COLUMN_LIMIT);
      const total = totals.find((row) => row.status === status);
      return { status, count: total?.count ?? 0, totalValue: total?.total ?? "0", items: rows.map((row) => toCard(row, clock)) };
    }),
  );
  return { stages };
}

/** "Muat lebih banyak": the next cards of one stage column. */
export async function listPipelineStageCards(params: {
  headers: Headers;
  status: (typeof ACTIVE_STAGES)[number];
  offset: number;
  filters?: Omit<DealFilters, "status" | "createdFrom" | "createdTo">;
}) {
  const actor = await pipelineActor(params.headers);
  const status = z.enum(ACTIVE_STAGES).parse(params.status);
  const offset = z.number().int().min(0).max(100_000).parse(params.offset);
  const clock = await organizationClock(actor.organizationId);
  const { timezone } = clock;
  const filters = filterSchema.omit({ status: true, createdFrom: true, createdTo: true }).parse(params.filters ?? {});
  const rows = await cardQuery(
    actor.organizationId,
    timezone,
    and(eq(deals.organizationId, actor.organizationId), eq(deals.status, status), isNull(deals.onHoldUntil), ...filterConditions(filters, timezone)),
  )
    .orderBy(desc(deals.lastActivityAt), desc(deals.id))
    .limit(PIPELINE_COLUMN_LIMIT)
    .offset(offset);
  return rows.map((row) => toCard(row, clock));
}

// ---------------------------------------------------------------------------
// Deal detail

const createdBy = alias(user, "created_by_user");

export type DealDetailDto = {
  id: string;
  title: string;
  description: string;
  notes: string | null;
  status: string;
  estimatedValue: string;
  wonValue: string | null;
  lostReason: string | null;
  lostNote: string | null;
  expectedCloseDate: string | null;
  onHoldUntil: string | null;
  onHoldReason: string | null;
  hasQuotation: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  wonAt: string | null;
  lostAt: string | null;
  lastActivityAt: string;
  createdByName: string | null;
  assignedToId: string;
  assignedToName: string;
  customer: {
    id: string;
    companyName: string;
    contactPerson: string;
    phoneRaw: string;
    phoneNormalized: string;
    email: string | null;
    address: string | null;
    notes: string | null;
  };
  /** When the deal first entered each stage; stages it never reached are absent. */
  stageEnteredAt: Partial<Record<(typeof ALL_STAGES)[number], string>>;
  /** When the deal entered the stage it is in now (DEAL-03). */
  stageSince: string;
  /** DEAL-09: computed when read. */
  signals: DealSignal[];
};

/**
 * §6.2: a deal Finance cannot see (anything not WON) and a deal in another
 * organization produce the same NOT_FOUND (TENANT-04).
 */
export async function getDealDetail(params: { headers: Headers; dealId: string }): Promise<DealDetailDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["read"] } });
  const dealId = z.string().uuid().safeParse(params.dealId);
  if (!dealId.success) throw new APIError("NOT_FOUND", { message: "Deal not found" });

  const [row] = await db
    .select({ deal: deals, customer: customers, assignedToName: assignee.name, createdByName: createdBy.name })
    .from(deals)
    .innerJoin(customers, and(eq(customers.id, deals.customerId), eq(customers.organizationId, deals.organizationId)))
    .innerJoin(assignee, eq(assignee.id, deals.assignedToId))
    .leftJoin(createdBy, eq(createdBy.id, deals.createdById))
    .where(and(eq(deals.id, dealId.data), scope(actor.role, actor.organizationId)))
    .limit(1);
  if (!row) throw new APIError("NOT_FOUND", { message: "Deal not found" });

  const stageEvents = await db
    .select({ eventType: activities.eventType, metadata: activities.metadata, createdAt: activities.createdAt })
    .from(activities)
    .where(
      and(
        eq(activities.organizationId, actor.organizationId),
        eq(activities.dealId, row.deal.id),
        eq(activities.entityType, "deal"),
        inArray(activities.eventType, ["stage_changed", "won", "lost", "reopened"]),
      ),
    )
    .orderBy(asc(activities.createdAt), asc(activities.id));

  // Events written before the stage model changed carry the old names.
  const stageName = (value: unknown) => {
    const name = value === "NEW" || value === "CONTACTED" || value === "QUALIFIED" ? "PROSPECT" : value === "QUOTATION" ? "PROPOSAL" : value;
    return (ALL_STAGES as readonly unknown[]).includes(name) ? (name as (typeof ALL_STAGES)[number]) : null;
  };
  const stageOf = (event: (typeof stageEvents)[number], key: "fromStatus" | "toStatus") => stageName((event.metadata as Record<string, unknown> | null)?.[key]);

  // The deal started in the stage the first event left; with no events it never moved.
  const startedIn = (stageEvents.length ? stageOf(stageEvents[0], "fromStatus") : null) ?? (row.deal.status as (typeof ALL_STAGES)[number]);
  const stageEnteredAt: DealDetailDto["stageEnteredAt"] = { [startedIn]: toIsoDto(row.deal.createdAt) };
  for (const event of stageEvents) {
    const toStatus = stageOf(event, "toStatus");
    if (toStatus) stageEnteredAt[toStatus] ??= toIsoDto(event.createdAt);
  }

  const clock = await organizationClock(actor.organizationId);
  const [counts] = await db
    .select(taskCounts(actor.organizationId, clock.timezone))
    .from(deals)
    .where(and(eq(deals.id, row.deal.id), eq(deals.organizationId, actor.organizationId)));

  const { deal, customer } = row;
  return {
    id: deal.id,
    title: deal.title,
    description: deal.description,
    notes: deal.notes,
    status: deal.status,
    estimatedValue: toMoneyDto(deal.estimatedValue),
    wonValue: deal.wonValue !== null ? toMoneyDto(deal.wonValue) : null,
    lostReason: deal.lostReason,
    lostNote: deal.lostNote,
    expectedCloseDate: deal.expectedCloseDate,
    onHoldUntil: deal.onHoldUntil,
    onHoldReason: deal.onHoldReason,
    hasQuotation: deal.hasQuotation,
    version: deal.version,
    createdAt: toIsoDto(deal.createdAt),
    updatedAt: toIsoDto(deal.updatedAt),
    wonAt: deal.wonAt ? toIsoDto(deal.wonAt) : null,
    lostAt: deal.lostAt ? toIsoDto(deal.lostAt) : null,
    lastActivityAt: toIsoDto(deal.lastActivityAt),
    createdByName: row.createdByName,
    assignedToId: deal.assignedToId,
    assignedToName: row.assignedToName,
    customer: {
      id: customer.id,
      companyName: customer.companyName,
      contactPerson: customer.contactPerson,
      phoneRaw: customer.phoneRaw,
      phoneNormalized: customer.phoneNormalized,
      email: customer.email,
      address: customer.address,
      notes: customer.notes,
    },
    stageEnteredAt,
    stageSince: toIsoDto(deal.stageEnteredAt),
    signals: signalsOf(deal, counts, clock),
  };
}

// ---------------------------------------------------------------------------
// Activity timeline

export type ActivityDto = {
  id: string;
  entityType: string;
  eventType: string;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

/**
 * AUD-01/AUD-04: a deal's timeline, newest first. What a role may see is
 * decided here, not in the UI: Sales never receives finance events, and
 * Finance receives only finance events plus the "won" event of a deal it can
 * already open. Owner and Admin see everything.
 */
export async function listDealActivities(params: { headers: Headers; dealId: string }): Promise<ActivityDto[]> {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["read"] } });
  const dealId = z.string().uuid().safeParse(params.dealId);
  if (!dealId.success) throw new APIError("NOT_FOUND", { message: "Deal not found" });

  const visible = await db.query.deals.findFirst({
    where: and(eq(deals.id, dealId.data), scope(actor.role, actor.organizationId)),
    columns: { id: true },
  });
  if (!visible) throw new APIError("NOT_FOUND", { message: "Deal not found" });

  let categoryFilter: SQL | undefined;
  if (actor.role === "SALES") {
    categoryFilter = eq(activities.permissionCategory, "sales");
  } else if (actor.role === "FINANCE") {
    categoryFilter = or(
      eq(activities.permissionCategory, "finance"),
      and(eq(activities.entityType, "deal"), eq(activities.eventType, "won")),
    );
  }

  const actorUser = alias(user, "actor_user");
  const rows = await db
    .select({ activity: activities, actorName: actorUser.name })
    .from(activities)
    .leftJoin(actorUser, eq(actorUser.id, activities.actorId))
    .where(and(eq(activities.organizationId, actor.organizationId), eq(activities.dealId, dealId.data), categoryFilter))
    .orderBy(desc(activities.createdAt), desc(activities.id))
    .limit(ACTIVITY_LIMIT);

  return rows.map(({ activity, actorName }) => ({
    id: activity.id,
    entityType: activity.entityType,
    eventType: activity.eventType,
    actorId: activity.actorId,
    actorName,
    createdAt: toIsoDto(activity.createdAt),
    metadata: (activity.metadata as Record<string, unknown> | null) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// People pickers

export type AssignableMemberDto = { userId: string; name: string; role: string };

/** RBAC-03: who a deal can be assigned to -- active Sales, Admin or Owner. */
export async function listAssignableMembers(params: { headers: Headers }): Promise<AssignableMemberDto[]> {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["read"] } });
  const rows = await db
    .select({ userId: member.userId, name: user.name, role: member.role })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, actor.organizationId),
        inArray(member.role, ["SALES", "ADMIN", "OWNER"]),
        sql`${member.deactivatedAt} is null`,
      ),
    )
    .orderBy(asc(user.name), asc(user.id));
  return rows;
}

export type DealOptionDto = { id: string; title: string; customerName: string };

const OPTION_LIMIT = 8;

/**
 * The deal picker on the follow-up form: a few active deals matching what
 * was typed (title or customer), never the whole table (SEARCH-02). A won or
 * lost deal cannot take a new follow-up (FUP-04), so it is not offered.
 */
export async function searchActiveDealOptions(params: { headers: Headers; query?: string }): Promise<DealOptionDto[]> {
  const actor = await requirePermission({ headers: params.headers, permission: { followUp: ["write"] } });
  const query = z.string().trim().max(200).optional().parse(params.query);
  const pattern = query ? `%${escapeLike(query)}%` : undefined;
  return db
    .select({ id: deals.id, title: deals.title, customerName: customers.companyName })
    .from(deals)
    .innerJoin(customers, and(eq(customers.id, deals.customerId), eq(customers.organizationId, deals.organizationId)))
    .where(
      and(
        eq(deals.organizationId, actor.organizationId),
        inArray(deals.status, [...ACTIVE_STAGES]),
        pattern ? or(ilike(deals.title, pattern), ilike(customers.companyName, pattern)) : undefined,
      ),
    )
    .orderBy(desc(deals.lastActivityAt), desc(deals.id))
    .limit(OPTION_LIMIT);
}

// ---------------------------------------------------------------------------
// Dashboard feeds

export type FeedActivityDto = ActivityDto & { dealId: string; dealTitle: string; customerName: string };

/**
 * "Kabar dari tim": the latest events across the organization, filtered by
 * role exactly like a deal's own timeline (AUD-04) so the dashboard cannot
 * show what a deal page would hide.
 */
export async function listRecentActivities(params: { headers: Headers; limit?: number }): Promise<FeedActivityDto[]> {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["read"] } });
  const limit = z.number().int().min(1).max(20).default(6).parse(params.limit);

  let categoryFilter: SQL | undefined;
  if (actor.role === "SALES") {
    categoryFilter = eq(activities.permissionCategory, "sales");
  } else if (actor.role === "FINANCE") {
    categoryFilter = or(
      eq(activities.permissionCategory, "finance"),
      and(eq(activities.entityType, "deal"), eq(activities.eventType, "won")),
    );
  }

  const actorUser = alias(user, "actor_user");
  const rows = await db
    .select({ activity: activities, actorName: actorUser.name, dealTitle: deals.title, customerName: customers.companyName })
    .from(activities)
    .innerJoin(deals, and(eq(deals.id, activities.dealId), eq(deals.organizationId, activities.organizationId)))
    .innerJoin(customers, and(eq(customers.id, deals.customerId), eq(customers.organizationId, deals.organizationId)))
    .leftJoin(actorUser, eq(actorUser.id, activities.actorId))
    .where(and(eq(activities.organizationId, actor.organizationId), categoryFilter, scope(actor.role, actor.organizationId)))
    .orderBy(desc(activities.createdAt), desc(activities.id))
    .limit(limit);

  return rows.map(({ activity, actorName, dealTitle, customerName }) => ({
    id: activity.id,
    entityType: activity.entityType,
    eventType: activity.eventType,
    actorId: activity.actorId,
    actorName,
    createdAt: toIsoDto(activity.createdAt),
    metadata: (activity.metadata as Record<string, unknown> | null) ?? null,
    dealId: activity.dealId,
    dealTitle,
    customerName,
  }));
}

// ---------------------------------------------------------------------------
// Deals that need attention (DEAL-09, RISK-01)

export type AttentionDealDto = {
  id: string;
  title: string;
  status: string;
  estimatedValue: string;
  customerName: string;
  assignedToName: string;
  onHoldUntil: string | null;
  signals: DealSignal[];
};

/**
 * Open deals with at least one health signal, largest value first. Sales,
 * Owner and Admin see every open deal of the organization, as on the board.
 *
 * shortcut: reads every open deal and decides in code, which is fine for a few
 * thousand; move the signal predicate into SQL when an organization has more.
 */
export async function listDealsNeedingAttention(params: { headers: Headers; limit?: number }): Promise<AttentionDealDto[]> {
  const actor = await pipelineActor(params.headers);
  const limit = z.number().int().min(1).max(200).default(50).parse(params.limit);
  const clock = await organizationClock(actor.organizationId);

  const rows = await cardQuery(actor.organizationId, clock.timezone, and(eq(deals.organizationId, actor.organizationId), inArray(deals.status, [...ACTIVE_STAGES])))
    .orderBy(desc(deals.estimatedValue), desc(deals.id));

  return rows
    .map((row) => ({ row, signals: signalsOf(row.deal, row, clock) }))
    .filter(({ signals }) => signals.length > 0)
    .slice(0, limit)
    .map(({ row, signals }) => ({
      id: row.deal.id,
      title: row.deal.title,
      status: row.deal.status,
      estimatedValue: toMoneyDto(row.deal.estimatedValue),
      customerName: row.customerName,
      assignedToName: row.assignedToName,
      onHoldUntil: row.deal.onHoldUntil,
      signals,
    }));
}
