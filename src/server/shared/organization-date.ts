// DATA-04: quotation numbering (QUO-04), expiry (QUO-10), and later
// follow-up buckets (FUP-03) all use "today" in the organization's own
// timezone, never the server's UTC day or the browser's timezone. The
// clock (`now`) is always a parameter, never read from `new Date()`
// internally, so tests can pin a fixed instant instead of racing the real
// clock across a UTC day boundary.
//
// Intl.DateTimeFormat with a `timeZone` is used instead of a date library:
// it is built into Node/V8, needs no dependency, and correctly folds in
// DST/offset rules for the IANA zone name stored in
// organizationSettings.timezone.

/**
 * The organization's local calendar date for the given instant, as
 * YYYY-MM-DD. This is a plain string on purpose (DATA-04 / the same
 * reasoning as deals.expectedCloseDate): a date-only value that never
 * round-trips through a JS Date, so it can't silently pick up an
 * off-by-one-day bug from an implicit timezone conversion.
 */
export function organizationDateString(timezone: string, now: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA formats as YYYY-MM-DD directly, avoiding a second parse/reorder
  // step that could introduce its own bug.
  return formatter.format(now);
}

/** The four-digit year of organizationDateString, for QUO-04's numbering. */
export function organizationYear(timezone: string, now: Date): number {
  return Number(organizationDateString(timezone, now).slice(0, 4));
}
