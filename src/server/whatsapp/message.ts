/**
 * WA-01 default template (quotation exists) and WA-02's fallback (no
 * quotation yet). Two complete literal bodies, not one template with a
 * conditionally-blanked placeholder -- WA-02's "placeholder tidak boleh
 * tertinggal" is guaranteed structurally this way, not by an extra check.
 */
export function renderFollowUpMessage(params: {
  customerName: string;
  dealTitle: string;
  quotationNumber?: string | null;
}): string {
  if (params.quotationNumber) {
    return [
      `Halo Pak/Bu ${params.customerName},`,
      "",
      `izin follow-up terkait quotation ${params.quotationNumber}`,
      `untuk ${params.dealTitle}.`,
      "",
      "Apakah quotation tersebut sudah sempat direview?",
      "",
      "Terima kasih.",
    ].join("\n");
  }
  return [
    `Halo Pak/Bu ${params.customerName},`,
    "",
    `izin follow-up terkait ${params.dealTitle}.`,
    "",
    "Apakah ada yang bisa kami bantu terkait kebutuhan Bapak/Ibu?",
    "",
    "Terima kasih.",
  ].join("\n");
}

/**
 * WA-01: `https://wa.me/{international_digits}?text={encoded_message}`.
 * WA-03: message is URL-encoded, and an empty/invalid number is a fixable
 * error. `phoneInternational` is expected already-normalized (no "+", see
 * customers/phone.ts); this only guards against an empty/garbage value --
 * a customer record's phoneNormalized is guaranteed valid by construction
 * (createCustomer/updateCustomer both reject an unnormalizable phone
 * before a row can ever be saved), so this is a defensive invariant for
 * this function's own general reusability, not a re-check of that guarantee.
 */
export function buildWhatsAppDeepLink(phoneInternational: string, message: string): string {
  const digits = phoneInternational.replace(/[^0-9]/g, "");
  if (digits.length === 0) {
    throw new Error("buildWhatsAppDeepLink requires a non-empty phone number");
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** WA-04: the collection reminder from an invoice. The amount and the date arrive already formatted. */
export function renderCollectionMessage(params: { contactName: string; invoiceNumber: string; remaining: string; dueDate: string; overdue: boolean }): string {
  return [
    `Halo Pak/Bu ${params.contactName},`,
    "",
    params.overdue
      ? `izin mengingatkan invoice ${params.invoiceNumber} sebesar ${params.remaining} yang jatuh tempo pada ${params.dueDate}.`
      : `izin menginformasikan invoice ${params.invoiceNumber} sebesar ${params.remaining} yang jatuh tempo pada ${params.dueDate}.`,
    "",
    "Mohon konfirmasi jadwal pembayarannya.",
    "",
    "Terima kasih.",
  ].join("\n");
}
