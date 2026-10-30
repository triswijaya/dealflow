"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConflictDialog } from "@/components/ui/conflict-dialog";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatPhone } from "@/lib/format";
import { normalizePhone } from "@/server/customers/phone";
import type { CustomerOptionDto } from "@/server/customers/customers";
import { findSimilarCustomersAction, saveCustomerAction, type SimilarCustomer } from "./actions";

export type EditableCustomer = {
  id: string;
  version: number;
  companyName: string;
  taxId: string | null;
  contactPerson: string;
  phoneRaw: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

type Values = {
  companyName: string;
  taxId: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

type FieldName = keyof Values;
type Errors = Partial<Record<FieldName, string>>;

const LIMITS = { companyName: 200, contactPerson: 150, address: 2000, notes: 5000 } as const;
const PHONE_ERROR = "Nomor tidak valid. Gunakan format 08xx atau kode negara (+62).";

// Mirrors the server schema (CUS-01) so the user hears about a mistake
// before the round trip; the server still has the final say.
function validate(values: Values): Errors {
  const errors: Errors = {};
  const company = values.companyName.trim();
  if (!company || company.length > LIMITS.companyName) errors.companyName = "Nama perusahaan / customer wajib diisi. Maksimal 200 karakter.";
  const contact = values.contactPerson.trim();
  if (!contact || contact.length > LIMITS.contactPerson) errors.contactPerson = "Nama kontak wajib diisi. Maksimal 150 karakter.";
  const email = values.email.trim();
  if (!values.phone.trim() && !email) errors.phone = "Isi telepon / WhatsApp atau email.";
  else if (values.phone.trim() && !normalizePhone(values.phone)) errors.phone = PHONE_ERROR;
  const taxId = values.taxId.replace(/[.\-\s]/g, "");
  if (taxId && !/^[0-9]{15,16}$/.test(taxId)) errors.taxId = "NPWP harus 15 atau 16 digit.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Masukkan email yang valid.";
  if (values.address.trim().length > LIMITS.address) errors.address = "Maksimal 2.000 karakter";
  if (values.notes.trim().length > LIMITS.notes) errors.notes = "Maksimal 5.000 karakter";
  return errors;
}

const count = (value: string, limit: number) =>
  `${value.length.toLocaleString("id-ID")} / ${limit.toLocaleString("id-ID")} karakter`;

export function CustomerFormDialog({
  open,
  onClose,
  customer,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  customer?: EditableCustomer;
  /** When set, a newly created customer is handed back instead of opening its page (the deal form uses this). */
  onCreated?: (customer: CustomerOptionDto) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={customer ? "Edit customer" : "Tambah customer"} size="drawer">
      <CustomerForm customer={customer} onClose={onClose} onCreated={onCreated} />
    </Dialog>
  );
}

function CustomerForm({
  customer,
  onClose,
  onCreated,
}: {
  customer?: EditableCustomer;
  onClose: () => void;
  onCreated?: (customer: CustomerOptionDto) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<Values>({
    companyName: customer?.companyName ?? "",
    taxId: customer?.taxId ?? "",
    contactPerson: customer?.contactPerson ?? "",
    phone: customer?.phoneRaw ?? "",
    email: customer?.email ?? "",
    address: customer?.address ?? "",
    notes: customer?.notes ?? "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [similar, setSimilar] = useState<SimilarCustomer[]>([]);
  const lookup = useRef(0);

  function set(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  // CUS-02: warn about a similar name or number, never block. Debounced so
  // typing doesn't fire a request per keystroke, and a stale answer is dropped.
  const companyName = values.companyName.trim();
  const phone = values.phone.trim();
  const hasLookupInput = companyName.length > 0 || normalizePhone(phone) !== null;
  useEffect(() => {
    if (!hasLookupInput) return;
    const ticket = ++lookup.current;
    const timer = setTimeout(async () => {
      const result = await findSimilarCustomersAction({
        companyName,
        phone: normalizePhone(phone) ? phone : undefined,
        excludeCustomerId: customer?.id,
      });
      if (ticket === lookup.current) setSimilar(result.ok ? result.data : []);
    }, 500);
    return () => clearTimeout(timer);
  }, [hasLookupInput, companyName, phone, customer?.id]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      document.getElementById(`customer-${Object.keys(found)[0]}`)?.focus();
      return;
    }

    setPending(true);
    const result = await saveCustomerAction({
      customerId: customer?.id,
      expectedVersion: customer?.version,
      values,
    });
    setPending(false);

    if (result.ok) {
      toast("Customer disimpan");
      onClose();
      if (customer) router.refresh();
      else if (onCreated) onCreated(result.data);
      else router.push(`/customers/${result.data.id}`);
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

  const normalized = normalizePhone(values.phone);

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="stack">
        <div className="input-grid">
          <Field label="Nama perusahaan / customer" htmlFor="customer-companyName" required error={errors.companyName} hint="1–200 karakter">
            <Input
              id="customer-companyName"
              value={values.companyName}
              onChange={(event) => set("companyName", event.target.value)}
              autoComplete="organization"
              invalid={!!errors.companyName}
            />
          </Field>
          <Field label="Nama kontak" htmlFor="customer-contactPerson" required error={errors.contactPerson} hint="1–150 karakter">
            <Input
              id="customer-contactPerson"
              value={values.contactPerson}
              onChange={(event) => set("contactPerson", event.target.value)}
              autoComplete="off"
              invalid={!!errors.contactPerson}
            />
          </Field>
          <Field
            label="Telepon / WhatsApp"
            htmlFor="customer-phone"
            error={errors.phone}
            hint={normalized ? `Disimpan sebagai ${formatPhone(normalized)}` : "Contoh: 0812 3456 789 atau +62 812 3456 789"}
          >
            <Input
              id="customer-phone"
              type="tel"
              value={values.phone}
              onChange={(event) => set("phone", event.target.value)}
              autoComplete="off"
              invalid={!!errors.phone}
            />
          </Field>
          <Field label="NPWP" htmlFor="customer-taxId" error={errors.taxId} hint="Opsional. 15 atau 16 digit.">
            <Input
              id="customer-taxId"
              value={values.taxId}
              onChange={(event) => set("taxId", event.target.value)}
              inputMode="numeric"
              autoComplete="off"
              invalid={!!errors.taxId}
            />
          </Field>
          <Field label="Email" htmlFor="customer-email" error={errors.email}>
            <Input
              id="customer-email"
              type="email"
              value={values.email}
              onChange={(event) => set("email", event.target.value)}
              autoComplete="off"
              invalid={!!errors.email}
            />
          </Field>
        </div>
        <Field label="Alamat" htmlFor="customer-address" error={errors.address} hint={count(values.address, LIMITS.address)}>
          <Textarea
            id="customer-address"
            value={values.address}
            onChange={(event) => set("address", event.target.value)}
            invalid={!!errors.address}
          />
        </Field>
        <Field label="Catatan" htmlFor="customer-notes" error={errors.notes} hint={count(values.notes, LIMITS.notes)}>
          <Textarea
            id="customer-notes"
            value={values.notes}
            onChange={(event) => set("notes", event.target.value)}
            invalid={!!errors.notes}
          />
        </Field>
        {hasLookupInput && similar.length > 0 ? (
          <Alert tone="warning">
            Customer dengan nama/nomor serupa sudah ada:{" "}
            {similar.map((match, index) => (
              <span key={match.id}>
                {index > 0 ? ", " : ""}
                <b>{match.companyName}</b> ({match.contactPerson}){" "}
                <Link href={`/customers/${match.id}`} target="_blank" rel="noopener noreferrer">
                  Lihat
                </Link>
              </span>
            ))}
            . Anda tetap bisa menyimpan.
          </Alert>
        ) : null}
        {formError ? <Alert tone="error">{formError}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button type="submit" pending={pending} pendingText="Menyimpan...">
          Simpan customer
        </Button>
      </DialogFooter>

      <ConflictDialog
        open={conflict}
        onClose={() => setConflict(false)}
        onReload={() => {
          setConflict(false);
          onClose();
          router.refresh();
        }}
      />
    </form>
  );
}
