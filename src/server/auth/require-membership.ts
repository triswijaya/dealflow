import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "@/server/db/client";
import { member } from "@/server/db/schema";
import { roles } from "@/lib/auth-permissions";

type OrgRole = keyof typeof roles;
type PermissionRequest = Parameters<(typeof roles)["OWNER"]["authorize"]>[0];

function isOrgRole(role: string): role is OrgRole {
  return role in roles;
}

/**
 * API-01's "authenticate -> resolve membership -> authorize" entry point.
 * Always a fresh DB read (no session-embedded role, no cookie cache), so
 * role changes and deactivation are effective immediately (AUTH-06).
 */
export async function requireMembership(params: { headers: Headers }) {
  const session = await auth.api.getSession({ headers: params.headers });
  if (!session) {
    throw new APIError("UNAUTHORIZED", { message: "Authentication required" });
  }

  const [row] = await db.select().from(member).where(eq(member.userId, session.user.id)).limit(1);
  if (!row) {
    throw new APIError("FORBIDDEN", { message: "No organization membership" });
  }
  if (row.deactivatedAt) {
    throw new APIError("FORBIDDEN", { message: "Your membership has been deactivated" });
  }
  if (!isOrgRole(row.role)) {
    throw new APIError("FORBIDDEN", { message: "Unrecognized membership role" });
  }

  return {
    userId: session.user.id,
    organizationId: row.organizationId,
    role: row.role,
    member: row,
  };
}

export async function requirePermission(params: { headers: Headers; permission: PermissionRequest }) {
  const membership = await requireMembership({ headers: params.headers });
  const result = roles[membership.role].authorize(params.permission);
  if (!result.success) {
    throw new APIError("FORBIDDEN", { message: "Insufficient permission" });
  }
  return membership;
}
