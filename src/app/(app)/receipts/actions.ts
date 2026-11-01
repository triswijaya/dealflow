"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/lib/action-result";
import { allocateReceipt, identifyReceipt, listReceipts, recordReceipt, recordRefund, reverseReceipt } from "@/server/receipts/receipts";
import type { ReceiptDto } from "@/server/receipts/dto";
import { listInvoiceRows, type InvoiceRowDto } from "@/server/invoices/invoice-views";
import { runAction } from "@/server/shared/action";

function refresh(receiptId?: string) {
  revalidatePath("/receipts");
  if (receiptId) revalidatePath(`/receipts/${receiptId}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}

/** RCP-01: money that came in, with or without a known customer (an advance, a combined transfer, an unknown sender). */
export async function recordReceiptAction(input: {
  customerId?: string;
  amount: string;
  receivedOn: string;
  method: string;
  reference?: string;
  note?: string;
  idempotencyKey: string;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const receipt = await recordReceipt({ headers: await headers(), input: { ...input, customerId: input.customerId || undefined, reference: input.reference || undefined, note: input.note || undefined } });
    refresh(receipt.id);
    return { id: receipt.id };
  });
}

export async function identifyReceiptAction(input: { receiptId: string; customerId: string; basis: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    await identifyReceipt({ headers: await headers(), receiptId: input.receiptId, input: { customerId: input.customerId, basis: input.basis } });
    refresh(input.receiptId);
    return null;
  });
}

/** SET-02: one receipt can settle several invoices of its customer. */
export async function allocateReceiptAction(input: { receiptId: string; allocations: { invoiceId: string; amount: string }[]; idempotencyKey: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    await allocateReceipt({ headers: await headers(), receiptId: input.receiptId, input: { allocations: input.allocations, idempotencyKey: input.idempotencyKey } });
    refresh(input.receiptId);
    for (const allocation of input.allocations) revalidatePath(`/invoices/${allocation.invoiceId}`);
    return null;
  });
}

export async function reverseReceiptAction(input: { receiptId: string; reason: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    await reverseReceipt({ headers: await headers(), receiptId: input.receiptId, input: { reason: input.reason } });
    refresh(input.receiptId);
    return null;
  });
}

export async function refundReceiptAction(input: { receiptId: string; amount: string; refundedOn: string; reason: string; reference?: string; idempotencyKey: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    await recordRefund({ headers: await headers(), receiptId: input.receiptId, input: { ...input, reference: input.reference || undefined } });
    refresh(input.receiptId);
    return null;
  });
}

/** For the allocation dialog: the customer's open invoices, oldest due first, and its receipts with money left. */
export async function allocationOptionsAction(customerId: string): Promise<ActionResult<{ invoices: InvoiceRowDto[]; receipts: ReceiptDto[] }>> {
  return runAction(async () => {
    const requestHeaders = await headers();
    const [invoices, receipts] = await Promise.all([
      listInvoiceRows({ headers: requestHeaders, pageSize: 100, filters: { customerId } }),
      listReceipts({ headers: requestHeaders, customerId, open: true, pageSize: 100 }),
    ]);
    return { invoices: invoices.items.filter((invoice) => BigInt(invoice.remainingAmount) > 0n).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)), receipts: receipts.items };
  });
}
