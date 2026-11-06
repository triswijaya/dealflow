import { renderInvoicePdf } from "@/server/pdf/quotation-document";
import { getInvoiceForPdf } from "@/server/invoices/invoice-views";
import { pdfResponse, routeError } from "@/server/shared/route-response";

/**
 * INV-05: same rules as the quotation PDF (PDF-04): the session, tenant and
 * permission are checked on every request, the id is an unguessable UUID, and
 * the file is rendered in memory and never cached.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/invoices/[invoiceId]/pdf">) {
  const { invoiceId } = await ctx.params;

  try {
    const document = await getInvoiceForPdf({ headers: request.headers, invoiceId });
    return pdfResponse(await renderInvoicePdf(document), document.invoiceNumber);
  } catch (error) {
    return routeError(error, request, "invoice_pdf.failed", "Failed to render PDF");
  }
}
