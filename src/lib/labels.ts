// UI vocabulary from the design brief §13 and the badge colors from the
// approved mockups. Codes mirror the server's stored values exactly.

// Status tones follow business meaning, the same way everywhere: success is
// done or paid, warning needs attention or is in progress, danger is late or
// lost, info is scheduled or sent, brand marks the selling stages.
export type BadgeTone = "neutral" | "info" | "brand" | "success" | "warning" | "danger" | "outline";

export const ACTIVE_DEAL_STAGES = ["PROSPECT", "PROPOSAL", "NEGOTIATION", "COMMITMENT"] as const;
export const DEAL_STAGES = [...ACTIVE_DEAL_STAGES, "WON", "LOST"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];
export type ActiveDealStage = (typeof ACTIVE_DEAL_STAGES)[number];

export const DEAL_STAGE: Record<DealStage, { label: string; tone: BadgeTone }> = {
  PROSPECT: { label: "Gali kebutuhan", tone: "neutral" },
  PROPOSAL: { label: "Penawaran dikirim", tone: "brand" },
  NEGOTIATION: { label: "Negosiasi", tone: "warning" },
  COMMITMENT: { label: "Menunggu komitmen", tone: "info" },
  WON: { label: "Menang", tone: "success" },
  LOST: { label: "Tidak dilanjutkan", tone: "danger" },
};

export function isActiveStage(status: string): status is ActiveDealStage {
  return (ACTIVE_DEAL_STAGES as readonly string[]).includes(status);
}

export const LOST_REASONS = [
  { value: "PRICE_TOO_HIGH", label: "Harga terlalu tinggi" },
  { value: "LOST_TO_COMPETITOR", label: "Kalah dari kompetitor" },
  { value: "NO_RESPONSE", label: "Tidak ada respons" },
  { value: "PROJECT_CANCELLED", label: "Proyek dibatalkan" },
  { value: "BUDGET_UNAVAILABLE", label: "Anggaran tidak tersedia" },
  { value: "NO_NEED", label: "Tidak lagi dibutuhkan" },
  { value: "OTHER", label: "Lainnya" },
] as const;

// DEAL-09: health signals, computed on read.
export const DEAL_SIGNAL: Record<string, { label: string; tone: BadgeTone }> = {
  TASK_OVERDUE: { label: "Tugas terlambat", tone: "danger" },
  NO_NEXT_STEP: { label: "Tanpa langkah berikut", tone: "warning" },
  STALE: { label: "Lama di tahap", tone: "warning" },
  PAST_CLOSE_DATE: { label: "Lewat target", tone: "warning" },
  HOLD_REVIEW_DUE: { label: "Waktunya ditinjau", tone: "danger" },
};

// ORD-01: the evidence a deal is won on. LEGACY is migrated data only.
export const COMMITMENT_TYPES = [
  { value: "PURCHASE_ORDER", label: "Purchase order (PO)" },
  { value: "CONTRACT", label: "Kontrak / SPK" },
  { value: "WRITTEN_CONFIRMATION", label: "Konfirmasi tertulis" },
  { value: "PAYMENT", label: "Pembayaran (DP atau lunas)" },
] as const;

export function lostReasonLabel(value: string | null): string {
  return LOST_REASONS.find((reason) => reason.value === value)?.label ?? "Lainnya";
}

export const QUOTATION_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: "Draf", tone: "neutral" },
  SENT: { label: "Terkirim", tone: "info" },
  ACCEPTED: { label: "Diterima", tone: "success" },
  REJECTED: { label: "Ditolak", tone: "danger" },
  EXPIRED: { label: "Kedaluwarsa", tone: "warning" },
};

export const INVOICE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  UNPAID: { label: "Belum dibayar", tone: "warning" },
  PARTIALLY_PAID: { label: "Dibayar sebagian", tone: "info" },
  PAID: { label: "Lunas", tone: "success" },
  OVERDUE: { label: "Lewat jatuh tempo", tone: "danger" },
  VOID: { label: "Dibatalkan", tone: "neutral" },
};

export const FOLLOW_UP_TYPES = [
  { value: "CALL", label: "Telepon" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "MEETING", label: "Pertemuan" },
  { value: "OTHER", label: "Lainnya" },
] as const;

export function followUpTypeLabel(value: string): string {
  return FOLLOW_UP_TYPES.find((type) => type.value === value)?.label ?? "Lainnya";
}

export const FOLLOW_UP_BUCKET: Record<string, { label: string; tone: BadgeTone }> = {
  TODAY: { label: "Hari ini", tone: "warning" },
  OVERDUE: { label: "Terlambat", tone: "danger" },
  UPCOMING: { label: "Mendatang", tone: "info" },
  DONE: { label: "Selesai", tone: "success" },
};

export const PAYMENT_METHODS = [
  { value: "BANK_TRANSFER", label: "Transfer bank" },
  { value: "CASH", label: "Tunai" },
  { value: "OTHER", label: "Lainnya" },
] as const;

export function paymentMethodLabel(value: string): string {
  return PAYMENT_METHODS.find((method) => method.value === value)?.label ?? "Lainnya";
}

export type Role = "OWNER" | "ADMIN" | "SALES" | "FINANCE";

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  SALES: "Sales",
  FINANCE: "Finance",
};

export const INVITABLE_ROLES = [
  { value: "ADMIN", label: "Admin", description: "Kelola semua data, anggota, dan pengaturan." },
  { value: "SALES", label: "Sales", description: "Kelola customer, deal, quotation, dan follow-up." },
  { value: "FINANCE", label: "Finance", description: "Kelola invoice dan pembayaran; lihat deal yang sudah menang." },
] as const;
