import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { payments } from "@/server/db/schema";

type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/**
 * §10.2: `paid_amount = sum(payment.amount yang tercatat valid)`.
 *
 * One grouped query for however many invoices are asked about, so a list
 * read does not fan out into a query per row. Postgres `sum()` over bigint
 * returns numeric, which postgres.js hands back as a string; it is parsed
 * with BigInt, never Number, so a large total stays exact (MONEY-01,
 * MONEY-04's "Agregasi dashboard tetap exact dan tidak dikonversi ke
 * number"). Invoices with no payments simply have no row in the result and
 * fall back to 0.
 */
export async function paidAmountsFor(
  executor: Executor,
  params: { organizationId: string; invoiceIds: string[] },
): Promise<Map<string, bigint>> {
  if (params.invoiceIds.length === 0) {
    return new Map();
  }

  const rows = await executor
    .select({ invoiceId: payments.invoiceId, paid: sql<string>`sum(${payments.amount})` })
    .from(payments)
    .where(
      and(eq(payments.organizationId, params.organizationId), inArray(payments.invoiceId, params.invoiceIds)),
    )
    .groupBy(payments.invoiceId);

  return new Map(rows.map((row) => [row.invoiceId, BigInt(row.paid)]));
}

/** Single-invoice convenience over paidAmountsFor. */
export async function paidAmountFor(
  executor: Executor,
  params: { organizationId: string; invoiceId: string },
): Promise<bigint> {
  const totals = await paidAmountsFor(executor, {
    organizationId: params.organizationId,
    invoiceIds: [params.invoiceId],
  });
  return totals.get(params.invoiceId) ?? 0n;
}
