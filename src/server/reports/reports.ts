import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { customers, invoices, orderAmendments, orders, receipts, refunds } from "@/server/db/schema";
import { toMoneyDto } from "@/server/shared/dto";
import { organizationClock } from "@/server/shared/organization-clock";
import { toCsv } from "./csv";

// §11.1: the report figures, each with one fixed definition. Every sum is computed
// in the database over bigint and travels as a string, so it stays exact. Dates are
// the organization's calendar dates, not UTC days.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const rangeSchema = z.object({ from: isoDate.optional(), to: isoDate.optional() });

export type AgingBucket = "NOT_DUE" | "1_30" | "31_60" | "61_90" | "OVER_90";

export type ReportSummaryDto = {
  period: { from: string; to: string };
  /** Orders by commitment date plus dated amendments, cancelled orders left out; the deal value is not counted again. */
  bookings: { total: string; orders: number } | null;
  /** Live invoices by issue date. */
  billed: { total: string; invoices: number } | null;
  /** Active receipts by received date minus refunds by refund date. Withholding and write-offs are not cash. */
  cashReceived: { total: string; receipts: number } | null;
  /** READY billing items; retention not yet invoiced (ready or not) is reported apart as held. */
  readyToBill: { total: string; items: number; retentionHeld: string } | null;
  /** What live invoices still owe, with the aging of it. */
  outstanding: { total: string; invoices: number } | null;
  aging: { bucket: AgingBucket; invoices: number; amount: string }[] | null;
  /** What is left on active receipts (not revenue). */
  customerCredit: { total: string; receipts: number } | null;
  winRate: { won: number; lost: number; rate: number | null; medianDaysToWin: number | null } | null;
};

const MONEY_ROLES = ["OWNER", "ADMIN", "FINANCE"];
const SALES_ROLES = ["OWNER", "ADMIN", "SALES"];
const BOOKING_ROLES = ["OWNER", "ADMIN", "SALES", "FINANCE"];

function resolveRange(input: unknown, today: string) {
  const { from, to } = rangeSchema.parse(input ?? {});
  const range = { from: from ?? `${today.slice(0, 7)}-01`, to: to ?? today };
  if (range.from > range.to) throw new APIError("BAD_REQUEST", { message: "Invalid date range: from is after to" });
  return range;
}

const first = <T>(rows: T[]) => rows[0]!;

export async function getReportSummary(params: { headers: Headers; range?: unknown }): Promise<ReportSummaryDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["read"] } });
  const { today, timezone } = await organizationClock(actor.organizationId);
  const range = resolveRange(params.range, today);
  const org = actor.organizationId;
  const money = MONEY_ROLES.includes(actor.role);

  const bookings = BOOKING_ROLES.includes(actor.role)
    ? await (async () => {
        const [created] = await db
          .select({ total: sql<string>`coalesce(sum(${orders.originalValue}), 0)::text`, count: sql<number>`count(*)`.mapWith(Number) })
          .from(orders)
          .where(and(eq(orders.organizationId, org), isNull(orders.cancelledAt), sql`${orders.commitmentDate} between ${range.from}::date and ${range.to}::date`));
        const [amended] = await db
          .select({ total: sql<string>`coalesce(sum(${orderAmendments.delta}), 0)::text` })
          .from(orderAmendments)
          .innerJoin(orders, and(eq(orders.id, orderAmendments.orderId), eq(orders.organizationId, orderAmendments.organizationId)))
          .where(and(eq(orderAmendments.organizationId, org), isNull(orders.cancelledAt), sql`${orderAmendments.effectiveDate} between ${range.from}::date and ${range.to}::date`));
        return { total: (BigInt(created!.total) + BigInt(amended!.total)).toString(), orders: created!.count };
      })()
    : null;

  const billed = money
    ? await db
        .select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)::text`, count: sql<number>`count(*)`.mapWith(Number) })
        .from(invoices)
        .where(and(eq(invoices.organizationId, org), isNull(invoices.voidedAt), sql`${invoices.issueDate} between ${range.from}::date and ${range.to}::date`))
        .then((rows) => ({ total: first(rows).total, invoices: first(rows).count }))
    : null;

  const cashReceived = money
    ? await (async () => {
        const [received] = await db
          .select({ total: sql<string>`coalesce(sum(${receipts.amount}), 0)::text`, count: sql<number>`count(*)`.mapWith(Number) })
          .from(receipts)
          .where(and(eq(receipts.organizationId, org), isNull(receipts.reversedAt), sql`${receipts.receivedOn} between ${range.from}::date and ${range.to}::date`));
        const [refunded] = await db
          .select({ total: sql<string>`coalesce(sum(${refunds.amount}), 0)::text` })
          .from(refunds)
          .where(and(eq(refunds.organizationId, org), sql`${refunds.refundedOn} between ${range.from}::date and ${range.to}::date`));
        return { total: (BigInt(received!.total) - BigInt(refunded!.total)).toString(), receipts: received!.count };
      })()
    : null;

  const readyToBill = money
    ? await db
        .execute<{ items: number; total: string; retention: string }>(sql`
          with open_items as (
            select b.*, (b.trigger = 'ON_ORDER' or (b.trigger = 'ON_DATE' and b.due_on <= ${today}::date) or (b.trigger = 'ON_MILESTONE' and b.milestone_done_at is not null)) as is_ready
            from billing_items b join orders o on o.id = b.order_id and o.organization_id = b.organization_id
            where b.organization_id = ${org} and b.cancelled_at is null and o.cancelled_at is null
              and not exists (select 1 from invoices i where i.billing_item_id = b.id and i.voided_at is null))
          select count(*) filter (where is_ready)::int as items,
            coalesce(sum(amount) filter (where is_ready), 0)::text as total,
            coalesce(sum(amount) filter (where is_retention), 0)::text as retention
          from open_items`)
        .then((rows) => ({ total: rows[0]!.total, items: Number(rows[0]!.items), retentionHeld: rows[0]!.retention }))
    : null;

  const aging = money
    ? await db
        .execute<{ bucket: AgingBucket; invoices: number; amount: string }>(sql`
          with owed as (
            select i.id, i.due_date, i.total - coalesce((select sum(s.amount) from settlements s where s.invoice_id = i.id and s.reversed_at is null), 0) as remaining
            from invoices i where i.organization_id = ${org} and i.voided_at is null)
          select case
              when ${today}::date - due_date <= 0 then 'NOT_DUE'
              when ${today}::date - due_date <= 30 then '1_30'
              when ${today}::date - due_date <= 60 then '31_60'
              when ${today}::date - due_date <= 90 then '61_90'
              else 'OVER_90' end as bucket,
            count(*)::int as invoices, sum(remaining)::text as amount
          from owed where remaining > 0 group by 1`)
        .then((rows) => {
          const byBucket = new Map(rows.map((row) => [row.bucket, row]));
          return (["NOT_DUE", "1_30", "31_60", "61_90", "OVER_90"] as const).map((bucket) => ({
            bucket,
            invoices: Number(byBucket.get(bucket)?.invoices ?? 0),
            amount: byBucket.get(bucket)?.amount ?? "0",
          }));
        })
    : null;

  const outstanding = aging
    ? { total: aging.reduce((sum, bucket) => sum + BigInt(bucket.amount), 0n).toString(), invoices: aging.reduce((sum, bucket) => sum + bucket.invoices, 0) }
    : null;

  const customerCredit = money
    ? await db
        .execute<{ total: string; receipts: number }>(sql`
          select coalesce(sum(left_over), 0)::text as total, count(*)::int as receipts from (
            select r.amount
              - coalesce((select sum(s.amount) from settlements s where s.receipt_id = r.id and s.reversed_at is null), 0)
              - coalesce((select sum(f.amount) from refunds f where f.receipt_id = r.id), 0) as left_over
            from receipts r where r.organization_id = ${org} and r.reversed_at is null and r.customer_id is not null) x
          where left_over > 0`)
        .then((rows) => ({ total: rows[0]!.total, receipts: Number(rows[0]!.receipts) }))
    : null;

  const winRate = SALES_ROLES.includes(actor.role)
    ? await db
        .execute<{ won: number; lost: number; median: number | null }>(sql`
          select
            count(*) filter (where status = 'WON' and (won_at at time zone ${timezone})::date between ${range.from}::date and ${range.to}::date)::int as won,
            count(*) filter (where status = 'LOST' and (lost_at at time zone ${timezone})::date between ${range.from}::date and ${range.to}::date)::int as lost,
            percentile_cont(0.5) within group (order by extract(epoch from (won_at - created_at)) / 86400)
              filter (where status = 'WON' and (won_at at time zone ${timezone})::date between ${range.from}::date and ${range.to}::date) as median
          from deals where organization_id = ${org}`)
        .then((rows) => {
          const won = Number(rows[0]!.won);
          const lost = Number(rows[0]!.lost);
          return {
            won,
            lost,
            rate: won + lost === 0 ? null : won / (won + lost),
            medianDaysToWin: rows[0]!.median === null ? null : Math.round(Number(rows[0]!.median) * 10) / 10,
          };
        })
    : null;

  return { period: range, bookings, billed, cashReceived, readyToBill, outstanding, aging, customerCredit, winRate };
}

// ---------------------------------------------------------------------------
// CSV export (money reports and exports: Owner, Admin, Finance; orders: anyone who reads them)

export const EXPORT_KINDS = ["invoices", "receipts", "orders"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export async function exportCsv(params: { headers: Headers; kind: string; range?: unknown }): Promise<{ filename: string; content: string }> {
  const kind = z.enum(EXPORT_KINDS).safeParse(params.kind);
  if (!kind.success) throw new APIError("NOT_FOUND", { message: "Unknown export" });
  const actor = await requirePermission({
    headers: params.headers,
    permission: kind.data === "invoices" ? { invoice: ["read"] } : kind.data === "receipts" ? { payment: ["read"] } : { order: ["read"] },
  });
  const { today } = await organizationClock(actor.organizationId);
  const range = resolveRange(params.range, today);
  const org = actor.organizationId;

  if (kind.data === "invoices") {
    const rows = await db.execute<Record<string, string | number | null>>(sql`
      select i.invoice_number, c.company_name as customer, o.order_number, i.issue_date::text, i.due_date::text, i.total::text,
        coalesce((select sum(s.amount) from settlements s where s.invoice_id = i.id and s.reversed_at is null), 0)::text as settled,
        case when i.voided_at is not null then 'VOID' else 'LIVE' end as state
      from invoices i join customers c on c.id = i.customer_id and c.organization_id = i.organization_id
        join orders o on o.id = i.order_id and o.organization_id = i.organization_id
      where i.organization_id = ${org} and i.issue_date between ${range.from}::date and ${range.to}::date
      order by i.issue_date, i.invoice_number`);
    return { filename: `invoices-${range.from}-${range.to}.csv`, content: toCsv(["Invoice", "Customer", "Pesanan", "Tanggal terbit", "Jatuh tempo", "Total", "Terselesaikan", "Status"], rows.map((row) => [row.invoice_number, row.customer, row.order_number, row.issue_date, row.due_date, row.total, row.settled, row.state])) };
  }
  if (kind.data === "receipts") {
    const rows = await db.execute<Record<string, string | number | null>>(sql`
      select r.received_on::text, c.company_name as customer, r.amount::text, r.method, r.reference,
        case when r.reversed_at is not null then 'REVERSED' else 'ACTIVE' end as state
      from receipts r left join customers c on c.id = r.customer_id and c.organization_id = r.organization_id
      where r.organization_id = ${org} and r.received_on between ${range.from}::date and ${range.to}::date
      order by r.received_on, r.id`);
    return { filename: `receipts-${range.from}-${range.to}.csv`, content: toCsv(["Tanggal terima", "Customer", "Jumlah", "Metode", "Referensi", "Status"], rows.map((row) => [row.received_on, row.customer, row.amount, row.method, row.reference, row.state])) };
  }
  const rows = await db
    .select({ order: orders, customerName: customers.companyName })
    .from(orders)
    .innerJoin(customers, and(eq(customers.id, orders.customerId), eq(customers.organizationId, orders.organizationId)))
    .where(and(eq(orders.organizationId, org), sql`${orders.commitmentDate} between ${range.from}::date and ${range.to}::date`))
    .orderBy(asc(orders.commitmentDate), asc(orders.orderNumber));
  return {
    filename: `orders-${range.from}-${range.to}.csv`,
    content: toCsv(
      ["Pesanan", "Customer", "Judul", "Jenis bukti", "Referensi", "Tanggal komitmen", "Nilai awal", "Status"],
      rows.map(({ order, customerName }) => [order.orderNumber, customerName, order.title, order.commitmentType, order.commitmentRef, order.commitmentDate, toMoneyDto(order.originalValue), order.cancelledAt ? "CANCELLED" : "ACTIVE"]),
    ),
  };
}
