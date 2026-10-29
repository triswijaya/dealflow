import { and, asc, desc, eq, gte, isNotNull, isNull, lt, notInArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { customers, deals, followUps, user } from "@/server/db/schema";
import { toIsoDto, toMoneyDto } from "@/server/shared/dto";
import { organizationClock } from "@/server/shared/organization-clock";
import { buildPaginatedDto, resolvePagination } from "@/server/shared/pagination";
import { followUpBucket, type FollowUpBucket } from "./follow-up-bucket";

// Read models for the follow-up screens: every row carries the deal and
// customer context a reminder needs (FUP-05) so a page never stitches rows.

const TYPES = ["CALL", "WHATSAPP", "EMAIL", "MEETING", "OTHER"] as const;
const TABS = ["TODAY", "OVERDUE", "UPCOMING", "DONE"] as const;
export type FollowUpTab = (typeof TABS)[number];

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const filterSchema = z.object({
  type: z.enum(TYPES).optional(),
  assignedToId: z.string().min(1).max(100).optional(),
  dealId: z.string().uuid().optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

export type FollowUpFilters = z.input<typeof filterSchema>;

const assignee = alias(user, "assignee");
const completer = alias(user, "completer");

export type FollowUpRowDto = {
  id: string;
  dealId: string;
  type: string;
  note: string | null;
  followUpAt: string;
  completedAt: string | null;
  version: number;
  dealTitle: string;
  dealStatus: string;
  /** The won value once a deal is won, otherwise the estimate. */
  dealValue: string;
  customerId: string;
  customerName: string;
  customerContact: string;
  customerPhone: string;
  customerEmail: string | null;
  assignedToName: string;
  completedByName: string | null;
  /** FUP-05: the last completed interaction on the deal, not a page view. */
  lastContactAt: string | null;
  /** Null for a completed follow-up and for an open one on a closed deal (FUP-04). */
  bucket: FollowUpBucket | null;
};

/** Start of the organization's today and tomorrow, as UTC instants (FUP-03). */
function dayBounds(timezone: string) {
  const startToday = sql`(date_trunc('day', now() AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone})`;
  const startTomorrow = sql`((date_trunc('day', now() AT TIME ZONE ${timezone}) + interval '1 day') AT TIME ZONE ${timezone})`;
  return { startToday, startTomorrow };
}

function tabCondition(tab: FollowUpTab, timezone: string): SQL {
  const { startToday, startTomorrow } = dayBounds(timezone);
  const open = and(isNull(followUps.completedAt), isNull(followUps.cancelledAt), notInArray(deals.status, ["WON", "LOST"]))!;
  switch (tab) {
    case "OVERDUE":
      return and(open, lt(followUps.followUpAt, startToday))!;
    case "TODAY":
      return and(open, gte(followUps.followUpAt, startToday), lt(followUps.followUpAt, startTomorrow))!;
    case "UPCOMING":
      return and(open, gte(followUps.followUpAt, startTomorrow))!;
    case "DONE":
      return isNotNull(followUps.completedAt);
  }
}

function filterConditions(filters: z.output<typeof filterSchema>, timezone: string): SQL[] {
  const conditions: SQL[] = [];
  if (filters.type) conditions.push(eq(followUps.type, filters.type));
  if (filters.assignedToId) conditions.push(eq(deals.assignedToId, filters.assignedToId));
  if (filters.dealId) conditions.push(eq(followUps.dealId, filters.dealId));
  if (filters.from && filters.to && filters.from > filters.to) {
    throw new APIError("BAD_REQUEST", { message: "Invalid date range: from is after to" });
  }
  // Inclusive of both days in the organization's own calendar (FILTER-01, DATA-04).
  if (filters.from) conditions.push(sql`${followUps.followUpAt} >= (${filters.from}::date)::timestamp AT TIME ZONE ${timezone}`);
  if (filters.to) conditions.push(sql`${followUps.followUpAt} < ((${filters.to}::date + 1)::timestamp AT TIME ZONE ${timezone})`);
  return conditions;
}

function baseQuery(organizationId: string, where: SQL | undefined) {
  const lastContact = sql<Date | null>`(
    select max(f2.completed_at) from ${followUps} as f2
    where f2.deal_id = ${followUps.dealId}
      and f2.organization_id = ${organizationId}
      and f2.completed_at is not null
  )`;
  return db
    .select({
      followUp: followUps,
      deal: deals,
      customer: customers,
      assignedToName: assignee.name,
      completedByName: completer.name,
      lastContact,
    })
    .from(followUps)
    .innerJoin(deals, and(eq(deals.id, followUps.dealId), eq(deals.organizationId, followUps.organizationId)))
    .innerJoin(customers, and(eq(customers.id, deals.customerId), eq(customers.organizationId, deals.organizationId)))
    .innerJoin(assignee, eq(assignee.id, deals.assignedToId))
    .leftJoin(completer, and(isNotNull(followUps.completedAt), eq(completer.id, followUps.updatedById)))
    .where(where);
}

function toRow(row: Awaited<ReturnType<typeof baseQuery>>[number], timezone: string, today: string): FollowUpRowDto {
  const { followUp, deal, customer } = row;
  const open = followUp.completedAt === null && followUp.cancelledAt === null && deal.status !== "WON" && deal.status !== "LOST";
  const lastContact = row.lastContact ? new Date(row.lastContact as unknown as string | Date) : null;
  return {
    id: followUp.id,
    dealId: followUp.dealId,
    type: followUp.type,
    note: followUp.note,
    followUpAt: toIsoDto(followUp.followUpAt),
    completedAt: followUp.completedAt ? toIsoDto(followUp.completedAt) : null,
    version: followUp.version,
    dealTitle: deal.title,
    dealStatus: deal.status,
    dealValue: toMoneyDto(deal.status === "WON" && deal.wonValue !== null ? deal.wonValue : deal.estimatedValue),
    customerId: customer.id,
    customerName: customer.companyName,
    customerContact: customer.contactPerson,
    customerPhone: customer.phoneNormalized,
    customerEmail: customer.email,
    assignedToName: row.assignedToName,
    completedByName: followUp.completedAt ? row.completedByName : null,
    lastContactAt: lastContact ? toIsoDto(lastContact) : null,
    bucket: open ? followUpBucket(followUp.followUpAt, timezone, today) : null,
  };
}

async function readActor(headers: Headers) {
  return requirePermission({ headers, permission: { followUp: ["read"] } });
}

/**
 * FUP-03: one tab of the follow-up list (Today, Overdue, Upcoming or Done)
 * with the schedule and deal context. Open buckets are mutually exclusive,
 * only cover active deals (FUP-04), and run oldest first; Done runs newest
 * first. Without a tab every follow-up is returned (used on a deal page).
 */
export async function listFollowUpRows(params: {
  headers: Headers;
  tab?: FollowUpTab;
  filters?: FollowUpFilters;
  page?: number;
  pageSize?: number;
}) {
  const actor = await readActor(params.headers);
  const { timezone, today } = await organizationClock(actor.organizationId);
  const { page, pageSize, limit, offset } = resolvePagination(params);
  const tab = z.enum(TABS).optional().parse(params.tab);
  const filters = filterSchema.parse(params.filters ?? {});
  const where = and(
    eq(followUps.organizationId, actor.organizationId),
    tab ? tabCondition(tab, timezone) : undefined,
    ...filterConditions(filters, timezone),
  );

  const [rows, [{ count }]] = await Promise.all([
    baseQuery(actor.organizationId, where)
      .orderBy(...(tab === "DONE" ? [desc(followUps.completedAt), desc(followUps.id)] : [asc(followUps.followUpAt), asc(followUps.id)]))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(followUps)
      .innerJoin(deals, and(eq(deals.id, followUps.dealId), eq(deals.organizationId, followUps.organizationId)))
      .where(where),
  ]);
  return buildPaginatedDto(
    rows.map((row) => toRow(row, timezone, today)),
    page,
    pageSize,
    count,
  );
}

export type FollowUpCountsDto = { today: number; overdue: number; upcoming: number; done: number };

/** The tab badges, under the same filters as the list so the numbers match what a tab shows. */
export async function getFollowUpCounts(params: { headers: Headers; filters?: FollowUpFilters }): Promise<FollowUpCountsDto> {
  const actor = await readActor(params.headers);
  const { timezone } = await organizationClock(actor.organizationId);
  const filters = filterSchema.parse(params.filters ?? {});
  const where = and(eq(followUps.organizationId, actor.organizationId), ...filterConditions(filters, timezone));
  const count = (tab: FollowUpTab) => sql<number>`count(*) filter (where ${tabCondition(tab, timezone)})`.mapWith(Number);

  const [row] = await db
    .select({ today: count("TODAY"), overdue: count("OVERDUE"), upcoming: count("UPCOMING"), done: count("DONE") })
    .from(followUps)
    .innerJoin(deals, and(eq(deals.id, followUps.dealId), eq(deals.organizationId, followUps.organizationId)))
    .where(where);
  return row ?? { today: 0, overdue: 0, upcoming: 0, done: 0 };
}

/** The sidebar badge: what needs attention now (today plus overdue), or null if the role cannot see follow-ups. */
export async function getFollowUpBadgeCount(params: { headers: Headers }): Promise<number> {
  const counts = await getFollowUpCounts({ headers: params.headers });
  return counts.today + counts.overdue;
}

/** One follow-up with its deal context, for the edit and complete dialogs. */
export async function getFollowUpRow(params: { headers: Headers; followUpId: string }): Promise<FollowUpRowDto> {
  const actor = await readActor(params.headers);
  const id = z.string().uuid().safeParse(params.followUpId);
  if (!id.success) throw new APIError("NOT_FOUND", { message: "Follow-up not found" });
  const { timezone, today } = await organizationClock(actor.organizationId);
  const [row] = await baseQuery(actor.organizationId, and(eq(followUps.organizationId, actor.organizationId), eq(followUps.id, id.data))).limit(1);
  if (!row) throw new APIError("NOT_FOUND", { message: "Follow-up not found" });
  return toRow(row, timezone, today);
}

/** FUP-03: "Follow-up Today" counts unique customers; the task count is shown alongside when it differs. */
export async function countTodayCustomers(params: { headers: Headers }): Promise<number> {
  const actor = await readActor(params.headers);
  const { timezone } = await organizationClock(actor.organizationId);
  const [row] = await db
    .select({ customers: sql<number>`count(distinct ${deals.customerId})`.mapWith(Number) })
    .from(followUps)
    .innerJoin(deals, and(eq(deals.id, followUps.dealId), eq(deals.organizationId, followUps.organizationId)))
    .where(and(eq(followUps.organizationId, actor.organizationId), tabCondition("TODAY", timezone)));
  return row?.customers ?? 0;
}
