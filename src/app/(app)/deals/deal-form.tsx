"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CustomerFormDialog } from "@/app/(app)/customers/customer-form-dialog";
import { CustomerPicker, customerLabel } from "@/components/domain/customer-picker";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConflictDialog } from "@/components/ui/conflict-dialog";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatRupiah } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/labels";
import type { CustomerOptionDto } from "@/server/customers/customers";
import type { AssignableMemberDto } from "@/server/deals/deal-views";
import { saveDealAction, type DealFormValues } from "./actions";

export type EditableDeal = {
  id: string;
  version: number;
  title: string;
  estimatedValue: string;
  assignedToId: string;
  assignedToName: string;
  expectedCloseDate: string | null;
  description: string;
  notes: string | null;
  hasQuotation: boolean;
  customer: CustomerOptionDto;
};

export type DealActor = { userId: string; name: string; role: Role };

type FieldName = "customerId" | "title" | "estimatedValue" | "assignedToId" | "expectedCloseDate" | "description" | "notes";
type Errors = Partial<Record<FieldName, string>>;

const LIMITS = { title: 200, description: 5000, notes: 5000 } as const;
const MAX_VALUE = 1_000_000_000_000_000n;

const count = (value: string, limit: number) => `${value.length.toLocaleString("id-ID")} / ${limit.toLocaleString("id-ID")} karakter`;

export function DealFormDialog({
  open,
  onClose,
  ...props
}: { open: boolean; onClose: () => void } & Omit<DealFormProps, "onClose">) {
  return (
    <Dialog open={open} onClose={onClose} title={props.deal ? "Edit deal" : "Buat deal"} size="large">
      <DealForm {...props} onClose={onClose} />
    </Dialog>
  );
}

export type DealFormProps = {
  deal?: EditableDeal;
  members: AssignableMemberDto[];
  actor: DealActor;
  /** A customer to start with, e.g. when arriving from a customer page. */
  initialCustomer?: CustomerOptionDto | null;
  /** Cancel, and (in a dialog) what happens after a successful save. */
  onClose: () => void;
  /** False on the full-page form, where "close" means navigating back and must not race the redirect to the new deal. */
  closeOnCreate?: boolean;
};

export function DealForm({ deal, members, actor, initialCustomer = null, onClose, closeOnCreate = true }: DealFormProps) {
  const router = useRouter();
  const toast = useToast();
  const privileged = actor.role === "OWNER" || actor.role === "ADMIN";
  // §6.2: only Owner/Admin choose who a deal belongs to. Sales create deals
  // for themselves and cannot hand an existing deal to someone else.
  const assigneeLocked = !privileged;

  const [customer, setCustomer] = useState<CustomerOptionDto | null>(deal?.customer ?? initialCustomer);
  const [title, setTitle] = useState(deal?.title ?? "");
  const [value, setValue] = useState(deal ? deal.estimatedValue : "");
  const [assignedToId, setAssignedToId] = useState(deal?.assignedToId ?? (privileged ? "" : actor.userId));
  const [closeDate, setCloseDate] = useState(deal?.expectedCloseDate ?? "");
  const [description, setDescription] = useState(deal?.description ?? "");
  const [notes, setNotes] = useState(deal?.notes ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);

  const clear = (field: FieldName) => errors[field] && setErrors((current) => ({ ...current, [field]: undefined }));

  // The current assignee may no longer be assignable (deactivated, role
  // changed); keep them selectable so the form can still show the truth.
  const options = members.some((member) => member.userId === deal?.assignedToId)
    ? members
    : deal
      ? [{ userId: deal.assignedToId, name: deal.assignedToName, role: "SALES" }, ...members]
      : members;
  const assigneeName = deal?.assignedToName ?? actor.name;

  function validate(): Errors {
    const found: Errors = {};
    if (!customer) found.customerId = "Pilih customer.";
    const trimmed = title.trim();
    if (!trimmed || trimmed.length > LIMITS.title) found.title = "Judul deal wajib diisi. Maksimal 200 karakter.";
    if (!value) found.estimatedValue = "Nilai estimasi wajib diisi.";
    else if (BigInt(value) > MAX_VALUE) found.estimatedValue = `Nilai terlalu besar. Maksimal ${formatRupiah(MAX_VALUE)}.`;
    if (!assigneeLocked && !assignedToId) found.assignedToId = "Pilih assigned sales.";
    if (description.trim().length > LIMITS.description) found.description = "Maksimal 5.000 karakter";
    if (notes.trim().length > LIMITS.notes) found.notes = "Maksimal 5.000 karakter";
    return found;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(`deal-${first}`)?.focus();
      return;
    }

    const values: DealFormValues = {
      customerId: customer!.id,
      title,
      estimatedValue: value,
      assignedToId: assignedToId || undefined,
      expectedCloseDate: closeDate,
      description,
      notes,
    };
    setPending(true);
    const result = await saveDealAction({ dealId: deal?.id, expectedVersion: deal?.version, values });
    setPending(false);

    if (result.ok) {
      toast("Deal disimpan");
      if (deal) {
        onClose();
        router.refresh();
      } else {
        if (closeOnCreate) onClose();
        router.push(`/deals/${result.data.id}`);
      }
      return;
    }
    if (result.error.code === "CONFLICT") {
      setConflict(true);
      return;
    }
    const fieldErrors = (result.error.fieldErrors ?? {}) as Errors;
    setErrors(fieldErrors);
    setFormError(Object.keys(fieldErrors).length > 0 ? null : result.error.message || "Perubahan belum dapat disimpan. Periksa koneksi lalu coba lagi.");
  }

  return (
    <>
      <form onSubmit={onSubmit} noValidate>
        <div className="stack">
          {deal?.hasQuotation ? (
            <Field label="Customer" htmlFor="deal-customerId" required hint="Customer terkunci karena deal sudah memiliki quotation.">
              <Input id="deal-customerId" value={customerLabel(deal.customer)} readOnly />
            </Field>
          ) : (
            <>
              <CustomerPicker
                id="deal-customerId"
                label="Customer"
                required
                hint="Cari nama perusahaan atau kontak."
                error={errors.customerId}
                value={customer}
                onChange={(next) => {
                  setCustomer(next);
                  clear("customerId");
                }}
              />
              <div>
                <Button variant="tertiary" onClick={() => setAddingCustomer(true)}>
                  + Tambah customer baru
                </Button>
                {addingCustomer ? <small style={{ marginLeft: 8 }}>Form deal tetap tersimpan saat customer baru ditambahkan.</small> : null}
              </div>
            </>
          )}
          <Field label="Judul deal" htmlFor="deal-title" required error={errors.title} hint="1–200 karakter">
            <Input
              id="deal-title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                clear("title");
              }}
              autoComplete="off"
              invalid={!!errors.title}
            />
          </Field>
          <Field label="Nilai estimasi (Rp)" htmlFor="deal-estimatedValue" required error={errors.estimatedValue} hint="Nilai harus lebih dari Rp0 untuk menandai menang.">
            <MoneyInput
              id="deal-estimatedValue"
              value={value}
              onValueChange={(digits) => {
                setValue(digits);
                clear("estimatedValue");
              }}
              invalid={!!errors.estimatedValue}
            />
          </Field>
          {assigneeLocked ? (
            <Field label="Assigned sales" htmlFor="deal-assignedToId" required>
              <Input id="deal-assignedToId" value={deal ? assigneeName : `Anda · ${actor.name}`} readOnly />
            </Field>
          ) : (
            <Field label="Assigned sales" htmlFor="deal-assignedToId" required error={errors.assignedToId}>
              <Select
                id="deal-assignedToId"
                value={assignedToId}
                invalid={!!errors.assignedToId}
                onChange={(event) => {
                  setAssignedToId(event.target.value);
                  clear("assignedToId");
                }}
              >
                <option value="">Pilih assigned sales</option>
                {options.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name} · {ROLE_LABEL[member.role as Role] ?? member.role}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Target closing" htmlFor="deal-expectedCloseDate" error={errors.expectedCloseDate}>
            <Input
              id="deal-expectedCloseDate"
              type="date"
              value={closeDate}
              onChange={(event) => {
                setCloseDate(event.target.value);
                clear("expectedCloseDate");
              }}
              invalid={!!errors.expectedCloseDate}
            />
          </Field>
          <Field label="Deskripsi" htmlFor="deal-description" error={errors.description} hint={count(description, LIMITS.description)}>
            <Textarea
              id="deal-description"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                clear("description");
              }}
              invalid={!!errors.description}
            />
          </Field>
          <Field label="Catatan" htmlFor="deal-notes" error={errors.notes} hint={count(notes, LIMITS.notes)}>
            <Textarea
              id="deal-notes"
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                clear("notes");
              }}
              invalid={!!errors.notes}
            />
          </Field>
          {deal ? null : <Alert tone="info">Deal baru selalu dimulai pada tahap Baru.</Alert>}
          {formError ? <Alert tone="error">{formError}</Alert> : null}
        </div>
        <DialogFooter>
          <Button variant="tertiary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" pending={pending} pendingText="Menyimpan...">
            Simpan deal
          </Button>
        </DialogFooter>
      </form>

      <CustomerFormDialog
        open={addingCustomer}
        onClose={() => setAddingCustomer(false)}
        onCreated={(created) => {
          setCustomer(created);
          setErrors((current) => ({ ...current, customerId: undefined }));
          setAddingCustomer(false);
        }}
      />
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

/** Opens the create form from a button; used on the pipeline, the deal list and customer pages. */
export function NewDealButton({
  members,
  actor,
  initialCustomer,
  variant = "primary",
  children = "Buat deal",
}: Omit<DealFormProps, "onClose" | "deal" | "closeOnCreate"> & { variant?: "primary" | "secondary" | "tertiary"; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <DealFormDialog open={open} onClose={() => setOpen(false)} members={members} actor={actor} initialCustomer={initialCustomer} />
    </>
  );
}
