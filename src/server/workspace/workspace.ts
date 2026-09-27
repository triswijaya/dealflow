import { eq } from "drizzle-orm";
import { auth } from "@/server/auth/auth";
import { db } from "@/server/db/client";
import { member, organization } from "@/server/db/schema";
import { organizationClock } from "@/server/shared/organization-clock";
import type { Role } from "@/lib/labels";

export type WorkspaceUser = { id: string; name: string; email: string; emailVerified: boolean };

export type Workspace = {
  user: WorkspaceUser;
  organization: { id: string; name: string };
  role: Role;
  memberId: string;
  timezone: string;
  today: string;
};

export type WorkspaceState =
  | { status: "anonymous" }
  | { status: "no-membership"; user: WorkspaceUser }
  | { status: "deactivated"; user: WorkspaceUser }
  | { status: "active"; workspace: Workspace };

/**
 * The session + membership view every signed-in page renders from. Unlike
 * requireMembership (which throws for API use), this distinguishes the
 * states a page needs to route on: no session, a user whose owner
 * onboarding never finished (AUTH-02), and a deactivated membership
 * (AUTH-06). Always a fresh read, same as requireMembership.
 */
export async function getWorkspaceState(headers: Headers): Promise<WorkspaceState> {
  const session = await auth.api.getSession({ headers });
  if (!session) {
    return { status: "anonymous" };
  }
  const user: WorkspaceUser = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
  };

  const [row] = await db
    .select({ member, organizationName: organization.name })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, user.id))
    .limit(1);
  if (!row) {
    return { status: "no-membership", user };
  }
  if (row.member.deactivatedAt) {
    return { status: "deactivated", user };
  }

  const clock = await organizationClock(row.member.organizationId);
  return {
    status: "active",
    workspace: {
      user,
      organization: { id: row.member.organizationId, name: row.organizationName },
      role: row.member.role as Role,
      memberId: row.member.id,
      timezone: clock.timezone,
      today: clock.today,
    },
  };
}
