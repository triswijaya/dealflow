"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action-result";

export type SendEmailValues = { to: string; message: string; idempotencyKey: string };

/**
 * ADR-0004: mail a document's PDF to the customer. The email goes through the
 * outbox, so a provider outage only delays it; the document itself is never
 * changed by sending it.
 */
export function SendEmailDialog({
  open,
  onClose,
  documentLabel,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  /** e.g. "quotation QT-2026-00012" */
  documentLabel: string;
  onSend: (values: SendEmailValues) => Promise<ActionResult<{ queued: boolean }>>;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Kirim lewat email" description={`PDF ${documentLabel} dikirim sebagai lampiran.`}>
      {open ? <SendEmailBody documentLabel={documentLabel} onSend={onSend} onClose={onClose} /> : null}
    </Dialog>
  );
}

function SendEmailBody({ documentLabel, onSend, onClose }: { documentLabel: string; onSend: (values: SendEmailValues) => Promise<ActionResult<{ queued: boolean }>>; onClose: () => void }) {
  const toast = useToast();
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  // One key per opened dialog: a double click or a retry sends the email once.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await onSend({ to: to.trim(), message: message.trim(), idempotencyKey });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast(result.data.queued ? `Email ${documentLabel} masuk antrean kirim` : "Email ini sudah dikirim sebelumnya", "success");
    onClose();
  }

  return (
    <>
      <div className="stack">
        <Field label="Kepada" htmlFor="email-to" hint="Kosongkan untuk memakai email PIC atau kontak utama customer.">
          <Input id="email-to" type="email" value={to} onChange={(event) => setTo(event.target.value)} placeholder="nama@perusahaan.co.id" autoComplete="off" />
        </Field>
        <Field label="Pesan" htmlFor="email-message" hint="Opsional. Kosongkan untuk memakai pesan standar.">
          <Textarea id="email-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} />
        </Field>
        <small>Gagal kirim tidak membatalkan dokumen. Antrean mencoba lagi otomatis.</small>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button pending={pending} pendingText="Mengirim..." onClick={submit}>
          Kirim email
        </Button>
      </DialogFooter>
    </>
  );
}
