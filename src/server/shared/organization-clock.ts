import { eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { db } from "@/server/db/client";
import { organizationSettings } from "@/server/db/schema";
import { organizationDateString } from "./organization-date";

/**
 * The organization's timezone plus the current instant, resolved together
 * so a caller never mixes today's date from one timezone with a `now` read
 * separately (DATA-04). Originally private to quotations.ts (QUO-04); moved
 * here once follow-ups.ts (FUP-01/03) needed the same timezone+today+now
 * triple, so both modules resolve it identically instead of drifting.
 */
export async function organizationClock(organizationId: string): Promise<{
  timezone: string;
  today: string;
  now: Date;
}> {
  const settings = await db.query.organizationSettings.findFirst({
    where: eq(organizationSettings.organizationId, organizationId),
  });
  if (!settings) {
    // Every organization gets a settings row at registration (AUTH-02);
    // reaching here means that invariant broke, not a normal user error.
    throw new APIError("INTERNAL_SERVER_ERROR", { message: "Organization settings not found" });
  }
  const now = new Date();
  return { timezone: settings.timezone, today: organizationDateString(settings.timezone, now), now };
}
