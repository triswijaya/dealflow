"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { KeyValue } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatRupiah } from "@/lib/format";
import { INVOICE_STATUS, PAYMENT_METHODS, paymentMethodLabel } from "@/lib/labels";
import { recordPaymentAction } from "./actions";

export type PayableInvoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  issueDate: string;
  total: string;
  remainingAmount: string;
};

/** I-04: record a payment in two steps, fill then review, because a saved payment cannot be edited or deleted. */
export function PaymentDialog({ open, onClose, invoice, today }: { open: boolean; onClose: () => void; invoice: PayableInvoice; today: string }) {
  return (
    <Dialog open={open} onClose={onClose} title={open ? "Catat pembayaran" : ""} description={<InvoiceLine invoice={invoice} />}>
      <PaymentBody invoice={invoice} today={today} onClose={onClose} />
    </Dialog>
  );
}

function InvoiceLine({ invoice }: { invoice: PayableInvoice }) {
  return (
    <>
      <b style={{ fontFamily: "ui-monospace, monospace" }}>{invoice.invoiceNumber}</b> · {invoice.customerName}
    </>
  );
}

type Errors = Partial<Record<"amount" | "paymentDate" | "reference" | "note", string>>;

// What the invoice shows after this payment, so the review step can say "Lunas" before it is true.
function statusAfter(remaining: bigint): string {
  return remaining === 0n ? "PAID" : "PARTIALLY_PAID";
}

function PaymentBody({ invoice, today, onClose }: { invoice: PayableInvoice; today: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const remaining = BigInt(invoice.remainingAmount);
  const [step, setStep] = useState<"fill" | "review">("fill");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());

  const value = amount === "" ? 0n : BigInt(amount);
  const after = remaining - value;
  const showPreview = value > 0n && value <= remaining;

  function validate(): Errors {
    const found: Errors = {};
    if (value <= 0n) found.amount = "Jumlah harus lebih dari Rp0.";
    else if (value > remaining) found.amount = `Jumlah melebihi sisa tagihan (${formatRupiah(remaining)}).`;
    if (!paymentDate) found.paymentDate = "Tanggal bayar wajib diisi.";
    else if (paymentDate < invoice.issueDate) found.paymentDate = "Tanggal bayar tidak boleh sebelum tanggal terbit invoice.";
    else if (paymentDate > today) found.paymentDate = "Tanggal bayar tidak boleh masa depan.";
    if (reference.trim().length > 200) found.reference = "Maksimal 200 karakter";
    if (note.trim().length > 5000) found.note = "Maksimal 5.000 karakter";
    return found;
  }

  function review() {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(`payment-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    // A reviewed payment is one request: its retry reuses this key, a changed one gets a new key.
    setKey(crypto.randomUUID());
    setStep("review");
  }

  async function save(retry = false) {
    setPending(true);
    setFormError(null);
    let result: Awaited<ReturnType<typeof recordPaymentAction>>;
    try {
      result = await recordPaymentAction({ invoiceId: invoice.id, amount, paymentDate, paymentMethod: method, reference, note, idempotencyKey: key });
    } catch {
      // The connection dropped mid-save. Sending the same key again either returns the
      // payment that was recorded or records it once; it can never record it twice.
      if (!retry) {
        setChecking(true);
        await save(true);
        setChecking(false);
      } else {
        setPending(false);
        setFormError("Koneksi terputus. Periksa riwayat pembayaran sebelum mencoba lagi.");
      }
      return;
    }
    setPending(false);
    if (result.ok) {
      onClose();
      toast(`Pembayaran ${formatRupiah(amount)} dicatat`);
      router.refresh();
      return;
    }
    const fields = result.error.fieldErrors ?? {};
    if (Object.keys(fields).length > 0) {
      setErrors(fields as Errors);
      setStep("fill");
      return;
    }
    setFormError(result.error.message);
    if (result.error.code === "CONFLICT") router.refresh();
  }

  if (step === "review") {
    return (
      <>
        <div className="stack" style={{ gap: 14 }}>
          <h3>Tinjau pembayaran</h3>
          <dl style={{ margin: 0 }}>
            <KeyValue label="Invoice">{invoice.invoiceNumber}</KeyValue>
            <KeyValue label="Customer">{invoice.customerName}</KeyValue>
            <KeyValue label="Jumlah">
              <strong style={{ fontSize: 20 }}>{formatRupiah(value)}</strong>
            </KeyValue>
            <KeyValue label="Tanggal bayar">{formatDate(paymentDate)}</KeyValue>
            <KeyValue label="Metode">{paymentMethodLabel(method)}</KeyValue>
            <KeyValue label="Referensi">{reference.trim() || "-"}</KeyValue>
            <KeyValue label="Catatan">{note.trim() || "-"}</KeyValue>
            <KeyValue label="Sisa setelah pembayaran">
              {formatRupiah(after)} · {INVOICE_STATUS[statusAfter(after)]?.label}
            </KeyValue>
          </dl>
          <Alert tone="warning">Pembayaran yang sudah disimpan tidak dapat diubah atau dihapus.</Alert>
          {pending ? <Alert tone="info">{checking ? "Memeriksa apakah pembayaran sudah tersimpan..." : "Menyimpan pembayaran... jangan tutup jendela ini"}</Alert> : null}
          {formError ? <Alert tone="error">{formError}</Alert> : null}
        </div>
        <DialogFooter>
          <Button variant="tertiary" onClick={onClose} disabled={pending}>
            Batal
          </Button>
          <Button variant="secondary" onClick={() => setStep("fill")} disabled={pending}>
            Ubah
          </Button>
          <Button pending={pending} pendingText="Menyimpan pembayaran..." onClick={() => save()}>
            Simpan pembayaran
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <div className="stack">
        <Field label="Jumlah (Rp)" htmlFor="payment-amount" required error={errors.amount} hint="Lebih dari Rp0, maksimal sisa tagihan.">
          <MoneyInput id="payment-amount" value={amount} onValueChange={(digits) => { setAmount(digits); setErrors((current) => ({ ...current, amount: undefined })); }} invalid={!!errors.amount} />
        </Field>
        <div>
          <Button variant="secondary" onClick={() => { setAmount(invoice.remainingAmount); setErrors((current) => ({ ...current, amount: undefined })); }}>
            Bayar penuh ({formatRupiah(remaining)})
          </Button>
        </div>
        <Field label="Tanggal bayar" htmlFor="payment-paymentDate" required error={errors.paymentDate} hint={`Tidak boleh sebelum ${formatDate(invoice.issueDate)} atau setelah hari ini.`}>
          <Input id="payment-paymentDate" type="date" value={paymentDate} min={invoice.issueDate} max={today} onChange={(event) => { setPaymentDate(event.target.value); setErrors((current) => ({ ...current, paymentDate: undefined })); }} invalid={!!errors.paymentDate} />
        </Field>
        <Field label="Metode" htmlFor="payment-method" required>
          <Select id="payment-method" value={method} onChange={(event) => setMethod(event.target.value)}>
            {PAYMENT_METHODS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Referensi" htmlFor="payment-reference" error={errors.reference} hint="No. transaksi / bukti · Maksimal 200 karakter">
          <Input id="payment-reference" value={reference} onChange={(event) => setReference(event.target.value)} invalid={!!errors.reference} />
        </Field>
        <Field label="Catatan" htmlFor="payment-note" error={errors.note} hint={`${note.length.toLocaleString("id-ID")} / 5.000 karakter`}>
          <Textarea id="payment-note" value={note} onChange={(event) => setNote(event.target.value)} invalid={!!errors.note} />
        </Field>
        {showPreview ? (
          <Alert tone="success">
            Sisa setelah pembayaran: <b>{formatRupiah(after)}</b> · {INVOICE_STATUS[statusAfter(after)]?.label}
          </Alert>
        ) : null}
        {formError ? <Alert tone="error">{formError}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button onClick={review}>Lanjut</Button>
      </DialogFooter>
    </>
  );
}
