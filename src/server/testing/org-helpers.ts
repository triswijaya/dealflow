import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "@/server/auth/auth";
import { acceptInvitation, inviteMember, type InvitableRole } from "@/server/auth/members";
import { registerOwner } from "@/server/auth/register-owner";
import { db } from "@/server/db/client";

// Shared setup for integration tests that need a real organization with
// signed-in members. Each call creates a fresh organization, so tests never
// share rows (and TENANT-04 checks can use two of them side by side).

const PASSWORD = "correct-horse-battery-staple";

export async function migrateTestDatabase() {
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) {
    throw new Error("DATABASE_MIGRATION_URL must be set to run integration tests");
  }
  const client = postgres(url, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  return client;
}

// signIn.token (the JSON body) is not the cookie value: the cookie carries an
// HMAC signature suffix only the Set-Cookie header includes.
async function sessionCookieFor(email: string): Promise<string> {
  const response = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-in did not return a session cookie");
  return setCookie.split(";")[0];
}

export type TestOrg = {
  organizationId: string;
  ownerUserId: string;
  ownerHeaders: Headers;
};

export async function setupOrganization(name = "Test Org"): Promise<TestOrg> {
  const email = `owner-${Date.now()}-${Math.random()}@example.test`;
  const { organizationId } = await registerOwner({ email, password: PASSWORD, name: "Owner", companyName: `${name} ${Date.now()}-${Math.random()}` });
  const owner = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.email, email) });
  return {
    organizationId,
    ownerUserId: owner!.id,
    ownerHeaders: new Headers({ cookie: await sessionCookieFor(email) }),
  };
}

export type TestMember = { userId: string; memberId: string; headers: Headers };

export async function addMember(org: TestOrg, role: InvitableRole, name: string = role): Promise<TestMember> {
  const email = `${role.toLowerCase()}-${Date.now()}-${Math.random()}@example.test`;
  const invitation = await inviteMember({ email, role, organizationId: org.organizationId, headers: org.ownerHeaders });
  await auth.api.signUpEmail({ body: { email, password: PASSWORD, name } });
  const cookie = await sessionCookieFor(email);
  const user = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.email, email) });
  await acceptInvitation({ invitationId: invitation.id, userId: user!.id, headers: new Headers({ cookie }) });
  const membership = await db.query.member.findFirst({ where: (m, { eq }) => eq(m.userId, user!.id) });
  return { userId: user!.id, memberId: membership!.id, headers: new Headers({ cookie }) };
}
