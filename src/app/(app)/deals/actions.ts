"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/lib/action-result";
import { createDeal, transitionDeal, updateDeal } from "@/server/deals/deals";
import { listPipelineStageCards, type DealFilters, type PipelineCardDto } from "@/server/deals/deal-views";
import { runAction } from "@/server/shared/action";

export type DealFormValues = {
  customerId: string;
  title: string;
  estimatedValue: string;
  assignedToId?: string;
  expectedCloseDate: string;
  description: string;
  notes: string;
};

function refresh(dealId: string, customerId: string) {
  revalidatePath("/deals");
  revalidatePath("/pipeline");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath(`/customers/${customerId}`);
}

/** One action for both forms: an id and version means edit, otherwise create. */
export async function saveDealAction(input: {
  dealId?: string;
  expectedVersion?: number;
  values: DealFormValues;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const requestHeaders = await headers();
    const { values } = input;
    const payload = {
      customerId: values.customerId,
      title: values.title,
      estimatedValue: values.estimatedValue,
      assignedToId: values.assignedToId || undefined,
      // The service takes a YYYY-MM-DD date or nothing; an empty field is nothing.
      expectedCloseDate: values.expectedCloseDate || undefined,
      description: values.description,
      notes: values.notes,
    };
    const saved =
      input.dealId && input.expectedVersion !== undefined
        ? await updateDeal({ headers: requestHeaders, dealId: input.dealId, expectedVersion: input.expectedVersion, input: payload })
        : await createDeal({ headers: requestHeaders, input: payload });
    refresh(saved.id, saved.customerId);
    return { id: saved.id };
  });
}

export async function transitionDealAction(input: {
  dealId: string;
  expectedVersion: number;
  toStatus: string;
  lostReason?: string;
  lostNote?: string;
}): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const deal = await transitionDeal({
      headers: await headers(),
      dealId: input.dealId,
      expectedVersion: input.expectedVersion,
      input: { toStatus: input.toStatus, lostReason: input.lostReason, lostNote: input.lostNote },
    });
    refresh(deal.id, deal.customerId);
    return { status: deal.status };
  });
}

export async function loadMorePipelineAction(input: {
  status: "NEW" | "CONTACTED" | "QUALIFIED" | "QUOTATION" | "NEGOTIATION";
  offset: number;
  filters: Omit<DealFilters, "status" | "createdFrom" | "createdTo">;
}): Promise<ActionResult<PipelineCardDto[]>> {
  return runAction(async () => listPipelineStageCards({ headers: await headers(), ...input }));
}
