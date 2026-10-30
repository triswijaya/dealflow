// BIL-03 / ORD-05: the statuses of a billing item and of an order are derived
// when read, from facts (dates, milestones, live invoices, settlements). Nothing
// stores them, so they cannot drift and no cron has to keep them right.

export type BillingItemStatus = "PLANNED" | "READY" | "INVOICED" | "CANCELLED";
export type OrderStatus = "CANCELLED" | "CLOSED" | "FULLY_BILLED" | "ACTIVE";

export type BillingItemFacts = {
  trigger: string;
  dueOn: string | null;
  milestoneDoneAt: Date | null;
  cancelledAt: Date | null;
  /** A live (non-void) invoice exists for the item. */
  hasLiveInvoice: boolean;
};

/**
 * CANCELLED beats INVOICED beats the trigger. ON_ORDER is ready at once, ON_DATE
 * from the due date (inclusive) and ON_MILESTONE once the milestone is marked done.
 */
export function billingItemStatus(item: BillingItemFacts, today: string): BillingItemStatus {
  if (item.cancelledAt) return "CANCELLED";
  if (item.hasLiveInvoice) return "INVOICED";
  const triggered =
    item.trigger === "ON_ORDER" ||
    (item.trigger === "ON_DATE" && item.dueOn !== null && item.dueOn <= today) ||
    (item.trigger === "ON_MILESTONE" && item.milestoneDoneAt !== null);
  return triggered ? "READY" : "PLANNED";
}

/** CLOSED needs every live item invoiced and every live invoice paid; an order without live items is just ACTIVE. */
export function orderStatus(params: { cancelledAt: Date | null; itemStatuses: BillingItemStatus[]; liveInvoicesPaid: boolean[] }): OrderStatus {
  if (params.cancelledAt) return "CANCELLED";
  const live = params.itemStatuses.filter((status) => status !== "CANCELLED");
  const fullyBilled = live.length > 0 && live.every((status) => status === "INVOICED");
  if (!fullyBilled) return "ACTIVE";
  return params.liveInvoicesPaid.every(Boolean) ? "CLOSED" : "FULLY_BILLED";
}

/** ORD-03: the running value is the original value plus every signed amendment. */
export function runningValue(originalValue: bigint, deltas: bigint[]): bigint {
  return deltas.reduce((sum, delta) => sum + delta, originalValue);
}
