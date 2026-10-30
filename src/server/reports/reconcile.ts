import { sql, type SQL } from "drizzle-orm";
import type { db } from "@/server/db/client";

type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

// OPS / ADR-0003: the invariants the services keep under lock, checked again from the
// data alone. A finding means a bug or a hand-made change; nothing here repairs it.
// "error" fails `pnpm reconcile` (and so CI); "warning" is for things that need a
// person to look (deals won before orders existed, mail that gave up).

export type Finding = { check: string; severity: "error" | "warning"; organizationId: string; ids: string[]; message: string };

type Check = { name: string; severity: Finding["severity"]; message: string; query: (scope: SQL) => SQL };

// `scope` narrows every check to one organization, or is `true`.
const CHECKS: Check[] = [
  {
    name: "order_plan_matches_value",
    severity: "error",
    message: "The live billing items of an order do not add up to its original value plus amendments (BIL-02)",
    query: (scope) => sql`
      select o.organization_id, o.id::text as id from orders o
      where o.cancelled_at is null and ${scope}
        and coalesce((select sum(b.amount) from billing_items b where b.order_id = o.id and b.cancelled_at is null), 0)
          <> o.original_value + coalesce((select sum(a.delta) from order_amendments a where a.order_id = o.id), 0)`,
  },
  {
    name: "live_invoice_equals_item",
    severity: "error",
    message: "A live invoice total differs from its billing item amount (INV-03)",
    query: (scope) => sql`
      select i.organization_id, i.id::text as id from invoices i join billing_items b on b.id = i.billing_item_id
      where i.voided_at is null and i.total <> b.amount and ${scope}`,
  },
  {
    name: "one_live_invoice_per_item",
    severity: "error",
    message: "A billing item has more than one live invoice (INV-04)",
    query: (scope) => sql`
      select i.organization_id, i.billing_item_id::text as id from invoices i
      where i.voided_at is null and ${scope}
      group by i.organization_id, i.billing_item_id having count(*) > 1`,
  },
  {
    name: "invoice_not_over_settled",
    severity: "error",
    message: "An invoice is settled for more than its total (SET-02)",
    query: (scope) => sql`
      select i.organization_id, i.id::text as id from invoices i
      where i.voided_at is null and ${scope}
        and coalesce((select sum(s.amount) from settlements s where s.invoice_id = i.id and s.reversed_at is null), 0) > i.total`,
  },
  {
    name: "receipt_not_over_allocated",
    severity: "error",
    message: "A receipt is allocated and refunded for more than it received (SET-02)",
    query: (scope) => sql`
      select r.organization_id, r.id::text as id from receipts r
      where r.reversed_at is null and ${scope}
        and coalesce((select sum(s.amount) from settlements s where s.receipt_id = r.id and s.reversed_at is null), 0)
          + coalesce((select sum(f.amount) from refunds f where f.receipt_id = r.id), 0) > r.amount`,
  },
  {
    name: "settlement_same_customer",
    severity: "error",
    message: "A receipt settles an invoice of another customer (SET-01)",
    query: (scope) => sql`
      select s.organization_id, s.id::text as id from settlements s
      join invoices i on i.id = s.invoice_id join receipts r on r.id = s.receipt_id
      where s.reversed_at is null and ${scope} and (r.customer_id is null or r.customer_id <> i.customer_id)`,
  },
  {
    name: "no_settlement_on_void_invoice",
    severity: "error",
    message: "An active settlement sits on a voided invoice (INV-08)",
    query: (scope) => sql`
      select s.organization_id, s.id::text as id from settlements s join invoices i on i.id = s.invoice_id
      where s.reversed_at is null and i.voided_at is not null and ${scope}`,
  },
  {
    name: "no_live_invoice_on_cancelled_order",
    severity: "error",
    message: "A cancelled order still has a live invoice (ORD-04)",
    query: (scope) => sql`
      select i.organization_id, i.id::text as id from invoices i join orders o on o.id = i.order_id
      where i.voided_at is null and o.cancelled_at is not null and ${scope}`,
  },
  {
    name: "no_open_task_on_closed_deal",
    severity: "error",
    message: "A sales task is still open on a closed deal (FUP-04)",
    query: (scope) => sql`
      select f.organization_id, f.id::text as id from follow_ups f join deals d on d.id = f.deal_id
      where d.status in ('WON', 'LOST') and f.completed_at is null and f.cancelled_at is null and ${scope}`,
  },
  {
    name: "won_deal_has_order",
    severity: "warning",
    message: "A won deal has no live order (it was won before orders existed, or its orders were cancelled)",
    query: (scope) => sql`
      select d.organization_id, d.id::text as id from deals d
      where d.status = 'WON' and ${scope}
        and not exists (select 1 from orders o where o.deal_id = d.id and o.cancelled_at is null)`,
  },
  {
    name: "outbox_dead",
    severity: "warning",
    message: "Mail gave up after its last attempt (ADR-0004)",
    query: (scope) => sql`select e.organization_id, e.id::text as id from outbox_events e where e.status = 'DEAD' and ${scope}`,
  },
];

/** Runs every check, over all organizations or one, and groups the offending ids per check and organization. */
export async function runReconcile(executor: Executor, options: { organizationId?: string } = {}): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const check of CHECKS) {
    // The alias differs per check (o, i, r, s, f, d, e), so the scope is applied on the organization_id each query selects.
    const rows = await executor.execute<{ organization_id: string; id: string }>(
      options.organizationId
        ? sql`select * from (${check.query(sql`true`)}) as found where found.organization_id = ${options.organizationId}`
        : check.query(sql`true`),
    );
    const byOrganization = new Map<string, string[]>();
    for (const row of rows) byOrganization.set(row.organization_id, [...(byOrganization.get(row.organization_id) ?? []), row.id]);
    for (const [organizationId, ids] of byOrganization) {
      findings.push({ check: check.name, severity: check.severity, organizationId, ids, message: check.message });
    }
  }
  return findings;
}
