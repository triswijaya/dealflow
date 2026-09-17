import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "@/server/auth/auth";
import { inviteMember, acceptInvitation } from "@/server/auth/members";
import { registerOwner } from "@/server/auth/register-owner";
import { createCustomer, getCustomer, listCustomers, updateCustomer } from "./customers";
import { db } from "@/server/db/client";
import { customers } from "@/server/db/schema";

async function sessionCookieFor(email: string, password: string): Promise<string> {
  // signIn.token (the JSON body) is not the same value the cookie needs; the
  // cookie carries an HMAC signature suffix the JSON response doesn't
  // include. Using signIn.token directly produces a cookie that silently
  // fails to authenticate (getSession returns null), not an error, so this
  // must go through the actual Set-Cookie header.
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("sign-in did not return a session cookie");
  }
  return setCookie.split(";")[0];
}

describe("customers", () => {
  let migrationClient: ReturnType<typeof postgres>;

  beforeAll(async () => {
    const migrationUrl = process.env.DATABASE_MIGRATION_URL;
    if (!migrationUrl) {
      throw new Error("DATABASE_MIGRATION_URL must be set to run integration tests");
    }
    migrationClient = postgres(migrationUrl, { max: 1 });
    await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });
  });

  afterAll(async () => {
    await migrationClient.end();
  });

  async function setupOwner() {
    const ownerEmail = `owner-${Date.now()}-${Math.random()}@example.test`;
    const password = "correct-horse-battery-staple";
    const { organizationId } = await registerOwner({
      email: ownerEmail,
      password,
      name: "Owner",
      companyName: `Customer Co ${Date.now()}`,
    });
    const cookie = await sessionCookieFor(ownerEmail, password);
    return { organizationId, ownerCookie: cookie };
  }

  async function setupOwnerAndMember(role: "SALES" | "FINANCE") {
    const owner = await setupOwner();
    const memberEmail = `${role.toLowerCase()}-${Date.now()}-${Math.random()}@example.test`;
    const memberPassword = "correct-horse-battery-staple";
    const invite = await inviteMember({
      email: memberEmail,
      role,
      organizationId: owner.organizationId,
      headers: new Headers({ cookie: owner.ownerCookie }),
    });
    await auth.api.signUpEmail({ body: { email: memberEmail, password: memberPassword, name: "Invitee" } });
    const memberCookie = await sessionCookieFor(memberEmail, memberPassword);
    await acceptInvitation({
      invitationId: invite.id,
      userId: (await db.query.user.findFirst({ where: (u, { eq: eqOp }) => eqOp(u.email, memberEmail) }))!.id,
      headers: new Headers({ cookie: memberCookie }),
    });
    return { ...owner, memberCookie };
  }

  const validInput = {
    companyName: "PT Maju Jaya",
    contactPerson: "Budi Santoso",
    phone: "08123456789",
    email: "budi@example.com",
    address: "Jl. Sudirman No. 1",
    notes: "Prospek CCTV gudang",
  };

  it("creates a customer and normalizes the phone number", async () => {
    const { ownerCookie } = await setupOwner();
    const created = await createCustomer({ headers: new Headers({ cookie: ownerCookie }), input: validInput });

    expect(created.companyName).toBe("PT Maju Jaya");
    expect(created.phoneRaw).toBe("08123456789");
    expect(created.phoneNormalized).toBe("628123456789");
    expect(created.email).toBe("budi@example.com");
  });

  it("allows SALES to create a customer", async () => {
    const { organizationId, memberCookie } = await setupOwnerAndMember("SALES");
    const created = await createCustomer({ headers: new Headers({ cookie: memberCookie }), input: validInput });
    expect(created.organizationId).toBe(organizationId);
  });

  it("rejects FINANCE creating a customer, but allows FINANCE to read", async () => {
    const { ownerCookie, memberCookie } = await setupOwnerAndMember("FINANCE");
    await expect(
      createCustomer({ headers: new Headers({ cookie: memberCookie }), input: validInput }),
    ).rejects.toThrow();

    const created = await createCustomer({ headers: new Headers({ cookie: ownerCookie }), input: validInput });
    const readByFinance = await getCustomer({
      headers: new Headers({ cookie: memberCookie }),
      customerId: created.id,
    });
    expect(readByFinance.id).toBe(created.id);
  });

  it("rejects an invalid email format", async () => {
    const { ownerCookie } = await setupOwner();
    await expect(
      createCustomer({
        headers: new Headers({ cookie: ownerCookie }),
        input: { ...validInput, email: "not-an-email" },
      }),
    ).rejects.toThrow();
  });

  it("rejects a missing required field", async () => {
    const { ownerCookie } = await setupOwner();
    await expect(
      createCustomer({ headers: new Headers({ cookie: ownerCookie }), input: { ...validInput, companyName: "" } }),
    ).rejects.toThrow();
  });

  it("rejects a phone number with no leading 0 and no country code", async () => {
    const { ownerCookie } = await setupOwner();
    await expect(
      createCustomer({ headers: new Headers({ cookie: ownerCookie }), input: { ...validInput, phone: "8123456789" } }),
    ).rejects.toThrow(/phone/i);
  });

  it("updates a customer and records who updated it", async () => {
    const { ownerCookie } = await setupOwner();
    const created = await createCustomer({ headers: new Headers({ cookie: ownerCookie }), input: validInput });

    const updated = await updateCustomer({
      headers: new Headers({ cookie: ownerCookie }),
      customerId: created.id,
      input: { ...validInput, companyName: "PT Maju Jaya Sentosa" },
    });

    expect(updated.companyName).toBe("PT Maju Jaya Sentosa");
    expect(updated.updatedById).toBeTruthy();
  });

  it("returns not-found for a customer in a different organization (TENANT-04), on both read and update", async () => {
    const orgA = await setupOwner();
    const orgB = await setupOwner();
    const created = await createCustomer({ headers: new Headers({ cookie: orgA.ownerCookie }), input: validInput });

    await expect(
      getCustomer({ headers: new Headers({ cookie: orgB.ownerCookie }), customerId: created.id }),
    ).rejects.toThrow(/not found/i);

    await expect(
      updateCustomer({
        headers: new Headers({ cookie: orgB.ownerCookie }),
        customerId: created.id,
        input: validInput,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("scopes listCustomers to the caller's own organization only", async () => {
    const orgA = await setupOwner();
    const orgB = await setupOwner();
    await createCustomer({ headers: new Headers({ cookie: orgA.ownerCookie }), input: validInput });
    await createCustomer({
      headers: new Headers({ cookie: orgB.ownerCookie }),
      input: { ...validInput, companyName: "PT Lain" },
    });

    const listA = await listCustomers({ headers: new Headers({ cookie: orgA.ownerCookie }) });
    expect(listA).toHaveLength(1);
    expect(listA[0]?.companyName).toBe("PT Maju Jaya");

    const dbCountA = await db.query.customers.findMany({
      where: and(eq(customers.organizationId, orgA.organizationId), eq(customers.companyName, "PT Lain")),
    });
    expect(dbCountA).toHaveLength(0);
  });
});
