"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ItemsTable, addDays, rowErrors, useDocumentCalculation, type Row } from "@/components/domain/document-items-editor";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/field";
import { KeyValue } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatQuantity, formatRupiah } from "@/lib/format";
import { QUOTATION_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { InvoiceDraftContextDto, InvoiceSourceContentDto, InvoiceableDealDto } from "@/server/invoices/invoice-views";
import { getInvoiceDraftContextAction, getInvoiceSourceContentAction, issueInvoiceAction, searchInvoiceableDealsAction } from "./actions";

const MANUAL = "";
const STEPS = ["Pilih deal & sumber", "Tinjau isi", "Konfirmasi"];
const TEXT_LIMIT = 10_000;

type Content = {
  rows: Row[];
  discount: string;
  tax: string;
  notes: string;
  terms: string;
  editVersion?: number;
};

function contentFrom(source: InvoiceSourceContentDto | null, defaultTerms: string | null): Content {
  if (!source) {
    return { rows: [{ key: 0, description: "", quantity: "1", unit: "paket", unitPrice: "" }], discount: "0", tax: "0", notes: "", terms: defaultTerms ?? "" };
  }
  return {
    rows: source.items.map((item, index) => ({ key: index, description: item.description, quantity: formatQuantity(item.quantity), unit: item.unit, unitPrice: item.unitPrice })),
    discount: source.discount,
    tax: source.tax,
    notes: source.notes ?? "",
    terms: source.terms ?? "",
    editVersion: source.editVersion,
  };
}

/**
 * I-02: issue an invoice in three steps. The server's rules are the real
 * ones (a won deal, one invoice per deal, a source that has not changed);
 * the wizard lets the user see each of them before they matter.
 */
export function InvoiceWizard({ initialDeals, initialContext, today }: { initialDeals: InvoiceableDealDto[]; initialContext: InvoiceDraftContextDto | null; today: string }) {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [context, setContext] = useState<InvoiceDraftContextDto | null>(initialContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState(() => initialContext?.sources.find((source) => source.recommended)?.id ?? MANUAL);
  const [dealPick, setDealPick] = useState<InvoiceableDealDto | null>(null);

  const [content, setContent] = useState<Content>(() => contentFrom(null, initialContext?.defaultTerms ?? null));
  const [rowCounter, setRowCounter] = useState(1);
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDays(today, 30));
  const [submitted, setSubmitted] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [issuing, setIssuing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sourceChanged, setSourceChanged] = useState(false);

  const calculation = useDocumentCalculation(content.rows, content.discount, content.tax);
  const setRows = (update: (current: Row[]) => Row[]) => setContent((current) => ({ ...current, rows: update(current.rows) }));
  const source = context?.sources.find((candidate) => candidate.id === sourceId) ?? null;

  const dateError = dueDate && issueDate && dueDate < issueDate ? "Jatuh tempo tidak boleh sebelum tanggal terbit." : undefined;
  const rowsInvalid = content.rows.some((row) => Object.keys(rowErrors(row)).length > 0);
  const totalNotPositive = calculation.calc?.ok === false && calculation.calc.code === "TOTAL_NOT_POSITIVE";
  const canContinue = !rowsInvalid && !dateError && !calculation.discountTooHigh && calculation.calc?.ok === true && !!issueDate && !!dueDate;

  async function chooseDeal(deal: InvoiceableDealDto | null) {
    setDealPick(deal);
    setContext(null);
    setError(null);
    if (!deal) return;
    setLoading(true);
    const result = await getInvoiceDraftContextAction({ dealId: deal.id });
    setLoading(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setContext(result.data);
    setSourceId(result.data.sources.find((candidate) => candidate.recommended)?.id ?? MANUAL);
  }

  async function loadContent(): Promise<boolean> {
    if (!context) return false;
    if (!sourceId) {
      setContent(contentFrom(null, context.defaultTerms));
      setRowCounter(1);
      return true;
    }
    setLoading(true);
    const result = await getInvoiceSourceContentAction({ dealId: context.deal.id, quotationId: sourceId });
    setLoading(false);
    if (!result.ok) {
      setError(result.error.message);
      return false;
    }
    const next = contentFrom(result.data, context.defaultTerms);
    setContent(next);
    setRowCounter(next.rows.length);
    return true;
  }

  async function next1() {
    setError(null);
    if (await loadContent()) setStep(2);
  }

  function next2() {
    setSubmitted(true);
    if (!canContinue) return;
    // A new key per reviewed payload: a retry of this exact review is idempotent,
    // a changed review is a different request and must not reuse the old key.
    setIdempotencyKey(crypto.randomUUID());
    setStep(3);
  }

  async function submit(retry = false) {
    if (!context) return;
    setIssuing(true);
    setError(null);
    let result: Awaited<ReturnType<typeof issueInvoiceAction>>;
    try {
      result = await issueInvoiceAction({
        dealId: context.deal.id,
        quotationId: sourceId || undefined,
        expectedSourceEditVersion: sourceId ? content.editVersion : undefined,
        issueDate,
        dueDate,
        items: content.rows.map((row) => ({ description: row.description, quantity: row.quantity.trim().replace(",", "."), unit: row.unit, unitPrice: row.unitPrice })),
        discount: content.discount,
        tax: content.tax,
        notes: content.notes,
        terms: content.terms,
        idempotencyKey,
      });
    } catch {
      // The connection dropped: the invoice may or may not exist. The same key is
      // sent again, which returns the invoice if it was created and never makes a second.
      if (!retry) {
        setChecking(true);
        await submit(true);
        setChecking(false);
      } else {
        setIssuing(false);
        setError("Koneksi terputus. Periksa daftar invoice sebelum mencoba lagi.");
      }
      return;
    }
    setIssuing(false);

    if (result.ok) {
      toast(`Invoice ${result.data.invoiceNumber} diterbitkan`, "success", { label: "Buka invoice", href: `/invoices/${result.data.id}` });
      router.push(`/invoices/${result.data.id}`);
      return;
    }
    if (result.error.code === "CONFLICT" && /berubah sejak/i.test(result.error.message)) {
      setSourceChanged(true);
      return;
    }
    if (result.error.code === "CONFLICT" && /sudah memiliki invoice/i.test(result.error.message)) {
      const refreshed = await getInvoiceDraftContextAction({ dealId: context.deal.id });
      if (refreshed.ok) setContext(refreshed.data);
      setStep(1);
      return;
    }
    const fields = result.error.fieldErrors ?? {};
    setError(Object.keys(fields).length > 0 ? Object.values(fields)[0]! : result.error.message);
  }

  const stepper = (
    <ol className="stepper" aria-label="Langkah" style={{ listStyle: "none", marginTop: 0, marginBottom: 20, padding: "10px 0 22px" }}>
      {STEPS.map((label, index) => (
        <li key={label} className={cn("step", index + 1 < step && "done", index + 1 === step && "current")} aria-current={index + 1 === step ? "step" : undefined}>
          <b>{index + 1 < step ? <Check aria-hidden="true" /> : index + 1}</b>
          {label}
        </li>
      ))}
    </ol>
  );

  // -------------------------------------------------------------------------
  if (step === 1) {
    const blockedByExisting = context?.existingInvoice;
    return (
      <>
        {stepper}
        <Card style={{ maxWidth: 760 }}>
          <div className="stack">
            {initialContext ? (
              <Field label="Deal" htmlFor="invoice-deal">
                <Input id="invoice-deal" value={`${initialContext.deal.title} · ${initialContext.deal.customerName}`} readOnly />
              </Field>
            ) : (
              <Combobox<InvoiceableDealDto>
                id="invoice-deal"
                label="Deal Menang tanpa invoice"
                required
                placeholder="Cari deal menang"
                noResults="Tidak ada deal menang yang siap ditagih."
                value={dealPick}
                onChange={chooseDeal}
                search={(query) => (query || initialDeals.length === 0 ? searchInvoiceableDealsAction({ query }) : Promise.resolve({ ok: true as const, data: initialDeals }))}
                display={(deal) => `${deal.title} · ${deal.customerName} · ${formatRupiah(deal.wonValue)}${deal.wonAt ? ` · ${formatDate(deal.wonAt)}` : ""}`}
                renderOption={(deal) => (
                  <>
                    <b>{deal.title}</b>
                    <small>
                      {deal.customerName} · {formatRupiah(deal.wonValue)}
                    </small>
                  </>
                )}
              />
            )}

            {loading && !context ? <div className="skeleton" aria-busy="true" aria-label="Memuat"><div className="skel" /><div className="skel" /></div> : null}

            {blockedByExisting ? (
              <Alert tone="info">
                Deal ini sudah memiliki invoice. <b>{blockedByExisting.invoiceNumber}</b>{" "}
                <Link className="btn tertiary" href={`/invoices/${blockedByExisting.id}`}>
                  Buka invoice
                </Link>
              </Alert>
            ) : null}

            {context && !blockedByExisting ? (
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="field-legend">Sumber isi invoice</legend>
                <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                  {context.sources.map((candidate) => {
                    const info = QUOTATION_STATUS[candidate.status];
                    return (
                      <label key={candidate.id} className="choice">
                        <input type="radio" name="source" checked={sourceId === candidate.id} onChange={() => setSourceId(candidate.id)} />
                        <span>
                          <strong>
                            {candidate.quotationNumber} · <Badge tone={info?.tone}>{info?.label ?? candidate.status}</Badge>
                            {candidate.recommended ? " · Direkomendasikan" : ""}
                            {!candidate.isLatest ? " · Versi lama" : ""}
                          </strong>
                          <small>
                            {formatRupiah(candidate.total)} · {formatDate(candidate.issueDate)}
                          </small>
                        </span>
                      </label>
                    );
                  })}
                  <label className="choice">
                    <input type="radio" name="source" checked={sourceId === MANUAL} onChange={() => setSourceId(MANUAL)} />
                    <span>
                      <strong>Tanpa quotation - isi item manual</strong>
                      <small>{context.sources.length > 0 ? "Isi item baru." : "Isi item sesuai kesepakatan dengan customer."}</small>
                    </span>
                  </label>
                </div>
                {context.sources.length === 0 ? <Alert tone="info" className="mt">Deal ini tidak punya quotation. Isi item secara manual.</Alert> : null}
                {source && source.status === "SENT" ? <Alert tone="warning" className="mt">Quotation ini berstatus Terkirim. Pastikan isinya sesuai kesepakatan.</Alert> : null}
              </fieldset>
            ) : null}

            {error ? <Alert tone="error">{error}</Alert> : null}
          </div>
          <div className="footer">
            <ButtonLink variant="tertiary" href={initialContext ? `/deals/${initialContext.deal.id}` : "/invoices"}>
              Batal
            </ButtonLink>
            <Button disabled={!context || Boolean(blockedByExisting)} pending={loading && Boolean(context)} pendingText="Memuat..." onClick={next1}>
              Lanjut
            </Button>
          </div>
        </Card>
      </>
    );
  }

  // -------------------------------------------------------------------------
  if (step === 2 && context) {
    return (
      <>
        {stepper}
        <div className="cols split">
          <div className="stack">
            <Card>
              <h2>Info dokumen</h2>
              <div className="input-grid">
                <Field label="Tanggal terbit" htmlFor="invoice-issue" required>
                  <Input id="invoice-issue" type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
                </Field>
                <Field label="Jatuh tempo" htmlFor="invoice-due" required error={dateError ?? (submitted && !dueDate ? "Jatuh tempo wajib diisi." : undefined)}>
                  <Input id="invoice-due" type="date" value={dueDate} min={issueDate || undefined} invalid={!!dateError} onChange={(event) => setDueDate(event.target.value)} />
                </Field>
              </div>
              <div className="chips" style={{ marginTop: 12 }} aria-label="Pilihan jatuh tempo">
                {[7, 14, 30].map((days) => (
                  <button key={days} type="button" className={cn("chip", issueDate && dueDate === addDays(issueDate, days) && "active")} onClick={() => issueDate && setDueDate(addDays(issueDate, days))}>
                    +{days} hari
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <h2>Item</h2>
              <ItemsTable rows={content.rows} setRows={setRows} rowCounter={rowCounter} setRowCounter={setRowCounter} calculation={calculation} submitted={submitted} serverErrors={{}} idPrefix="inv" />
            </Card>

            <Card>
              <h2>Catatan &amp; syarat</h2>
              <div className="stack">
                <Field label="Catatan" htmlFor="invoice-notes" hint={`${content.notes.length.toLocaleString("id-ID")} / 10.000 karakter`} error={content.notes.length > TEXT_LIMIT ? "Maksimal 10.000 karakter" : undefined}>
                  <Textarea id="invoice-notes" value={content.notes} onChange={(event) => setContent((current) => ({ ...current, notes: event.target.value }))} />
                </Field>
                <Field label="Syarat & ketentuan" htmlFor="invoice-terms" hint={`${content.terms.length.toLocaleString("id-ID")} / 10.000 karakter`} error={content.terms.length > TEXT_LIMIT ? "Maksimal 10.000 karakter" : undefined}>
                  <Textarea id="invoice-terms" value={content.terms} onChange={(event) => setContent((current) => ({ ...current, terms: event.target.value }))} />
                </Field>
                {sourceId ? <Alert tone="info">Perubahan di sini tidak mengubah quotation sumber.</Alert> : null}
              </div>
            </Card>
          </div>

          <Card className="summary-panel">
            <h2>Ringkasan</h2>
            <div className="sumrow">
              <span>Subtotal</span>
              <strong className="money">{formatRupiah(calculation.subtotal)}</strong>
            </div>
            <div className="stack">
              <Field label="Diskon (Rp)" htmlFor="invoice-discount" error={calculation.discountTooHigh ? "Diskon tidak boleh melebihi subtotal" : undefined} hint="Diskon nominal, bukan persentase.">
                <MoneyInput id="invoice-discount" value={content.discount} onValueChange={(digits) => setContent((current) => ({ ...current, discount: digits }))} invalid={calculation.discountTooHigh} />
              </Field>
              <Field label="Pajak (Rp)" htmlFor="invoice-tax">
                <MoneyInput id="invoice-tax" value={content.tax} onValueChange={(digits) => setContent((current) => ({ ...current, tax: digits }))} />
              </Field>
            </div>
            <div className="line" />
            <div className="sumrow sumtotal">
              <span>Total</span>
              <span className="money">{formatRupiah(calculation.total)}</span>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              Total dihitung otomatis oleh sistem.
            </p>
            {(submitted && totalNotPositive) || (!sourceId && calculation.total === 0n && !rowsInvalid) ? (
              <Alert tone={totalNotPositive ? "error" : "warning"}>{totalNotPositive ? "Total invoice harus lebih dari Rp0." : "Tambahkan minimal satu item dengan total invoice lebih dari Rp0."}</Alert>
            ) : null}
            <div className="stack" style={{ marginTop: 20 }}>
              <span title={canContinue ? undefined : "Lengkapi item invoice terlebih dahulu."}>
                <Button full disabled={submitted && !canContinue} onClick={next2}>
                  Lanjut
                </Button>
              </span>
              <Button variant="secondary" onClick={() => setStep(1)}>
                Kembali
              </Button>
              <ButtonLink variant="tertiary" href="/invoices">
                Batal
              </ButtonLink>
            </div>
          </Card>
        </div>
      </>
    );
  }

  // -------------------------------------------------------------------------
  if (!context) return null;
  return (
    <>
      {stepper}
      <Card style={{ maxWidth: 760 }}>
        <h2>Konfirmasi</h2>
        <dl>
          <KeyValue label="Customer">{context.deal.customerName}</KeyValue>
          <KeyValue label="Deal">{context.deal.title}</KeyValue>
          <KeyValue label="Sumber">{source ? source.quotationNumber : "Item manual"}</KeyValue>
          <KeyValue label="Tanggal terbit">{formatDate(issueDate)}</KeyValue>
          <KeyValue label="Jatuh tempo">{formatDate(dueDate)}</KeyValue>
          <KeyValue label="Jumlah item">{content.rows.length}</KeyValue>
          <KeyValue label="Total">
            <strong style={{ fontSize: 22 }}>{formatRupiah(calculation.total)}</strong>
          </KeyValue>
        </dl>
        <Alert tone="warning">
          Invoice yang sudah terbit <b>tidak dapat diubah atau dihapus</b>.{source ? " Quotation sumber akan dikunci." : ""}
        </Alert>
        {checking ? <Alert tone="info" className="mt">Memeriksa hasil sebelumnya...</Alert> : null}
        {error ? <Alert tone="error" className="mt">{error}</Alert> : null}
        <div className="footer">
          <ButtonLink variant="tertiary" href="/invoices">
            Batal
          </ButtonLink>
          <Button variant="secondary" onClick={() => setStep(2)} disabled={issuing}>
            Kembali
          </Button>
          <Button pending={issuing} pendingText="Memproses..." onClick={() => submit()}>
            Terbitkan invoice
          </Button>
        </div>
      </Card>

      <Dialog open={sourceChanged} onClose={() => setSourceChanged(false)} title="Quotation sumber sudah berubah">
        <div className="stack">
          <p>Quotation sumber sudah berubah sejak Anda meninjau. Tinjau ulang sebelum menerbitkan.</p>
          <Alert tone="warning">Perubahan Anda masih tersimpan. Muat ulang isi untuk meninjau sumber terbaru.</Alert>
        </div>
        <DialogFooter>
          <Button variant="tertiary" onClick={() => setSourceChanged(false)}>
            Batal
          </Button>
          <Button
            onClick={async () => {
              setSourceChanged(false);
              if (await loadContent()) setStep(2);
            }}
          >
            Muat ulang isi
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
