"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/lib/action-result";
import { createQuotation, reviseQuotation, transitionQuotationStatus, updateQuotation } from "@/server/quotations/quotations";
import { sendQuotationEmail } from "@/server/outbox/documents";
import { runAction } from "@/server/shared/action";

export type QuotationFormValues = {
  issueDate: string;
  validUntil: string;
  items: { description: string; quantity: string; unit: string; unitPrice: string }[];
  discount: string;
  tax: string;
  notes: string;
  terms: string;
};

function refresh(quotationId: string, dealId: string) {
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
}

/** One action for both screens: an id and edit version means update the draft, otherwise create one on the deal. */
export async function saveQuotationAction(input: {
  dealId?: string;
  quotationId?: string;
  expectedEditVersion?: number;
  values: QuotationFormValues;
}): Promise<ActionResult<{ id: string; editVersion: number }>> {
  return runAction(async () => {
    const requestHeaders = await headers();
    const { values } = input;
    const payload = {
      issueDate: values.issueDate,
      validUntil: values.validUntil,
      items: values.items,
      discount: values.discount || "0",
      tax: values.tax || "0",
      notes: values.notes,
      terms: values.terms,
    };
    const saved =
      input.quotationId && input.expectedEditVersion !== undefined
        ? await updateQuotation({ headers: requestHeaders, quotationId: input.quotationId, expectedEditVersion: input.expectedEditVersion, input: payload })
        : await createQuotation({ headers: requestHeaders, input: { dealId: input.dealId, ...payload } });
    refresh(saved.id, saved.dealId);
    return { id: saved.id, editVersion: saved.editVersion };
  });
}

export async function transitionQuotationAction(input: {
  quotationId: string;
  expectedEditVersion: number;
  toStatus: "SENT" | "ACCEPTED" | "REJECTED";
}): Promise<ActionResult<{ status: string; dealAdvanced: boolean }>> {
  return runAction(async () => {
    const requestHeaders = await headers();
    const result = await transitionQuotationStatus({
      headers: requestHeaders,
      quotationId: input.quotationId,
      expectedEditVersion: input.expectedEditVersion,
      toStatus: input.toStatus,
    });
    refresh(result.id, result.dealId);
    return { status: result.status, dealAdvanced: input.toStatus === "SENT" };
  });
}

/** The idempotency key comes from the dialog (one per open), so a double click cannot create two revisions. */
export async function reviseQuotationAction(input: {
  sourceQuotationId: string;
  expectedLatestQuotationId: string;
  idempotencyKey: string;
}): Promise<ActionResult<{ id: string; quotationNumber: string }>> {
  return runAction(async () => {
    const revised = await reviseQuotation({ headers: await headers(), input });
    refresh(revised.id, revised.dealId);
    return { id: revised.id, quotationNumber: revised.quotationNumber };
  });
}

/** QUO-08: mail the PDF to the customer through the outbox. It does not mark the quotation sent. */
export async function sendQuotationEmailAction(input: { quotationId: string; to?: string; message?: string; idempotencyKey: string }): Promise<ActionResult<{ queued: boolean }>> {
  return runAction(async () => {
    const result = await sendQuotationEmail({
      headers: await headers(),
      quotationId: input.quotationId,
      input: { to: input.to || undefined, message: input.message || undefined, idempotencyKey: input.idempotencyKey },
    });
    revalidatePath(`/quotations/${input.quotationId}`);
    return { queued: result.queued };
  });
}
