"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink, IconButton } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { INVITABLE_ROLES, ROLE_LABEL, type Role } from "@/lib/labels";
import type { TeamMemberDto } from "@/server/settings/team";
import { changeMemberRoleAction, inviteMemberAction, revokeInvitationAction, setMemberActiveAction } from "../actions";
import { Ban } from "lucide-react";

// What each role will be able to do, shown before a role change is confirmed (S-02).
const ROLE_EFFECT: Record<string, string> = {
  ADMIN: "dapat mengelola semua data, anggota, dan pengaturan.",
  SALES: "dapat mengelola customer, deal, quotation, dan follow-up. Akses ke invoice dan pembayaran dicabut.",
  FINANCE: "dapat mengelola invoice dan pembayaran, serta melihat deal yang sudah menang. Akses untuk mengelola pipeline, quotation, dan follow-up dicabut.",
};

function RoleChoices({ name, value, onChange, exclude }: { name: string; value: string; onChange: (role: string) => void; exclude?: string }) {
  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="field-legend">Role</legend>
      {INVITABLE_ROLES.filter((role) => role.value !== exclude).map((role) => (
        <label key={role.value} className="choice">
          <input type="radio" name={name} value={role.value} checked={value === role.value} onChange={() => onChange(role.value)} />
          <span>
            <b>{role.label}</b>
            <small>{role.description}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function InviteButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Undang anggota</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Undang anggota">
        <InviteForm onClose={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function InviteForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("SALES");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!email.trim()) return setError("Wajib diisi.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Masukkan email yang valid.");
    setError(null);
    setPending(true);
    const result = await inviteMemberAction({ email, role });
    setPending(false);
    if (result.ok) {
      toast("Undangan dikirim");
      onClose();
      router.refresh();
      return;
    }
    const fieldMessage = result.error.fieldErrors?.email ?? result.error.fieldErrors?.role;
    if (fieldMessage) setError(fieldMessage);
    else setFormError(result.error.code === "INTERNAL_SERVER_ERROR" ? "Undangan belum dapat dikirim. Periksa koneksi lalu coba lagi." : result.error.message);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="stack">
        <Field label="Email" htmlFor={`${id}-email`} required error={error ?? undefined}>
          <Input id={`${id}-email`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" invalid={!!error} autoFocus />
        </Field>
        <RoleChoices name={`${id}-role`} value={role} onChange={setRole} />
        {formError ? <Alert tone="error">{formError}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button type="submit" pending={pending}>
          Kirim undangan
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RevokeInvitationButton({ invitationId, email }: { invitationId: string; email: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setPending(true);
    setError(null);
    const result = await revokeInvitationAction({ invitationId });
    setPending(false);
    if (!result.ok) return setError(result.error.message);
    toast("Undangan dicabut");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Cabut
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Cabut undangan untuk ${email}?`} description="Link undangan tidak dapat dipakai setelah dicabut.">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <DialogFooter>
          <Button variant="tertiary" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button variant="destructive" pending={pending} onClick={revoke}>
            Cabut undangan
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

type Mode = "role" | "deactivate";

export function MemberActions({ member, viewerRole, soleActiveOwner }: { member: TeamMemberDto; viewerRole: Role; soleActiveOwner: boolean }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [open, setOpen] = useState(false);
  const start = (next: Mode) => {
    setMode(next);
    setOpen(true);
  };

  // Why the row is locked, if it is. The server enforces every one of these;
  // this only explains the disabled button.
  let lockReason: string | undefined;
  if (member.role === "OWNER" && member.isSelf && soleActiveOwner) lockReason = "Organisasi harus punya minimal satu Owner aktif.";
  else if (member.isSelf) lockReason = "Anda tidak dapat mengubah akses Anda sendiri.";
  else if (member.role === "OWNER" && viewerRole !== "OWNER") lockReason = "Hanya Owner yang dapat mengelola Owner.";

  if (lockReason) {
    return (
      <span title={lockReason}>
        <IconButton label={lockReason} disabled>
          <Ban aria-hidden="true" />
        </IconButton>
      </span>
    );
  }

  if (!member.active) {
    return <ReactivateButton member={member} />;
  }

  return (
    <>
      <Menu label="Menu tindakan">
        {member.role !== "OWNER" ? <MenuItem onSelect={() => start("role")}>Ubah role</MenuItem> : null}
        <MenuItem danger onSelect={() => start("deactivate")}>
          Nonaktifkan
        </MenuItem>
      </Menu>
      {mode === "role" ? <RoleDialog open={open} onClose={() => setOpen(false)} member={member} /> : null}
      {mode === "deactivate" ? <DeactivateDialog open={open} onClose={() => setOpen(false)} member={member} /> : null}
    </>
  );
}

function ReactivateButton({ member }: { member: TeamMemberDto }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  async function reactivate() {
    setPending(true);
    const result = await setMemberActiveAction({ memberId: member.memberId, active: true });
    setPending(false);
    if (!result.ok) return toast(result.error.message, "error");
    toast("Anggota diperbarui");
    router.refresh();
  }
  return (
    <Button variant="secondary" pending={pending} onClick={reactivate}>
      Aktifkan kembali
    </Button>
  );
}

function RoleDialog({ open, onClose, member }: { open: boolean; onClose: () => void; member: TeamMemberDto }) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const [role, setRole] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = member.name.split(" ")[0];

  async function submit() {
    setPending(true);
    setError(null);
    const result = await changeMemberRoleAction({ memberId: member.memberId, role });
    setPending(false);
    if (!result.ok) return setError(result.error.message);
    toast("Anggota diperbarui");
    onClose();
    router.refresh();
  }

  return (
    <Dialog open={open} onClose={onClose} title={role ? `Ubah role ${member.name} menjadi ${ROLE_LABEL[role as Role]}?` : `Ubah role ${member.name}`}>
      <div className="stack">
        <RoleChoices name={`${id}-role`} value={role} onChange={setRole} exclude={member.role} />
        {role ? <p>{first} {ROLE_EFFECT[role]}</p> : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button disabled={!role} pending={pending} onClick={submit}>
          Ubah role
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function DeactivateDialog({ open, onClose, member }: { open: boolean; onClose: () => void; member: TeamMemberDto }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = member.name.split(" ")[0];

  async function submit() {
    setPending(true);
    setError(null);
    const result = await setMemberActiveAction({ memberId: member.memberId, active: false });
    setPending(false);
    if (!result.ok) return setError(result.error.message);
    toast("Anggota diperbarui");
    onClose();
    router.refresh();
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Nonaktifkan ${member.name}?`} description="Akses langsung dicabut. Histori dan data yang dibuat tetap tersimpan.">
      <div className="stack">
        {member.activeDeals > 0 ? (
          <Alert tone="warning">
            {first} masih menangani {member.activeDeals} deal aktif. Pindahkan penanggung jawabnya setelah ini.
          </Alert>
        ) : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
      <DialogFooter>
        {member.activeDeals > 0 ? (
          <ButtonLink variant="tertiary" href={`/deals?sales=${member.userId}`}>
            Lihat deal
          </ButtonLink>
        ) : null}
        <Button variant="tertiary" onClick={onClose}>
          Batal
        </Button>
        <Button variant="destructive" pending={pending} onClick={submit}>
          Nonaktifkan
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
