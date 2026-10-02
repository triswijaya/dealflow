"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, PasswordInput } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";

const MIN_PASSWORD = 12;

type Outcome = "form" | "done" | "invalid";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("form");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = {
      password: password.length < MIN_PASSWORD ? `Password minimal ${MIN_PASSWORD} karakter.` : undefined,
      confirm: password !== confirm ? "Ulangi password harus sama dengan password baru." : undefined,
    };
    setErrors(found);
    setError(null);
    if (found.password || found.confirm) return;

    setPending(true);
    const { error: failure } = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);
    if (!failure) return setOutcome("done");
    if (failure.status === 429) return setError("Terlalu banyak percobaan. Coba lagi dalam beberapa menit.");
    // A used, expired or tampered token all land here.
    if (failure.status === 400) return setOutcome("invalid");
    setError("Password belum dapat disimpan. Periksa koneksi lalu coba lagi.");
  }

  if (outcome === "done") {
    return (
      <div className="stack">
        <h1>Password berhasil diubah.</h1>
        <p className="muted">Demi keamanan, semua sesi lama sudah dikeluarkan.</p>
        <Link className="btn primary" href="/login?reason=password-reset">
          Masuk
        </Link>
      </div>
    );
  }
  if (outcome === "invalid") {
    return (
      <div className="stack">
        <h1>Link reset tidak valid atau sudah kedaluwarsa.</h1>
        <p className="muted">Minta link baru untuk melanjutkan.</p>
        <Link className="btn primary" href="/forgot-password">
          Minta link baru
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1>Buat password baru</h1>
      <p className="muted">{pending ? "Password baru sedang disimpan." : `Gunakan minimal ${MIN_PASSWORD} karakter untuk mengamankan akun Anda.`}</p>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <Field label="Password baru" htmlFor="password" required error={errors.password} hint={`Minimal ${MIN_PASSWORD} karakter`}>
          <PasswordInput id="password" name="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} invalid={!!errors.password} autoFocus />
        </Field>
        <Field label="Ulangi password baru" htmlFor="confirm" required error={errors.confirm}>
          <PasswordInput id="confirm" name="confirm" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} invalid={!!errors.confirm} />
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button type="submit" pending={pending} pendingText="Menyimpan...">
          Simpan password baru
        </Button>
      </form>
    </>
  );
}
