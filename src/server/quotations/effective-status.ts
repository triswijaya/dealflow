// QUO-10: "Effective status SENT yang lewat batas adalah EXPIRED pada
// setiap read... Materialisasi EXPIRED/event boleh dilakukan secara
// idempotent; cron bukan syarat akurasi." EXPIRED is deliberately never
// written to quotations.status -- the stored value stays SENT forever
// (or until ACCEPTED/REJECTED), and this function computes the DISPLAYED
// status at read time instead. getQuotation/listQuotations call this to
// override the raw column; the database row itself never changes because
// of the calendar alone.
//
// A DRAFT past its own validUntil is NOT covered here: QUO-10 says a
// late draft "tetap draft dengan peringatan" (stays DRAFT, with a
// warning) -- expiry only ever changes what SENT displays as, nothing
// else.
export function effectiveQuotationStatus(params: { status: string; validUntil: string }, todayOrg: string): string {
  if (params.status === "SENT" && todayOrg > params.validUntil) {
    return "EXPIRED";
  }
  return params.status;
}
