"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/lib/action-result";
import { listContacts, type ContactDto } from "@/server/customers/contacts";
import { createDeal, putDealOnHold, reopenDeal, resumeDeal, transitionDeal, updateDeal } from "@/server/deals/deals";
import { listPipelineStageCards, type DealFilters, type PipelineCardDto } from "@/server/deals/deal-views";
import { confirmWon } from "@/server/orders/orders";
import { runAction } from "@/server/shared/action";

export type DealFormValues = {
  customerId: string;
  contactId: string;
  title: string;
  estimatedValue: string;
  assignedToId?: string;
  /** The starting stage of a new deal; ignored on edit, where the stage moves on its own. */
  stage?: string;
  expectedCloseDate: string;
  description: string;
  notes: string;
};

export type PlanItemInput = { label: string; amount: string; trigger: "ON_ORDER" | "ON_DATE" | "ON_MILESTONE"; dueOn?: string; isRetention?: boolean };

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
      // An empty choice clears the PIC; the customer's primary contact still shows.
      contactId: values.contactId || null,
      title: values.title,
      estimatedValue: values.estimatedValue || "0",
      assignedToId: values.assignedToId || undefined,
      // The service takes a YYYY-MM-DD date or nothing; an empty field is nothing.
      expectedCloseDate: values.expectedCloseDate || undefined,
      description: values.description,
      notes: values.notes,
    };
    const saved =
      input.dealId && input.expectedVersion !== undefined
        ? await updateDeal({ headers: requestHeaders, dealId: input.dealId, expectedVersion: input.expectedVersion, input: payload })
        : await createDeal({ headers: requestHeaders, input: { ...payload, stage: values.stage || undefined } });
    refresh(saved.id, saved.customerId);
    return { id: saved.id };
  });
}

/** CUS-04: the contacts a deal's PIC can be chosen from. */
export async function listCustomerContactsAction(customerId: string): Promise<ActionResult<ContactDto[]>> {
  return runAction(async () => listContacts({ headers: await headers(), customerId }));
}

/** DEAL-04: Won needs the commitment evidence and creates the first order with its termin plan. */
export async function confirmWonAction(input: {
  dealId: string;
  expectedVersion: number;
  commitmentType: string;
  commitmentRef?: string;
  commitmentDate?: string;
  value?: string;
  sourceQuotationId?: string;
  billingItems?: PlanItemInput[];
}): Promise<ActionResult<{ status: string; orderId: string }>> {
  return runAction(async () => {
    const { deal, order } = await confirmWon({
      headers: await headers(),
      dealId: input.dealId,
      expectedVersion: input.expectedVersion,
      input: {
        commitmentType: input.commitmentType,
        commitmentRef: input.commitmentRef || undefined,
        commitmentDate: input.commitmentDate || undefined,
        value: input.value || undefined,
        sourceQuotationId: input.sourceQuotationId || undefined,
        billingItems: input.billingItems?.length ? input.billingItems : undefined,
      },
    });
    refresh(deal.id, deal.customerId);
    return { status: deal.status, orderId: order.id };
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

/** DEAL-07: park a deal until a review date; calling it again extends the hold. */
export async function holdDealAction(input: { dealId: string; expectedVersion: number; reviewDate: string; reason: string }): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const deal = await putDealOnHold({
      headers: await headers(),
      dealId: input.dealId,
      expectedVersion: input.expectedVersion,
      input: { reviewDate: input.reviewDate, reason: input.reason },
    });
    refresh(deal.id, deal.customerId);
    return { status: deal.status };
  });
}

export async function resumeDealAction(input: { dealId: string; expectedVersion: number }): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const deal = await resumeDeal({ headers: await headers(), ...input });
    refresh(deal.id, deal.customerId);
    return { status: deal.status };
  });
}

/** DEAL-08: back to an active stage. A won deal's orders are cancelled in the same step. */
export async function reopenDealAction(input: { dealId: string; expectedVersion: number; toStatus: string; reason: string }): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const deal = await reopenDeal({
      headers: await headers(),
      dealId: input.dealId,
      expectedVersion: input.expectedVersion,
      input: { toStatus: input.toStatus, reason: input.reason },
    });
    refresh(deal.id, deal.customerId);
    return { status: deal.status };
  });
}

export async function loadMorePipelineAction(input: {
  status: "PROSPECT" | "PROPOSAL" | "NEGOTIATION" | "COMMITMENT";
  offset: number;
  filters: Omit<DealFilters, "status" | "createdFrom" | "createdTo">;
}): Promise<ActionResult<PipelineCardDto[]>> {
  return runAction(async () => listPipelineStageCards({ headers: await headers(), ...input }));
}
