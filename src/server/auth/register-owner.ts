import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "@/server/db/client";
import { member, organization, organizationSettings, user } from "@/server/db/schema";

export interface RegisterOwnerInput {
  email: string;
  password: string;
  name: string;
  companyName: string;
}

export interface RegisterOwnerResult {
  userId: string;
  organizationId: string;
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "org";
}

async function generateUniqueSlug(companyName: string): Promise<string> {
  const base = slugify(companyName);
  let candidate = base;
  let suffix = 0;
  // Best-effort uniqueness check; organization.slug carries a DB unique
  // constraint as the real guarantee against a race between two concurrent
  // registrations picking the same slug.
  while (await db.query.organization.findFirst({ where: eq(organization.slug, candidate) })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

/**
 * AUTH-02: creates user + organization + default organization_settings +
 * OWNER membership for a new owner registration. Idempotent/resumable: if a
 * previous call stopped partway (network error, process restart, etc.),
 * calling again with the same input completes only the missing steps rather
 * than failing or duplicating data.
 *
 * When the email already exists, the caller must still prove ownership via
 * the given password (a real sign-in attempt) before this resumes
 * provisioning on that account's behalf; otherwise anyone who knew or
 * guessed an in-progress owner's email could hijack their registration.
 */
export async function registerOwner(input: RegisterOwnerInput): Promise<RegisterOwnerResult> {
  const existingUser = await db.query.user.findFirst({ where: eq(user.email, input.email) });

  let userId: string;
  if (existingUser) {
    const verified = await auth.api
      .signInEmail({ body: { email: input.email, password: input.password } })
      .catch(() => null);
    if (!verified) {
      throw new Error("Registration failed");
    }
    userId = existingUser.id;
  } else {
    const signUpResult = await auth.api.signUpEmail({
      body: { email: input.email, password: input.password, name: input.name },
    });
    userId = signUpResult.user.id;
  }

  const existingMembership = await db.query.member.findFirst({ where: eq(member.userId, userId) });

  let organizationId: string;
  if (existingMembership) {
    organizationId = existingMembership.organizationId;
  } else {
    const slug = await generateUniqueSlug(input.companyName);
    const org = await auth.api.createOrganization({
      body: { name: input.companyName, slug, userId },
    });
    if (!org) {
      throw new Error("Registration failed");
    }
    organizationId = org.id;
  }

  const existingSettings = await db.query.organizationSettings.findFirst({
    where: eq(organizationSettings.organizationId, organizationId),
  });
  if (!existingSettings) {
    await db.insert(organizationSettings).values({ organizationId });
  }

  return { userId, organizationId };
}
