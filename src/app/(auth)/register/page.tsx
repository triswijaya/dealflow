"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { registerOwnerAction, type RegisterState } from "./actions";

const MIN_PASSWORD = 12;
const initialState: RegisterState = { error: null };

type Fields = "name" | "companyName" | "email" | "password";

function validate(form: FormData): Partial<Record<Fields, string>> {
  const errors: Partial<Record<Fields, string>> = {};
  const value = (key: Fields) => String(form.get(key) ?? "").trim();
  if (!value("name")) errors.name = "Wajib diisi.";
  if (!value("companyName")) errors.companyName = "Wajib diisi.";
  if (!value("email")) errors.email = "Wajib diisi.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value("email"))) errors.email = "Format email tidak valid.";
  const password = String(form.get("password") ?? "");
  if (!password) errors.password = "Wajib diisi.";
  else if (password.length < MIN_PASSWORD) errors.password = `Minimal ${MIN_PASSWORD} karakter.`;
  return errors;
}

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(registerOwnerAction, initialState);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Fields, string>>>({});
  const [passwordLength, setPasswordLength] = useState(0);

  const remaining = Math.max(MIN_PASSWORD - passwordLength, 0);

  return (
    <>
      <h1>Buat organisasi baru</h1>
      <p className="muted">Mulai kelola sales pipeline tim Anda di DealFlow.</p>
      <form
        className="stack"
        action={formAction}
        noValidate
        onSubmit={(event) => {
          const errors = validate(new FormData(event.currentTarget));
          setFieldErrors(errors);
          if (Object.keys(errors).length > 0) event.preventDefault();
        }}
      >
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <Field label="Nama lengkap" htmlFor="name" required error={fieldErrors.name}>
          <Input id="name" name="name" autoComplete="name" invalid={!!fieldErrors.name} />
        </Field>
        <Field label="Nama perusahaan" htmlFor="companyName" required error={fieldErrors.companyName}>
          <Input id="companyName" name="companyName" autoComplete="organization" invalid={!!fieldErrors.companyName} />
        </Field>
        <Field label="Email" htmlFor="email" required error={fieldErrors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" invalid={!!fieldErrors.email} />
        </Field>
        <Field label="Password" htmlFor="password" required error={fieldErrors.password} hint="Minimal 12 karakter">
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            invalid={!!fieldErrors.password}
            onChange={(event) => setPasswordLength(event.target.value.length)}
          />
        </Field>
        <div aria-live="polite">
          <div className="progress" aria-hidden="true">
            <span style={{ width: `${Math.min(passwordLength / MIN_PASSWORD, 1) * 100}%` }} />
          </div>
          <small>
            {passwordLength} karakter · {remaining === 0 ? "panjang terpenuhi" : `kurang ${remaining} karakter`}
          </small>
        </div>
        <Button type="submit" pending={isPending}>
          Daftar
        </Button>
        <small>Akun ini menjadi Owner organisasi. Anggota tim lain bergabung lewat undangan.</small>
        <p>
          Sudah punya akun?{" "}
          <Link href="/login">
            <b>Masuk</b>
          </Link>
        </p>
      </form>
    </>
  );
}
