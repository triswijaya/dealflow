import { and, eq, isNull, ne } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { auth } from "./auth";
import { requirePermission } from "./require-membership";
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

/**
 * AUTH-04/RBAC-02: Better Auth has no built-in deactivation concept, so this
 * mirrors the scope of its native last-owner protection by hand: an OWNER's
 * membership can only be touched by another OWNER, and the last active
 * OWNER can never be deactivated (including by themselves).
 */
export async function deactivateMember(params: { memberId: string; headers: Headers }) {
  const actor = await requirePermission({ headers: params.headers, permission: { member: ["update"] } });

  const target = await db.query.member.findFirst({
    where: and(eq(member.id, params.memberId), eq(member.organizationId, actor.organizationId)),
  });
  if (!target) {
    throw new APIError("NOT_FOUND", { message: "Member not found" });
  }
  if (target.deactivatedAt) {
    return target; // already deactivated: idempotent
  }

  if (target.role === "OWNER") {
    if (actor.role !== "OWNER") {
      throw new APIError("FORBIDDEN", { message: "You are not allowed to deactivate this member" });
    }
    const [otherActiveOwner] = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, actor.organizationId),
          eq(member.role, "OWNER"),
          isNull(member.deactivatedAt),
          ne(member.id, target.id),
        ),
      )
      .limit(1);
    if (!otherActiveOwner) {
      throw new APIError("BAD_REQUEST", { message: "Cannot deactivate the only active owner" });
    }
  }

  const [updated] = await db
    .update(member)
    .set({ deactivatedAt: new Date() })
    .where(eq(member.id, target.id))
    .returning();
  return updated;
}

export async function reactivateMember(params: { memberId: string; headers: Headers }) {
  const actor = await requirePermission({ headers: params.headers, permission: { member: ["update"] } });

  const target = await db.query.member.findFirst({
    where: and(eq(member.id, params.memberId), eq(member.organizationId, actor.organizationId)),
  });
  if (!target) {
    throw new APIError("NOT_FOUND", { message: "Member not found" });
  }
  if (!target.deactivatedAt) {
    return target; // already active: idempotent
  }
  if (target.role === "OWNER" && actor.role !== "OWNER") {
    throw new APIError("FORBIDDEN", { message: "You are not allowed to reactivate this member" });
  }

  const [updated] = await db.update(member).set({ deactivatedAt: null }).where(eq(member.id, target.id)).returning();
  return updated;
}
