import { APIError } from "better-auth/api";
import { exportCsv } from "@/server/reports/reports";
import { getRequestId, logger } from "@/server/shared/logger";

/** CSV export: permission and tenant are checked on every request and nothing is cached. */
export async function GET(request: Request, ctx: RouteContext<"/api/export/[kind]">) {
  const { kind } = await ctx.params;
  const url = new URL(request.url);
  try {
    const { filename, content } = await exportCsv({
      headers: request.headers,
      kind,
      range: { from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined },
    });
    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof APIError) {
      const message = typeof error.body?.message === "string" ? error.body.message : "Request failed";
      return Response.json({ code: error.status, message }, { status: error.statusCode });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return Response.json({ code: "BAD_REQUEST", message: "Invalid date range" }, { status: 400 });
    }
    logger.error("export.failed", { requestId: getRequestId(request), error });
    return Response.json({ code: "INTERNAL_SERVER_ERROR", message: "Export failed" }, { status: 500 });
  }
}
