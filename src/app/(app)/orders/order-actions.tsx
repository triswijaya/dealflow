"use client";

import { Flag, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action-result";
import { formatRupiah } from "@/lib/format";
import { BILLING_TRIGGERS } from "@/lib/labels";
import type { OrderDto } from "@/server/orders/dto";
import { amendOrderAction, cancelOrderAction, markMilestoneAction, rebalanceOrderAction, type PlanItemEdit } from "./actions";

type Mode = "amend" | "rebalance" | "cancel";

/** Runs one action, reports it, and refreshes the page on success. */
function useSubmit(onDone: () => void) {
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

/** The header actions of an active order (ORD-03/05, BIL-02). */
export function OrderActions({ order }: { order: OrderDto }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [open, setOpen] = useState(false);
  if (order.status === "CANCELLED") return null;
  const start = (next: Mode) => {
    setMode(next);
    setOpen(true);
  };
  const hasLiveInvoice = order.billingItems.some((item) => item.invoiceId);
  const editable = order.billingItems.some((item) => item.status === "PLANNED" || item.status === "READY");
  const title = { amend: "Amandemen pesanan", rebalance: "Ubah rencana termin", cancel: `Batalkan ${order.orderNumber}` };

  return (
    <>
      <Menu label="Aksi pesanan">
        {editable ? <MenuItem onSelect={() => start("rebalance")}>Ubah rencana termin</MenuItem> : null}
        {hasLiveInvoice ? null : (
          <MenuItem danger onSelect={() => start("cancel")}>
            Batalkan pesanan
          </MenuItem>
        )}
      </Menu>
      <Button variant="secondary" onClick={() => start("amend")}>
        Amandemen
      </Button>
      {mode ? (
        <Dialog open={open} onClose={() => setOpen(false)} title={title[mode]} size={mode === "rebalance" ? "large" : undefined}>
          {open && mode === "amend" ? <AmendBody order={order} onClose={() => setOpen(false)} /> : null}
          {open && mode === "rebalance" ? <RebalanceBody order={order} onClose={() => setOpen(false)} /> : null}
          {open && mode === "cancel" ? <CancelBody order={order} onClose={() => setOpen(false)} /> : null}
        </Dialog>
      ) : null}
    </>
  );
}

function AmendBody({ order, onClose }: { order: OrderDto; onClose: () => void }) {
  const [direction, setDirection] = useState<"plus" | "minus">("plus");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const { pending, error, run } = useSubmit(onClose);
  const delta = amount ? (direction === "plus" ? amount : `-${amount}`) : "";
  const after = amount ? BigInt(order.currentValue) + BigInt(delta) : null;

  return (
    <>
      <div className="stack">
        <p className="muted">Nilai berjalan {formatRupiah(order.currentValue)}. Nilai awal tetap tersimpan.</p>
        <div className="input-grid">
          <Field label="Jenis" htmlFor="amend-dir" required>
            <Select id="amend-dir" value={direction} onChange={(event) => setDirection(event.target.value === "minus" ? "minus" : "plus")}>
              <option value="plus">Kerja tambah</option>
              <option value="minus">Kerja kurang</option>
            </Select>
          </Field>
          <Field label="Jumlah (Rp)" htmlFor="amend-amount" required hint={after !== null ? `Nilai baru ${formatRupiah(after)}` : undefined}>
            <MoneyInput id="amend-amount" value={amount} onValueChange={setAmount} />
          </Field>
        </div>
        <Field label="Alasan" htmlFor="amend-reason" required>
          <Textarea id="amend-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="mis. Tambah 4 kamera di area parkir" />
        </Field>
        <Field label="Nomor adendum" htmlFor="amend-ref" hint="Opsional">
          <Input id="amend-ref" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} />
        </Field>
        <small>
          {direction === "plus"
            ? "Kerja tambah menjadi termin baru yang langsung siap ditagih. Atur ulang di rencana termin bila perlu."
            : "Kerja kurang memangkas termin yang belum ditagih, mulai dari yang terakhir."}
        </small>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button
          disabled={!amount || BigInt(amount) <= 0n || !reason.trim()}
          pending={pending}
          pendingText="Menyimpan..."
          onClick={() => run(() => amendOrderAction({ orderId: order.id, delta, reason, reference }), "Amandemen dicatat, termin sudah diseimbangkan")}
        >
          Simpan amandemen
        </Button>
      </DialogFooter>
    </>
  );
}

type Row = { key: string; id?: string; label: string; trigger: PlanItemEdit["trigger"]; dueOn: string; amount: string; isRetention: boolean };

function RebalanceBody({ order, onClose }: { order: OrderDto; onClose: () => void }) {
  const locked = order.billingItems.filter((item) => item.status === "INVOICED");
  const [rows, setRows] = useState<Row[]>(() =>
    order.billingItems
      .filter((item) => item.status === "PLANNED" || item.status === "READY")
      .map((item) => ({ key: item.id, id: item.id, label: item.label, trigger: item.trigger as Row["trigger"], dueOn: item.dueOn ?? "", amount: item.amount, isRetention: item.isRetention })),
  );
  const [reason, setReason] = useState("");
  const { pending, error, run } = useSubmit(onClose);
  const lockedTotal = locked.reduce((sum, item) => sum + BigInt(item.amount), 0n);
  const total = lockedTotal + rows.reduce((sum, row) => sum + (row.amount ? BigInt(row.amount) : 0n), 0n);
  const target = BigInt(order.currentValue);
  const balanced = total === target;
  const complete = rows.length > 0 && rows.every((row) => row.label.trim() && row.amount && BigInt(row.amount) > 0n && (row.trigger !== "ON_DATE" || row.dueOn));
  const update = (key: string, change: Partial<Row>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));

  return (
    <>
      <div className="stack">
        <p className="muted">Pecah, gabung, atau ubah jumlah dan pemicu. Total harus tetap {formatRupiah(target)}. Untuk mengubah nilai pesanan, pakai amandemen.</p>
        <div className="plan-preview">
          <table className="plan-editor">
            <thead>
              <tr>
                <th>Termin</th>
                <th>Pemicu</th>
                <th className="num">Jumlah</th>
                <th aria-label="Hapus" />
              </tr>
            </thead>
            <tbody>
              {locked.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.label}
                    <small>Terkunci · {item.invoiceNumber}</small>
                  </td>
                  <td className="muted">{BILLING_TRIGGERS.find((trigger) => trigger.value === item.trigger)?.label}</td>
                  <td className="num">{formatRupiah(item.amount)}</td>
                  <td />
                </tr>
              ))}
              {rows.map((row, index) => (
                <tr key={row.key}>
                  <td>
                    <Input aria-label={`Nama termin ${index + 1}`} value={row.label} onChange={(event) => update(row.key, { label: event.target.value })} maxLength={200} />
                  </td>
                  <td>
                    <Select aria-label={`Pemicu termin ${index + 1}`} value={row.trigger} onChange={(event) => update(row.key, { trigger: event.target.value as Row["trigger"] })}>
                      {BILLING_TRIGGERS.map((trigger) => (
                        <option key={trigger.value} value={trigger.value}>
                          {trigger.label}
                        </option>
                      ))}
                    </Select>
                    {row.trigger === "ON_DATE" ? (
                      <Input aria-label={`Tanggal termin ${index + 1}`} type="date" value={row.dueOn} onChange={(event) => update(row.key, { dueOn: event.target.value })} style={{ marginTop: 6 }} />
                    ) : null}
                  </td>
                  <td>
                    <MoneyInput aria-label={`Jumlah termin ${index + 1}`} value={row.amount} onValueChange={(amount) => update(row.key, { amount })} />
                  </td>
                  <td>
                    <IconButton label="Hapus termin" disabled={rows.length < 2} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>
                      <Trash2 aria-hidden="true" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row between">
          <Button variant="tertiary" onClick={() => setRows((current) => [...current, { key: crypto.randomUUID(), label: `Termin ${current.length + locked.length + 1}`, trigger: "ON_MILESTONE", dueOn: "", amount: "", isRetention: false }])}>
            <Plus aria-hidden="true" />
            Tambah termin
          </Button>
          <span className={balanced ? "sum-ok" : "sum-bad"}>
            {formatRupiah(total)} dari {formatRupiah(target)}
          </span>
        </div>
        <Field label="Alasan perubahan" htmlFor="plan-reason" required>
          <Input id="plan-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="mis. Customer minta DP 20%" />
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button
          disabled={!balanced || !complete || !reason.trim()}
          pending={pending}
          pendingText="Menyimpan..."
          onClick={() =>
            run(
              () =>
                rebalanceOrderAction({
                  orderId: order.id,
                  reason,
                  items: rows.map((row) => ({
                    ...(row.id ? { id: row.id } : {}),
                    label: row.label.trim(),
                    amount: row.amount,
                    trigger: row.trigger,
                    ...(row.trigger === "ON_DATE" ? { dueOn: row.dueOn } : {}),
                    isRetention: row.isRetention,
                  })),
                }),
              "Rencana termin disimpan",
            )
          }
        >
          Simpan rencana
        </Button>
      </DialogFooter>
    </>
  );
}

function CancelBody({ order, onClose }: { order: OrderDto; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const { pending, error, run } = useSubmit(onClose);
  return (
    <>
      <div className="stack">
        <p>Termin yang tersisa ikut batal. Uang yang sudah masuk tetap tercatat sebagai kredit customer dan bisa di-refund dari Uang masuk.</p>
        <Field label="Alasan" htmlFor="cancel-reason" required>
          <Textarea id="cancel-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="mis. Proyek dibatalkan pemilik gedung" />
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Kembali
        </Button>
        <Button variant="destructive" disabled={!reason.trim()} pending={pending} pendingText="Memproses..." onClick={() => run(() => cancelOrderAction({ orderId: order.id, reason }), "Pesanan dibatalkan")}>
          Batalkan pesanan
        </Button>
      </DialogFooter>
    </>
  );
}

/** BIL-03: on a milestone termin, record the BAST that makes it ready to bill. */
export function MilestoneButton({ orderId, billingItemId, label }: { orderId: string; billingItemId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const { pending, error, run } = useSubmit(() => setOpen(false));
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Flag aria-hidden="true" />
        Tandai BAST selesai
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Tandai milestone selesai" description={`${label} menjadi siap ditagih.`}>
        {open ? (
          <>
            <div className="stack">
              <Field label="Nomor BAST" htmlFor="bast-ref" hint="Opsional, tapi membantu saat penagihan.">
                <Input id="bast-ref" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} placeholder="mis. BAST-1104" />
              </Field>
              {error ? <Alert tone="error">{error}</Alert> : null}
            </div>
            <DialogFooter>
              <Button variant="tertiary" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button pending={pending} pendingText="Menyimpan..." onClick={() => run(() => markMilestoneAction({ orderId, billingItemId, milestoneRef: reference }), "Termin siap ditagih")}>
                Tandai selesai
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </Dialog>
    </>
  );
}
