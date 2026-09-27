"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerOwnerAction, type RegisterState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const initialState: RegisterState = { error: null };

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(registerOwnerAction, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Buat organisasi baru</CardTitle>
        <CardDescription>Mulai kelola sales pipeline tim Anda di DealFlow.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Nama lengkap</FieldLabel>
              <Input id="name" name="name" autoComplete="name" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="companyName">Nama perusahaan</FieldLabel>
              <Input id="companyName" name="companyName" autoComplete="organization" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field data-invalid={state.error ? "true" : undefined}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
              <FieldError errors={state.error ? [{ message: state.error }] : undefined} />
            </Field>
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Memproses..." : "Daftar"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
      <div className="border-t px-4 py-4 text-center text-sm text-muted-foreground">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Masuk
        </Link>
      </div>
    </Card>
  );
}
