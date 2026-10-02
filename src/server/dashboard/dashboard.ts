import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";
import { zonedLocalToInstant } from "@/lib/format";
import { organizationClock } from "@/server/shared/organization-clock";

// DASH-01: the definitions are fixed by the requirement, and every figure is
// one grouped read in the database (DASH-02: no joins that double a sum).

const ACTIVE = ["NEW", "CONTACTED", "QUALIFIED", "QUOTATION", "NEGOTIATION"] as const;

export type PipelineStageMetric = { status: (typeof ACTIVE)[number]; count: number; value: string };

/** "Sales Pipeline Value": the estimated value of every deal still in play, by stage. */
export async function getPipelineMetrics(params: { headers: Headers }) {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["read"] } });
  const rows = await db
    .select({ status: deals.status, count: sql<number>`count(*)`.mapWith(Number), value: sql<string>`coalesce(sum(${deals.estimatedValue}), 0)::text` })
    .from(deals)
    .where(and(eq(deals.organizationId, actor.organizationId), inArray(deals.status, [...ACTIVE])))
    .groupBy(deals.status);

  const stages: PipelineStageMetric[] = ACTIVE.map((status) => {
    const row = rows.find((candidate) => candidate.status === status);
    return { status, count: row?.count ?? 0, value: row?.value ?? "0" };
  });
  return {
    stages,
    totalCount: stages.reduce((sum, stage) => sum + stage.count, 0),
    totalValue: stages.reduce((sum, stage) => sum + BigInt(stage.value), 0n).toString(),
  };
}

/**
 * "Won This Month": the won value of deals whose won_at falls in the current
 * calendar month of the organization's timezone, as a half-open interval
 * converted to UTC (DASH-03). It is deal value, not cash received.
 */
export async function getWonThisMonth(params: { headers: Headers }) {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["read"] } });
  const { timezone, today } = await organizationClock(actor.organizationId);
  const monthStart = `${today.slice(0, 7)}-01`;
  const next = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const from = zonedLocalToInstant(`${monthStart}T00:00`, timezone);
  const to = zonedLocalToInstant(`${next}T00:00`, timezone);

  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number), value: sql<string>`coalesce(sum(${deals.wonValue}), 0)::text` })
    .from(deals)
    .where(and(eq(deals.organizationId, actor.organizationId), eq(deals.status, "WON"), gte(deals.wonAt, from), lt(deals.wonAt, to)));
  return { count: row?.count ?? 0, value: row?.value ?? "0" };
}
