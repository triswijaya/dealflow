"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, MoneyInput, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatRupiah } from "@/lib/format";
import type { InvoiceRowDto } from "@/server/invoices/invoice-views";
import type { ReceiptDto } from "@/server/receipts/dto";
import { allocateReceiptAction, allocationOptionsAction } from "./actions";

const min = (a: bigint, b: bigint) => (a < b ? a : b);

/** Fill the invoices oldest-due first with what the receipt has left. */
function prefill(invoices: InvoiceRowDto[], available: bigint) {
  let left = available;
  const amounts: Record<string, string> = {};
  for (const invoice of invoices) {
    const take = min(left, BigInt(invoice.remainingAmount));
    amounts[invoice.id] = take > 0n ? take.toString() : "";
    left -= take;
  }
  return amounts;
}

/**
 * SET-02: settle invoices from money already received. Opened from a receipt it
 * spreads that receipt over the customer's open invoices; opened from an invoice
 * it uses the customer's credit (a receipt with money left) for that invoice.
 */
export function AllocateDialog({
  open,
  onClose,
  customerId,
  receiptId,
  invoiceId,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  receiptId?: string;
  invoiceId?: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={invoiceId ? "Pakai kredit customer" : "Alokasikan ke invoice"} size="large">
      {open ? <AllocateBody customerId={customerId} receiptId={receiptId} invoiceId={invoiceId} onClose={onClose} /> : null}
    </Dialog>
  );
}

function AllocateBody({ customerId, receiptId, invoiceId, onClose }: { customerId: string; receiptId?: string; invoiceId?: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [options, setOptions] = useState<{ invoices: InvoiceRowDto[]; receipts: ReceiptDto[] } | null>(null);
  const [chosenReceipt, setChosenReceipt] = useState(receiptId ?? "");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    allocationOptionsAction(customerId).then((result) => {
      if (!live) return;
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const invoices = invoiceId ? result.data.invoices.filter((invoice) => invoice.id === invoiceId) : result.data.invoices;
      const receipt = result.data.receipts.find((item) => item.id === (receiptId ?? result.data.receipts[0]?.id));
      setOptions({ invoices, receipts: result.data.receipts });
      setChosenReceipt(receipt?.id ?? "");
      setAmounts(prefill(invoices, receipt ? BigInt(receipt.availableAmount) : 0n));
    });
    return () => {
      live = false;
    };
  }, [customerId, receiptId, invoiceId]);

  if (!options) return error ? <Alert tone="error">{error}</Alert> : <p className="muted">Memuat invoice dan uang masuk…</p>;

  const receipt = options.receipts.find((item) => item.id === chosenReceipt);
  const available = receipt ? BigInt(receipt.availableAmount) : 0n;
  const total = Object.values(amounts).reduce((sum, value) => sum + (value ? BigInt(value) : 0n), 0n);
  const over = options.invoices.find((invoice) => amounts[invoice.id] && BigInt(amounts[invoice.id]) > BigInt(invoice.remainingAmount));
  const blocked = !receipt || total <= 0n || total > available || Boolean(over);

  async function submit() {
    setPending(true);
    setError(null);
    const allocations = Object.entries(amounts)
      .filter(([, value]) => value && BigInt(value) > 0n)
      .map(([id, amount]) => ({ invoiceId: id, amount }));
    const result = await allocateReceiptAction({ receiptId: chosenReceipt, allocations, idempotencyKey });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast(`${allocations.length} invoice dilunasi dari uang masuk`, "success");
    onClose();
    router.refresh();
  }

  return (
    <>
      <div className="stack">
        {options.receipts.length === 0 ? <Alert tone="info">Customer ini tidak punya uang masuk yang tersisa.</Alert> : null}
        {!receiptId && options.receipts.length > 0 ? (
          <Field label="Dari uang masuk" htmlFor="alloc-receipt" required>
            <Select
              id="alloc-receipt"
              value={chosenReceipt}
              onChange={(event) => {
                setChosenReceipt(event.target.value);
                const next = options.receipts.find((item) => item.id === event.target.value);
                setAmounts(prefill(options.invoices, next ? BigInt(next.availableAmount) : 0n));
              }}
            >
              {options.receipts.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatDate(item.receivedOn)} · sisa {formatRupiah(item.availableAmount)}
                  {item.reference ? ` · ${item.reference}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {options.invoices.length === 0 ? (
          <Alert tone="info">Tidak ada invoice terbuka. Sisa uang tetap menjadi kredit customer, atau bisa di-refund.</Alert>
        ) : (
          <div className="alloc-list">
            {options.invoices.map((invoice) => (
              <div key={invoice.id} className="alloc-row">
                <div>
                  <b className="doc-id">{invoice.invoiceNumber}</b>
                  <small>
                    Jatuh tempo {formatDate(invoice.dueDate)} · sisa {formatRupiah(invoice.remainingAmount)}
                  </small>
                </div>
                <MoneyInput
                  aria-label={`Alokasi ke ${invoice.invoiceNumber}`}
                  value={amounts[invoice.id] ?? ""}
                  onValueChange={(value) => setAmounts((current) => ({ ...current, [invoice.id]: value }))}
                />
              </div>
            ))}
          </div>
        )}
        <dl>
          <div className="kv">
            <dt>Tersedia</dt>
            <dd>{formatRupiah(available)}</dd>
          </div>
          <div className="kv">
            <dt>Dialokasikan</dt>
            <dd className={total > available ? "red" : undefined}>{formatRupiah(total)}</dd>
          </div>
          <div className="kv">
            <dt>Tetap sebagai kredit</dt>
            <dd>{formatRupiah(available > total ? available - total : 0n)}</dd>
          </div>
        </dl>
        {over ? <Alert tone="warning">Alokasi ke {over.invoiceNumber} melebihi sisanya.</Alert> : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button disabled={blocked} pending={pending} pendingText="Menyimpan..." onClick={submit}>
          Simpan alokasi
        </Button>
      </DialogFooter>
    </>
  );
}
