import { renderQuotationPdf } from "@/server/pdf/quotation-document";
import { quotationDocumentProps } from "@/server/quotations/pdf-props";
import { getQuotationForPdf } from "@/server/quotations/quotations";
import { pdfResponse, routeError } from "@/server/shared/route-response";

/**
 * PDF-04: session, tenant, and permission are verified on every request
 * (getQuotationForPdf runs requirePermission fresh, no caching anywhere in
 * this codebase), the URL carries an unguessable UUID rather than a
 * sequential id, and nothing is written to a persistent filesystem:
 * renderQuotationPdf resolves entirely in memory.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/quotations/[quotationId]/pdf">) {
  const { quotationId } = await ctx.params;

  try {
    const loaded = await getQuotationForPdf({ headers: request.headers, quotationId });
    return pdfResponse(await renderQuotationPdf(quotationDocumentProps(loaded)), loaded.quotation.quotationNumber);
  } catch (error) {
    return routeError(error, request, "quotation_pdf.failed", "Failed to render PDF");
  }
}
