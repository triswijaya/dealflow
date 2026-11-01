"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/lib/action-result";
import { buildCollectionWhatsAppMessage, cancelCollectionTask, completeCollectionTask, createCollectionTask } from "@/server/collections/collections";
import { runAction } from "@/server/shared/action";

function refresh(invoiceId: string) {
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/work");
  revalidatePath("/dashboard");
}

/** FUP-01: a collection step on an invoice; PROMISE_TO_PAY puts the promised date in followUpAt. */
export async function createCollectionTaskAction(input: { invoiceId: string; type: string; note: string; followUpAt: string; done?: boolean }): Promise<ActionResult<null>> {
  return runAction(async () => {
    const followUpAt = new Date(input.followUpAt);
    const completedAt = input.done ? new Date(Math.min(followUpAt.getTime(), Date.now())) : undefined;
    await createCollectionTask({ headers: await headers(), input: { invoiceId: input.invoiceId, type: input.type, note: input.note, followUpAt, completedAt } });
    refresh(input.invoiceId);
    return null;
  });
}

export async function completeCollectionTaskAction(input: { invoiceId: string; followUpId: string; expectedVersion: number }): Promise<ActionResult<null>> {
  return runAction(async () => {
    await completeCollectionTask({ headers: await headers(), followUpId: input.followUpId, expectedVersion: input.expectedVersion });
    refresh(input.invoiceId);
    return null;
  });
}

export async function cancelCollectionTaskAction(input: { invoiceId: string; followUpId: string; reason: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    await cancelCollectionTask({ headers: await headers(), followUpId: input.followUpId, input: { reason: input.reason } });
    refresh(input.invoiceId);
    return null;
  });
}

/** WA-04: only builds the link; nothing is sent or marked. */
export async function collectionWhatsAppAction(invoiceId: string): Promise<ActionResult<{ contactName: string; message: string; deepLink: string }>> {
  return runAction(async () => {
    const built = await buildCollectionWhatsAppMessage({ headers: await headers(), invoiceId });
    return { contactName: built.contactName, message: built.message, deepLink: built.deepLink };
  });
}
