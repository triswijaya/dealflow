import type { QuotationDocumentProps } from "@/server/pdf/quotation-document";
import type { loadQuotationForPdf } from "./quotations";

/** What the quotation PDF is drawn from, shared by the download route and the email handler. */
export function quotationDocumentProps({ quotation, items, seller, customer }: Awaited<ReturnType<typeof loadQuotationForPdf>>): QuotationDocumentProps {
  return {
    quotationNumber: quotation.quotationNumber,
    revisionNumber: quotation.revisionNumber,
    status: quotation.status,
    issueDate: quotation.issueDate,
    validUntil: quotation.validUntil,
    seller,
    customer,
    items: items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    })),
    subtotal: quotation.subtotal,
    discount: quotation.discount,
    tax: quotation.tax,
    total: quotation.total,
    notes: quotation.notes,
    terms: quotation.terms,
  };
}
