import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { activities, deals, followUps, invoices, receipts, refunds, settlements } from "@/server/db/schema";
import { zonedDateString } from "@/lib/format";
import { organizationClock } from "@/server/shared/organization-clock";

// The lines on the dashboard: one value per day, derived from what is stored.
// Deal value history is not kept, so a deal counts with its current value on
// every day it sat in a stage; the last point always equals today's KPI.

export const TREND_STAGES = ["PROPOSAL", "NEGOTIATION", "COMMITMENT"] as const;
export type TrendStage = (typeof TREND_STAGES)[number];

export type DashboardTrendsDto = {
  days: string[];
  /** Counted pipeline stages per day (PROSPECT is not a revenue opportunity yet, DEAL-08). */
  stages: Record<TrendStage, { value: number[]; count: number[] }> | null;
  /** Won value over the 30 days ending each day, and last calendar month's won value. */
  won: { series: number[]; lastMonth: string } | null;
  /** What live invoices owed at the end of each day, all and overdue, plus the share collected so far. */
  outstanding: { series: number[]; overdue: number[]; billed: string; collected: string } | null;
  /** Cash in (receipts minus refunds) over the 30 days ending each day. */
  received: number[] | null;
  /** Follow-ups scheduled on each day, open or done. */
  followUps: number[] | null;
};

const shiftDay = (day: string, by: number) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + by)).toISOString().slice(0, 10);
};

export function dayRange(today: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => shiftDay(today, index - days + 1));
}

/** Sum of the amounts dated within the `window` days ending on each day. */
export function rolling(days: string[], dated: { day: string; amount: number }[], window: number): number[] {
  return days.map((day) => {
    const from = shiftDay(day, -window + 1);
    return dated.reduce((sum, item) => (item.day >= from && item.day <= day ? sum + item.amount : sum), 0);
  });
}

type StageDeal = { id: string; createdDay: string; status: string; value: number };
type StageEvent = { dealId: string; day: string; fromStatus: string | null; toStatus: string | null };

/**
 * Each deal's stage at the end of each day, from its stage events: before the
 * first event it was in the stage that event left, and with no events it never moved.
 */
export function stageSeries(days: string[], dealRows: StageDeal[], events: StageEvent[]) {
  const out = Object.fromEntries(TREND_STAGES.map((stage) => [stage, { value: days.map(() => 0), count: days.map(() => 0) }])) as Record<
    TrendStage,
    { value: number[]; count: number[] }
  >;
  const byDeal = new Map<string, StageEvent[]>();
  for (const event of events) byDeal.set(event.dealId, [...(byDeal.get(event.dealId) ?? []), event]);
  for (const deal of dealRows) {
    const own = (byDeal.get(deal.id) ?? []).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    const started = own[0]?.fromStatus ?? deal.status;
    days.forEach((day, index) => {
      if (deal.createdDay > day) return;
      let stage = started;
      for (const event of own) if (event.day <= day && event.toStatus) stage = event.toStatus;
      const slot = out[stage as TrendStage];
      if (!slot) return;
      slot.value[index] += deal.value;
      slot.count[index] += 1;
    });
  }
  return out;
}

const OLD_NAMES: Record<string, string> = { NEW: "PROSPECT", CONTACTED: "PROSPECT", QUALIFIED: "PROSPECT", QUOTATION: "PROPOSAL" };
const stageName = (value: unknown) => (typeof value === "string" ? (OLD_NAMES[value] ?? value) : null);

// shortcut: per-day sums are folded in memory over the window's rows, fine for a
// small team's few hundred deals and invoices; move to SQL windows if that grows.
export async function getDashboardTrends(params: { headers: Headers; days?: number }): Promise<DashboardTrendsDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["read"] } });
  const org = actor.organizationId;
  const { today, timezone } = await organizationClock(org);
  const days = dayRange(today, Math.min(Math.max(params.days ?? 30, 7), 90));
  const first = days[0]!;
  const sales = actor.role !== "FINANCE";
  const money = actor.role !== "SALES";
  const local = (instant: Date) => zonedDateString(instant, timezone);

  let stages: DashboardTrendsDto["stages"] = null;
  let won: DashboardTrendsDto["won"] = null;
  let follow: number[] | null = null;
  if (sales) {
    // Deals on hold now are left out of every day, as they are of the pipeline KPI.
    const open = await db
      .select({ id: deals.id, createdAt: deals.createdAt, status: deals.status, value: deals.estimatedValue })
      .from(deals)
      .where(and(eq(deals.organizationId, org), isNull(deals.onHoldUntil)));
    const events = open.length
      ? await db
          .select({ dealId: activities.dealId, createdAt: activities.createdAt, metadata: activities.metadata })
          .from(activities)
          .where(and(eq(activities.organizationId, org), eq(activities.entityType, "deal"), inArray(activities.eventType, ["stage_changed", "won", "lost", "reopened"])))
      : [];
    stages = stageSeries(
      days,
      open.map((deal) => ({ id: deal.id, createdDay: local(deal.createdAt), status: deal.status, value: Number(deal.value) })),
      events.flatMap((event) => {
        const meta = (event.metadata ?? {}) as Record<string, unknown>;
        return event.dealId ? [{ dealId: event.dealId, day: local(event.createdAt), fromStatus: stageName(meta.fromStatus), toStatus: stageName(meta.toStatus) }] : [];
      }),
    );

    const lastMonthStart = `${shiftDay(`${today.slice(0, 7)}-01`, -1).slice(0, 7)}-01`;
    const windowStart = shiftDay(first, -29);
    const earliest = lastMonthStart < windowStart ? lastMonthStart : windowStart;
    // A day early in UTC so no deal won late on the first local day is missed.
    const wonRows = await db
      .select({ wonAt: deals.wonAt, value: deals.wonValue })
      .from(deals)
      .where(and(eq(deals.organizationId, org), eq(deals.status, "WON"), gte(deals.wonAt, new Date(`${shiftDay(earliest, -1)}T00:00:00Z`))));
    const dated = wonRows.flatMap((row) => (row.wonAt ? [{ day: local(row.wonAt), amount: row.value ?? 0n }] : []));
    const lastMonth = dated.filter((row) => row.day.slice(0, 7) === lastMonthStart.slice(0, 7)).reduce((sum, row) => sum + row.amount, 0n);
    won = { series: rolling(days, dated.map((row) => ({ day: row.day, amount: Number(row.amount) })), 30), lastMonth: lastMonth.toString() };

    const tasks = await db
      .select({ at: followUps.followUpAt })
      .from(followUps)
      .where(and(eq(followUps.organizationId, org), isNull(followUps.cancelledAt), gte(followUps.followUpAt, new Date(`${shiftDay(first, -1)}T00:00:00Z`))));
    follow = rolling(days, tasks.map((task) => ({ day: local(task.at), amount: 1 })), 1);
  }

  let outstanding: DashboardTrendsDto["outstanding"] = null;
  let received: number[] | null = null;
  if (money) {
    const invoiceRows = await db
      .select({ id: invoices.id, total: invoices.total, issueDate: invoices.issueDate, dueDate: invoices.dueDate, voidedAt: invoices.voidedAt })
      .from(invoices)
      .where(eq(invoices.organizationId, org));
    const settled = await db
      .select({ invoiceId: settlements.invoiceId, amount: settlements.amount, settledOn: settlements.settledOn, reversedAt: settlements.reversedAt })
      .from(settlements)
      .where(eq(settlements.organizationId, org));
    const series = days.map(() => 0);
    const overdue = days.map(() => 0);
    for (const invoice of invoiceRows) {
      const voidDay = invoice.voidedAt ? local(invoice.voidedAt) : null;
      const own = settled.filter((row) => row.invoiceId === invoice.id).map((row) => ({ day: row.settledOn, until: row.reversedAt ? local(row.reversedAt) : null, amount: Number(row.amount) }));
      days.forEach((day, index) => {
        if (invoice.issueDate > day || (voidDay && voidDay <= day)) return;
        const paid = own.reduce((sum, row) => (row.day <= day && (!row.until || row.until > day) ? sum + row.amount : sum), 0);
        const left = Math.max(Number(invoice.total) - paid, 0);
        series[index] += left;
        if (invoice.dueDate < day) overdue[index] += left;
      });
    }
    const live = invoiceRows.filter((invoice) => !invoice.voidedAt);
    const liveIds = new Set(live.map((invoice) => invoice.id));
    const billed = live.reduce((sum, invoice) => sum + invoice.total, 0n);
    const collected = settled.filter((row) => !row.reversedAt && liveIds.has(row.invoiceId)).reduce((sum, row) => sum + row.amount, 0n);
    outstanding = { series, overdue, billed: billed.toString(), collected: collected.toString() };

    const since = shiftDay(first, -30);
    const [cashIn, cashOut] = await Promise.all([
      db
        .select({ day: receipts.receivedOn, amount: receipts.amount })
        .from(receipts)
        .where(and(eq(receipts.organizationId, org), isNull(receipts.reversedAt), sql`${receipts.receivedOn} >= ${since}::date`)),
      db
        .select({ day: refunds.refundedOn, amount: refunds.amount })
        .from(refunds)
        .where(and(eq(refunds.organizationId, org), sql`${refunds.refundedOn} >= ${since}::date`)),
    ]);
    received = rolling(days, [...cashIn.map((row) => ({ day: row.day, amount: Number(row.amount) })), ...cashOut.map((row) => ({ day: row.day, amount: -Number(row.amount) }))], 30);
  }

  return { days, stages, won, outstanding, received, followUps: follow };
}
