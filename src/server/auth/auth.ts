import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { member } from "@/server/db/schema";
import { sendEmail } from "@/server/email/send-email";
import { env } from "@/server/env";
import { ac, roles } from "@/lib/auth-permissions";

async function findMembershipDeactivation(userId: string) {
  const [row] = await db
    .select({ deactivatedAt: member.deactivatedAt })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  return row?.deactivatedAt ?? null;
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
  // AUTH-06: a deactivated user cannot log in. This runs for every session
  // creation path (not just email/password), always against a fresh DB read
  // (we never enable session.cookieCache), so there is no stale-cache window.
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const deactivatedAt = await findMembershipDeactivation(session.userId);
          if (deactivatedAt) {
            return false;
          }
        },
      },
    },
  },
  // AUTH-06: a deactivated user cannot run organization-management
  // operations either. organizationHooks (below) only see target data, not
  // the calling actor, and Better Auth's own role checks have no notion of
  // deactivation, so this is the one choke point that covers every
  // /organization/* endpoint (invite, cancel, list, add/remove/update-role).
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!ctx.path.startsWith("/organization/")) {
        return;
      }
      const session = await getSessionFromCtx(ctx);
      if (!session) {
        return;
      }
      const deactivatedAt = await findMembershipDeactivation(session.user.id);
      if (deactivatedAt) {
        throw new APIError("FORBIDDEN", {
          message: "Your membership has been deactivated",
        });
      }
    }),
  },
  plugins: [
    organization({
      ac,
      roles,
      // Matches the custom role key below, not Better Auth's built-in "owner".
      creatorRole: "OWNER",
      schema: {
        member: {
          additionalFields: {
            // Managed only via server/auth/members.ts (deactivateMember /
            // reactivateMember), never through Better Auth's addMember input.
            deactivatedAt: {
              type: "date",
              required: false,
              input: false,
            },
          },
        },
      },
      async sendInvitationEmail(data) {
        const inviteLink = `${env.APP_URL}/accept-invitation/${data.id}`;
        await sendEmail({
          to: data.email,
          subject: `You've been invited to join ${data.organization.name} on DealFlow`,
          text: `${data.inviter.user.name} invited you to join ${data.organization.name} as ${data.role}.\n\n${inviteLink}`,
        });
      },
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
        // RBAC-02 (last-owner protection, and admin cannot touch an owner's
        // membership at all) is already enforced natively by Better Auth's
        // organization plugin once creatorRole is set to our OWNER key.
        // Confirmed empirically: removing/demoting the sole owner is
        // rejected ("You cannot leave the organization ..."), an ADMIN
        // cannot update an OWNER's role at all ("You are not allowed to
        // update this member"), and removing one of several co-owners
        // succeeds correctly. No custom hook needed here; see
        // register-owner.integration.test.ts for the proof.

        // RBAC-02: ownership transfer is not MVP UI, so invitations can only
        // grant ADMIN/SALES/FINANCE, never OWNER.
        beforeCreateInvitation: async ({ invitation }) => {
          if (invitation.role === "OWNER") {
            throw new APIError("BAD_REQUEST", {
              message: "Cannot invite a member directly as OWNER",
            });
          }
        },
      },
    }),
    // Must stay last: lets Server Actions that call auth.api.* directly
    // (registerOwner, sign-in) set the session cookie on the actual Next.js
    // response via next/headers, instead of only returning it in a Response
    // object nothing forwards.
    nextCookies(),
  ],
});
