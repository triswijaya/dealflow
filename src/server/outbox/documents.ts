import { and, eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { activities, deals, invoices, orders, quotations } from "@/server/db/schema";
import { db } from "@/server/db/client";
import { findContactEmail } from "@/server/customers/contacts";
import { loadInvoiceForPdf } from "@/server/invoices/invoice-views";
import { loadQuotationForPdf } from "@/server/quotations/quotations";
import { formatRupiah } from "@/server/money/amount";
import { formatIndonesianDate } from "@/server/pdf/format-date";
import { DOCUMENT_EMAIL } from "./handlers";
import { enqueueOutbox, tryOutboxNow } from "./outbox";

// ADR-0004 / QUO-08: mailing a document to the customer. It writes an outbox row and
// a timeline event in one transaction and tries to send right after the commit; if
// the provider is down the row stays and the sweep sends it later. Sending a
// quotation by email does not mark it SENT: that stays an explicit decision.

const inputSchema = z.object({
  to: z.string().trim().email().optional(),
  message: z.string().trim().max(2000).optional(),
  idempotencyKey: z.string().min(1).max(200),
});

async function recipientFor(organizationId: string, to: string | undefined, customerId: string, contactId: string | null) {
  if (to) return to;
  const email = await findContactEmail(organizationId, { customerId, contactId });
  if (!email) throw new APIError("BAD_REQUEST", { message: "There is no email address for this customer, enter one" });
  return email;
}

/** The deal's quotations are read-only once it is lost (QUO-11), mailing included. */
export async function sendQuotationEmail(params: { headers: Headers; quotationId: string; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { quotation: ["write"] } });
  const input = inputSchema.parse(params.input);
  const quotation = await db.query.quotations.findFirst({
    where: and(eq(quotations.id, params.quotationId), eq(quotations.organizationId, actor.organizationId)),
  });
  if (!quotation) throw new APIError("NOT_FOUND", { message: "Quotation not found" });
  const deal = await db.query.deals.findFirst({ where: and(eq(deals.id, quotation.dealId), eq(deals.organizationId, actor.organizationId)) });
  if (deal?.status === "LOST") throw new APIError("BAD_REQUEST", { message: "The deal is lost, so its quotations are read-only" });
  const to = await recipientFor(actor.organizationId, input.to, quotation.customerId, deal?.contactId ?? null);

  const loaded = await loadQuotationForPdf(actor.organizationId, quotation.id);
  const sellerName = loaded.seller.name ?? "kami";
  const outboxId = await db.transaction(async (tx) => {
    const id = await enqueueOutbox(tx, {
      organizationId: actor.organizationId,
      type: DOCUMENT_EMAIL,
      dedupeKey: `quotation:${quotation.id}:${input.idempotencyKey}`,
      createdById: actor.userId,
      payload: {
        kind: "QUOTATION",
        documentId: quotation.id,
        to,
        subject: `Quotation ${quotation.quotationNumber} dari ${sellerName}`,
        text: [
          `Yth. ${loaded.customer.contactPerson ?? loaded.customer.companyName ?? "Bapak/Ibu"},`,
          "",
          input.message ?? `Terlampir quotation ${quotation.quotationNumber} untuk ${loaded.customer.companyName ?? "Anda"}, berlaku sampai ${formatIndonesianDate(quotation.validUntil)}.`,
          "",
          "Hormat kami,",
          sellerName,
        ].join("\n"),
      },
    });
    if (id) {
      await tx.insert(activities).values({
        organizationId: actor.organizationId,
        dealId: quotation.dealId,
        entityType: "quotation",
        eventType: "emailed",
        actorId: actor.userId,
        metadata: { quotationId: quotation.id, quotationNumber: quotation.quotationNumber },
        permissionCategory: "sales",
      });
    }
    return id;
  });
  await tryOutboxNow([outboxId]);
  return { queued: outboxId !== null, outboxId };
}

export async function sendInvoiceEmail(params: { headers: Headers; invoiceId: string; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { invoice: ["write"] } });
  const input = inputSchema.parse(params.input);
  const [row] = await db
    .select({ invoice: invoices, order: orders })
    .from(invoices)
    .innerJoin(orders, and(eq(orders.id, invoices.orderId), eq(orders.organizationId, invoices.organizationId)))
    .where(and(eq(invoices.id, params.invoiceId), eq(invoices.organizationId, actor.organizationId)));
  if (!row) throw new APIError("NOT_FOUND", { message: "Invoice not found" });
  if (row.invoice.voidedAt) throw new APIError("BAD_REQUEST", { message: "This invoice is void" });
  const to = await recipientFor(actor.organizationId, input.to, row.invoice.customerId, row.order.contactId);

  const document = await loadInvoiceForPdf(actor.organizationId, row.invoice.id);
  const sellerName = document.seller.name ?? "kami";
  const outboxId = await db.transaction(async (tx) => {
    const id = await enqueueOutbox(tx, {
      organizationId: actor.organizationId,
      type: DOCUMENT_EMAIL,
      dedupeKey: `invoice:${row.invoice.id}:${input.idempotencyKey}`,
      createdById: actor.userId,
      payload: {
        kind: "INVOICE",
        documentId: row.invoice.id,
        to,
        subject: `Invoice ${row.invoice.invoiceNumber} dari ${sellerName}`,
        text: [
          `Yth. ${document.customer.contactPerson ?? document.customer.companyName ?? "Bapak/Ibu"},`,
          "",
          input.message ?? `Terlampir invoice ${row.invoice.invoiceNumber} sebesar ${formatRupiah(row.invoice.total)}, jatuh tempo ${formatIndonesianDate(row.invoice.dueDate)}.`,
          "",
          "Hormat kami,",
          sellerName,
        ].join("\n"),
      },
    });
    if (id) {
      await tx.insert(activities).values({
        organizationId: actor.organizationId,
        dealId: row.invoice.dealId,
        orderId: row.invoice.orderId,
        entityType: "invoice",
        eventType: "emailed",
        actorId: actor.userId,
        metadata: { invoiceId: row.invoice.id, invoiceNumber: row.invoice.invoiceNumber },
        permissionCategory: "finance",
      });
    }
    return id;
  });
  await tryOutboxNow([outboxId]);
  return { queued: outboxId !== null, outboxId };
}

