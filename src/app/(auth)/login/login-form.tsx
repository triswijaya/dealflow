"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";

type LoginError = "credentials" | "deactivated" | "rate-limited";

const MESSAGES: Record<LoginError, string> = {
  // SEC-01/AUTH-06: one message whether the email is unknown or the password
  // is wrong, so a failed attempt never confirms that an account exists.
  credentials: "Email atau password salah.",
  deactivated: "Akses Anda ke organisasi ini sudah dinonaktifkan. Hubungi admin organisasi.",
  "rate-limited": "Terlalu banyak percobaan. Coba lagi dalam beberapa menit.",
};

export function LoginForm({ notice, next }: { notice?: string; next?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const errors = {
      email: email ? undefined : "Wajib diisi.",
      password: password ? undefined : "Wajib diisi.",
    };
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    setError(null);
    setPending(true);
    await authClient.signIn.email(
      { email, password },
      {
        onSuccess: () => {
          router.push(next ?? "/dashboard");
          router.refresh();
        },
        onError: (ctx) => {
          setPending(false);
          if (ctx.error.status === 429) setError("rate-limited");
          // The deactivation hook only runs after the password is verified,
          // so this message is never shown to someone without the password.
          else if (ctx.error.code === "FAILED_TO_CREATE_SESSION") setError("deactivated");
          else setError("credentials");
        },
      },
    );
  }

  return (
    <>
      <h1>Masuk ke DealFlow</h1>
      <p className="muted">Kelola pipeline penjualan tim Anda.</p>
      <form className="stack" onSubmit={onSubmit} noValidate>
        {notice && !error ? <Alert tone="info">{notice}</Alert> : null}
        {error ? <Alert tone="error">{MESSAGES[error]}</Alert> : null}
        <Field label="Email" htmlFor="email" required error={fieldErrors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" invalid={!!fieldErrors.email} />
        </Field>
        <Field label="Password" htmlFor="password" required error={fieldErrors.password}>
          <PasswordInput id="password" name="password" autoComplete="current-password" invalid={!!fieldErrors.password} />
        </Field>
        <div style={{ textAlign: "right" }}>
          <Link href="/forgot-password">Lupa password?</Link>
        </div>
        <Button type="submit" pending={pending}>
          Masuk
        </Button>
        <p style={{ textAlign: "center" }}>
          Belum punya akun?{" "}
          <Link href="/register">
            <b>Daftar</b>
          </Link>
        </p>
      </form>
    </>
  );
}
