import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { invitation, organization, user } from "@/server/db/schema";
import type { Role } from "@/lib/labels";

// A-07: the public face of an invitation link. No session needed, because the
// person opening it may not have an account yet; the unguessable invitation id
// is the credential. It reveals only what the invitee must confirm: who
// invited them, to which organization, as what, and for which email.

export type InvitationPreview =
  | { state: "not-found" }
  | { state: "expired" | "used" | "revoked" }
  | {
      state: "valid";
      invitationId: string;
      email: string;
      role: Role;
      organizationName: string;
      inviterName: string;
      /** Whether an account with this email already exists. */
      hasAccount: boolean;
    };

export async function getInvitationPreview(invitationId: string): Promise<InvitationPreview> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(invitationId)) return { state: "not-found" };

  const [row] = await db
    .select({ invitation, organizationName: organization.name, inviterName: user.name })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .innerJoin(user, eq(user.id, invitation.inviterId))
    .where(eq(invitation.id, invitationId))
    .limit(1);
  if (!row) return { state: "not-found" };

  const { invitation: found } = row;
  if (found.status === "accepted") return { state: "used" };
  if (found.status !== "pending") return { state: "revoked" };
  if (found.expiresAt.getTime() <= Date.now()) return { state: "expired" };

  const existing = await db.query.user.findFirst({ where: eq(user.email, found.email.toLowerCase()) });
  return {
    state: "valid",
    invitationId: found.id,
    email: found.email,
    role: (found.role ?? "SALES") as Role,
    organizationName: row.organizationName,
    inviterName: row.inviterName,
    hasAccount: Boolean(existing),
  };
}
