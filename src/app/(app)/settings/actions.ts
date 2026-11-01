"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { cancelInvitation, deactivateMember, inviteMember, reactivateMember, updateMemberRole } from "@/server/auth/members";
import { requirePermission } from "@/server/auth/require-membership";
import { updateCompanySettings, updateWriteOffLimit, type CompanySettingsDto } from "@/server/settings/company";
import { runAction } from "@/server/shared/action";

const inviteSchema = z.object({
  email: z.string().trim().min(1).max(254).pipe(z.email()),
  role: z.enum(["ADMIN", "SALES", "FINANCE"]),
});

export async function saveCompanySettingsAction(input: { expectedUpdatedAt: string; values: unknown }): Promise<ActionResult<CompanySettingsDto>> {
  return runAction(async () => {
    const saved = await updateCompanySettings({ headers: await headers(), expectedUpdatedAt: input.expectedUpdatedAt, input: input.values });
    // The company name is in the sidebar of every page.
    revalidatePath("/", "layout");
    return saved;
  });
}

export async function saveWriteOffLimitAction(input: { writeOffLimit: string }): Promise<ActionResult<string>> {
  return runAction(async () => {
    const saved = await updateWriteOffLimit({ headers: await headers(), input });
    revalidatePath("/settings/finance");
    return saved;
  });
}

export async function inviteMemberAction(input: { email: string; role: string }): Promise<ActionResult<{ email: string }>> {
  return runAction(async () => {
    const values = inviteSchema.parse(input);
    const requestHeaders = await headers();
    const actor = await requirePermission({ headers: requestHeaders, permission: { invitation: ["create"] } });
    await inviteMember({ email: values.email, role: values.role, organizationId: actor.organizationId, headers: requestHeaders });
    revalidatePath("/settings/members");
    return { email: values.email };
  });
}

export async function revokeInvitationAction(input: { invitationId: string }): Promise<ActionResult> {
  return runAction(async () => {
    await cancelInvitation({ invitationId: input.invitationId, headers: await headers() });
    revalidatePath("/settings/members");
    return null;
  });
}

export async function changeMemberRoleAction(input: { memberId: string; role: string }): Promise<ActionResult> {
  return runAction(async () => {
    const role = z.enum(["ADMIN", "SALES", "FINANCE"]).parse(input.role);
    await updateMemberRole({ memberId: input.memberId, role, headers: await headers() });
    revalidatePath("/settings/members");
    return null;
  });
}

export async function setMemberActiveAction(input: { memberId: string; active: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const requestHeaders = await headers();
    if (input.active) await reactivateMember({ memberId: input.memberId, headers: requestHeaders });
    else await deactivateMember({ memberId: input.memberId, headers: requestHeaders });
    revalidatePath("/settings/members");
    return null;
  });
}
