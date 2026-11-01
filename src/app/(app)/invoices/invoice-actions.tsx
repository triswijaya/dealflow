"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SendEmailDialog } from "@/components/domain/send-email-dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/field";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action-result";
import { formatRupiah } from "@/lib/format";
import { AllocateDialog } from "../receipts/allocate-dialog";
import { reverseSettlementAction, sendInvoiceEmailAction, settleInvoiceAction, voidInvoiceAction } from "./actions";

type Target = { id: string; invoiceNumber: string; total: string; remainingAmount: string; hasLiveSettlement: boolean; voided: boolean };
type Mode = "email" | "withholding" | "writeoff" | "void";

function useRun(onDone: () => void) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<ActionResult<unknown>>, done: string) {
    setPending(true);
    setError(null);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast(done, "success");
    onDone();
    router.refresh();
  }
  return { pending, error, run };
}

/** The ⋯ menu of an invoice: mail, non-cash settlements (SET-01) and void (INV-08). */
export function InvoiceMoreActions({ invoice }: { invoice: Target }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [open, setOpen] = useState(false);
  if (invoice.voided) return null;
  const start = (next: Mode) => {
    setMode(next);
    setOpen(true);
  };
  const owes = BigInt(invoice.remainingAmount) > 0n;
  return (
    <>
      <Menu label="Aksi invoice">
        <MenuItem onSelect={() => start("email")}>Kirim lewat email</MenuItem>
        {owes ? <MenuItem onSelect={() => start("withholding")}>Catat potongan PPh</MenuItem> : null}
        {owes ? <MenuItem onSelect={() => start("writeoff")}>Hapus selisih kecil</MenuItem> : null}
        <MenuItem
          danger
          disabled={invoice.hasLiveSettlement}
          title={invoice.hasLiveSettlement ? "Batalkan pelunasan yang aktif dulu" : undefined}
          onSelect={() => start("void")}
        >
          Void invoice
        </MenuItem>
      </Menu>
      <SendEmailDialog
        open={open && mode === "email"}
        onClose={() => setOpen(false)}
        documentLabel={`invoice ${invoice.invoiceNumber}`}
        onSend={(values) => sendInvoiceEmailAction({ invoiceId: invoice.id, ...values })}
      />
      {mode && mode !== "email" ? (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title={{ withholding: "Potongan PPh", writeoff: "Hapus selisih kecil", void: `Void ${invoice.invoiceNumber}` }[mode]}
        >
          {open && mode === "void" ? <VoidBody invoice={invoice} onClose={() => setOpen(false)} /> : null}
          {open && (mode === "withholding" || mode === "writeoff") ? <SettleBody invoice={invoice} kind={mode === "withholding" ? "WITHHOLDING" : "WRITE_OFF"} onClose={() => setOpen(false)} /> : null}
        </Dialog>
      ) : null}
    </>
  );
}

function SettleBody({ invoice, kind, onClose }: { invoice: Target; kind: "WITHHOLDING" | "WRITE_OFF"; onClose: () => void }) {
  const withholding = kind === "WITHHOLDING";
  const [amount, setAmount] = useState(withholding ? ((BigInt(invoice.total) * 2n) / 100n).toString() : invoice.remainingAmount);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const { pending, error, run } = useRun(onClose);
  const tooMuch = amount !== "" && BigInt(amount) > BigInt(invoice.remainingAmount);
  return (
    <>
      <div className="stack">
        <p className="muted">
          Sisa tagihan {formatRupiah(invoice.remainingAmount)}. {withholding ? "Potongan PPh mengurangi tagihan tanpa menambah kas." : "Untuk selisih kecil seperti biaya transfer, dalam batas yang diatur di pengaturan."}
        </p>
        <Field label="Jumlah (Rp)" htmlFor="settle-amount" required error={tooMuch ? "Melebihi sisa tagihan." : undefined} hint={withholding ? "Contoh PPh 23 sebesar 2%. Sesuaikan dengan bukti potong." : undefined}>
          <MoneyInput id="settle-amount" value={amount} onValueChange={setAmount} invalid={tooMuch} />
        </Field>
        {withholding ? (
          <Field label="Nomor bukti potong" htmlFor="settle-ref" required>
            <Input id="settle-ref" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} placeholder="mis. BP-23/2026/104" />
          </Field>
        ) : (
          <Field label="Alasan" htmlFor="settle-note" required>
            <Textarea id="settle-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={5000} placeholder="mis. Biaya transfer antarbank ditanggung customer" />
          </Field>
        )}
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button
          disabled={!amount || BigInt(amount) <= 0n || tooMuch || (withholding ? !reference.trim() : !note.trim())}
          pending={pending}
          pendingText="Menyimpan..."
          onClick={() => run(() => settleInvoiceAction({ invoiceId: invoice.id, kind, amount, reference, note, idempotencyKey }), withholding ? "Potongan PPh dicatat" : "Selisih dihapus")}
        >
          Simpan
        </Button>
      </DialogFooter>
    </>
  );
}

function VoidBody({ invoice, onClose }: { invoice: Target; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const { pending, error, run } = useRun(() => {
    onClose();
    router.refresh();
  });
  return (
    <>
      <div className="stack">
        <p>Invoice tetap tersimpan dan nomornya tidak dipakai ulang. Termin kembali siap ditagih untuk invoice pengganti.</p>
        <Field label="Alasan void" htmlFor="void-reason" required>
          <Textarea id="void-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="mis. Salah alamat penagihan" />
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button variant="destructive" disabled={!reason.trim()} pending={pending} pendingText="Memproses..." onClick={() => run(() => voidInvoiceAction({ invoiceId: invoice.id, reason }), "Invoice di-void, termin siap ditagih lagi")}>
          Void invoice
        </Button>
      </DialogFooter>
    </>
  );
}

/** Reverse one settlement row; the invoice owes again and the receipt has the money back. */
export function ReverseSettlementButton({ invoiceId, settlementId, label }: { invoiceId: string; settlementId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, error, run } = useRun(() => setOpen(false));
  return (
    <>
      <Button variant="tertiary" onClick={() => setOpen(true)}>
        Batalkan
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Batalkan pelunasan" description={label}>
        {open ? (
          <>
            <div className="stack">
              <p>Catatan aslinya tetap tersimpan. Sisa invoice bertambah lagi, dan uangnya kembali ke uang masuk asalnya.</p>
              <Field label="Alasan" htmlFor="reverse-reason" required>
                <Textarea id="reverse-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="mis. Salah alokasi ke invoice lain" />
              </Field>
              {error ? <Alert tone="error">{error}</Alert> : null}
            </div>
            <DialogFooter>
              <Button variant="tertiary" onClick={() => setOpen(false)}>
                Kembali
              </Button>
              <Button variant="destructive" disabled={!reason.trim()} pending={pending} pendingText="Memproses..." onClick={() => run(() => reverseSettlementAction({ invoiceId, settlementId, reason }), "Pelunasan dibatalkan")}>
                Batalkan pelunasan
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </Dialog>
    </>
  );
}

/** RCP-05: use the customer's credit (money left on earlier receipts) for this invoice. */
export function UseCreditButton({ customerId, invoiceId }: { customerId: string; invoiceId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Pakai kredit
      </Button>
      <AllocateDialog open={open} onClose={() => setOpen(false)} customerId={customerId} invoiceId={invoiceId} />
    </>
  );
}
