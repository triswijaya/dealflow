import { and, eq, isNull, sql } from "drizzle-orm";
import type { db } from "@/server/db/client";
import { followUps } from "@/server/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * FUP-04: closing a deal cancels its open tasks, in the transaction that closes it.
 * Returns how many were cancelled, for the deal's event.
 */
export async function cancelOpenDealTasks(tx: Tx, params: { organizationId: string; dealId: string; actorId: string; at: Date }): Promise<number> {
  const cancelled = await tx
    .update(followUps)
    .set({ cancelledAt: params.at, updatedById: params.actorId, version: sql`${followUps.version} + 1` })
    .where(
      and(
        eq(followUps.organizationId, params.organizationId),
        eq(followUps.dealId, params.dealId),
        isNull(followUps.completedAt),
        isNull(followUps.cancelledAt),
      ),
    )
    .returning({ id: followUps.id });
  return cancelled.length;
}
