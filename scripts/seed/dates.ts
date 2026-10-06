/** YYYY-MM-DD plus a whole number of days, calendar-only (no timezone drift). */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** A Jakarta (WIB, UTC+7) wall-clock time on a given date, as an ISO instant string. */
export function wib(isoDate: string, time: string): string {
  return `${isoDate}T${time}:00+07:00`;
}
