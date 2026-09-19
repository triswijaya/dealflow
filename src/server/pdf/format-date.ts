// PDF-01: issue_date/valid_until rendered on the document. The stored
// value is always a plain YYYY-MM-DD string (DATA-04), so this is pure
// string parsing, not a Date round-trip -- there is no timezone to get
// wrong here, unlike an instant.
const INDONESIAN_MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** "2026-09-19" -> "19 September 2026". */
export function formatIndonesianDate(isoDate: string): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`formatIndonesianDate expects YYYY-MM-DD, got: ${isoDate}`);
  }
  const [, year, month, day] = match;
  const monthName = INDONESIAN_MONTHS[Number(month) - 1];
  if (!monthName) {
    throw new Error(`formatIndonesianDate received an invalid month: ${isoDate}`);
  }
  // Number(day) drops a leading zero ("01" -> "1") for the display form;
  // the value itself was already validated against the regex above, so
  // this Number() only ever sees a clean 2-digit string, never anything
  // that could round oddly.
  return `${Number(day)} ${monthName} ${year}`;
}
