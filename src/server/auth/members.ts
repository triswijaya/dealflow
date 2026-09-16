import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "@/server/db/client";
import { invitation, member } from "@/server/db/schema";

// AUTH-04: ownership transfer is not MVP UI (RBAC-02), so invitations only
// ever grant one of these; also enforced server-side via beforeCreateInvitation.
export type InvitableRole = "ADMIN" | "SALES" | "FINANCE";

export async function inviteMember(params: {
  email: string;
  role: InvitableRole;
  organizationId?: string;
  headers: Headers;
}) {
  return auth.api.createInvitation({
    body: { email: params.email, role: params.role, organizationId: params.organizationId },
    headers: params.headers,
  });
}

export async function listOrganizationMembers(params: { organizationId?: string; headers: Headers }) {
  return auth.api.listMembers({
    query: { organizationId: params.organizationId },
    headers: params.headers,
  });
}

export async function cancelInvitation(params: { invitationId: string; headers: Headers }) {
  return auth.api.cancelInvitation({
    body: { invitationId: params.invitationId },
    headers: params.headers,
  });
}

/**
 * AUTH-04: acceptance must be idempotent. If the invitation was already
 * accepted and the caller is already a member of that organization, treat a
 * retry as success instead of surfacing an error.
 */
export async function acceptInvitation(params: { invitationId: string; userId: string; headers: Headers }) {
  try {
    return await auth.api.acceptInvitation({
      body: { invitationId: params.invitationId },
      headers: params.headers,
    });
  } catch (error) {
    const existingInvitation = await db.query.invitation.findFirst({
      where: eq(invitation.id, params.invitationId),
    });
    const existingMembership = existingInvitation
      ? await db.query.member.findFirst({
          where: eq(member.userId, params.userId),
        })
      : undefined;
    if (
      existingInvitation?.status === "accepted" &&
      existingMembership?.organizationId === existingInvitation.organizationId
    ) {
      return { invitation: existingInvitation, member: existingMembership };
    }
    throw error;
  }
}
