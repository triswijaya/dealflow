import "@/server/outbox/handlers";
import { enqueueDailySummaries } from "@/server/outbox/daily-summary";
import { processOutbox } from "@/server/outbox/outbox";
import { getRequestId, logger } from "@/server/shared/logger";
import { isAuthorizedCron } from "@/server/shared/cron-auth";

// ADR-0004: queues the day's summary mails (once per recipient per day), then sends what it can.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return Response.json({ code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  try {
    const queued = await enqueueDailySummaries();
    const sent = await processOutbox({ limit: 50 });
    return Response.json({ queued, sent });
  } catch (error) {
    logger.error("cron.daily_summary.failed", { requestId: getRequestId(request), error });
    return Response.json({ code: "INTERNAL_SERVER_ERROR", message: "Summary failed" }, { status: 500 });
  }
}
