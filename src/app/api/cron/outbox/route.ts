import "@/server/outbox/handlers";
import { processOutbox } from "@/server/outbox/outbox";
import { getRequestId, logger } from "@/server/shared/logger";
import { isAuthorizedCron } from "@/server/shared/cron-auth";

// OBS-05: sweeps the outbox. Safe to call twice at once (rows are claimed with SKIP
// LOCKED), safe to repeat (a sent row is never picked again), and its progress is in
// the table, not in this request.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return Response.json({ code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await processOutbox({ limit: 50 }));
  } catch (error) {
    logger.error("cron.outbox.failed", { requestId: getRequestId(request), error });
    return Response.json({ code: "INTERNAL_SERVER_ERROR", message: "Sweep failed" }, { status: 500 });
  }
}
