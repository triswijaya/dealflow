export type InvoiceStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

/**
 * §10.2 / INV-06 / INV-07: an invoice's status is always derived, never
 * stored. Same read-time overlay pattern as quotations' EXPIRED
 * (quotations/effective-status.ts): nothing writes a status column, so the
 * displayed value can never drift from the payments and the calendar, and
 * correctness does not depend on a cron running at midnight.
 *
 * Priority is exactly the order §10.2 lists:
 *   paid_amount >= total          -> PAID       (highest, wins even if overdue)
 *   not settled and today > due   -> OVERDUE     (beats UNPAID/PARTIALLY_PAID)
 *   0 < paid_amount < total       -> PARTIALLY_PAID
 *   otherwise                     -> UNPAID
 *
 * `>=` rather than `==` for PAID is deliberate (§3 "formula PAID
 * menggunakan paid_amount >= total sebagai pertahanan untuk data
 * legacy/import kelak"): recordPayment refuses to overpay, but a future
 * import must not be able to produce an invoice that is over-settled and
 * still shows as unpaid.
 *
 * `todayOrg` and `dueDate` are both YYYY-MM-DD in the organization's own
 * timezone, so a plain string comparison is also a correct chronological
 * one, and INV-06's "pada due date sendiri belum overdue" falls out of
 * using a strict `>`.
 */
export function invoiceEffectiveStatus(
  params: { total: bigint; paidAmount: bigint; dueDate: string },
  todayOrg: string,
): InvoiceStatus {
  if (params.paidAmount >= params.total) {
    return "PAID";
  }
  if (todayOrg > params.dueDate) {
    return "OVERDUE";
  }
  return params.paidAmount > 0n ? "PARTIALLY_PAID" : "UNPAID";
}

/** §10.2: `remaining_amount = max(total - paid_amount, 0)`. */
export function invoiceRemainingAmount(total: bigint, paidAmount: bigint): bigint {
  const remaining = total - paidAmount;
  return remaining > 0n ? remaining : 0n;
}
