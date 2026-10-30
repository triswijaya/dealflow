import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { billingItems, deals, orders } from "@/server/db/schema";
import { createInvoice, createInvoiceInputSchema } from "@/server/invoices/invoices";
import { calculateDocumentTotals } from "@/server/money/calculation";
import { transitionDeal } from "@/server/deals/deals";
import { amendOrder, confirmWon, rebalanceBillingItems } from "@/server/orders/orders";

// Test-only conveniences. The real services stay strict (WON needs evidence,
// an invoice equals its billing item); these helpers do what a user would do
// through the screens so older scenarios can keep their shape.

type TransitionParams = Parameters<typeof transitionDeal>[0];

/** transitionDeal, except that WON goes through confirmWon with a purchase order as evidence. */
export async function transitionOrWin(params: TransitionParams) {
  const input = params.input as { toStatus?: string };
  if (input.toStatus === "WON") {
    const { deal } = await confirmWon({
      headers: params.headers,
      dealId: params.dealId,
      expectedVersion: params.expectedVersion,
      input: { commitmentType: "PURCHASE_ORDER", commitmentRef: "PO-TEST" },
    });
    return deal;
  }
  return transitionDeal(params);
}

/** Wins a deal at its current version. */
export async function winDeal(headers: Headers, dealId: string, input: Record<string, unknown> = {}) {
  const current = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  return confirmWon({ headers, dealId, expectedVersion: current!.version, input: { commitmentType: "PURCHASE_ORDER", ...input } });
}

/** The billing item a "bill the deal" scenario means: the first live one of the deal's first order. */
export async function firstBillingItemOfDeal(dealId: string) {
  const [row] = await db
    .select({ item: billingItems, order: orders })
    .from(billingItems)
    .innerJoin(orders, and(eq(orders.id, billingItems.orderId), eq(orders.organizationId, billingItems.organizationId)))
    .where(and(eq(orders.dealId, dealId), isNull(billingItems.cancelledAt), isNull(orders.cancelledAt)))
    .orderBy(asc(orders.createdAt), asc(billingItems.sortOrder), asc(billingItems.id))
    .limit(1);
  return row;
}

/**
 * createInvoice for a deal: finds its first billing item and, when the invoice
 * total differs from that item's amount, makes the plan match the way a user
 * would (split the item to bill less, amend the order to bill more).
 */
export async function createInvoiceForDeal(params: { headers: Headers; input: Record<string, unknown> & { dealId: string } }) {
  const { dealId, ...rest } = params.input;
  const row = await firstBillingItemOfDeal(dealId);
  if (!row) throw new Error(`No billing item for deal ${dealId}`);
  let billingItemId = row.item.id;

  const parsed = createInvoiceInputSchema.safeParse({ ...rest, billingItemId });
  if (parsed.success) {
    const calculated = calculateDocumentTotals({
      items: parsed.data.items.map((item) => ({ quantityScaled: item.quantity, unitPrice: item.unitPrice })),
      discount: parsed.data.discount,
      tax: parsed.data.tax,
    });
    if (calculated.ok && calculated.totals.total !== row.item.amount) {
      const total = calculated.totals.total;
      const live = await db.query.invoices.findFirst({ where: (invoice, { eq: eqOp, and: andOp, isNull: isNullOp }) => andOp(eqOp(invoice.billingItemId, billingItemId), isNullOp(invoice.voidedAt)), columns: { id: true } });
      if (!live) {
        if (total < row.item.amount) {
          const split = await rebalanceBillingItems({
            headers: params.headers,
            orderId: row.order.id,
            input: {
              reason: "test split",
              items: [
                { id: row.item.id, label: row.item.label, amount: total.toString(), trigger: "ON_ORDER" },
                { label: "Sisa", amount: (row.item.amount - total).toString(), trigger: "ON_ORDER" },
              ],
            },
          });
          billingItemId = split.billingItems.find((item) => item.id === row.item.id)!.id;
        } else {
          await amendOrder({ headers: params.headers, orderId: row.order.id, input: { delta: (total - row.item.amount).toString(), reason: "test top-up" } });
          const refreshed = await firstBillingItemOfDeal(dealId);
          // The top-up is a new ON_ORDER item; merge it into the first so one item carries the whole invoice.
          await rebalanceBillingItems({
            headers: params.headers,
            orderId: row.order.id,
            input: { reason: "test merge", items: [{ id: row.item.id, label: row.item.label, amount: total.toString(), trigger: "ON_ORDER" }] },
          });
          void refreshed;
        }
      }
    }
  }
  return createInvoice({ headers: params.headers, input: { ...rest, billingItemId } });
}

