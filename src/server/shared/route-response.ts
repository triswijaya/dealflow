import { APIError } from "better-auth/api";
import { getRequestId, logger } from "./logger";

/** A known service error keeps its status and message; anything else is logged and answered without internals (API-02). */
export function routeError(error: unknown, request: Request, operation: string, failure: string): Response {
  if (error instanceof APIError) {
    const message = typeof error.body?.message === "string" ? error.body.message : "Request failed";
    return Response.json({ code: error.status, message }, { status: error.statusCode });
  }
  logger.error(operation, { requestId: getRequestId(request), error });
  return Response.json({ code: "INTERNAL_SERVER_ERROR", message: failure }, { status: 500 });
}

/**
 * PDF-04: a per-tenant document, never cached by a shared cache. The number is server-made
 * (QT-YYYY-NNNNN, INV-YYYY-NNNNN), so the replace is only defense in depth.
 */
export function pdfResponse(buffer: Buffer, documentNumber: string): Response {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${documentNumber.replace(/[^A-Za-z0-9-]/g, "_")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
