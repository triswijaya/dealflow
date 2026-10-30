import { APIError } from "better-auth/api";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import type { ActionError, ActionResult } from "@/lib/action-result";
import { logger } from "./logger";

// Service errors are written in English for developers and tests; the UI
// language is Indonesian (§3). This table is the single place that turns
// a known service message into what a user reads, optionally pinned to the
// form field it concerns.
const KNOWN_MESSAGES: [RegExp, string, string?][] = [
  [/modified by someone else|newer version, reload/i, "Data sudah diubah orang lain. Muat ulang untuk melihat versi terbaru sebelum menyimpan lagi."],
  [/The contact has no phone number for WhatsApp/i, "Kontak ini belum punya nomor telepon, jadi WhatsApp tidak bisa dibuka."],
  [/Contact not found for this customer/i, "Kontak tidak ditemukan pada customer ini.", "contactId"],
  [/Contact was modified by someone else/i, "Kontak sudah diubah orang lain. Muat ulang sebelum menyimpan lagi."],
  [/primary contact cannot be deleted/i, "Kontak utama tidak dapat dihapus. Jadikan kontak lain utama dulu."],
  [/contact of a deal and cannot be deleted/i, "Kontak ini dipakai oleh sebuah deal, jadi tidak dapat dihapus."],
  [/A contact needs a phone number or an email/i, "Isi telepon / WhatsApp atau email.", "phone"],
  [/Tax ID must be 15 or 16 digits/i, "NPWP harus 15 atau 16 digit.", "taxId"],
  [/Cannot transition a deal/i, "Tahap deal tidak dapat dipindahkan ke tahap tersebut."],
  [/deal is on hold, resume it/i, "Deal sedang ditahan. Lanjutkan deal sebelum memindahkan tahapnya."],
  [/Only an open deal can be put on hold/i, "Hanya deal yang masih berjalan yang dapat ditahan."],
  [/review date cannot be in the past/i, "Tanggal tinjau ulang tidak boleh sebelum hari ini.", "reviewDate"],
  [/Only a lost deal can be reopened/i, "Hanya deal yang kalah yang dapat dibuka kembali."],
  [/Only an owner, an admin or the assigned sales can reopen/i, "Hanya Owner, Admin, atau sales yang ditugaskan yang dapat membuka kembali deal ini."],
  [/A reason is required/i, "Alasan wajib diisi.", "reason"],
  [/Estimated value must be positive for a deal in/i, "Nilai estimasi harus lebih dari Rp0 untuk tahap ini.", "estimatedValue"],
  [/Estimated value must be positive/i, "Nilai deal harus lebih dari Rp0 untuk menandai menang."],
  [/won or lost deal cannot be edited/i, "Deal yang sudah menang atau kalah tidak dapat diubah."],
  [/Cannot change the customer once a quotation exists/i, "Customer terkunci karena deal sudah memiliki quotation.", "customerId"],
  [/Only an owner or admin can reassign/i, "Hanya Owner atau Admin yang dapat mengganti assigned sales.", "assignedToId"],
  [/Assignee must be an active member/i, "Assigned sales harus anggota aktif organisasi ini.", "assignedToId"],
  [/Assignee must have the Sales, Owner, or Admin role/i, "Assigned sales harus ber-role Sales, Owner, atau Admin.", "assignedToId"],
  [/assignedToId is required/i, "Pilih assigned sales.", "assignedToId"],
  [/Sales can only assign a new deal to themselves/i, "Sales hanya dapat menugaskan deal baru ke dirinya sendiri.", "assignedToId"],
  [/Customer not found in this organization/i, "Customer tidak ditemukan.", "customerId"],
  [/Invalid phone number/i, "Nomor tidak valid. Gunakan format 08xx atau kode negara (+62).", "phone"],
  [/quotation for a closed deal/i, "Quotation baru tidak dapat dibuat untuk deal yang sudah menang atau kalah."],
  [/validUntil cannot be before issueDate/i, "Tanggal berlaku tidak boleh sebelum tanggal terbit.", "validUntil"],
  [/can no longer be edited/i, "Quotation ini sudah dikunci dan tidak dapat diedit. Buat revisi untuk perubahan."],
  [/Only the latest version/i, "Hanya versi terbaru yang dapat diubah statusnya."],
  [/expired and can no longer be sent or accepted/i, "Quotation sudah kedaluwarsa, jadi tidak dapat dikirim atau diterima. Perbarui tanggal berlaku."],
  [/cannot be sent while the deal is on hold/i, "Deal sedang ditahan. Lanjutkan deal sebelum quotation ditandai terkirim."],
  [/quotations are read-only/i, "Deal sudah kalah, jadi quotation-nya hanya bisa dibaca. Buka kembali deal untuk mengubahnya."],
  [/Cannot transition a quotation/i, "Status quotation tidak dapat diubah ke status tersebut."],
  [/must have at least one item/i, "Tambahkan minimal satu item.", "items"],
  [/Discount cannot exceed the subtotal/i, "Diskon tidak boleh melebihi subtotal.", "discount"],
  [/total must be greater than zero/i, "Total harus lebih dari Rp0.", "items"],
  [/amount is outside the allowed range/i, "Nominal di luar batas yang diizinkan."],
  [/Idempotency key was already used/i, "Permintaan ini bentrok dengan permintaan sebelumnya. Muat ulang lalu coba lagi."],
  [/follow-up on a WON or LOST deal/i, "Deal sudah final. Follow-up baru tidak dapat dibuat."],
  [/Completed time cannot be in the future/i, "Waktu selesai tidak boleh masa depan.", "completedAt"],
  [/follow-up that is already completed/i, "Follow-up yang sudah selesai tidak dapat diubah."],
  [/invoice can only be created for a WON deal/i, "Invoice hanya dapat dibuat untuk deal yang sudah menang."],
  [/already has invoice/i, "Deal ini sudah memiliki invoice."],
  [/changed since it was previewed/i, "Quotation sumber sudah berubah sejak Anda meninjau. Tinjau ulang sebelum menerbitkan."],
  [/expectedSourceEditVersion is required/i, "Pilih ulang quotation sumber sebelum menerbitkan."],
  [/dueDate cannot be before issueDate/i, "Jatuh tempo tidak boleh sebelum tanggal terbit.", "dueDate"],
  [/already fully paid/i, "Invoice ini sudah lunas."],
  [/Payment exceeds the remaining balance/i, "Jumlah melebihi sisa tagihan.", "amount"],
  [/Payment amount must be greater than zero/i, "Jumlah harus lebih dari Rp0.", "amount"],
  [/before the invoice issue date/i, "Tanggal bayar tidak boleh sebelum tanggal terbit invoice.", "paymentDate"],
  [/Payment date cannot be in the future/i, "Tanggal bayar tidak boleh di masa depan.", "paymentDate"],
  [/only active owner/i, "Organisasi harus punya minimal satu Owner aktif."],
  [/not allowed to (deactivate|reactivate) this member/i, "Hanya Owner yang dapat mengelola Owner."],
  [/directly as OWNER/i, "Undangan tidak dapat memberi role Owner.", "role"],
  [/already has an active organization membership/i, "Akun ini sudah tergabung di organisasi lain. Satu akun hanya bisa aktif di satu organisasi."],
  [/already a member/i, "Email ini sudah menjadi anggota organisasi.", "email"],
  [/already invited/i, "Email ini sudah memiliki undangan tertunda.", "email"],
  [/cannot change your own role/i, "Anda tidak dapat mengubah role Anda sendiri."],
  [/not allowed to change an owner/i, "Role Owner tidak dapat diubah."],
  [/Reactivate the member before/i, "Aktifkan kembali anggota ini sebelum mengubah role."],
  [/membership has been deactivated/i, "Akses Anda ke organisasi ini sudah dinonaktifkan. Hubungi admin organisasi."],
];

const CODE_FALLBACK: Record<string, string> = {
  BAD_REQUEST: "Isian tidak valid. Periksa kembali data Anda.",
  UNAUTHORIZED: "Sesi Anda berakhir. Silakan masuk kembali.",
  FORBIDDEN: "Anda tidak memiliki izin untuk aksi ini.",
  NOT_FOUND: "Data tidak ditemukan atau Anda tidak memiliki akses.",
  CONFLICT: "Data sudah berubah. Muat ulang lalu coba lagi.",
  TOO_MANY_REQUESTS: "Terlalu banyak percobaan. Coba lagi dalam beberapa menit.",
};

const GENERIC = "Terjadi kesalahan. Coba lagi dalam beberapa saat.";

function translate(code: string, message: string): ActionError {
  for (const [pattern, text, field] of KNOWN_MESSAGES) {
    if (pattern.test(message)) {
      return { code, message: text, ...(field ? { fieldErrors: { [field]: text } } : {}) };
    }
  }
  return { code, message: CODE_FALLBACK[code] ?? GENERIC };
}

function zodIssueMessage(issue: ZodError["issues"][number]): string {
  switch (issue.code) {
    case "too_small":
      return issue.minimum === 1 ? "Wajib diisi." : `Minimal ${issue.minimum} karakter.`;
    case "too_big":
      return issue.origin === "array" ? `Maksimal ${issue.maximum} item.` : `Maksimal ${issue.maximum} karakter.`;
    case "invalid_format":
      return issue.format === "email" ? "Format email tidak valid." : "Format tidak valid.";
    case "invalid_type":
      return "Wajib diisi.";
    default: {
      const known = translate("BAD_REQUEST", issue.message);
      return known.message === CODE_FALLBACK.BAD_REQUEST ? "Isian tidak valid." : known.message;
    }
  }
}

export function toActionError(error: unknown): ActionError {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.map(String).join(".") || "form";
      fieldErrors[key] ??= zodIssueMessage(issue);
    }
    return { code: "BAD_REQUEST", message: "Periksa kembali isian yang ditandai.", fieldErrors };
  }
  if (error instanceof APIError) {
    const message = typeof error.body?.message === "string" ? error.body.message : "";
    return translate(String(error.status), message);
  }
  // API-02/SEC-08: never leak internals to the client.
  logger.error("action.unexpected", { error });
  return { code: "INTERNAL_SERVER_ERROR", message: GENERIC };
}

/** Runs a mutation and folds any failure into API-02's error shape. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: toActionError(error) };
  }
}
