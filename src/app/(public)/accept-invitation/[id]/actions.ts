"use server";

import { eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import type { ActionResult } from "@/lib/action-result";
import { auth } from "@/server/auth/auth";
import { getInvitationPreview } from "@/server/auth/invitation-preview";
import { acceptInvitation } from "@/server/auth/members";
import { assertRateLimit, clientIp } from "@/server/security/rate-limit";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { runAction } from "@/server/shared/action";

/** A signed-in person whose account email matches the invitation. */
export async function acceptInvitationAction(input: { invitationId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) throw new APIError("UNAUTHORIZED", { message: "Authentication required" });
    await acceptInvitation({ invitationId: input.invitationId, userId: session.user.id, headers: requestHeaders });
    return null;
  });
}

/**
 * A new person: create the account for the invited email, sign in, and join,
 * in one step. The email comes from the invitation, never from the form, and
 * holding the link is the proof of owning that mailbox, so it counts as
 * verified.
 */
export async function acceptInvitationAsNewUserAction(input: { invitationId: string; name: string; password: string }): Promise<ActionResult> {
  return runAction(async () => {
    // SEC-02: this creates an account without any prior session, so it is limited
    // per client and per invitation (a link is no reason to allow endless tries).
    await assertRateLimit([
      { key: `accept-invitation:ip:${clientIp(await headers())}`, rule: { max: 10, windowSeconds: 60 * 60 } },
      { key: `accept-invitation:invitation:${input.invitationId}`, rule: { max: 10, windowSeconds: 60 * 60 } },
    ]);
    const preview = await getInvitationPreview(input.invitationId);
    if (preview.state !== "valid") throw new APIError("BAD_REQUEST", { message: "Invitation is not available" });
    if (preview.hasAccount) throw new APIError("BAD_REQUEST", { message: "Account already exists" });
    const name = input.name.trim();
    if (name.length < 1 || name.length > 150) throw new APIError("BAD_REQUEST", { message: "Name is required" });

    const created = await auth.api.signUpEmail({
      body: { email: preview.email, password: input.password, name },
      returnHeaders: true,
    });
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, created.response.user.id));

    // The session cookie was just minted by this very request, so it is not
    // in the incoming headers yet: forward it by hand for the acceptance call.
    const cookie = created.headers
      .getSetCookie()
      .map((entry) => entry.split(";")[0])
      .join("; ");
    await acceptInvitation({ invitationId: input.invitationId, userId: created.response.user.id, headers: new Headers({ cookie }) });
    return null;
  });
}
