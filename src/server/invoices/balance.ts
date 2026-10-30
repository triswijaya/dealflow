import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { settlements } from "@/server/db/schema";

type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/**
 * §10.3: `settled_amount = sum(settlement aktif ke invoice)`, every kind
 * (receipt, withholding, write-off); a reversed settlement no longer counts.
 *
 * One grouped query for however many invoices are asked about, so a list
 * read does not fan out into a query per row. Postgres `sum()` over bigint
 * returns numeric, which postgres.js hands back as a string; it is parsed
 * with BigInt, never Number, so a large total stays exact (MONEY-01,
 * MONEY-04's "Agregasi dashboard tetap exact dan tidak dikonversi ke
 * number"). Invoices with nothing settled simply have no row in the result and
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
    .select({ invoiceId: settlements.invoiceId, paid: sql<string>`sum(${settlements.amount})` })
    .from(settlements)
    .where(
      and(
        eq(settlements.organizationId, params.organizationId),
        inArray(settlements.invoiceId, params.invoiceIds),
        isNull(settlements.reversedAt),
      ),
    )
    .groupBy(settlements.invoiceId);

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
