"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";
import { acceptInvitationAction, acceptInvitationAsNewUserAction } from "./actions";

const MIN_PASSWORD = 12;

type Mode = "new-user" | "join" | "sign-in" | "wrong-account";

export function AcceptForm({
  mode,
  invitationId,
  email,
  roleLabel,
  organizationName,
  inviterName,
  signedInAs,
}: {
  mode: Mode;
  invitationId: string;
  email: string;
  roleLabel: string;
  organizationName: string;
  inviterName: string;
  signedInAs?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const title = mode === "new-user" ? "Bergabung dengan tim" : "Undangan untuk Anda";
  const subtitle = {
    "new-user": "Undangan ke ruang kerja perusahaan.",
    join: "Email akun sesuai dengan undangan.",
    "sign-in": "Masuk dengan email yang menerima undangan.",
    "wrong-account": `Anda masuk sebagai ${signedInAs}, sedangkan undangan ini untuk email lain.`,
  }[mode];

  function done() {
    router.replace("/dashboard");
    router.refresh();
  }

  async function join() {
    setPending(true);
    setError(null);
    const result = await acceptInvitationAction({ invitationId });
    setPending(false);
    if (!result.ok) return setError(result.error.message);
    done();
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const found = {
      name: name.trim() ? undefined : "Wajib diisi.",
      password: password.length < MIN_PASSWORD ? `Password minimal ${MIN_PASSWORD} karakter.` : undefined,
    };
    setErrors(found);
    setError(null);
    if (found.name || found.password) return;
    setPending(true);
    const result = await acceptInvitationAsNewUserAction({ invitationId, name, password });
    setPending(false);
    if (!result.ok) return setError(result.error.message);
    done();
  }

  async function switchAccount() {
    await authClient.signOut();
    router.refresh();
  }

  return (
    <>
      <h1>{title}</h1>
      <p className="muted">{subtitle}</p>
      <form className="stack" onSubmit={onCreate} noValidate>
        <Alert tone="info">
          <span className="auth-summary">
            <span>
              <b>{inviterName}</b> mengundang Anda bergabung ke <b>{organizationName}</b> sebagai <b>{roleLabel}</b>.
            </span>
          </span>
        </Alert>
        <Field label="Email" htmlFor="invite-email">
          <Input id="invite-email" value={email} readOnly />
        </Field>
        <Field label="Role" htmlFor="invite-role">
          <Input id="invite-role" value={roleLabel} readOnly />
        </Field>

        {mode === "new-user" ? (
          <>
            <Field label="Nama lengkap" htmlFor="invite-name" required error={errors.name}>
              <Input id="invite-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} invalid={!!errors.name} autoFocus />
            </Field>
            <Field label="Password" htmlFor="invite-password" required error={errors.password} hint={`Minimal ${MIN_PASSWORD} karakter`}>
              <PasswordInput id="invite-password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} invalid={!!errors.password} />
            </Field>
          </>
        ) : null}

        {error ? <Alert tone="error">{error}</Alert> : null}

        {mode === "new-user" ? (
          <Button type="submit" pending={pending} pendingText="Memproses...">
            Buat akun &amp; bergabung
          </Button>
        ) : null}
        {mode === "join" ? (
          <Button pending={pending} pendingText="Memproses..." onClick={join}>
            Gabung ke {organizationName}
          </Button>
        ) : null}
        {mode === "sign-in" ? (
          <Link className="btn primary" href={`/login?next=${encodeURIComponent(`/accept-invitation/${invitationId}`)}`}>
            Masuk untuk bergabung
          </Link>
        ) : null}
        {mode === "wrong-account" ? (
          <Button variant="secondary" onClick={switchAccount}>
            Keluar dan ganti akun
          </Button>
        ) : null}
      </form>
    </>
  );
}
