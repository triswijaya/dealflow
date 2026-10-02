import { headers } from "next/headers";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ROLE_LABEL } from "@/lib/labels";
import { auth } from "@/server/auth/auth";
import { getInvitationPreview } from "@/server/auth/invitation-preview";
import { AcceptForm } from "./accept-form";

export const metadata = { title: "Undangan" };

const UNAVAILABLE = {
  "not-found": "Undangan tidak ditemukan.",
  expired: "Undangan sudah kedaluwarsa.",
  used: "Undangan sudah dipakai.",
  revoked: "Undangan sudah dicabut.",
} as const;

export default async function AcceptInvitationPage({ params }: PageProps<"/accept-invitation/[id]">) {
  const { id } = await params;
  const preview = await getInvitationPreview(id);

  if (preview.state !== "valid") {
    return (
      <AuthShell variant="state">
        <h1>{UNAVAILABLE[preview.state]}</h1>
        <p className="muted">Hubungi pengundang bila Anda memerlukan bantuan.</p>
        <Link className="btn tertiary" href="/login">
          Ke halaman masuk
        </Link>
      </AuthShell>
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const mode = !session
    ? preview.hasAccount
      ? "sign-in"
      : "new-user"
    : session.user.email.toLowerCase() === preview.email.toLowerCase()
      ? "join"
      : "wrong-account";

  return (
    <AuthShell>
      <AcceptForm
        mode={mode}
        invitationId={preview.invitationId}
        email={preview.email}
        roleLabel={ROLE_LABEL[preview.role]}
        organizationName={preview.organizationName}
        inviterName={preview.inviterName}
        signedInAs={session?.user.email}
      />
    </AuthShell>
  );
}
