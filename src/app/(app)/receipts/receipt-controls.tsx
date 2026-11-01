"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CustomerPicker } from "@/components/domain/customer-picker";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action-result";
import { formatRupiah } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/labels";
import type { CustomerOptionDto } from "@/server/customers/customers";
import type { ReceiptDto } from "@/server/receipts/dto";
import { identifyReceiptAction, recordReceiptAction, refundReceiptAction, reverseReceiptAction } from "./actions";
import { AllocateDialog } from "./allocate-dialog";

function useRun(onDone: () => void) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T>(action: () => Promise<ActionResult<T>>, done: string, after?: (data: T) => void) {
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
    if (after) after(result.data);
    else router.refresh();
  }
  return { pending, error, run };
}

/** RCP-01: record money as it lands in the bank, before or without an invoice. */
export function RecordReceiptButton({ today }: { today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Catat uang masuk
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Catat uang masuk" description="Catat sesuai mutasi rekening. Alokasi ke invoice bisa dilakukan sekarang atau nanti.">
        {open ? <RecordBody today={today} onClose={() => setOpen(false)} onSaved={(id) => router.push(`/receipts/${id}`)} /> : null}
      </Dialog>
    </>
  );
}

function RecordBody({ today, onClose, onSaved }: { today: string; onClose: () => void; onSaved: (id: string) => void }) {
  const [customer, setCustomer] = useState<CustomerOptionDto | null>(null);
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(today);
  const [method, setMethod] = useState<string>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const { pending, error, run } = useRun(onClose);
  return (
    <>
      <div className="stack">
        <CustomerPicker id="receipt-customer" label="Dari customer" hint="Kosongkan bila pengirimnya belum dikenali. Bisa diidentifikasi nanti." value={customer} onChange={setCustomer} clearable />
        <div className="input-grid">
          <Field label="Jumlah (Rp)" htmlFor="receipt-amount" required>
            <MoneyInput id="receipt-amount" value={amount} onValueChange={setAmount} />
          </Field>
          <Field label="Tanggal diterima" htmlFor="receipt-date" required>
            <Input id="receipt-date" type="date" value={receivedOn} max={today} onChange={(event) => setReceivedOn(event.target.value)} />
          </Field>
          <Field label="Metode" htmlFor="receipt-method" required>
            <Select id="receipt-method" value={method} onChange={(event) => setMethod(event.target.value)}>
              {PAYMENT_METHODS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Referensi" htmlFor="receipt-ref">
            <Input id="receipt-ref" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} placeholder="mis. nomor mutasi" />
          </Field>
        </div>
        <Field label="Catatan" htmlFor="receipt-note">
          <Textarea id="receipt-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={5000} />
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button
          disabled={!amount || BigInt(amount) <= 0n || !receivedOn}
          pending={pending}
          pendingText="Menyimpan..."
          onClick={() => run(() => recordReceiptAction({ customerId: customer?.id, amount, receivedOn, method, reference, note, idempotencyKey }), "Uang masuk dicatat", (data) => onSaved(data.id))}
        >
          Simpan
        </Button>
      </DialogFooter>
    </>
  );
}

type Mode = "identify" | "allocate" | "refund" | "reverse";

/** The buttons in a receipt's header: identify (RCP-02), allocate (SET-02), refund and reverse (RCP-04). */
export function ReceiptActions({ receipt, today }: { receipt: ReceiptDto; today: string }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [open, setOpen] = useState(false);
  if (receipt.status === "REVERSED") return null;
  const start = (next: Mode) => {
    setMode(next);
    setOpen(true);
  };
  const close = () => setOpen(false);
  const available = BigInt(receipt.availableAmount);
  const untouched = receipt.allocatedAmount === "0" && receipt.refundedAmount === "0";
  return (
    <>
      <Menu label="Aksi uang masuk">
        <MenuItem onSelect={() => start("identify")}>{receipt.customerId ? "Ganti customer" : "Identifikasi customer"}</MenuItem>
        {available > 0n ? <MenuItem onSelect={() => start("refund")}>Catat refund</MenuItem> : null}
        <MenuItem danger disabled={!untouched} title={untouched ? undefined : "Batalkan alokasi dan refund dulu"} onSelect={() => start("reverse")}>
          Batalkan uang masuk
        </MenuItem>
      </Menu>
      {receipt.customerId && available > 0n ? <Button onClick={() => start("allocate")}>Alokasikan ke invoice</Button> : null}
      {!receipt.customerId ? <Button onClick={() => start("identify")}>Identifikasi customer</Button> : null}
      {receipt.customerId ? <AllocateDialog open={open && mode === "allocate"} onClose={close} customerId={receipt.customerId} receiptId={receipt.id} /> : null}
      {mode && mode !== "allocate" ? (
        <Dialog open={open} onClose={close} title={{ identify: "Identifikasi customer", refund: "Catat refund", reverse: "Batalkan uang masuk" }[mode]} description={`${formatRupiah(receipt.amount)} diterima ${receipt.receivedOn}`}>
          {open && mode === "identify" ? <IdentifyBody receipt={receipt} onClose={close} /> : null}
          {open && mode === "refund" ? <RefundBody receipt={receipt} today={today} onClose={close} /> : null}
          {open && mode === "reverse" ? <ReverseBody receipt={receipt} onClose={close} /> : null}
        </Dialog>
      ) : null}
    </>
  );
}

function IdentifyBody({ receipt, onClose }: { receipt: ReceiptDto; onClose: () => void }) {
  const [customer, setCustomer] = useState<CustomerOptionDto | null>(null);
  const [basis, setBasis] = useState("");
  const { pending, error, run } = useRun(onClose);
  return (
    <>
      <div className="stack">
        {receipt.allocatedAmount !== "0" ? <Alert tone="warning">Uang ini sudah dialokasikan. Batalkan alokasinya dulu sebelum mengganti customer.</Alert> : null}
        <CustomerPicker id="identify-customer" label="Customer" required value={customer} onChange={setCustomer} />
        <Field label="Dasar identifikasi" htmlFor="identify-basis" required hint="Tercatat di audit.">
          <Textarea id="identify-basis" value={basis} onChange={(event) => setBasis(event.target.value)} maxLength={1000} placeholder="mis. Konfirmasi dari Bu Rina via WhatsApp, nama pengirim cocok" />
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button disabled={!customer || !basis.trim()} pending={pending} pendingText="Menyimpan..." onClick={() => run(() => identifyReceiptAction({ receiptId: receipt.id, customerId: customer!.id, basis }), "Customer diidentifikasi")}>
          Simpan
        </Button>
      </DialogFooter>
    </>
  );
}

function RefundBody({ receipt, today, onClose }: { receipt: ReceiptDto; today: string; onClose: () => void }) {
  const [amount, setAmount] = useState(receipt.availableAmount);
  const [refundedOn, setRefundedOn] = useState(today);
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const { pending, error, run } = useRun(onClose);
  const tooMuch = amount !== "" && BigInt(amount) > BigInt(receipt.availableAmount);
  return (
    <>
      <div className="stack">
        <p className="muted">Sisa yang bisa dikembalikan {formatRupiah(receipt.availableAmount)}.</p>
        <div className="input-grid">
          <Field label="Jumlah (Rp)" htmlFor="refund-amount" required error={tooMuch ? "Melebihi sisa uang masuk." : undefined}>
            <MoneyInput id="refund-amount" value={amount} onValueChange={setAmount} invalid={tooMuch} />
          </Field>
          <Field label="Tanggal refund" htmlFor="refund-date" required>
            <Input id="refund-date" type="date" value={refundedOn} max={today} onChange={(event) => setRefundedOn(event.target.value)} />
          </Field>
        </div>
        <Field label="Alasan" htmlFor="refund-reason" required>
          <Textarea id="refund-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="mis. Kelebihan bayar dikembalikan" />
        </Field>
        <Field label="Referensi" htmlFor="refund-ref">
          <Input id="refund-ref" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} />
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button
          disabled={!amount || BigInt(amount) <= 0n || tooMuch || !reason.trim()}
          pending={pending}
          pendingText="Menyimpan..."
          onClick={() => run(() => refundReceiptAction({ receiptId: receipt.id, amount, refundedOn, reason, reference, idempotencyKey }), "Refund dicatat")}
        >
          Simpan refund
        </Button>
      </DialogFooter>
    </>
  );
}

function ReverseBody({ receipt, onClose }: { receipt: ReceiptDto; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const { pending, error, run } = useRun(onClose);
  return (
    <>
      <div className="stack">
        <p>Untuk uang masuk yang salah catat. Catatannya tetap tersimpan dan tidak dihitung lagi.</p>
        <Field label="Alasan" htmlFor="receipt-reverse-reason" required>
          <Textarea id="receipt-reverse-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="mis. Tercatat dua kali" />
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Kembali
        </Button>
        <Button variant="destructive" disabled={!reason.trim()} pending={pending} pendingText="Memproses..." onClick={() => run(() => reverseReceiptAction({ receiptId: receipt.id, reason }), "Uang masuk dibatalkan")}>
          Batalkan uang masuk
        </Button>
      </DialogFooter>
    </>
  );
}
