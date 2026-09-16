import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/server/db/client";
import { member } from "@/server/db/schema";
import { env } from "@/server/env";
import { ac, roles } from "@/lib/auth-permissions";

async function hasOtherOwner(organizationId: string, excludingMemberId: string) {
  const otherOwners = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.role, "OWNER"),
        ne(member.id, excludingMemberId),
      ),
    )
    .limit(1);
  return otherOwners.length > 0;
}

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  plugins: [
    organization({
      ac,
      roles,
      // Matches the custom role key below, not Better Auth's built-in "owner".
      creatorRole: "OWNER",
      organizationHooks: {
        // AUTH-05: one active organization membership per user on MVP.
        // Applies uniformly to both org creation (creator becomes the first
        // member) and invitation acceptance, since both go through
        // beforeAddMember. Database unique index in schema.ts is the
        // defense-in-depth backstop for races.
        beforeAddMember: async ({ user }) => {
          const existing = await db
            .select({ id: member.id })
            .from(member)
            .where(eq(member.userId, user.id))
            .limit(1);
          if (existing.length > 0) {
            throw new APIError("BAD_REQUEST", {
              message: "User already has an active organization membership",
            });
          }
        },
        // RBAC-02: the last OWNER of an organization cannot be removed.
        beforeRemoveMember: async ({ member: targetMember }) => {
          if (targetMember.role !== "OWNER") return;
          const stillHasOwner = await hasOtherOwner(targetMember.organizationId, targetMember.id);
          if (!stillHasOwner) {
            throw new APIError("BAD_REQUEST", {
              message: "Cannot remove the last owner of an organization",
            });
          }
        },
        // RBAC-02: the last OWNER cannot be demoted away from OWNER.
        beforeUpdateMemberRole: async ({ member: targetMember, newRole }) => {
          if (targetMember.role !== "OWNER" || newRole === "OWNER") return;
          const stillHasOwner = await hasOtherOwner(targetMember.organizationId, targetMember.id);
          if (!stillHasOwner) {
            throw new APIError("BAD_REQUEST", {
              message: "Cannot change the role of the last owner of an organization",
            });
          }
        },
      },
    }),
  ],
});
