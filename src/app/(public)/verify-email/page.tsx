import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { auth } from "@/server/auth/auth";
import { ResendVerification } from "./resend-verification";

export const metadata = { title: "Verifikasi email" };

// Better Auth verifies the token at /api/auth/verify-email and then redirects
// here: with ?verified=1 on success, plus ?error=... when the token is bad.
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const params = await searchParams;
  const failed = typeof params.error === "string";
  const verified = params.verified === "1" && !failed;
  if (!failed && !verified) redirect("/dashboard");

  if (verified) {
    return (
      <AuthShell variant="state">
        <h1>Email berhasil diverifikasi.</h1>
        <p className="muted">Akun Anda semakin aman.</p>
        <Link className="btn primary" href="/dashboard">
          Lanjut ke DealFlow
        </Link>
      </AuthShell>
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  return (
    <AuthShell variant="state">
      <h1>Link verifikasi tidak valid atau sudah kedaluwarsa.</h1>
      {session ? (
        <>
          <p className="muted">Gunakan email verifikasi terbaru.</p>
          <ResendVerification email={session.user.email} />
        </>
      ) : (
        <>
          <p className="muted">Masuk untuk mengirim ulang email verifikasi.</p>
          <Link className="btn primary" href="/login?next=/dashboard">
            Kirim ulang email verifikasi
          </Link>
        </>
      )}
    </AuthShell>
  );
}
