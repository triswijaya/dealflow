import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { createInvoiceInTx, createInvoiceInputSchema } from "@/server/invoices/invoices";
import { recordPaymentInTx, recordPaymentInputSchema } from "@/server/invoices/payments";
import { organizationClock } from "@/server/shared/organization-clock";
import { APIError } from "better-auth/api";
import { directOrderSchema, getOrder, insertDirectOrder } from "./orders";

// Optional parts of the one-submit flow (ORD-02): what to invoice and what was paid.
const invoicePartSchema = createInvoiceInputSchema
  .omit({ billingItemId: true, items: true, quotationId: true, expectedSourceEditVersion: true, replacesInvoiceId: true })
  .extend({ items: createInvoiceInputSchema.shape.items.optional(), dueDate: createInvoiceInputSchema.shape.dueDate.optional() });
const paymentPartSchema = recordPaymentInputSchema
  .omit({ invoiceId: true, amount: true, paymentDate: true })
  .extend({ amount: recordPaymentInputSchema.shape.amount.optional(), paymentDate: recordPaymentInputSchema.shape.paymentDate.optional() });

const inputSchema = z.object({ order: z.unknown(), invoice: z.unknown().optional(), payment: z.unknown().optional() });

/**
 * ORD-02: a buyer who pays on the spot. One submit makes the order, issues the
 * invoice of its first billing item and records the payment, in one transaction:
 * either all of it or none. Sales may create the order alone; invoicing needs
 * invoice rights and recording the payment needs payment rights, checked here
 * so a Sales user cannot reach them through this door. No deal is made.
 */
export async function createDirectOrderWithBilling(params: { headers: Headers; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { order: ["write"] } });
  const parts = inputSchema.parse(params.input);
  const orderInput = directOrderSchema.parse(parts.order);
  const invoicePart = parts.invoice === undefined ? null : invoicePartSchema.parse(parts.invoice);
  const paymentPart = parts.payment === undefined ? null : paymentPartSchema.parse(parts.payment);
  if (paymentPart && !invoicePart) {
    throw new APIError("BAD_REQUEST", { message: "A payment needs an invoice to settle" });
  }
  if (invoicePart) await requirePermission({ headers: params.headers, permission: { invoice: ["write"] } });
  if (paymentPart) await requirePermission({ headers: params.headers, permission: { payment: ["write"] } });
  const clock = await organizationClock(actor.organizationId);

  const ids = await db.transaction(async (tx) => {
    const order = await insertDirectOrder(tx, actor, clock, orderInput);
    if (!invoicePart) return { orderId: order.id, invoiceId: null, paymentId: null };

    const item = (await tx.query.billingItems.findFirst({
      where: (billingItem, { eq: eqOp }) => eqOp(billingItem.orderId, order.id),
      orderBy: (billingItem, { asc }) => asc(billingItem.sortOrder),
    }))!;
    const invoice = await createInvoiceInTx(
      tx,
      actor,
      clock,
      createInvoiceInputSchema.parse({
        ...invoicePart,
        billingItemId: item.id,
        dueDate: invoicePart.dueDate ?? clock.today,
        items: invoicePart.items ?? [{ description: order.title, quantity: "1", unit: "paket", unitPrice: item.amount.toString() }],
      }),
    );
    if (!paymentPart) return { orderId: order.id, invoiceId: invoice.id, paymentId: null };

    const payment = await recordPaymentInTx(
      tx,
      actor,
      clock,
      recordPaymentInputSchema.parse({
        ...paymentPart,
        invoiceId: invoice.id,
        amount: (paymentPart.amount ?? BigInt(invoice.total)).toString(),
        paymentDate: paymentPart.paymentDate ?? clock.today,
      }),
    );
    return { orderId: order.id, invoiceId: invoice.id, paymentId: payment.payment.id };
  });

  return { ...ids, order: await getOrder({ headers: params.headers, orderId: ids.orderId }) };
}
