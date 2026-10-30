import { APIError } from "better-auth/api";
import { renderQuotationPdf } from "@/server/pdf/quotation-document";
import { quotationDocumentProps } from "@/server/quotations/pdf-props";
import { getQuotationForPdf } from "@/server/quotations/quotations";
import { getRequestId, logger } from "@/server/shared/logger";

// PDF-04: server-generated only (QT-YYYY-NNNNN[-Rn]), never user input --
// this replace() is cheap defense-in-depth, not something ever expected to
// actually strip anything.
function safeFilename(quotationNumber: string): string {
  return quotationNumber.replace(/[^A-Za-z0-9-]/g, "_");
}

/**
 * PDF-04: session, tenant, and permission are verified on every request
 * (getQuotationForPdf runs requirePermission fresh, no caching anywhere in
 * this codebase), the URL carries an unguessable UUID rather than a
 * sequential id, and nothing is written to a persistent filesystem --
 * renderQuotationPdf resolves entirely in memory.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/quotations/[quotationId]/pdf">) {
  const { quotationId } = await ctx.params;

  try {
    const loaded = await getQuotationForPdf({ headers: request.headers, quotationId });
    const { quotation } = loaded;
    const buffer = await renderQuotationPdf(quotationDocumentProps(loaded));

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename(quotation.quotationNumber)}.pdf"`,
        // Sensitive per-tenant document: never cached by a shared/proxy
        // cache, always re-verified on the next request.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof APIError) {
      const message = typeof error.body?.message === "string" ? error.body.message : "Request failed";
      return Response.json({ code: error.status, message }, { status: error.statusCode });
    }
    // API-02: never leak internals (stack trace, SQL) to the client.
    logger.error("quotation_pdf.failed", { requestId: getRequestId(request), error });
    return Response.json({ code: "INTERNAL_SERVER_ERROR", message: "Failed to render PDF" }, { status: 500 });
  }
}
