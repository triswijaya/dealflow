import { and, asc, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { deals, invitation, member, user } from "@/server/db/schema";
import { toIsoDto } from "@/server/shared/dto";
import type { Role } from "@/lib/labels";

// Read model for the members screen (S-02). Owner and Admin only: the same
// permission that guards changing a member.

export type TeamMemberDto = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  joinedAt: string;
  /** Open deals (not won or lost) this member is responsible for. */
  activeDeals: number;
  isSelf: boolean;
};

export type PendingInvitationDto = {
  id: string;
  email: string;
  role: string;
  invitedByName: string;
  sentAt: string;
  expiresAt: string;
};

export type TeamDto = {
  members: TeamMemberDto[];
  invitations: PendingInvitationDto[];
  /** Whether the viewer is the one active Owner (so their own row is locked). */
  soleActiveOwner: boolean;
  viewerRole: Role;
};

export async function getTeam(params: { headers: Headers }): Promise<TeamDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { member: ["update"] } });

  const rows = await db
    .select({ member, name: user.name, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, actor.organizationId))
    .orderBy(asc(member.createdAt), asc(member.id));

  const counts = await db
    .select({ assignedToId: deals.assignedToId, count: sql<number>`count(*)`.mapWith(Number) })
    .from(deals)
    .where(
      and(
        eq(deals.organizationId, actor.organizationId),
        inArray(deals.assignedToId, rows.map((row) => row.member.userId)),
        notInArray(deals.status, ["WON", "LOST"]),
      ),
    )
    .groupBy(deals.assignedToId);
  const dealCount = new Map(counts.map((row) => [row.assignedToId, row.count]));

  const inviter = alias(user, "inviter");
  const pending = await db
    .select({ invitation, inviterName: inviter.name })
    .from(invitation)
    .innerJoin(inviter, eq(inviter.id, invitation.inviterId))
    .where(
      and(
        eq(invitation.organizationId, actor.organizationId),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitation.createdAt));

  const members = rows.map((row) => ({
    memberId: row.member.id,
    userId: row.member.userId,
    name: row.name,
    email: row.email,
    role: row.member.role as Role,
    active: row.member.deactivatedAt === null,
    joinedAt: toIsoDto(row.member.createdAt),
    activeDeals: dealCount.get(row.member.userId) ?? 0,
    isSelf: row.member.id === actor.member.id,
  }));
  const activeOwners = members.filter((entry) => entry.role === "OWNER" && entry.active);

  return {
    members,
    invitations: pending.map(({ invitation: row, inviterName }) => ({
      id: row.id,
      email: row.email,
      role: row.role ?? "SALES",
      invitedByName: inviterName,
      sentAt: toIsoDto(row.createdAt),
      expiresAt: toIsoDto(row.expiresAt),
    })),
    soleActiveOwner: activeOwners.length === 1 && activeOwners[0].userId === actor.userId,
    viewerRole: actor.role as Role,
  };
}
