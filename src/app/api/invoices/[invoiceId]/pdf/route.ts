import { APIError } from "better-auth/api";
import { renderInvoicePdf } from "@/server/pdf/quotation-document";
import { getInvoiceForPdf } from "@/server/invoices/invoice-views";
import { getRequestId, logger } from "@/server/shared/logger";

function safeFilename(invoiceNumber: string): string {
  return invoiceNumber.replace(/[^A-Za-z0-9-]/g, "_");
}

/**
 * INV-05: same rules as the quotation PDF (PDF-04): the session, tenant and
 * permission are checked on every request, the id is an unguessable UUID, and
 * the file is rendered in memory and never cached.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/invoices/[invoiceId]/pdf">) {
  const { invoiceId } = await ctx.params;

  try {
    const document = await getInvoiceForPdf({ headers: request.headers, invoiceId });
    const buffer = await renderInvoicePdf(document);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename(document.invoiceNumber)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof APIError) {
      const message = typeof error.body?.message === "string" ? error.body.message : "Request failed";
      return Response.json({ code: error.status, message }, { status: error.statusCode });
    }
    logger.error("invoice_pdf.failed", { requestId: getRequestId(request), error });
    return Response.json({ code: "INTERNAL_SERVER_ERROR", message: "Failed to render PDF" }, { status: 500 });
  }
}
