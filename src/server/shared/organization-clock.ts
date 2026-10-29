import { eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { db } from "@/server/db/client";
import { organizationSettings } from "@/server/db/schema";
import { logger } from "./logger";
import { organizationDateString } from "./organization-date";

function findSettings(organizationId: string) {
  return db.query.organizationSettings.findFirst({
    where: eq(organizationSettings.organizationId, organizationId),
  });
}

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
  let settings = await findSettings(organizationId);
  if (!settings) {
    // Every organization gets a settings row at registration (AUTH-02), but
    // provisioning is two writes, so a crash between them can leave an owner
    // with a membership and no settings (G-07). Repair it with the defaults
    // instead of locking them out; the conflict clause makes a race harmless.
    await db.insert(organizationSettings).values({ organizationId }).onConflictDoNothing();
    logger.warn("organization.settings_repaired", { organizationId });
    settings = await findSettings(organizationId);
  }
  if (!settings) {
    throw new APIError("INTERNAL_SERVER_ERROR", { message: "Organization settings not found" });
  }
  const now = new Date();
  return { timezone: settings.timezone, today: organizationDateString(settings.timezone, now), now };
}
