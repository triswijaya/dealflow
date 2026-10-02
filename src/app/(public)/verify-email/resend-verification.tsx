"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function resend() {
    setState("sending");
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/verify-email?verified=1" });
    setState(error ? "failed" : "sent");
  }

  return (
    <>
      {state === "sent" ? <Alert tone="success">Email verifikasi dikirim. Periksa kotak masuk Anda.</Alert> : null}
      {state === "failed" ? <Alert tone="error">Gagal mengirim email. Coba lagi dalam beberapa menit.</Alert> : null}
      <Button pending={state === "sending"} pendingText="Mengirim..." disabled={state === "sent"} onClick={resend}>
        Kirim ulang email verifikasi
      </Button>
    </>
  );
}
