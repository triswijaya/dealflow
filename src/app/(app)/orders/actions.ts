"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/lib/action-result";
import { amendOrder, cancelOrder, markMilestone, rebalanceBillingItems } from "@/server/orders/orders";
import { runAction } from "@/server/shared/action";
import type { PlanItemInput } from "../deals/actions";

export type PlanItemEdit = PlanItemInput & { id?: string };

function refresh(orderId: string, dealId: string | null) {
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/invoices/new");
  if (dealId) revalidatePath(`/deals/${dealId}`);
}

/** ORD-03: extra or reduced work. Without a plan the server adds or trims termin to balance. */
export async function amendOrderAction(input: { orderId: string; delta: string; reason: string; reference?: string; effectiveDate?: string }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const order = await amendOrder({
      headers: await headers(),
      orderId: input.orderId,
      input: { delta: input.delta, reason: input.reason, reference: input.reference || undefined, effectiveDate: input.effectiveDate || undefined },
    });
    refresh(order.id, order.dealId);
    return { id: order.id };
  });
}

/** BIL-02: reshape the termin that are not invoiced yet; the total stays the order value. */
export async function rebalanceOrderAction(input: { orderId: string; reason: string; items: PlanItemEdit[] }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const order = await rebalanceBillingItems({ headers: await headers(), orderId: input.orderId, input: { reason: input.reason, items: input.items } });
    refresh(order.id, order.dealId);
    return { id: order.id };
  });
}

/** BIL-03: a milestone (BAST) is done, so its termin is ready to bill. */
export async function markMilestoneAction(input: { orderId: string; billingItemId: string; milestoneRef?: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    await markMilestone({ headers: await headers(), billingItemId: input.billingItemId, input: { milestoneRef: input.milestoneRef || undefined } });
    refresh(input.orderId, null);
    return null;
  });
}

/** ORD-05: only while no invoice is live; money already received stays as customer credit. */
export async function cancelOrderAction(input: { orderId: string; reason: string }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const order = await cancelOrder({ headers: await headers(), orderId: input.orderId, input: { reason: input.reason } });
    refresh(order.id, order.dealId);
    return { id: order.id };
  });
}
