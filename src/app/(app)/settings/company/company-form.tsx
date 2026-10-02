"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConflictDialog } from "@/components/ui/conflict-dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { zoneLabel } from "@/lib/format";
import type { CompanySettingsDto } from "@/server/settings/company";
import { saveCompanySettingsAction } from "../actions";

type Values = { name: string; contactEmail: string; contactPhone: string; address: string; defaultQuotationTerms: string };
type Errors = Partial<Record<keyof Values, string>>;

const LIMITS = { address: 500, defaultQuotationTerms: 2000 } as const;

function toValues(settings: CompanySettingsDto): Values {
  return {
    name: settings.name,
    contactEmail: settings.contactEmail ?? "",
    contactPhone: settings.contactPhone ?? "",
    address: settings.address ?? "",
    defaultQuotationTerms: settings.defaultQuotationTerms ?? "",
  };
}

function validate(values: Values): Errors {
  const errors: Errors = {};
  if (values.name.trim().length < 2) errors.name = "Nama perusahaan wajib diisi (minimal 2 karakter).";
  const email = values.contactEmail.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.contactEmail = "Masukkan email perusahaan yang valid.";
  const phone = values.contactPhone.trim();
  if (phone && !/^[+()\d][\d\s().-]{5,}$/.test(phone)) errors.contactPhone = "Nomor telepon tidak valid.";
  if (values.address.trim().length > LIMITS.address) errors.address = "Maksimal 500 karakter.";
  if (values.defaultQuotationTerms.trim().length > LIMITS.defaultQuotationTerms) errors.defaultQuotationTerms = "Maksimal 2.000 karakter.";
  return errors;
}

export function CompanyForm({ settings }: { settings: CompanySettingsDto }) {
  const router = useRouter();
  const toast = useToast();
  const initial = toValues(settings);
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);

  const dirty = (Object.keys(initial) as (keyof Values)[]).some((key) => values[key] !== initial[key]);

  function set(field: keyof Values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    setFormError(null);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(`company-${first}`)?.focus();
      return;
    }
    setPending(true);
    const result = await saveCompanySettingsAction({ expectedUpdatedAt: settings.updatedAt, values });
    setPending(false);
    if (result.ok) {
      toast("Profil perusahaan diperbarui");
      router.refresh();
      return;
    }
    if (result.error.code === "CONFLICT") {
      setConflict(true);
      return;
    }
    const fieldErrors = (result.error.fieldErrors ?? {}) as Errors;
    setErrors(fieldErrors);
    setFormError(Object.keys(fieldErrors).length > 0 ? null : "Perubahan belum dapat disimpan. Periksa koneksi lalu coba lagi.");
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <div className="stack">
          <div className="input-grid">
            <Field label="Nama perusahaan" htmlFor="company-name" required error={errors.name}>
              <Input id="company-name" value={values.name} onChange={(event) => set("name", event.target.value)} autoComplete="organization" invalid={!!errors.name} />
            </Field>
            <Field label="Email perusahaan" htmlFor="company-contactEmail" error={errors.contactEmail}>
              <Input id="company-contactEmail" type="email" value={values.contactEmail} onChange={(event) => set("contactEmail", event.target.value)} autoComplete="off" invalid={!!errors.contactEmail} />
            </Field>
            <Field label="Telepon perusahaan" htmlFor="company-contactPhone" error={errors.contactPhone}>
              <Input id="company-contactPhone" type="tel" value={values.contactPhone} onChange={(event) => set("contactPhone", event.target.value)} autoComplete="off" invalid={!!errors.contactPhone} />
            </Field>
            <Field label="Mata uang" htmlFor="company-currency" hint="Satu-satunya mata uang yang didukung.">
              <Input id="company-currency" value="IDR - Rupiah" readOnly />
            </Field>
            <Field label="Zona waktu" htmlFor="company-timezone">
              <Input id="company-timezone" value={`${settings.timezone} (${zoneLabel(settings.timezone)})`} readOnly />
            </Field>
          </div>
          <Field label="Alamat" htmlFor="company-address" error={errors.address}>
            <Textarea id="company-address" value={values.address} onChange={(event) => set("address", event.target.value)} invalid={!!errors.address} />
          </Field>
          <Field label="Syarat default quotation" htmlFor="company-defaultQuotationTerms" error={errors.defaultQuotationTerms} hint="Dipakai sebagai isi awal pada quotation baru.">
            <Textarea
              id="company-defaultQuotationTerms"
              value={values.defaultQuotationTerms}
              onChange={(event) => set("defaultQuotationTerms", event.target.value)}
              invalid={!!errors.defaultQuotationTerms}
            />
          </Field>
          <Alert tone="info">Perubahan tidak mengubah quotation terkirim atau invoice yang sudah terbit.</Alert>
          {formError ? <Alert tone="error">{formError}</Alert> : null}
        </div>
        <div className="footer sticky-footer">
          {dirty ? (
            <Button
              variant="tertiary"
              onClick={() => {
                setValues(initial);
                setErrors({});
                setFormError(null);
              }}
            >
              Batalkan perubahan
            </Button>
          ) : null}
          <Button type="submit" pending={pending} pendingText="Menyimpan..." disabled={!dirty}>
            Simpan perubahan
          </Button>
        </div>
      </Card>
      <ConflictDialog
        open={conflict}
        onClose={() => setConflict(false)}
        onReload={() => {
          setConflict(false);
          router.refresh();
        }}
      />
    </form>
  );
}
