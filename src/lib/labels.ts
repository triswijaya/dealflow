// UI vocabulary from the design brief §13 and the badge colors from the
// approved mockups. Codes mirror the server's stored values exactly.

// Status tones follow business meaning, the same way everywhere: success is
// done or paid, warning needs attention or is in progress, danger is late or
// lost, info is scheduled or sent, brand marks the selling stages.
export type BadgeTone = "neutral" | "info" | "brand" | "success" | "warning" | "danger" | "outline";

export const ACTIVE_DEAL_STAGES = ["NEW", "CONTACTED", "QUALIFIED", "QUOTATION", "NEGOTIATION"] as const;
export const DEAL_STAGES = [...ACTIVE_DEAL_STAGES, "WON", "LOST"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];
export type ActiveDealStage = (typeof ACTIVE_DEAL_STAGES)[number];

export const DEAL_STAGE: Record<DealStage, { label: string; tone: BadgeTone }> = {
  NEW: { label: "Baru", tone: "neutral" },
  CONTACTED: { label: "Dihubungi", tone: "info" },
  QUALIFIED: { label: "Terkualifikasi", tone: "info" },
  QUOTATION: { label: "Penawaran", tone: "brand" },
  NEGOTIATION: { label: "Negosiasi", tone: "warning" },
  WON: { label: "Menang", tone: "success" },
  LOST: { label: "Kalah", tone: "danger" },
};

// DEAL-03: one step forward only; the button label names the target step.
export const NEXT_DEAL_STAGE: Record<ActiveDealStage, { to: DealStage; action: string }> = {
  NEW: { to: "CONTACTED", action: "Tandai dihubungi" },
  CONTACTED: { to: "QUALIFIED", action: "Tandai terkualifikasi" },
  QUALIFIED: { to: "QUOTATION", action: "Mulai penawaran" },
  QUOTATION: { to: "NEGOTIATION", action: "Masuk negosiasi" },
  NEGOTIATION: { to: "WON", action: "Tandai menang" },
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
  { value: "OTHER", label: "Lainnya" },
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
