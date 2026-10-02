"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConflictDialog } from "@/components/ui/conflict-dialog";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { KeyValue } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatPhone, instantToZonedLocal, zoneLabel } from "@/lib/format";
import { FOLLOW_UP_TYPES, followUpTypeLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { DealOptionDto } from "@/server/deals/deal-views";
import type { FollowUpRowDto } from "@/server/follow-ups/follow-up-views";
import { buildWhatsAppDeepLink, renderFollowUpMessage } from "@/server/whatsapp/message";
import type { WhatsAppComposerDto } from "@/server/whatsapp/whatsapp";
import {
  completeFollowUpAction,
  getWhatsAppComposerAction,
  recordWhatsAppOpenedAction,
  saveFollowUpAction,
  searchDealOptionsAction,
} from "./actions";

const NOTE_LIMIT = 5000;
const pad = (n: number) => String(n).padStart(2, "0");

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** The shortcut chips under "Jadwal": wall-clock values in the organization's timezone. */
function quickSchedules(timezone: string): { label: string; value: string }[] {
  const now = instantToZonedLocal(new Date(), timezone); // YYYY-MM-DDTHH:mm
  const today = now.slice(0, 10);
  const hour = Number(now.slice(11, 13));
  const minute = Number(now.slice(14, 16));
  // "Nanti sore": 16.00 today, or two hours from now once that has passed.
  const later = hour < 15 ? `${today}T16:00` : (() => {
    const total = hour * 60 + minute + 120;
    const rounded = Math.ceil(total / 15) * 15;
    const target = rounded >= 24 * 60 ? `${addDays(today, 1)}T08:00` : `${today}T${pad(Math.floor(rounded / 60))}:${pad(rounded % 60)}`;
    return target;
  })();
  return [
    { label: "Nanti sore", value: later },
    { label: "Besok 09.00", value: `${addDays(today, 1)}T09:00` },
    { label: "Minggu depan", value: `${addDays(today, 7)}T09:00` },
  ];
}

export type FormFollowUp = Pick<FollowUpRowDto, "id" | "version" | "dealId" | "dealTitle" | "customerName" | "type" | "note" | "followUpAt" | "completedAt">;

const dealLabel = (deal: { title: string; customerName: string }) => `${deal.title} · ${deal.customerName}`;

// ---------------------------------------------------------------------------
// F-02: schedule or edit a follow-up

export function FollowUpFormDialog({
  open,
  onClose,
  timezone,
  followUp,
  deal,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  timezone: string;
  followUp?: FormFollowUp;
  /** Set when the deal is already known (from a deal page); the field is then read-only. */
  deal?: DealOptionDto;
  preset?: { type?: string; alreadyDone?: boolean };
}) {
  const readOnly = Boolean(followUp?.completedAt);
  const title = readOnly ? "Follow-up selesai · hanya baca" : followUp ? "Edit follow-up" : "Jadwalkan follow-up";
  return (
    <Dialog open={open} onClose={onClose} title={title} size="large">
      <FollowUpForm timezone={timezone} followUp={followUp} deal={deal} preset={preset} readOnly={readOnly} onClose={onClose} />
    </Dialog>
  );
}

function FollowUpForm({
  timezone,
  followUp,
  deal,
  preset,
  readOnly,
  onClose,
}: {
  timezone: string;
  followUp?: FormFollowUp;
  deal?: DealOptionDto;
  preset?: { type?: string; alreadyDone?: boolean };
  readOnly: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const shortcuts = quickSchedules(timezone);
  const [picked, setPicked] = useState<DealOptionDto | null>(deal ?? null);
  const [type, setType] = useState(followUp?.type ?? preset?.type ?? "CALL");
  const [scheduledAt, setScheduledAt] = useState(
    followUp ? instantToZonedLocal(followUp.followUpAt, timezone) : preset?.alreadyDone ? instantToZonedLocal(new Date(), timezone) : shortcuts[1]!.value,
  );
  const [note, setNote] = useState(followUp?.note ?? "");
  const [alreadyDone, setAlreadyDone] = useState(preset?.alreadyDone ?? false);
  const [errors, setErrors] = useState<Partial<Record<"dealId" | "scheduledAt" | "note", string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);

  const lockedDeal = Boolean(deal || followUp);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: typeof errors = {};
    if (!lockedDeal && !picked) found.dealId = "Pilih deal.";
    if (!scheduledAt) found.scheduledAt = "Jadwal wajib diisi.";
    if (note.trim().length > NOTE_LIMIT) found.note = "Maksimal 5.000 karakter";
    setErrors(found);
    setFormError(null);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(`followup-${first}`)?.focus();
      return;
    }

    setPending(true);
    const result = await saveFollowUpAction({
      followUpId: followUp?.id,
      expectedVersion: followUp?.version,
      values: { dealId: followUp?.dealId ?? deal?.id ?? picked!.id, type, note, scheduledAt, alreadyDone },
    });
    setPending(false);

    if (result.ok) {
      toast("Follow-up disimpan");
      onClose();
      router.refresh();
      return;
    }
    if (result.error.code === "CONFLICT") {
      setConflict(true);
      return;
    }
    const fieldErrors = result.error.fieldErrors ?? {};
    setErrors({ dealId: fieldErrors.dealId, scheduledAt: fieldErrors.followUpAt ?? fieldErrors.scheduledAt, note: fieldErrors.note });
    setFormError(Object.keys(fieldErrors).length > 0 ? null : result.error.message);
  }

  const dealText = followUp ? dealLabel({ title: followUp.dealTitle, customerName: followUp.customerName }) : deal ? dealLabel({ title: deal.title, customerName: deal.customerName }) : "";

  return (
    <>
      <form onSubmit={onSubmit} noValidate>
        <div className="stack">
          {lockedDeal ? (
            <Field label="Deal" htmlFor="followup-dealId" required>
              <Input id="followup-dealId" value={dealText} readOnly />
            </Field>
          ) : (
            <Combobox<DealOptionDto>
              id="followup-dealId"
              label="Deal"
              required
              error={errors.dealId}
              hint="Cari judul deal atau nama customer."
              placeholder="Cari deal aktif"
              noResults="Tidak ada deal aktif yang cocok."
              value={picked}
              onChange={(next) => {
                setPicked(next);
                setErrors((current) => ({ ...current, dealId: undefined }));
              }}
              search={(query) => searchDealOptionsAction({ query })}
              display={dealLabel}
              renderOption={(option) => (
                <>
                  <b>{option.title}</b>
                  <small>{option.customerName}</small>
                </>
              )}
            />
          )}

          <div className="field">
            <span id="followup-type-label">
              Tipe <span className="red" aria-hidden="true">*</span>
            </span>
            <div className="chips" role="radiogroup" aria-labelledby="followup-type-label">
              {FOLLOW_UP_TYPES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={type === option.value}
                  disabled={Boolean(followUp)}
                  className={cn("chip", type === option.value && "active")}
                  onClick={() => setType(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {followUp ? <small>Tipe ditentukan saat follow-up dibuat.</small> : null}
          </div>

          <Field label={`Jadwal (${zoneLabel(timezone)})`} htmlFor="followup-scheduledAt" required error={errors.scheduledAt}>
            <Input
              id="followup-scheduledAt"
              type="datetime-local"
              value={scheduledAt}
              readOnly={readOnly}
              invalid={!!errors.scheduledAt}
              onChange={(event) => {
                setScheduledAt(event.target.value);
                setErrors((current) => ({ ...current, scheduledAt: undefined }));
              }}
            />
          </Field>
          {readOnly ? null : (
            <div className="chips" aria-label="Pilihan jadwal cepat">
              {shortcuts.map((shortcut) => (
                <button key={shortcut.label} type="button" className="chip" onClick={() => setScheduledAt(shortcut.value)}>
                  {shortcut.label}
                </button>
              ))}
            </div>
          )}

          <Field label="Catatan" htmlFor="followup-note" error={errors.note} hint={`${note.length.toLocaleString("id-ID")} / 5.000 karakter`}>
            <Textarea
              id="followup-note"
              value={note}
              readOnly={readOnly}
              invalid={!!errors.note}
              onChange={(event) => {
                setNote(event.target.value);
                setErrors((current) => ({ ...current, note: undefined }));
              }}
            />
          </Field>

          {followUp && !readOnly ? <Alert tone="info">Jadwal lama tetap tercatat di riwayat.</Alert> : null}
          {readOnly ? null : (
            <label className="toggle">
              <input type="checkbox" checked={alreadyDone} onChange={(event) => setAlreadyDone(event.target.checked)} />
              Sudah terjadi? Catat sebagai selesai
            </label>
          )}
          {formError ? <Alert tone="error">{formError}</Alert> : null}
        </div>
        <DialogFooter>
          <Button variant="tertiary" onClick={onClose}>
            {readOnly ? "Tutup" : "Batal"}
          </Button>
          {readOnly ? null : (
            <Button type="submit" pending={pending} pendingText="Menyimpan...">
              Simpan
            </Button>
          )}
        </DialogFooter>
      </form>
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

/** A button that opens the schedule form; used on the follow-up list, deal page and pipeline cards. */
export function ScheduleFollowUpButton({
  timezone,
  deal,
  variant = "primary",
  children = "Jadwalkan follow-up",
  autoOpen,
}: {
  timezone: string;
  deal?: DealOptionDto;
  variant?: "primary" | "secondary" | "tertiary";
  children?: React.ReactNode;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(autoOpen));
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <FollowUpFormDialog open={open} onClose={() => setOpen(false)} timezone={timezone} deal={deal} />
    </>
  );
}

// ---------------------------------------------------------------------------
// F-03: mark a follow-up done

export function CompleteFollowUpDialog({
  open,
  onClose,
  followUp,
  timezone,
}: {
  open: boolean;
  onClose: () => void;
  followUp: FollowUpRowDto;
  timezone: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Tandai follow-up selesai">
      <CompleteBody followUp={followUp} timezone={timezone} onClose={onClose} />
    </Dialog>
  );
}

function CompleteBody({ followUp, timezone, onClose }: { followUp: FollowUpRowDto; timezone: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [completedAt, setCompletedAt] = useState(() => instantToZonedLocal(new Date(), timezone));
  const [note, setNote] = useState(followUp.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!completedAt) {
      setError("Waktu selesai wajib diisi.");
      return;
    }
    if (completedAt > instantToZonedLocal(new Date(Date.now() + 60_000), timezone)) {
      setError("Waktu selesai tidak boleh masa depan.");
      return;
    }
    setError(null);
    setPending(true);
    const result = await completeFollowUpAction({ followUpId: followUp.id, expectedVersion: followUp.version, completedAt, note });
    setPending(false);
    if (result.ok) {
      onClose();
      toast("Follow-up ditandai selesai", "success", { label: "Jadwalkan follow-up berikutnya", href: `/deals/${followUp.dealId}?schedule=1` });
      router.refresh();
      return;
    }
    if (result.error.code === "CONFLICT") {
      setConflict(true);
      return;
    }
    if (result.error.fieldErrors?.completedAt) setError(result.error.fieldErrors.completedAt);
    else setFormError(result.error.message);
  }

  return (
    <>
      <form onSubmit={submit} noValidate>
        <div className="stack">
          <dl style={{ margin: 0 }}>
            <KeyValue label="Tipe">{followUpTypeLabel(followUp.type)}</KeyValue>
            <KeyValue label="Customer">{followUp.customerName}</KeyValue>
            <KeyValue label="Jadwal">{formatDateTime(followUp.followUpAt, timezone)}</KeyValue>
          </dl>
          <Field label="Waktu selesai" htmlFor="complete-at" required error={error ?? undefined} hint="Waktu lampau diperbolehkan; tidak boleh masa depan.">
            <Input id="complete-at" type="datetime-local" value={completedAt} invalid={!!error} onChange={(event) => setCompletedAt(event.target.value)} />
          </Field>
          <Field label="Hasil / catatan" htmlFor="complete-note" hint={`${note.length.toLocaleString("id-ID")} / 5.000 karakter`}>
            <Textarea id="complete-note" value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          {formError ? <Alert tone="error">{formError}</Alert> : null}
        </div>
        <DialogFooter>
          <Button variant="tertiary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" pending={pending} pendingText="Menyimpan...">
            Tandai selesai
          </Button>
        </DialogFooter>
      </form>
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

// ---------------------------------------------------------------------------
// W-01: open WhatsApp with an editable message

export function WhatsAppDialog({
  open,
  onClose,
  dealId,
  timezone,
  initialQuotationId,
}: {
  open: boolean;
  onClose: () => void;
  dealId: string;
  timezone: string;
  /** Start with this quotation selected instead of the default one (opened from a quotation page). */
  initialQuotationId?: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Kirim pesan WhatsApp">
      <WhatsAppBody dealId={dealId} timezone={timezone} onClose={onClose} initialQuotationId={initialQuotationId} />
    </Dialog>
  );
}

const NO_QUOTATION = "";

function WhatsAppBody({ dealId, timezone, onClose, initialQuotationId }: { dealId: string; timezone: string; onClose: () => void; initialQuotationId?: string }) {
  const toast = useToast();
  const [composer, setComposer] = useState<WhatsAppComposerDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quotationId, setQuotationId] = useState(NO_QUOTATION);
  const [message, setMessage] = useState("");
  const [opened, setOpened] = useState(false);
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getWhatsAppComposerAction({ dealId }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error.message);
        return;
      }
      const data = result.data;
      const chosen = data.quotations.find((quotation) => quotation.id === (initialQuotationId ?? data.defaultQuotationId)) ?? data.quotations.find((quotation) => quotation.id === data.defaultQuotationId);
      setComposer(data);
      setQuotationId(chosen?.id ?? NO_QUOTATION);
      setMessage(renderFollowUpMessage({ customerName: data.contactPerson, dealTitle: data.dealTitle, quotationNumber: chosen?.quotationNumber }));
    });
    return () => {
      cancelled = true;
    };
  }, [dealId, initialQuotationId]);

  if (loadError) return <Alert tone="error">{loadError}</Alert>;
  if (!composer) return <div className="skeleton" aria-busy="true" aria-label="Memuat"><div className="skel" /><div className="skel" /><div className="skel" /></div>;

  if (opened) {
    return <AfterOpened dealId={dealId} dealTitle={composer.dealTitle} customerName={composer.companyName} timezone={timezone} onClose={onClose} />;
  }

  let deepLink: string | null = null;
  try {
    deepLink = message.trim() ? buildWhatsAppDeepLink(composer.phoneNormalized, message) : null;
  } catch {
    deepLink = null;
  }
  const phoneInvalid = composer.phoneNormalized.replace(/[^0-9]/g, "").length === 0;

  function pickQuotation(id: string) {
    setQuotationId(id);
    const chosen = composer?.quotations.find((quotation) => quotation.id === id);
    setMessage(renderFollowUpMessage({ customerName: composer!.contactPerson, dealTitle: composer!.dealTitle, quotationNumber: chosen?.quotationNumber }));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast("Pesan disalin");
    } catch {
      toast("Tidak dapat menyalin. Salin pesan secara manual.", "error");
    }
  }

  async function open() {
    setLogging(true);
    // WA-03: only the click is logged, as its own event; it is not a completed follow-up.
    await recordWhatsAppOpenedAction({ dealId, quotationId: quotationId || undefined });
    setLogging(false);
    setOpened(true);
  }

  return (
    <>
      <div className="stack">
        <dl style={{ margin: 0 }}>
          <KeyValue label="Penerima">
            {composer.companyName} · {composer.contactPerson}
          </KeyValue>
          <KeyValue label="WhatsApp">{phoneInvalid ? "-" : formatPhone(composer.phoneNormalized)}</KeyValue>
        </dl>
        {phoneInvalid ? (
          <>
            <Alert tone="error">Nomor WhatsApp customer tidak valid.</Alert>
            <div>
              <ButtonLink variant="secondary" href={`/customers/${composer.customerId}`}>
                Perbaiki nomor customer
              </ButtonLink>
            </div>
          </>
        ) : null}
        <Field label="Quotation terkait" htmlFor="wa-quotation">
          <Select id="wa-quotation" value={quotationId} onChange={(event) => pickQuotation(event.target.value)}>
            {composer.quotations.map((quotation) => (
              <option key={quotation.id} value={quotation.id}>
                {quotation.quotationNumber} · {quotation.isLatest ? statusLabel(quotation.status) : "Versi lama"}
              </option>
            ))}
            <option value={NO_QUOTATION}>Tanpa quotation</option>
          </Select>
        </Field>
        <Field label="Pesan" htmlFor="wa-message">
          <Textarea id="wa-message" value={message} onChange={(event) => setMessage(event.target.value)} style={{ minHeight: 160 }} />
        </Field>
        <Alert tone="info">DealFlow hanya membuka WhatsApp. Pesan tidak terkirim otomatis dan tidak mengubah status quotation.</Alert>
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button variant="secondary" onClick={copy} disabled={!message.trim()}>
          Salin pesan
        </Button>
        <Button
          pending={logging}
          pendingText="Membuka..."
          disabled={phoneInvalid || !deepLink}
          onClick={() => {
            if (deepLink) window.open(deepLink, "_blank", "noopener,noreferrer");
            void open();
          }}
        >
          Buka WhatsApp
        </Button>
      </DialogFooter>
    </>
  );
}

const STATUS_LABEL: Record<string, string> = { DRAFT: "Draf", SENT: "Terkirim", ACCEPTED: "Diterima", REJECTED: "Ditolak", EXPIRED: "Kedaluwarsa" };
const statusLabel = (status: string) => STATUS_LABEL[status] ?? status;

function AfterOpened({ dealId, dealTitle, customerName, timezone, onClose }: { dealId: string; dealTitle: string; customerName: string; timezone: string; onClose: () => void }) {
  const [recording, setRecording] = useState(false);
  if (recording) {
    return (
      <FollowUpForm
        timezone={timezone}
        deal={{ id: dealId, title: dealTitle, customerName }}
        preset={{ type: "WHATSAPP", alreadyDone: true }}
        readOnly={false}
        onClose={onClose}
      />
    );
  }
  return (
    <>
      <div className="stack">
        <h3>Sudah menghubungi customer?</h3>
        <p className="muted">Percakapan dilakukan di WhatsApp. Catat hasilnya setelah selesai.</p>
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Nanti saja
        </Button>
        <Button onClick={() => setRecording(true)}>Catat follow-up selesai</Button>
      </DialogFooter>
    </>
  );
}
