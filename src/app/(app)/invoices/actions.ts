"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/lib/action-result";
import { createInvoice } from "@/server/invoices/invoices";
import {
  getInvoiceDraftContext,
  getInvoiceSourceContent,
  listInvoiceableItems,
  type InvoiceDraftContextDto,
  type InvoiceSourceContentDto,
  type InvoiceableItemDto,
} from "@/server/invoices/invoice-views";
import { recordPayment } from "@/server/invoices/payments";
import { runAction } from "@/server/shared/action";

export type IssueInvoiceValues = {
  billingItemId: string;
  quotationId?: string;
  expectedSourceEditVersion?: number;
  issueDate: string;
  dueDate: string;
  items: { description: string; quantity: string; unit: string; unitPrice: string }[];
  discount: string;
  tax: string;
  notes: string;
  terms: string;
  idempotencyKey: string;
};

function refresh(dealId: string | null, invoiceId?: string) {
  revalidatePath("/invoices");
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
  if (dealId) revalidatePath(`/deals/${dealId}`);
  revalidatePath("/dashboard");
}

/** API-05: the idempotency key is chosen by the wizard once per attempt, so a retry after a lost response returns the same invoice. */
export async function issueInvoiceAction(values: IssueInvoiceValues): Promise<ActionResult<{ id: string; invoiceNumber: string }>> {
  return runAction(async () => {
    const invoice = await createInvoice({
      headers: await headers(),
      input: { ...values, discount: values.discount || "0", tax: values.tax || "0", quotationId: values.quotationId || undefined },
    });
    refresh(invoice.dealId, invoice.id);
    return { id: invoice.id, invoiceNumber: invoice.invoiceNumber };
  });
}

export async function recordPaymentAction(input: {
  invoiceId: string;
  amount: string;
  paymentDate: string;
  paymentMethod: string;
  reference: string;
  note: string;
  idempotencyKey: string;
}): Promise<ActionResult<{ remainingAmount: string; status: string }>> {
  return runAction(async () => {
    const result = await recordPayment({ headers: await headers(), input });
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${input.invoiceId}`);
    revalidatePath("/dashboard");
    return { remainingAmount: result.remainingAmount, status: result.status };
  });
}

export async function searchInvoiceableDealsAction(input: { query: string }): Promise<ActionResult<InvoiceableItemDto[]>> {
  return runAction(async () => listInvoiceableItems({ headers: await headers(), query: input.query }));
}

export async function getInvoiceDraftContextAction(input: { billingItemId: string }): Promise<ActionResult<InvoiceDraftContextDto>> {
  return runAction(async () => getInvoiceDraftContext({ headers: await headers(), billingItemId: input.billingItemId }));
}

export async function getInvoiceSourceContentAction(input: { dealId: string; quotationId: string }): Promise<ActionResult<InvoiceSourceContentDto>> {
  return runAction(async () => getInvoiceSourceContent({ headers: await headers(), ...input }));
}
