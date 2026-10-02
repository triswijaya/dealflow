"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";

const RESEND_SECONDS = 60;

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function request(target: string) {
    setPending(true);
    setError(null);
    const { error: failure } = await authClient.requestPasswordReset({ email: target, redirectTo: "/reset-password" });
    setPending(false);
    // Better Auth answers the same whether or not the email is registered, so
    // success here never confirms that an account exists (SEC-01).
    if (failure) {
      setError("Permintaan belum berhasil. Coba lagi.");
      return false;
    }
    setSentTo(target);
    setWait(RESEND_SECONDS);
    return true;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setFieldError("Masukkan email yang valid.");
      return;
    }
    setFieldError(null);
    await request(value);
  }

  if (sentTo) {
    return (
      <div className="stack">
        <h1>Periksa email Anda</h1>
        <p className="muted">Jika email tersebut terdaftar, link reset sudah dikirim. Link berlaku terbatas.</p>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button variant="tertiary" disabled={wait > 0} pending={pending} onClick={() => request(sentTo)}>
          {wait > 0 ? `Kirim ulang (${wait} detik)` : "Kirim ulang"}
        </Button>
        <Link className="btn tertiary" href="/login">
          Kembali ke halaman masuk
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1>Lupa password</h1>
      <p className="muted">{fieldError ? "Periksa email akun Anda." : "Masukkan email akun Anda. Kami kirimkan link untuk membuat password baru."}</p>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <Field label="Email" htmlFor="email" required error={fieldError ?? undefined}>
          <Input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} invalid={!!fieldError} autoFocus />
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button type="submit" pending={pending}>
          Kirim link reset
        </Button>
        <Link className="btn tertiary" href="/login">
          ← Kembali ke halaman masuk
        </Link>
      </form>
    </>
  );
}
