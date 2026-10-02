"use server";

import { APIError } from "better-auth/api";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { auth } from "@/server/auth/auth";
import { provisionOrganization } from "@/server/auth/register-owner";
import { runAction } from "@/server/shared/action";

const COOKIE = "df_company";
const nameSchema = z.string().trim().min(2).max(120);

/**
 * A-03: finishes setting up the organization for a signed-in account that
 * does not have one yet. Safe to call repeatedly (provisionOrganization is
 * resumable), which is what "Coba lagi" relies on.
 */
export async function completeOnboardingAction(input: { companyName?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) throw new APIError("UNAUTHORIZED", { message: "Authentication required" });
    const jar = await cookies();
    const name = nameSchema.parse(input.companyName ?? jar.get(COOKIE)?.value ?? "");
    await provisionOrganization({ userId: session.user.id, companyName: name });
    jar.delete(COOKIE);
    return null;
  });
}
