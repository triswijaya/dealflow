"use client";

import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action-result";
import { instantToZonedLocal, zonedLocalToInstant } from "@/lib/format";
import { FOLLOW_UP_TYPES } from "@/lib/labels";
import { cancelCollectionTaskAction, collectionWhatsAppAction, completeCollectionTaskAction, createCollectionTaskAction } from "./collection-actions";

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

/** FUP-01: schedule a collection step, or record a promise to pay with its date. */
export function CollectionTaskButton({ invoiceId, timezone, promise, variant = "secondary" }: { invoiceId: string; timezone: string; promise?: boolean; variant?: "primary" | "secondary" | "tertiary" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {promise ? "Janji bayar" : "Jadwalkan penagihan"}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={promise ? "Catat janji bayar" : "Jadwalkan penagihan"}>
        {open ? <TaskBody invoiceId={invoiceId} timezone={timezone} promise={promise} onClose={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  );
}

function TaskBody({ invoiceId, timezone, promise, onClose }: { invoiceId: string; timezone: string; promise?: boolean; onClose: () => void }) {
  const now = instantToZonedLocal(new Date(), timezone);
  const [type, setType] = useState<string>("CALL");
  const [date, setDate] = useState(now.slice(0, 10));
  const [time, setTime] = useState("09:00");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const { pending, error, run } = useRun(onClose);
  const followUpAt = zonedLocalToInstant(`${date}T${promise ? "09:00" : time}`, timezone);
  return (
    <>
      <div className="stack">
        {promise ? <p className="muted">Jika tanggalnya lewat dan invoice belum lunas, invoice masuk antrian penagihan sebagai janji terlewat.</p> : null}
        <div className="input-grid">
          {promise ? null : (
            <Field label="Tipe" htmlFor="ctask-type" required>
              <Select id="ctask-type" value={type} onChange={(event) => setType(event.target.value)}>
                {FOLLOW_UP_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={promise ? "Tanggal janji bayar" : "Tanggal"} htmlFor="ctask-date" required>
            <Input id="ctask-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          {promise ? null : (
            <Field label="Jam" htmlFor="ctask-time" required>
              <Input id="ctask-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </Field>
          )}
        </div>
        <Field label="Catatan" htmlFor="ctask-note">
          <Textarea id="ctask-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={5000} placeholder={promise ? "mis. Bu Rina janji transfer setelah approval direksi" : "mis. Tanyakan status pembayaran ke bagian AP"} />
        </Field>
        {promise ? null : (
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={done} onChange={(event) => setDone(event.target.checked)} />
            Sudah dilakukan, catat sebagai selesai
          </label>
        )}
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button
          disabled={!date || Number.isNaN(followUpAt.getTime())}
          pending={pending}
          pendingText="Menyimpan..."
          onClick={() =>
            run(
              () => createCollectionTaskAction({ invoiceId, type: promise ? "PROMISE_TO_PAY" : type, note, followUpAt: followUpAt.toISOString(), done }),
              promise ? "Janji bayar dicatat" : done ? "Penagihan dicatat" : "Penagihan dijadwalkan",
            )
          }
        >
          Simpan
        </Button>
      </DialogFooter>
    </>
  );
}

export function CompleteTaskButton({ invoiceId, followUpId, version }: { invoiceId: string; followUpId: string; version: number }) {
  const { pending, error, run } = useRun(() => {});
  return (
    <Button variant="secondary" pending={pending} pendingText="..." title={error ?? undefined} onClick={() => run(() => completeCollectionTaskAction({ invoiceId, followUpId, expectedVersion: version }), "Tugas selesai")}>
      Selesai
    </Button>
  );
}

export function CancelTaskButton({ invoiceId, followUpId }: { invoiceId: string; followUpId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, error, run } = useRun(() => setOpen(false));
  return (
    <>
      <Button variant="tertiary" onClick={() => setOpen(true)}>
        Batalkan
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Batalkan tugas penagihan">
        {open ? (
          <>
            <div className="stack">
              <Field label="Alasan" htmlFor="ctask-cancel">
                <Textarea id="ctask-cancel" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="mis. Sudah dibayar lewat giro" />
              </Field>
              {error ? <Alert tone="error">{error}</Alert> : null}
            </div>
            <DialogFooter>
              <Button variant="tertiary" onClick={() => setOpen(false)}>
                Kembali
              </Button>
              <Button variant="destructive" pending={pending} pendingText="Memproses..." onClick={() => run(() => cancelCollectionTaskAction({ invoiceId, followUpId, reason }), "Tugas dibatalkan")}>
                Batalkan tugas
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </Dialog>
    </>
  );
}

/** WA-04: opens WhatsApp with the collection message to the invoice's contact; nothing is sent from here. */
export function CollectionWhatsAppButton({ invoiceId, iconOnly }: { invoiceId: string; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" aria-label="WhatsApp penagihan" onClick={() => setOpen(true)}>
        <MessageCircle aria-hidden="true" />
        {iconOnly ? null : "WhatsApp"}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="WhatsApp penagihan">
        {open ? <WhatsAppBody invoiceId={invoiceId} onClose={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  );
}

function WhatsAppBody({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const [state, setState] = useState<{ contactName: string; message: string; deepLink: string } | string | null>(null);
  useEffect(() => {
    let live = true;
    collectionWhatsAppAction(invoiceId).then((result) => {
      if (live) setState(result.ok ? result.data : result.error.message);
    });
    return () => {
      live = false;
    };
  }, [invoiceId]);
  if (state === null) return <p className="muted">Menyiapkan pesan…</p>;
  if (typeof state === "string") return <Alert tone="error">{state}</Alert>;
  return (
    <>
      <div className="stack">
        <p className="muted">Ke {state.contactName}. Pesan dibuka di WhatsApp dan bisa diubah sebelum dikirim.</p>
        <p className="wa-preview">{state.message}</p>
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Tutup
        </Button>
        <a className="btn primary" href={state.deepLink} target="_blank" rel="noreferrer" onClick={onClose}>
          <MessageCircle aria-hidden="true" />
          Buka WhatsApp
        </a>
      </DialogFooter>
    </>
  );
}
