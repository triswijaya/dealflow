"use client";

import { MessageCircle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, IconLink } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Avatar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatPhone } from "@/lib/format";
import type { ContactDto } from "@/server/customers/contacts";
import { deleteContactAction, saveContactAction, setPrimaryContactAction } from "./actions";

const ROLE_SUGGESTIONS = ["PIC", "Keuangan", "Direktur", "Purchasing", "Teknis"];

/**
 * CUS-04: the people at a customer. The primary contact is the default PIC
 * for new deals and cannot be deleted; promote another one first.
 */
export function ContactsCard({ customerId, contacts, canWrite }: { customerId: string; contacts: ContactDto[]; canWrite: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<ContactDto | "new" | null>(null);

  async function run(promise: Promise<{ ok: boolean; error?: { message: string } }>, done: string) {
    const result = await promise;
    if (!result.ok) {
      toast(result.error?.message ?? "Belum berhasil. Coba lagi.", "error");
      return;
    }
    toast(done, "success");
    router.refresh();
  }

  return (
    <section className="region">
      <div className="card-head">
        <h2>
          Kontak <span className="muted">{contacts.length}</span>
        </h2>
        {canWrite ? (
          <Button variant="tertiary" onClick={() => setEditing("new")}>
            <Plus aria-hidden="true" />
            Tambah
          </Button>
        ) : null}
      </div>
      {contacts.length === 0 ? (
        <p className="quiet-empty">Belum ada kontak.</p>
      ) : (
        <ul className="contact-list">
          {contacts.map((contact) => (
            <li key={contact.id}>
              <Avatar name={contact.name} />
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <b>{contact.name}</b>
                  {contact.role ? <Badge tone="outline">{contact.role}</Badge> : null}
                  {contact.isPrimary ? <Badge tone="info">Utama</Badge> : null}
                </div>
                <small>{[contact.phoneNormalized ? formatPhone(contact.phoneNormalized) : null, contact.email].filter(Boolean).join(" · ") || "Belum ada telepon atau email"}</small>
              </div>
              <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                {contact.phoneNormalized ? (
                  <IconLink label={`WhatsApp ${contact.name}`} href={`https://wa.me/${contact.phoneNormalized}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden="true" />
                  </IconLink>
                ) : null}
                {canWrite ? (
                  <Menu label={`Aksi untuk ${contact.name}`}>
                    <MenuItem onSelect={() => setEditing(contact)}>Ubah</MenuItem>
                    {contact.isPrimary ? null : (
                      <MenuItem onSelect={() => run(setPrimaryContactAction({ customerId, contactId: contact.id, expectedVersion: contact.version }), `${contact.name} jadi kontak utama`)}>
                        Jadikan kontak utama
                      </MenuItem>
                    )}
                    {contact.isPrimary ? null : (
                      <MenuItem danger onSelect={() => run(deleteContactAction({ customerId, contactId: contact.id, expectedVersion: contact.version }), "Kontak dihapus")}>
                        Hapus
                      </MenuItem>
                    )}
                  </Menu>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Tambah kontak" : "Ubah kontak"}>
        {editing !== null ? <ContactForm key={editing === "new" ? "new" : editing.id} customerId={customerId} contact={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      </Dialog>
    </section>
  );
}

function ContactForm({ customerId, contact, onClose }: { customerId: string; contact: ContactDto | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(contact?.name ?? "");
  const [role, setRole] = useState(contact?.role ?? "");
  const [phone, setPhone] = useState(contact?.phoneRaw ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setErrors({ name: "Nama wajib diisi." });
      document.getElementById("contact-name")?.focus();
      return;
    }
    setPending(true);
    setFormError(null);
    const result = await saveContactAction({ customerId, contactId: contact?.id, expectedVersion: contact?.version, values: { name, role, phone, email } });
    setPending(false);
    if (!result.ok) {
      const fieldErrors = (result.error.fieldErrors ?? {}) as Record<string, string>;
      setErrors(fieldErrors);
      if (!Object.keys(fieldErrors).length) setFormError(result.error.message);
      return;
    }
    toast(contact ? "Kontak diperbarui" : "Kontak ditambahkan", "success");
    onClose();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="stack">
        <Field label="Nama" htmlFor="contact-name" required error={errors.name}>
          <Input id="contact-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={150} invalid={!!errors.name} autoComplete="off" />
        </Field>
        <Field label="Peran" htmlFor="contact-role" error={errors.role} hint="mis. PIC, Keuangan, Direktur">
          <Input id="contact-role" list="contact-roles" value={role} onChange={(event) => setRole(event.target.value)} maxLength={100} />
          <datalist id="contact-roles">
            {ROLE_SUGGESTIONS.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </Field>
        <div className="input-grid">
          <Field label="Telepon / WhatsApp" htmlFor="contact-phone" error={errors.phone}>
            <Input id="contact-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={50} placeholder="0812 3456 7890" />
          </Field>
          <Field label="Email" htmlFor="contact-email" error={errors.email}>
            <Input id="contact-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
        </div>
        {formError ? <Alert tone="error">{formError}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button type="submit" pending={pending} pendingText="Menyimpan...">
          Simpan kontak
        </Button>
      </DialogFooter>
    </form>
  );
}
