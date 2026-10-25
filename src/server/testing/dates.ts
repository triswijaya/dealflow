import { DEFAULT_TIMEZONE, zonedDateString } from "@/lib/format";

/**
 * YYYY-MM-DD `offset` days from today in the organization's timezone (test
 * organizations use Asia/Jakarta, the schema default).
 *
 * Any date a service compares against "today" (issue date, payment date, due
 * date, "this month") must come from here, never from `toISOString()`. The UTC
 * date runs a day behind Jakarta from 00:00 to 07:00 WIB, so a UTC-based date
 * makes tests pass or fail depending on the hour they run.
 */
export function orgDay(offset = 0, timezone: string = DEFAULT_TIMEZONE): string {
  // Jakarta has no daylight saving, so whole 24-hour steps land on whole days.
  return zonedDateString(new Date(Date.now() + offset * 86_400_000), timezone);
}
