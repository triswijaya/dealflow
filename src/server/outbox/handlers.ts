import { z } from "zod";
import { sendEmail } from "@/server/email/send-email";
import { loadInvoiceForPdf } from "@/server/invoices/invoice-views";
import { renderInvoicePdf, renderQuotationPdf } from "@/server/pdf/quotation-document";
import { quotationDocumentProps } from "@/server/quotations/pdf-props";
import { loadQuotationForPdf } from "@/server/quotations/quotations";
import { registerOutboxHandler } from "./outbox";

// The two kinds of mail the outbox sends. The payload holds what to say and to
// whom; a document is rendered from its frozen snapshot at send time, so a retry
// days later still mails what the customer was meant to get.

export const DOCUMENT_EMAIL = "email.document";
export const DAILY_SUMMARY_EMAIL = "email.daily_summary";

const documentPayload = z.object({
  kind: z.enum(["QUOTATION", "INVOICE"]),
  documentId: z.string().uuid(),
  to: z.string().email(),
  subject: z.string(),
  text: z.string(),
});
const summaryPayload = z.object({ to: z.string().email(), subject: z.string(), text: z.string() });

const safeFilename = (number: string) => number.replace(/[^A-Za-z0-9-]/g, "_");

registerOutboxHandler(DOCUMENT_EMAIL, async (event) => {
  const payload = documentPayload.parse(event.payload);
  if (payload.kind === "QUOTATION") {
    const loaded = await loadQuotationForPdf(event.organizationId, payload.documentId);
    const content = await renderQuotationPdf(quotationDocumentProps(loaded));
    await sendEmail({
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      attachments: [{ filename: `${safeFilename(loaded.quotation.quotationNumber)}.pdf`, content, contentType: "application/pdf" }],
    });
    return;
  }
  const document = await loadInvoiceForPdf(event.organizationId, payload.documentId);
  const content = await renderInvoicePdf(document);
  await sendEmail({
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    attachments: [{ filename: `${safeFilename(document.invoiceNumber)}.pdf`, content, contentType: "application/pdf" }],
  });
});

registerOutboxHandler(DAILY_SUMMARY_EMAIL, async (event) => {
  const payload = summaryPayload.parse(event.payload);
  await sendEmail({ to: payload.to, subject: payload.subject, text: payload.text });
});
