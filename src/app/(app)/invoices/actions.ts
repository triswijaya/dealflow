"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/lib/action-result";
import { createInvoice, voidInvoice } from "@/server/invoices/invoices";
import { reverseSettlement, settleInvoice } from "@/server/receipts/receipts";
import {
  getInvoiceDraftContext,
  getInvoiceSourceContent,
  listInvoiceableItems,
  type InvoiceDraftContextDto,
  type InvoiceSourceContentDto,
  type InvoiceableItemDto,
} from "@/server/invoices/invoice-views";
import { recordPayment } from "@/server/invoices/payments";
import { sendInvoiceEmail } from "@/server/outbox/documents";
import { runAction } from "@/server/shared/action";

export type IssueInvoiceValues = {
  billingItemId: string;
  replacesInvoiceId?: string;
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

/** INV-08: mail the invoice PDF to the customer through the outbox. */
export async function sendInvoiceEmailAction(input: { invoiceId: string; to?: string; message?: string; idempotencyKey: string }): Promise<ActionResult<{ queued: boolean }>> {
  return runAction(async () => {
    const result = await sendInvoiceEmail({
      headers: await headers(),
      invoiceId: input.invoiceId,
      input: { to: input.to || undefined, message: input.message || undefined, idempotencyKey: input.idempotencyKey },
    });
    revalidatePath(`/invoices/${input.invoiceId}`);
    return { queued: result.queued };
  });
}

/** INV-08: void needs a reason and no live settlement; the termin is ready again for a replacement. */
export async function voidInvoiceAction(input: { invoiceId: string; reason: string }): Promise<ActionResult<{ billingItemId: string }>> {
  return runAction(async () => {
    const invoice = await voidInvoice({ headers: await headers(), invoiceId: input.invoiceId, input: { reason: input.reason } });
    refresh(invoice.dealId, invoice.id);
    revalidatePath(`/orders/${invoice.orderId}`);
    return { billingItemId: invoice.billingItemId };
  });
}

/** SET-01: withholding tax (with the slip number) or a small write-off, neither of which is cash. */
export async function settleInvoiceAction(input: {
  invoiceId: string;
  kind: "WITHHOLDING" | "WRITE_OFF";
  amount: string;
  reference?: string;
  note?: string;
  idempotencyKey: string;
}): Promise<ActionResult<null>> {
  return runAction(async () => {
    await settleInvoice({
      headers: await headers(),
      invoiceId: input.invoiceId,
      input: { kind: input.kind, amount: input.amount, reference: input.reference || undefined, note: input.note || undefined, idempotencyKey: input.idempotencyKey },
    });
    refresh(null, input.invoiceId);
    return null;
  });
}

/** A wrong settlement is reversed, never deleted; the money goes back to its receipt. */
export async function reverseSettlementAction(input: { invoiceId: string; settlementId: string; reason: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    await reverseSettlement({ headers: await headers(), settlementId: input.settlementId, input: { reason: input.reason } });
    refresh(null, input.invoiceId);
    revalidatePath("/receipts");
    return null;
  });
}
