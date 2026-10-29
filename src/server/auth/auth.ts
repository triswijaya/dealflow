import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { invitation, organization as organizationTable } from "@/server/db/schema";
import { invitationEmail, resetPasswordEmail, verificationEmail } from "@/server/email/account-emails";
import { sendEmail } from "@/server/email/send-email";
import { env } from "@/server/env";
import { ac, roles } from "@/lib/auth-permissions";
import { findActiveMembership, findCurrentMembership } from "./current-membership";

// Organization endpoints a person needs precisely because they have no usable
// membership: answering an invitation. Better Auth itself checks the invitation
// is addressed to the signed-in email.
const JOINING_PATHS = new Set([
  "/organization/accept-invitation",
  "/organization/reject-invitation",
  "/organization/get-invitation",
  "/organization/list-user-invitations",
]);

type OrganizationRequest = {
  body?: unknown;
  query?: unknown;
  session: { session: object };
};

// Which organization an /organization/* call acts on, the way Better Auth will
// resolve it: explicit id or slug, the organization of a named invitation, else
// the session's active organization.
async function targetOrganizationId(ctx: OrganizationRequest): Promise<string | undefined> {
  const input = { ...(ctx.query as object | undefined), ...(ctx.body as object | undefined) } as Record<string, unknown>;
  if (typeof input.organizationId === "string") return input.organizationId;
  if (typeof input.organizationSlug === "string") {
    const org = await db.query.organization.findFirst({ where: eq(organizationTable.slug, input.organizationSlug) });
    return org?.id;
  }
  if (typeof input.invitationId === "string") {
    const row = await db.query.invitation.findFirst({ where: eq(invitation.id, input.invitationId) });
    return row?.organizationId;
  }
  return (ctx.session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? undefined;
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
    resetPasswordTokenExpiresIn: 60 * 60,
    // A-05: "semua sesi lama sudah dikeluarkan".
    revokeSessionsOnPasswordReset: true,
    async sendResetPassword({ user, url }) {
      await sendEmail(resetPasswordEmail({ to: user.email, name: user.name, url }));
    },
  },
  emailVerification: {
    expiresIn: 60 * 60 * 24,
    async sendVerificationEmail({ user, url }) {
      await sendEmail(verificationEmail({ to: user.email, name: user.name, url }));
    },
  },
  // AUTH-06: a deactivated user may sign in (so they can accept an invitation
  // to another organization) but can do nothing else: every service rejects
  // them through requireMembership, and the hook below covers Better Auth's
  // own organization endpoints. Sessions are never cached (no
  // session.cookieCache), so a deactivation takes effect on the next request.
  //
  // Better Auth's own role checks have no notion of deactivation, and a person
  // can now hold an old deactivated row in one organization next to an active
  // one in another. So this is the single choke point for every
  // /organization/* endpoint (invite, cancel, list, add/remove/update-role):
  // the caller needs an active membership AND the call must target that same
  // organization, otherwise a deactivated ex-admin of A, now a member of B,
  // could still act on A.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!ctx.path.startsWith("/organization/") || JOINING_PATHS.has(ctx.path)) {
        return;
      }
      const session = await getSessionFromCtx(ctx);
      if (!session) {
        return;
      }
      const current = await findCurrentMembership(session.user.id);
      if (!current) {
        return; // no membership yet, e.g. creating the first organization
      }
      if (current.deactivatedAt) {
        throw new APIError("FORBIDDEN", {
          message: "Your membership has been deactivated",
        });
      }
      const target = await targetOrganizationId({ body: ctx.body, query: ctx.query, session });
      if (target && target !== current.organizationId) {
        throw new APIError("FORBIDDEN", { message: "You are not a member of this organization" });
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
      // X-02 / A-07: seven days, matching the "berlaku sampai" date in the email.
      invitationExpiresIn: 60 * 60 * 24 * 7,
      async sendInvitationEmail(data) {
        await sendEmail(
          invitationEmail({
            to: data.email,
            organizationName: data.organization.name,
            inviterName: data.inviter.user.name,
            role: data.role,
            url: `${env.APP_URL}/accept-invitation/${data.id}`,
            expiresAt: data.invitation.expiresAt,
          }),
        );
      },
      organizationHooks: {
        // AUTH-05: one active organization membership per user on MVP.
        // Applies uniformly to both org creation (creator becomes the first
        // member) and invitation acceptance, since both go through
        // beforeAddMember. Database unique index in schema.ts is the
        // defense-in-depth backstop for races.
        beforeAddMember: async ({ user }) => {
          if (await findActiveMembership(user.id)) {
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
