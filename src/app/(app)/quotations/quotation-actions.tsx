"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConflictDialog } from "@/components/ui/conflict-dialog";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { SendEmailDialog } from "@/components/domain/send-email-dialog";
import { WhatsAppDialog } from "../follow-ups/follow-up-dialogs";
import { reviseQuotationAction, sendQuotationEmailAction, transitionQuotationAction } from "./actions";

type Mode = "sent" | "accepted" | "rejected" | "revise";

export type QuotationActionState = {
  id: string;
  quotationNumber: string;
  /** The effective status: a sent quotation past its date is EXPIRED. */
  status: string;
  isLatest: boolean;
  editVersion: number;
  latestVersionId: string;
  validUntil: string;
  today: string;
  dealId: string;
  dealStatus: string;
  timezone: string;
};

// QUO-11: a lost deal's quotations are read-only: no sending, mailing or
// revising. The server enforces it; this only hides what would be refused.
const CANNOT_SEND_DEAL = ["LOST"];

/**
 * The buttons in a quotation's header. What is offered follows the state of
 * the document (draft, sent, answered, expired, an old version) because each
 * state has exactly one sensible next move.
 */
export function QuotationActions({ quotation }: { quotation: QuotationActionState }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [open, setOpen] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const [email, setEmail] = useState(false);
  const start = (next: Mode) => {
    setMode(next);
    setOpen(true);
  };

  const { status, isLatest } = quotation;
  const pdf = (
    <a className="btn secondary" href={`/api/quotations/${quotation.id}/pdf`}>
      Unduh PDF
    </a>
  );

  const lateDraft = status === "DRAFT" && quotation.validUntil < quotation.today;
  const dealBlocks = CANNOT_SEND_DEAL.includes(quotation.dealStatus);
  const sendBlockReason = lateDraft ? "Perbarui tanggal berlaku." : undefined;
  const dealOpen = quotation.dealStatus !== "WON" && quotation.dealStatus !== "LOST";

  const more = (
    <Menu label="Menu tindakan">
      <MenuItem onSelect={() => setEmail(true)}>Kirim lewat email</MenuItem>
      <MenuItem onSelect={() => setWhatsapp(true)}>Kirim via WhatsApp</MenuItem>
      {isLatest ? <MenuItem onSelect={() => start("revise")}>Buat revisi</MenuItem> : null}
    </Menu>
  );

  let buttons: React.ReactNode;
  if (dealBlocks) {
    buttons = pdf;
  } else if (!isLatest) {
    buttons = (
      <>
        {pdf}
        <Button variant="secondary" onClick={() => start("revise")}>
          Buat revisi dari versi ini
        </Button>
      </>
    );
  } else if (status === "DRAFT") {
    buttons = (
      <>
        <span title={sendBlockReason}>
          <Button disabled={Boolean(sendBlockReason)} onClick={() => start("sent")}>
            Tandai terkirim
          </Button>
        </span>
        <ButtonLink variant="secondary" href={`/quotations/${quotation.id}/edit`}>
          Edit
        </ButtonLink>
        {pdf}
        {more}
      </>
    );
  } else if (status === "SENT") {
    buttons = (
      <>
        <Button onClick={() => start("accepted")}>Tandai diterima</Button>
        <Button variant="secondary" onClick={() => start("rejected")}>
          Tandai ditolak
        </Button>
        {pdf}
        {more}
      </>
    );
  } else if (status === "EXPIRED") {
    buttons = (
      <>
        <Button variant="secondary" onClick={() => start("rejected")}>
          Tandai ditolak
        </Button>
        <Button variant="secondary" onClick={() => start("revise")}>
          Buat revisi
        </Button>
        {pdf}
      </>
    );
  } else {
    // ACCEPTED or REJECTED: final; the way forward is a new revision, or on
    // an accepted one the deal's Won once the PO, contract or payment is in.
    buttons = (
      <>
        {status === "ACCEPTED" && dealOpen ? <ButtonLink href={`/deals/${quotation.dealId}?win=${quotation.id}`}>Konfirmasi menang</ButtonLink> : null}
        <Button variant="secondary" onClick={() => start("revise")}>
          Buat revisi
        </Button>
        {pdf}
        <Menu label="Menu tindakan">
          <MenuItem onSelect={() => setEmail(true)}>Kirim lewat email</MenuItem>
          <MenuItem onSelect={() => setWhatsapp(true)}>Kirim via WhatsApp</MenuItem>
        </Menu>
      </>
    );
  }

  return (
    <>
      {buttons}
      {mode ? <QuotationDialog open={open} onClose={() => setOpen(false)} mode={mode} quotation={quotation} /> : null}
      <SendEmailDialog
        open={email}
        onClose={() => setEmail(false)}
        documentLabel={`quotation ${quotation.quotationNumber}`}
        onSend={(values) => sendQuotationEmailAction({ quotationId: quotation.id, ...values })}
      />
      <WhatsAppDialog open={whatsapp} onClose={() => setWhatsapp(false)} dealId={quotation.dealId} timezone={quotation.timezone} initialQuotationId={quotation.id} />
    </>
  );
}

function QuotationDialog({ open, onClose, mode, quotation }: { open: boolean; onClose: () => void; mode: Mode; quotation: QuotationActionState }) {
  const title = {
    sent: "Tandai quotation sebagai terkirim?",
    accepted: `Customer menyetujui ${quotation.quotationNumber}?`,
    rejected: `Tandai ${quotation.quotationNumber} sebagai ditolak?`,
    revise: `Buat revisi dari ${quotation.quotationNumber}?`,
  }[mode];
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <QuotationDialogBody mode={mode} quotation={quotation} onClose={onClose} />
    </Dialog>
  );
}

function QuotationDialogBody({ mode, quotation, onClose }: { mode: Mode; quotation: QuotationActionState; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  // One key per opening of the dialog: a double click can never create two revisions (API-05).
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const advancesDeal = quotation.dealStatus === "PROSPECT";

  async function submit() {
    setPending(true);
    setError(null);
    const result =
      mode === "revise"
        ? await reviseQuotationAction({ sourceQuotationId: quotation.id, expectedLatestQuotationId: quotation.latestVersionId, idempotencyKey })
        : await transitionQuotationAction({
            quotationId: quotation.id,
            expectedEditVersion: quotation.editVersion,
            toStatus: mode === "sent" ? "SENT" : mode === "accepted" ? "ACCEPTED" : "REJECTED",
          });
    setPending(false);

    if (!result.ok) {
      if (result.error.code === "CONFLICT" && mode !== "sent") setConflict(true);
      else if (result.error.code === "CONFLICT") setError(result.error.message);
      else setError(result.error.message);
      return;
    }
    onClose();
    if (mode === "revise") {
      const created = result.data as { id: string; quotationNumber: string };
      toast(`Revisi ${created.quotationNumber} dibuat sebagai draf`);
      router.push(`/quotations/${created.id}/edit`);
      return;
    }
    toast(
      mode === "sent"
        ? `Quotation ditandai terkirim${advancesDeal ? " · Deal pindah ke Penawaran dikirim" : ""}`
        : mode === "accepted"
          ? "Quotation ditandai diterima · Status deal tetap"
          : "Quotation ditandai ditolak · Status deal tetap",
    );
    router.refresh();
  }

  return (
    <>
      <div className="stack" style={{ gap: 14 }}>
        {mode === "sent" ? (
          <>
            <p>Lakukan ini setelah Anda benar-benar mengirim quotation ke customer (email, WhatsApp, atau cetak).</p>
            <Alert tone="success">
              {advancesDeal ? "Deal otomatis pindah ke tahap Penawaran dikirim." : "Tahap deal tidak berubah."}
              <br />
              Isi quotation akan dikunci.
            </Alert>
          </>
        ) : null}
        {mode === "accepted" ? (
          <Alert tone="info">
            Bila deal masih di tahap Penawaran dikirim atau Negosiasi, deal otomatis pindah ke Menunggu komitmen. Konfirmasi menang saat PO, kontrak, atau pembayaran sudah ada.
            <br />
            Status quotation ini final.
          </Alert>
        ) : null}
        {mode === "rejected" ? <p>Deal tidak otomatis ditutup. Anda bisa membuat revisi setelah ini.</p> : null}
        {mode === "revise" ? (
          <>
            <p>Versi baru dibuat sebagai draf dengan isi yang sama. Versi saat ini akan dikunci sebagai versi lama.</p>
            {quotation.dealStatus === "WON" ? <Alert tone="info">Pada deal Menang: invoice yang sudah terbit tidak ikut berubah.</Alert> : null}
          </>
        ) : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button variant={mode === "rejected" ? "destructive" : "primary"} pending={pending} pendingText="Memproses..." onClick={submit}>
          {mode === "sent" ? "Tandai terkirim" : mode === "accepted" ? "Tandai diterima" : mode === "rejected" ? "Tandai ditolak" : "Buat revisi"}
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
