"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConflictDialog } from "@/components/ui/conflict-dialog";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/field";
import { ItemsTable, addDays, normalizeQuantity, rowErrors, useDocumentCalculation, type Row } from "@/components/domain/document-items-editor";
import { useToast } from "@/components/ui/toast";
import { formatQuantity, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveQuotationAction } from "./actions";

export type EditorQuotation = {
  id: string;
  quotationNumber: string;
  editVersion: number;
  issueDate: string;
  validUntil: string;
  items: { description: string; quantity: string; unit: string; unitPrice: string }[];
  discount: string;
  tax: string;
  notes: string | null;
  terms: string | null;
};

const TEXT_LIMIT = 10_000;

/**
 * Create and edit a draft quotation (Q-02). Totals shown here come from the
 * same calculation module the server uses, so the preview and the saved
 * numbers cannot differ; the server still computes and stores its own.
 */
export function QuotationEditor({
  deal,
  customer,
  quotation,
  defaultTerms,
  today,
}: {
  deal: { id: string; title: string };
  customer: { id: string; companyName: string };
  quotation?: EditorQuotation;
  defaultTerms: string | null;
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const initial = useMemo(
    () => ({
      issueDate: quotation?.issueDate ?? today,
      validUntil: quotation?.validUntil ?? addDays(today, 14),
      rows: (quotation?.items ?? [{ description: "", quantity: "1", unit: "pcs", unitPrice: "" }]).map((item) => ({
        description: item.description,
        quantity: formatQuantity(item.quantity),
        unit: item.unit,
        unitPrice: item.unitPrice,
      })),
      discount: quotation?.discount ?? "0",
      tax: quotation?.tax ?? "0",
      notes: quotation?.notes ?? "",
      terms: quotation ? (quotation.terms ?? "") : (defaultTerms ?? ""),
    }),
    // The starting point is fixed for the life of this page; saved edits
    // refresh the page, which remounts this component with fresh values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [issueDate, setIssueDate] = useState(initial.issueDate);
  const [validUntil, setValidUntil] = useState(initial.validUntil);
  // Row keys are plain numbers: stable across server render and hydration
  // (they end up in element ids), and new rows continue from the counter.
  const [rows, setRows] = useState<Row[]>(() => initial.rows.map((row, index) => ({ ...row, key: index })));
  const [rowCounter, setRowCounter] = useState(initial.rows.length);
  const [discount, setDiscount] = useState(initial.discount);
  const [tax, setTax] = useState(initial.tax);
  const [notes, setNotes] = useState(initial.notes);
  const [terms, setTerms] = useState(initial.terms);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);

  const snapshot = JSON.stringify({ issueDate, validUntil, rows: rows.map((row) => ({ description: row.description, quantity: row.quantity, unit: row.unit, unitPrice: row.unitPrice })), discount, tax, notes, terms });
  const baseline = useMemo(
    () => JSON.stringify({ ...initial, rows: initial.rows }),
    [initial],
  );
  const dirty = snapshot !== baseline;

  // Unsaved work: warn on reload or close (browser dialog), and on in-app
  // links with our own dialog (UX-04).
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname + url.search === window.location.pathname + window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveTo(url.pathname + url.search);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const computed = useDocumentCalculation(rows, discount, tax);
  const discountTooHigh = computed.discountTooHigh;
  const total = computed.total;
  const totalNotPositive = submitted && !discountTooHigh && computed.calc?.ok === false && computed.calc.code === "TOTAL_NOT_POSITIVE";

  const dateError = validUntil && issueDate && validUntil < issueDate ? "Berlaku sampai tidak boleh sebelum tanggal terbit." : undefined;

  async function save() {
    setSubmitted(true);
    setFormError(null);
    setServerErrors({});
    const invalidRow = rows.findIndex((row) => Object.keys(rowErrors(row)).length > 0);
    if (invalidRow >= 0) {
      document.getElementById(`item-${rows[invalidRow]!.key}-description`)?.focus();
      return;
    }
    if (!validUntil || !issueDate || dateError) {
      document.getElementById("quotation-validUntil")?.focus();
      return;
    }
    if (discountTooHigh) {
      document.getElementById("quotation-discount")?.focus();
      return;
    }
    if (computed.calc?.ok === false) return; // the total alert explains it

    setPending(true);
    const result = await saveQuotationAction({
      dealId: deal.id,
      quotationId: quotation?.id,
      expectedEditVersion: quotation?.editVersion,
      values: {
        issueDate,
        validUntil,
        items: rows.map((row) => ({ description: row.description, quantity: normalizeQuantity(row.quantity), unit: row.unit, unitPrice: row.unitPrice })),
        discount,
        tax,
        notes,
        terms,
      },
    });
    setPending(false);

    if (result.ok) {
      if (quotation) {
        toast("Draf disimpan");
        router.refresh();
      } else {
        toast("Quotation disimpan");
        // The new draft's page is where it is sent; the editor's work is done.
        router.replace(`/quotations/${result.data.id}`);
      }
      return;
    }
    if (result.error.code === "CONFLICT") {
      setConflict(true);
      return;
    }
    setServerErrors(result.error.fieldErrors ?? {});
    setFormError(Object.keys(result.error.fieldErrors ?? {}).length > 0 ? null : result.error.message);
  }

  const heading = quotation ? quotation.quotationNumber : "Quotation baru";

  return (
    <>
      <header className="pagehead">
        <div>
          <div className="eyebrow">Quotation</div>
          <h1 style={{ fontFamily: quotation ? "ui-monospace, monospace" : undefined }}>{heading}</h1>
          <p>{dirty ? "Perubahan belum disimpan" : quotation ? "Semua perubahan tersimpan" : "Draf baru"}</p>
        </div>
        <div className="row actions">
          <ButtonLink variant="tertiary" href={`/deals/${deal.id}`}>
            ← Kembali ke deal
          </ButtonLink>
        </div>
      </header>
      <Badge>Draf</Badge>

      <div className="cols split" style={{ marginTop: 20 }}>
        <div className="stack">
          <Card>
            <h2>Info dokumen</h2>
            <dl>
              <div className="kv">
                <dt>Deal / customer</dt>
                <dd>
                  <Link href={`/deals/${deal.id}`}>{deal.title}</Link> · <Link href={`/customers/${customer.id}`}>{customer.companyName}</Link>
                </dd>
              </div>
              <div className="kv">
                <dt>Nomor</dt>
                <dd>{quotation ? quotation.quotationNumber : "Dibuat otomatis setelah disimpan"}</dd>
              </div>
            </dl>
            <div className="input-grid">
              <Field label="Tanggal terbit" htmlFor="quotation-issueDate" required error={serverErrors.issueDate}>
                <Input id="quotation-issueDate" type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} invalid={!!serverErrors.issueDate} />
              </Field>
              <Field label="Berlaku sampai" htmlFor="quotation-validUntil" required error={dateError ?? serverErrors.validUntil ?? (submitted && !validUntil ? "Berlaku sampai wajib diisi." : undefined)}>
                <Input id="quotation-validUntil" type="date" value={validUntil} min={issueDate || undefined} onChange={(event) => setValidUntil(event.target.value)} invalid={!!(dateError ?? serverErrors.validUntil)} />
              </Field>
            </div>
            <div className="chips" style={{ marginTop: 12 }} aria-label="Pilihan masa berlaku">
              {[14, 30].map((days) => (
                <button key={days} type="button" className={cn("chip", issueDate && validUntil === addDays(issueDate, days) && "active")} onClick={() => issueDate && setValidUntil(addDays(issueDate, days))}>
                  +{days} hari
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h2>Item</h2>
            <ItemsTable
              rows={rows}
              setRows={setRows}
              rowCounter={rowCounter}
              setRowCounter={setRowCounter}
              calculation={computed}
              submitted={submitted}
              serverErrors={serverErrors}
            />
          </Card>

          <Card>
            <h2>Catatan &amp; syarat</h2>
            <div className="stack">
              <Field label="Catatan" htmlFor="quotation-notes" error={notes.length > TEXT_LIMIT ? "Maksimal 10.000 karakter" : undefined} hint={`${notes.length.toLocaleString("id-ID")} / 10.000 karakter`}>
                <Textarea id="quotation-notes" value={notes} onChange={(event) => setNotes(event.target.value)} invalid={notes.length > TEXT_LIMIT} />
              </Field>
              <Field
                label="Syarat & ketentuan"
                htmlFor="quotation-terms"
                error={terms.length > TEXT_LIMIT ? "Maksimal 10.000 karakter" : undefined}
                hint={defaultTerms && terms === defaultTerms ? "Terisi dari default perusahaan · Maksimal 10.000 karakter" : `${terms.length.toLocaleString("id-ID")} / 10.000 karakter`}
              >
                <Textarea id="quotation-terms" value={terms} onChange={(event) => setTerms(event.target.value)} invalid={terms.length > TEXT_LIMIT} />
              </Field>
              {defaultTerms && terms !== defaultTerms ? (
                <div>
                  <Button variant="tertiary" onClick={() => setTerms(defaultTerms)}>
                    Pakai default perusahaan
                  </Button>
                </div>
              ) : null}
            </div>
          </Card>
        </div>

        <Card className="summary-panel">
          <h2>Ringkasan</h2>
          <div className="sumrow">
            <span>Subtotal</span>
            <strong className="money">{formatRupiah(computed.subtotal)}</strong>
          </div>
          <div className="stack">
            <Field label="Diskon (Rp)" htmlFor="quotation-discount" error={discountTooHigh ? "Diskon tidak boleh melebihi subtotal" : serverErrors.discount} hint="Diskon nominal, bukan persentase.">
              <MoneyInput id="quotation-discount" value={discount} onValueChange={setDiscount} invalid={discountTooHigh || !!serverErrors.discount} />
            </Field>
            <Field label="Pajak (Rp)" htmlFor="quotation-tax" error={serverErrors.tax}>
              <MoneyInput id="quotation-tax" value={tax} onValueChange={setTax} invalid={!!serverErrors.tax} />
            </Field>
          </div>
          <div className="line" />
          <div className="sumrow sumtotal">
            <span>Total</span>
            <span className="money">{formatRupiah(total)}</span>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            Total dihitung otomatis oleh sistem.
          </p>
          {totalNotPositive ? <Alert tone="error">Total quotation harus lebih dari Rp0.</Alert> : null}
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          <div className="stack" style={{ marginTop: 20 }}>
            <Button pending={pending} pendingText="Menyimpan..." onClick={save}>
              Simpan draf
            </Button>
            {quotation ? (
              <ButtonLink variant="secondary" href={`/api/quotations/${quotation.id}/pdf`} target="_blank" rel="noopener noreferrer">
                Pratinjau PDF
              </ButtonLink>
            ) : (
              <>
                <span title="Simpan draf terlebih dahulu.">
                  <Button variant="secondary" disabled full>
                    Pratinjau PDF
                  </Button>
                </span>
                <small className="disabled-note">Simpan draf terlebih dahulu.</small>
              </>
            )}
            <ButtonLink variant="tertiary" href={quotation ? `/quotations/${quotation.id}` : `/deals/${deal.id}`}>
              Batal
            </ButtonLink>
          </div>
        </Card>
      </div>

      <div className="mobilebar">
        <div className="mobile-total">
          <small>Total</small>
          <strong className="money">{formatRupiah(total)}</strong>
        </div>
        <Button pending={pending} pendingText="Menyimpan..." onClick={save}>
          Simpan draf
        </Button>
      </div>

      <ConflictDialog
        open={conflict}
        onClose={() => setConflict(false)}
        onReload={() => {
          setConflict(false);
          router.refresh();
        }}
      />
      <Dialog open={leaveTo !== null} onClose={() => setLeaveTo(null)} title="Tinggalkan tanpa menyimpan?">
        <p>Perubahan pada quotation belum disimpan. Jika Anda meninggalkan halaman, perubahan tersebut akan hilang.</p>
        <DialogFooter>
          <Button variant="tertiary" onClick={() => setLeaveTo(null)}>
            Tetap di halaman
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              const target = leaveTo;
              setLeaveTo(null);
              if (target) router.push(target);
            }}
          >
            Tinggalkan tanpa menyimpan
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
