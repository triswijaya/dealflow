"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConflictDialog } from "@/components/ui/conflict-dialog";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatRupiah } from "@/lib/format";
import { ACTIVE_DEAL_STAGES, COMMITMENT_TYPES, DEAL_STAGE, LOST_REASONS, QUOTATION_STATUS, isActiveStage, type ActiveDealStage, type Role } from "@/lib/labels";
import { addOrderToDealAction, confirmWonAction, holdDealAction, reopenDealAction, transitionDealAction, type PlanItemInput } from "./actions";

export type TransitionDeal = {
  id: string;
  title: string;
  customerName: string;
  status: string;
  version: number;
  estimatedValue: string;
  onHoldUntil?: string | null;
  onHoldReason?: string | null;
};

/** A quotation the won value and the order can be taken from. */
export type SourceQuotation = { id: string; quotationNumber: string; status: string; total: string };

export type TransitionMode = { kind: "move"; to: ActiveDealStage } | { kind: "won" } | { kind: "order" } | { kind: "lost" } | { kind: "hold" } | { kind: "reopen" };

const NOTE_LIMIT = 5000;

/** Termin plan presets (ORD-03). The last line takes the rounding so the plan always sums to the value. */
const PLANS = {
  full: { label: "100% saat pesanan", rows: [["Pelunasan 100%", 100, "ON_ORDER"]] },
  dp: { label: "DP 30% · 70% BAST", rows: [["DP 30%", 30, "ON_ORDER"], ["Pelunasan setelah BAST (70%)", 70, "ON_MILESTONE"]] },
  progress: { label: "30 · 40 · 30", rows: [["DP 30%", 30, "ON_ORDER"], ["Termin 2 setelah BAST (40%)", 40, "ON_MILESTONE"], ["Pelunasan (30%)", 30, "ON_DATE"]] },
} as const;
type PlanKey = keyof typeof PLANS;
const TRIGGER_LABEL = { ON_ORDER: "Saat pesanan", ON_DATE: "Tanggal", ON_MILESTONE: "Milestone / BAST" } as const;

function addDays(today: string, days: number) {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function planItems(key: PlanKey, value: bigint, retention: boolean, today: string): PlanItemInput[] {
  const rows: { label: string; pct: number; trigger: PlanItemInput["trigger"]; isRetention?: boolean }[] = PLANS[key].rows.map(([label, pct, trigger]) => ({ label, pct, trigger }));
  if (retention) {
    const last = rows[rows.length - 1];
    last.pct -= 5;
    last.label = last.label.replace(/\d+%/, `${last.pct}%`);
    rows.push({ label: "Retensi 5%", pct: 5, trigger: "ON_DATE", isRetention: true });
  }
  let taken = 0n;
  return rows.map((row, index) => {
    const amount = index === rows.length - 1 ? value - taken : (value * BigInt(row.pct)) / 100n;
    taken += amount;
    return {
      label: row.label,
      amount: amount.toString(),
      trigger: row.trigger,
      ...(row.trigger === "ON_DATE" ? { dueOn: addDays(today, row.isRetention ? 180 : 60) } : {}),
      ...(row.isRetention ? { isRetention: true } : {}),
    };
  });
}

function titleOf(mode: TransitionMode, deal: TransitionDeal) {
  switch (mode.kind) {
    case "move":
      return `Pindahkan ke ${DEAL_STAGE[mode.to].label}?`;
    case "won":
      return "Konfirmasi menang";
    case "order":
      return "Tambah pesanan";
    case "lost":
      return "Tidak dilanjutkan";
    case "hold":
      return deal.onHoldUntil ? "Perpanjang penundaan" : "Tahan deal";
    case "reopen":
      return "Buka kembali deal";
  }
}

/**
 * Every change of a deal's state in one dialog (DEAL-03/04/07/08): moving to
 * any active stage, winning with commitment evidence and a termin plan,
 * closing as not continued, holding until a review date, and reopening. A won
 * deal can take a further order (a follow-up PO) through the same order form.
 */
export function DealTransitionDialog({
  open,
  onClose,
  mode,
  deal,
  role,
  today,
  quotations = [],
  preferredQuotationId,
}: {
  open: boolean;
  onClose: () => void;
  mode: TransitionMode;
  deal: TransitionDeal;
  role: Role;
  /** The organization's today (YYYY-MM-DD). */
  today: string;
  quotations?: SourceQuotation[];
  /** Start the Won dialog from this quotation (arriving from an accepted quotation). */
  preferredQuotationId?: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={titleOf(mode, deal)} size={mode.kind === "won" || mode.kind === "order" ? "large" : undefined}>
      <TransitionBody mode={mode} deal={deal} role={role} today={today} quotations={quotations} preferredQuotationId={preferredQuotationId} onClose={onClose} />
    </Dialog>
  );
}

function TransitionBody({
  mode,
  deal,
  role,
  today,
  quotations,
  preferredQuotationId,
  onClose,
}: {
  mode: TransitionMode;
  deal: TransitionDeal;
  role: Role;
  today: string;
  quotations: SourceQuotation[];
  preferredQuotationId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const sources = quotations.filter((quotation) => quotation.status === "ACCEPTED" || quotation.status === "SENT");
  const accepted = sources.find((quotation) => quotation.id === preferredQuotationId) ?? sources.find((quotation) => quotation.status === "ACCEPTED");

  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [commitmentType, setCommitmentType] = useState<string>("");
  const [commitmentRef, setCommitmentRef] = useState("");
  const [commitmentDate, setCommitmentDate] = useState(today);
  const [sourceId, setSourceId] = useState(mode.kind === "won" ? (accepted?.id ?? "") : "");
  // A further order starts empty: its value is the new PO's, not the deal's.
  const [value, setValue] = useState(accepted && mode.kind === "won" ? accepted.total : mode.kind === "won" && BigInt(deal.estimatedValue) > 0n ? deal.estimatedValue : "");
  const [plan, setPlan] = useState<PlanKey>("full");
  const [retention, setRetention] = useState(false);
  const [reviewDate, setReviewDate] = useState(deal.onHoldUntil && deal.onHoldUntil > today ? deal.onHoldUntil : addDays(today, 30));
  const [reopenTo, setReopenTo] = useState<ActiveDealStage>(deal.status === "WON" ? "COMMITMENT" : "PROSPECT");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const amount = value ? BigInt(value) : 0n;
  const items = amount > 0n ? planItems(plan, amount, retention, today) : [];
  const noteTooLong = note.trim().length > NOTE_LIMIT;
  const needsValue = mode.kind === "move" && mode.to !== "PROSPECT" && BigInt(deal.estimatedValue) <= 0n;

  const ordering = mode.kind === "won" || mode.kind === "order";
  const blocked =
    ordering
      ? !commitmentType || amount <= 0n
      : mode.kind === "lost"
        ? !reason || noteTooLong
        : mode.kind === "hold"
          ? !reason.trim() || !reviewDate || reviewDate < today
          : mode.kind === "reopen"
            ? !reason.trim()
            : needsValue;

  async function submit() {
    setPending(true);
    setError(null);
    const base = { dealId: deal.id, expectedVersion: deal.version };
    const result =
      mode.kind === "won"
        ? await confirmWonAction({ ...base, commitmentType, commitmentRef, commitmentDate, value, sourceQuotationId: sourceId || undefined, billingItems: items })
        : mode.kind === "order"
          ? await addOrderToDealAction({ dealId: deal.id, commitmentType, commitmentRef, commitmentDate, value, sourceQuotationId: sourceId || undefined, billingItems: items })
          : mode.kind === "hold"
            ? await holdDealAction({ ...base, reviewDate, reason })
            : mode.kind === "reopen"
              ? await reopenDealAction({ ...base, toStatus: reopenTo, reason })
              : await transitionDealAction({ ...base, toStatus: mode.kind === "move" ? mode.to : "LOST", ...(mode.kind === "lost" ? { lostReason: reason, lostNote: note } : {}) });
    setPending(false);

    if (!result.ok) {
      if (result.error.code === "CONFLICT") setConflict(true);
      else setError(result.error.message);
      return;
    }
    onClose();
    const message = {
      move: () => `Deal dipindahkan ke ${mode.kind === "move" ? DEAL_STAGE[mode.to].label : ""}`,
      won: () => (role === "SALES" ? "Deal menang. Pesanan dibuat, Finance yang menagih per termin." : "Deal menang. Pesanan dan rencana termin dibuat."),
      order: () => "Pesanan tambahan dan rencana terminnya dibuat.",
      lost: () => "Deal ditutup, tugas terbuka dibatalkan",
      hold: () => `Deal ditahan sampai ${formatDate(reviewDate)}`,
      reopen: () => `Deal dibuka kembali di ${DEAL_STAGE[reopenTo].label}`,
    }[mode.kind]();
    toast(message, "success");
    router.refresh();
  }

  const reasonField = (label: string, placeholder: string) => (
    <Field label={label} htmlFor="deal-reason" required>
      <Textarea id="deal-reason" value={reason} placeholder={placeholder} onChange={(event) => setReason(event.target.value)} maxLength={1000} />
    </Field>
  );

  return (
    <>
      <div className="stack" style={{ gap: 14 }}>
        <p className="muted">
          {deal.title} · {deal.customerName}
        </p>

        {mode.kind === "move" ? (
          needsValue ? (
            <Alert tone="warning">Isi nilai estimasi lebih dari Rp0 dulu. Nilai wajib mulai tahap Penawaran dikirim.</Alert>
          ) : (
            <p>Tahap bisa dipindah maju atau mundur kapan saja. Perpindahan tercatat di riwayat aktivitas.</p>
          )
        ) : null}

        {mode.kind === "order" ? <p>Untuk PO atau kontrak susulan dari customer yang sama. Pesanan pertama tidak berubah.</p> : null}

        {ordering ? (
          <>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-legend">
                Bukti komitmen <span className="red" aria-hidden="true">*</span>
              </legend>
              <div className="input-grid" style={{ marginTop: 8, gap: 8 }}>
                {COMMITMENT_TYPES.map((option) => (
                  <label key={option.value} className="choice">
                    <input type="radio" name="commitmentType" value={option.value} checked={commitmentType === option.value} onChange={() => setCommitmentType(option.value)} />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="input-grid">
              <Field label="Nomor bukti" htmlFor="won-ref" hint="Nomor PO, kontrak, atau subjek email">
                <Input id="won-ref" value={commitmentRef} onChange={(event) => setCommitmentRef(event.target.value)} maxLength={200} placeholder="mis. PO/2026/118" />
              </Field>
              <Field label="Tanggal komitmen" htmlFor="won-date" required>
                <Input id="won-date" type="date" value={commitmentDate} max={today} onChange={(event) => setCommitmentDate(event.target.value)} />
              </Field>
            </div>
            <div className="input-grid">
              <Field label="Nilai pesanan (Rp)" htmlFor="won-value" required hint={accepted && mode.kind === "won" ? `Dari ${accepted.quotationNumber}. Ubah jika nilai PO berbeda.` : "Nilai yang disepakati customer."}>
                <MoneyInput id="won-value" value={value} onValueChange={setValue} />
              </Field>
              {sources.length ? (
                <Field label="Penawaran sumber" htmlFor="won-source" hint="Item invoice nanti bisa diambil dari sini.">
                  <Select
                    id="won-source"
                    value={sourceId}
                    onChange={(event) => {
                      setSourceId(event.target.value);
                      const picked = sources.find((quotation) => quotation.id === event.target.value);
                      if (picked) setValue(picked.total);
                    }}
                  >
                    <option value="">Tanpa penawaran</option>
                    {sources.map((quotation) => (
                      <option key={quotation.id} value={quotation.id}>
                        {quotation.quotationNumber} · {formatRupiah(quotation.total)} · {QUOTATION_STATUS[quotation.status]?.label ?? quotation.status}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-legend">Rencana termin</legend>
              <div className="seg plan-seg" role="group" aria-label="Rencana termin" style={{ marginTop: 8 }}>
                {(Object.keys(PLANS) as PlanKey[]).map((key) => (
                  <button key={key} type="button" className={`btn ${plan === key ? "secondary" : "tertiary"}`} aria-pressed={plan === key} onClick={() => setPlan(key)}>
                    {PLANS[key].label}
                  </button>
                ))}
              </div>
              <label className="toggle" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={retention} onChange={(event) => setRetention(event.target.checked)} />
                Tahan retensi 5%, ditagih 6 bulan setelah pesanan
              </label>
            </fieldset>
            {items.length ? (
              <div className="plan-preview">
                <table>
                  <thead>
                    <tr>
                      <th>Termin</th>
                      <th>Pemicu</th>
                      <th className="num">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.label}>
                        <td data-label="Termin">{item.label}</td>
                        <td data-label="Pemicu">
                          {TRIGGER_LABEL[item.trigger]}
                          {item.dueOn ? ` · ${formatDate(item.dueOn)}` : ""}
                        </td>
                        <td data-label="Jumlah" className="num">
                          {formatRupiah(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <small>
              Rencana termin masih bisa diubah di pesanan selama termin belum ditagih.
              {mode.kind === "won" ? " Tugas terbuka deal ini akan dibatalkan." : ""}
            </small>
          </>
        ) : null}

        {mode.kind === "lost" ? (
          <>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-legend">
                Alasan <span className="red" aria-hidden="true">*</span>
              </legend>
              <div className="input-grid" style={{ marginTop: 8, gap: 8 }}>
                {LOST_REASONS.map((option) => (
                  <label key={option.value} className="choice">
                    <input type="radio" name="lostReason" value={option.value} checked={reason === option.value} onChange={() => setReason(option.value)} />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field
              label="Catatan tambahan"
              htmlFor="lost-note"
              error={noteTooLong ? "Maksimal 5.000 karakter" : undefined}
              hint={`Opsional · ${note.length.toLocaleString("id-ID")} / 5.000 karakter`}
            >
              <Textarea id="lost-note" value={note} onChange={(event) => setNote(event.target.value)} invalid={noteTooLong} placeholder="Apa yang bisa dipelajari dari deal ini?" />
            </Field>
            <small>Tugas terbuka ikut dibatalkan. Deal masih bisa dibuka kembali nanti.</small>
          </>
        ) : null}

        {mode.kind === "hold" ? (
          <>
            <p>Deal tetap di tahapnya, tapi keluar dari pipeline sampai tanggal tinjau. Saat tanggal itu tiba, deal muncul di antrian tinjau ulang.</p>
            <Field label="Tanggal tinjau ulang" htmlFor="hold-date" required error={reviewDate && reviewDate < today ? "Tidak boleh sebelum hari ini." : undefined}>
              <Input id="hold-date" type="date" min={today} value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} />
            </Field>
            {reasonField("Alasan", "mis. Anggaran baru cair tahun depan")}
          </>
        ) : null}

        {mode.kind === "reopen" ? (
          <>
            {deal.status === "WON" ? (
              <Alert tone="warning">Pesanan dari deal ini akan dibatalkan. Hanya bisa selama belum ada invoice aktif.</Alert>
            ) : null}
            <Field label="Kembali ke tahap" htmlFor="reopen-stage" required>
              <Select id="reopen-stage" value={reopenTo} onChange={(event) => isActiveStage(event.target.value) && setReopenTo(event.target.value)}>
                {ACTIVE_DEAL_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {DEAL_STAGE[stage].label}
                  </option>
                ))}
              </Select>
            </Field>
            {reasonField("Alasan", "mis. Customer membuka anggaran lagi")}
          </>
        ) : null}

        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>

      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button variant={mode.kind === "lost" ? "destructive" : "primary"} disabled={blocked} pending={pending} pendingText="Memproses..." onClick={submit}>
          {{ move: "Pindahkan", won: "Konfirmasi menang", order: "Buat pesanan", lost: "Tutup deal", hold: "Simpan", reopen: "Buka kembali" }[mode.kind]}
        </Button>
      </DialogFooter>

      <ConflictDialog
        open={conflict}
        onClose={() => setConflict(false)}
        onReload={() => {
          setConflict(false);
          onClose();
          router.refresh();
        }}
      />
    </>
  );
}
