"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isBuilt } from "@/components/app-shell/nav";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConflictDialog } from "@/components/ui/conflict-dialog";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatRupiah } from "@/lib/format";
import { DEAL_STAGE, LOST_REASONS, NEXT_DEAL_STAGE, isActiveStage, type DealStage, type Role } from "@/lib/labels";
import { confirmWonAction, transitionDealAction } from "./actions";

const COMMITMENT_TYPES = [
  { value: "PURCHASE_ORDER", label: "Purchase order (PO)" },
  { value: "CONTRACT", label: "Kontrak" },
  { value: "WRITTEN_CONFIRMATION", label: "Konfirmasi tertulis" },
  { value: "PAYMENT", label: "Pembayaran (DP / lunas)" },
] as const;

export type TransitionDeal = {
  id: string;
  title: string;
  customerName: string;
  status: string;
  version: number;
  estimatedValue: string;
};

export type TransitionMode = "advance" | "won" | "lost";

const NOTE_LIMIT = 5000;

const STAGE_HINT: Partial<Record<DealStage, string>> = {
  PROPOSAL: "Tandai bila harga, scope, dan ketentuan sudah disampaikan ke customer. Nilai estimasi harus lebih dari Rp0.",
};

/**
 * The three stage dialogs (P-05 advance, P-06 won, P-07 lost). The pipeline
 * only moves forward one step (DEAL-03) and both outcomes are final, so each
 * one says exactly what it will do before it does it.
 */
export function DealTransitionDialog({
  open,
  onClose,
  mode,
  deal,
  role,
}: {
  open: boolean;
  onClose: () => void;
  mode: TransitionMode;
  deal: TransitionDeal;
  role: Role;
}) {
  const title = {
    advance: () => {
      const next = isActiveStage(deal.status) ? NEXT_DEAL_STAGE[deal.status].to : "WON";
      return `Pindahkan ke ${DEAL_STAGE[next].label}?`;
    },
    won: () => "Tandai deal sebagai Menang?",
    lost: () => "Tandai deal sebagai Kalah?",
  }[mode]();

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <TransitionBody mode={mode} deal={deal} role={role} onClose={onClose} />
    </Dialog>
  );
}

function TransitionBody({ mode, deal, role, onClose }: { mode: TransitionMode; deal: TransitionDeal; role: Role; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [commitmentType, setCommitmentType] = useState<string>("");
  const [commitmentRef, setCommitmentRef] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const next: DealStage = mode === "won" ? "WON" : mode === "lost" ? "LOST" : isActiveStage(deal.status) ? NEXT_DEAL_STAGE[deal.status].to : "WON";
  const zeroValue = mode === "won" && BigInt(deal.estimatedValue) <= 0n;
  const noteTooLong = note.trim().length > NOTE_LIMIT;
  const blocked = zeroValue || (mode === "lost" && (!reason || noteTooLong)) || (mode === "won" && !commitmentType);

  async function submit() {
    setPending(true);
    setError(null);
    // DEAL-04: winning needs the evidence of the commitment, and creates the first order.
    const result =
      mode === "won"
        ? await confirmWonAction({ dealId: deal.id, expectedVersion: deal.version, commitmentType, commitmentRef })
        : await transitionDealAction({
            dealId: deal.id,
            expectedVersion: deal.version,
            toStatus: next,
            ...(mode === "lost" ? { lostReason: reason, lostNote: note } : {}),
          });
    setPending(false);

    if (!result.ok) {
      if (result.error.code === "CONFLICT") setConflict(true);
      else setError(result.error.message);
      return;
    }
    onClose();
    if (mode === "won") {
      // Owner and Admin can issue the invoice right away; for Sales the page
      // explains that Finance or Admin does it.
      const canInvoice = (role === "OWNER" || role === "ADMIN") && isBuilt("/invoices");
      toast("Deal ditandai Menang", "success", canInvoice ? { label: "Buat invoice sekarang?", href: `/invoices/new?dealId=${deal.id}` } : undefined);
    } else if (mode === "lost") {
      toast("Deal ditandai Kalah");
    } else {
      toast(`Deal dipindahkan ke ${DEAL_STAGE[next].label}`);
    }
    router.refresh();
  }

  return (
    <>
      <div className="stack" style={{ gap: 14 }}>
        <p className="muted">
          {deal.title} · {deal.customerName}
        </p>

        {mode === "advance" ? (
          <>
            {STAGE_HINT[next] ? <p>{STAGE_HINT[next]}</p> : null}
            <Alert tone="warning">Tahap hanya bisa maju satu langkah. Perubahan tahap tidak dapat dibatalkan.</Alert>
          </>
        ) : null}

        {mode === "won" ? (
          zeroValue ? (
            <Alert tone="warning">Isi nilai deal lebih dari Rp0 sebelum menandai menang.</Alert>
          ) : (
            <>
              <dl style={{ margin: 0 }}>
                <div className="kv">
                  <dt>Nilai menang</dt>
                  <dd>
                    <b className="money">{formatRupiah(deal.estimatedValue)}</b>
                  </dd>
                </div>
                <div className="kv">
                  <dt>Tanggal menang</dt>
                  <dd>Hari ini</dd>
                </div>
              </dl>
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="field-legend">
                  Bukti komitmen <span className="red" aria-hidden="true">*</span>
                </legend>
                <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                  {COMMITMENT_TYPES.map((option) => (
                    <label key={option.value} className="choice">
                      <input type="radio" name="commitmentType" value={option.value} checked={commitmentType === option.value} onChange={() => setCommitmentType(option.value)} />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label="Nomor PO / kontrak" htmlFor="won-ref" hint="Opsional">
                <Input id="won-ref" value={commitmentRef} onChange={(event) => setCommitmentRef(event.target.value)} maxLength={200} />
              </Field>
              <Alert tone="warning">
                Menang membuat pesanan dengan satu termin 100%. Nilai menang dikunci dan deal menjadi final; pesanan bisa diamandemen setelahnya.
              </Alert>
              <small>Quotation yang diterima tidak diperlukan untuk menang.</small>
            </>
          )
        ) : null}

        {mode === "lost" ? (
          <>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-legend">
                Alasan kalah <span className="red" aria-hidden="true">*</span>
              </legend>
              <div className="stack" style={{ gap: 8, marginTop: 8 }}>
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
              hint={`Opsional · Maksimal 5.000 karakter (${note.length.toLocaleString("id-ID")} / 5.000)`}
            >
              <Textarea id="lost-note" value={note} onChange={(event) => setNote(event.target.value)} invalid={noteTooLong} />
            </Field>
            <Alert tone="warning">Deal yang kalah bersifat final dan tidak bisa dibuka kembali.</Alert>
          </>
        ) : null}

        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>

      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <span title={blocked ? (zeroValue ? "Isi nilai deal lebih dari Rp0 sebelum menandai menang." : "Pilih alasan kalah terlebih dahulu.") : undefined}>
          <Button
            variant={mode === "lost" ? "destructive" : "primary"}
            disabled={blocked}
            pending={pending}
            pendingText="Memproses..."
            onClick={submit}
          >
            {mode === "advance" ? "Pindahkan" : mode === "won" ? "Tandai menang" : "Tandai kalah"}
          </Button>
        </span>
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
