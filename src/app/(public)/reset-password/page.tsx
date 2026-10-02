import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "Buat password baru" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : undefined;
  const failed = typeof params.error === "string" || !token;

  if (failed) {
    return (
      <AuthShell variant="state">
        <h1>Link reset tidak valid atau sudah kedaluwarsa.</h1>
        <p className="muted">Minta link baru untuk melanjutkan.</p>
        <Link className="btn primary" href="/forgot-password">
          Minta link baru
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
