"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import type { ActionResult } from "@/lib/action-result";
import { zonedLocalToInstant } from "@/lib/format";
import { requirePermission } from "@/server/auth/require-membership";
import { searchActiveDealOptions, type DealOptionDto } from "@/server/deals/deal-views";
import { completeFollowUp, createFollowUp, updateFollowUp } from "@/server/follow-ups/follow-ups";
import { runAction } from "@/server/shared/action";
import { organizationClock } from "@/server/shared/organization-clock";
import { getWhatsAppComposer, recordWhatsAppOpened, type WhatsAppComposerDto } from "@/server/whatsapp/whatsapp";

export type FollowUpFormValues = {
  dealId: string;
  type: string;
  note: string;
  /** Wall-clock "YYYY-MM-DDTHH:mm" in the organization's timezone (the form says "Jadwal (WIB)"). */
  scheduledAt: string;
  /** "Sudah terjadi? Catat sebagai selesai" */
  alreadyDone: boolean;
};

function refresh(dealId: string) {
  revalidatePath("/follow-ups");
  revalidatePath("/pipeline");
  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/dashboard");
}

async function instantIn(timezone: string, local: string, field: string): Promise<Date> {
  const instant = zonedLocalToInstant(local, timezone);
  if (Number.isNaN(instant.getTime())) {
    throw new APIError("BAD_REQUEST", { message: `Invalid ${field}` });
  }
  return instant;
}

/** One action for both forms: an id and version means reschedule/edit, otherwise create. */
export async function saveFollowUpAction(input: {
  followUpId?: string;
  expectedVersion?: number;
  values: FollowUpFormValues;
}): Promise<ActionResult<{ id: string; dealId: string }>> {
  return runAction(async () => {
    const requestHeaders = await headers();
    const { values } = input;
    const { organizationId } = await membershipOrg(requestHeaders);
    const { timezone } = await organizationClock(organizationId);
    const scheduled = await instantIn(timezone, values.scheduledAt, "schedule");
    // Logging something that already happened completes it at that moment, or
    // right now if the schedule is still ahead of us.
    const completedAt = values.alreadyDone ? new Date(Math.min(scheduled.getTime(), Date.now())) : undefined;

    let saved: { id: string; dealId: string };
    if (input.followUpId && input.expectedVersion !== undefined) {
      const updated = await updateFollowUp({
        headers: requestHeaders,
        followUpId: input.followUpId,
        expectedVersion: input.expectedVersion,
        input: { note: values.note, followUpAt: scheduled },
      });
      saved = updated;
      if (completedAt) {
        saved = await completeFollowUp({
          headers: requestHeaders,
          followUpId: updated.id,
          expectedVersion: updated.version,
          input: { completedAt },
        });
      }
    } else {
      saved = await createFollowUp({
        headers: requestHeaders,
        input: { dealId: values.dealId, type: values.type, note: values.note, followUpAt: scheduled, completedAt },
      });
    }
    refresh(saved.dealId);
    return { id: saved.id, dealId: saved.dealId };
  });
}

export async function completeFollowUpAction(input: {
  followUpId: string;
  expectedVersion: number;
  /** Wall-clock "YYYY-MM-DDTHH:mm" in the organization's timezone. */
  completedAt: string;
  note: string;
}): Promise<ActionResult<{ dealId: string }>> {
  return runAction(async () => {
    const requestHeaders = await headers();
    const { organizationId } = await membershipOrg(requestHeaders);
    const { timezone } = await organizationClock(organizationId);
    const completedAt = await instantIn(timezone, input.completedAt, "completedAt");
    const done = await completeFollowUp({
      headers: requestHeaders,
      followUpId: input.followUpId,
      expectedVersion: input.expectedVersion,
      input: { completedAt, note: input.note },
    });
    refresh(done.dealId);
    return { dealId: done.dealId };
  });
}

export async function searchDealOptionsAction(input: { query: string }): Promise<ActionResult<DealOptionDto[]>> {
  return runAction(async () => searchActiveDealOptions({ headers: await headers(), query: input.query }));
}

export async function getWhatsAppComposerAction(input: { dealId: string }): Promise<ActionResult<WhatsAppComposerDto>> {
  return runAction(async () => getWhatsAppComposer({ headers: await headers(), dealId: input.dealId }));
}

/** WA-03: opening WhatsApp is logged as its own event, never as a completed follow-up. */
export async function recordWhatsAppOpenedAction(input: { dealId: string; quotationId?: string }): Promise<ActionResult> {
  return runAction(async () => {
    await recordWhatsAppOpened({ headers: await headers(), dealId: input.dealId, quotationId: input.quotationId || undefined });
    revalidatePath(`/deals/${input.dealId}`);
    return null;
  });
}

async function membershipOrg(requestHeaders: Headers) {
  const actor = await requirePermission({ headers: requestHeaders, permission: { followUp: ["write"] } });
  return { organizationId: actor.organizationId };
}
