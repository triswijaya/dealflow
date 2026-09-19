import { organizationDateString } from "@/server/shared/organization-date";

export type FollowUpBucket = "TODAY" | "OVERDUE" | "UPCOMING";

/**
 * FUP-03: Today/Overdue/Upcoming, computed at read-time from the
 * organization's local calendar date -- same overlay pattern as
 * effective-status.ts's EXPIRED for quotations, never written to the DB.
 * Buckets are mutually exclusive and only meaningful for an incomplete
 * follow-up on an active deal; callers filter those out before bucketing
 * (this function has no opinion on completedAt or deal status).
 */
export function followUpBucket(followUpAt: Date, timezone: string, todayOrg: string): FollowUpBucket {
  const followUpDateOrg = organizationDateString(timezone, followUpAt);
  if (followUpDateOrg === todayOrg) {
    return "TODAY";
  }
  return followUpDateOrg < todayOrg ? "OVERDUE" : "UPCOMING";
}
