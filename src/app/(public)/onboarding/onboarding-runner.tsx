"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";
import { completeOnboardingAction } from "./actions";

type Phase = "ask" | "working" | "failed" | "done";

/**
 * A-03. With a company name already known it starts at once; without one it
 * asks for it first, because there is nothing to create the organization from.
 */
export function OnboardingRunner({ knownName, email }: { knownName: boolean; email: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(knownName ? "working" : "ask");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const started = useRef(false);

  async function run(companyName?: string) {
    setPhase("working");
    const result = await completeOnboardingAction({ companyName });
    if (!result.ok) return setPhase("failed");
    setPhase("done");
    router.replace("/dashboard");
    router.refresh();
  }

  useEffect(() => {
    // The ref keeps React's dev double-invoke from provisioning twice.
    if (knownName && !started.current) {
      started.current = true;
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (phase === "ask") {
    const submit = (event: FormEvent) => {
      event.preventDefault();
      if (name.trim().length < 2) return setNameError("Nama perusahaan wajib diisi (minimal 2 karakter).");
      setNameError(null);
      void run(name);
    };
    return (
      <form className="stack" onSubmit={submit} noValidate>
        <h1>Satu langkah lagi</h1>
        <p className="muted">Beri nama organisasi untuk akun {email}.</p>
        <Field label="Nama perusahaan" htmlFor="companyName" required error={nameError ?? undefined}>
          <Input id="companyName" value={name} onChange={(event) => setName(event.target.value)} autoComplete="organization" invalid={!!nameError} autoFocus />
        </Field>
        <Button type="submit">Buat organisasi</Button>
        <Button variant="tertiary" onClick={signOut}>
          Keluar
        </Button>
      </form>
    );
  }

  if (phase === "failed") {
    return (
      <div className="stack">
        <h1>Persiapan organisasi belum selesai.</h1>
        <p className="muted">Data akun Anda tetap tersimpan.</p>
        <Alert tone="warning">Persiapan belum berhasil. Silakan coba lagi.</Alert>
        <Button onClick={() => run(name || undefined)}>Coba lagi</Button>
        <Button variant="tertiary" onClick={signOut}>
          Keluar
        </Button>
      </div>
    );
  }

  return (
    <div className="stack" aria-live="polite">
      <h1>{phase === "done" ? "Organisasi siap" : "Menyiapkan organisasi Anda..."}</h1>
      <p className="muted">{phase === "done" ? "Anda diarahkan ke Ringkasan." : "Biasanya hanya beberapa detik."}</p>
      {phase === "done" ? <Alert tone="success">Persiapan selesai.</Alert> : null}
    </div>
  );
}
