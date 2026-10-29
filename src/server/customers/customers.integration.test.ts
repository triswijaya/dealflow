import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "@/server/auth/auth";
import { inviteMember, acceptInvitation } from "@/server/auth/members";
import { registerOwner } from "@/server/auth/register-owner";
import { createDeal, transitionDeal } from "@/server/deals/deals";
import {
  createCustomer,
  findSimilarCustomers,
  getCustomer,
  listCustomerDeals,
  listCustomers,
  updateCustomer,
} from "./customers";
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
      expectedVersion: created.version,
      input: { ...validInput, companyName: "PT Maju Jaya Sentosa" },
    });

    expect(updated.companyName).toBe("PT Maju Jaya Sentosa");
    expect(updated.updatedById).toBeTruthy();
    expect(updated.version).toBe(2);
  });

  it("rejects an update with a stale version (DATA-07/API-01)", async () => {
    const { ownerCookie } = await setupOwner();
    const created = await createCustomer({ headers: new Headers({ cookie: ownerCookie }), input: validInput });
    await updateCustomer({
      headers: new Headers({ cookie: ownerCookie }),
      customerId: created.id,
      expectedVersion: created.version,
      input: { ...validInput, companyName: "First update" },
    });

    await expect(
      updateCustomer({
        headers: new Headers({ cookie: ownerCookie }),
        customerId: created.id,
        expectedVersion: created.version, // stale: already consumed above
        input: { ...validInput, companyName: "Second update" },
      }),
    ).rejects.toThrow(/modified by someone else/);
  });

  it("actually clears email/address/notes when the update omits them, not silently keeping the old value", async () => {
    const { ownerCookie } = await setupOwner();
    const created = await createCustomer({ headers: new Headers({ cookie: ownerCookie }), input: validInput });
    expect(created.email).toBe("budi@example.com");
    expect(created.address).toBeTruthy();
    expect(created.notes).toBeTruthy();

    const { email, address, notes, ...withoutOptionalFields } = validInput;
    void email;
    void address;
    void notes;
    const cleared = await updateCustomer({
      headers: new Headers({ cookie: ownerCookie }),
      customerId: created.id,
      expectedVersion: created.version,
      input: withoutOptionalFields,
    });

    expect(cleared.email).toBeNull();
    expect(cleared.address).toBeNull();
    expect(cleared.notes).toBeNull();
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
        expectedVersion: created.version,
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
    expect(listA.items).toHaveLength(1);
    expect(listA.items[0]?.companyName).toBe("PT Maju Jaya");
    // TENANT-04: the paginated count itself must not leak org B's row into
    // org A's total, not just the returned items array.
    expect(listA.totalItems).toBe(1);

    const dbCountA = await db.query.customers.findMany({
      where: and(eq(customers.organizationId, orgA.organizationId), eq(customers.companyName, "PT Lain")),
    });
    expect(dbCountA).toHaveLength(0);
  });

  it("paginates listCustomers: correct slice, totalItems, and totalPages across pages (SEARCH-02)", async () => {
    const owner = await setupOwner();
    for (const companyName of ["PT Satu", "PT Dua", "PT Tiga", "PT Empat", "PT Lima"]) {
      await createCustomer({ headers: new Headers({ cookie: owner.ownerCookie }), input: { ...validInput, companyName } });
      // createdAt has millisecond resolution; a tiny gap keeps the default
      // desc(createdAt) order deterministic across the 5 inserts instead
      // of relying only on the id tie-breaker to separate same-instant rows.
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const pageOne = await listCustomers({ headers: new Headers({ cookie: owner.ownerCookie }), page: 1, pageSize: 2 });
    expect(pageOne.items).toHaveLength(2);
    expect(pageOne.page).toBe(1);
    expect(pageOne.pageSize).toBe(2);
    expect(pageOne.totalItems).toBe(5);
    expect(pageOne.totalPages).toBe(3);
    // Most recently created first (desc createdAt).
    expect(pageOne.items.map((c) => c.companyName)).toEqual(["PT Lima", "PT Empat"]);

    const pageTwo = await listCustomers({ headers: new Headers({ cookie: owner.ownerCookie }), page: 2, pageSize: 2 });
    expect(pageTwo.items.map((c) => c.companyName)).toEqual(["PT Tiga", "PT Dua"]);

    const pageThree = await listCustomers({ headers: new Headers({ cookie: owner.ownerCookie }), page: 3, pageSize: 2 });
    expect(pageThree.items.map((c) => c.companyName)).toEqual(["PT Satu"]);

    // Past the last page: empty, not an error.
    const pageFour = await listCustomers({ headers: new Headers({ cookie: owner.ownerCookie }), page: 4, pageSize: 2 });
    expect(pageFour.items).toHaveLength(0);
    expect(pageFour.totalItems).toBe(5);
  });

  it("rejects a pageSize over the MAX_PAGE_SIZE ceiling (API-04)", async () => {
    const owner = await setupOwner();
    await expect(listCustomers({ headers: new Headers({ cookie: owner.ownerCookie }), pageSize: 101 })).rejects.toThrow();
  });
  describe("search, counts and duplicates", () => {
    async function ownerUserIdOf(organizationId: string) {
      const row = await db.query.member.findFirst({
        where: (m, { and: andOp, eq: eqOp }) => andOp(eqOp(m.organizationId, organizationId), eqOp(m.role, "OWNER")),
      });
      return row!.userId;
    }

    const asHeaders = (cookie: string) => new Headers({ cookie });

    it("searches name, contact, email and phone case-insensitively (SEARCH-01)", async () => {
      const { ownerCookie } = await setupOwner();
      const headers = asHeaders(ownerCookie);
      await createCustomer({ headers, input: { ...validInput, companyName: "PT Maju Jaya", contactPerson: "Budi Santoso", phone: "0812 3456 789", email: "budi@majujaya.example" } });
      await createCustomer({ headers, input: { ...validInput, companyName: "CV Cahaya Abadi", contactPerson: "Yoga Pranata", phone: "+62 815 6789 012", email: "yoga@cahayaabadi.example" } });

      const names = async (query: string) => (await listCustomers({ headers, query })).items.map((c) => c.companyName);

      expect(await names("maju")).toEqual(["PT Maju Jaya"]);
      expect(await names("PRANATA")).toEqual(["CV Cahaya Abadi"]);
      expect(await names("yoga@cahaya")).toEqual(["CV Cahaya Abadi"]);
      // Local format, international format and partial digits all reach the same number.
      expect(await names("0812 3456")).toEqual(["PT Maju Jaya"]);
      expect(await names("+62812")).toEqual(["PT Maju Jaya"]);
      expect(await names("815")).toEqual(["CV Cahaya Abadi"]);
      expect(await names("")).toHaveLength(2);
      expect(await names("tidak ada")).toEqual([]);
    });

    it("treats % and _ in the query literally, not as wildcards", async () => {
      const { ownerCookie } = await setupOwner();
      const headers = asHeaders(ownerCookie);
      await createCustomer({ headers, input: { ...validInput, companyName: "PT Satu" } });
      await createCustomer({ headers, input: { ...validInput, companyName: "PT 100% Aman" } });

      expect((await listCustomers({ headers, query: "%" })).items.map((c) => c.companyName)).toEqual(["PT 100% Aman"]);
      expect((await listCustomers({ headers, query: "_" })).items).toHaveLength(0);
    });

    it("rejects a query over 200 characters (SEARCH-02)", async () => {
      const { ownerCookie } = await setupOwner();
      await expect(listCustomers({ headers: asHeaders(ownerCookie), query: "a".repeat(201) })).rejects.toThrow();
    });

    it("sorts by name when asked and keeps totalItems tied to the search", async () => {
      const { ownerCookie } = await setupOwner();
      const headers = asHeaders(ownerCookie);
      for (const companyName of ["PT Zeta", "PT alfa", "PT Mega"]) {
        await createCustomer({ headers, input: { ...validInput, companyName } });
      }
      const sorted = await listCustomers({ headers, sort: "name" });
      expect(sorted.items.map((c) => c.companyName)).toEqual(["PT alfa", "PT Mega", "PT Zeta"]);

      const filtered = await listCustomers({ headers, query: "PT", pageSize: 2 });
      expect(filtered.totalItems).toBe(3);
      expect(filtered.totalPages).toBe(2);
    });

    it("never returns another organization's customers from a search (TENANT-04)", async () => {
      const first = await setupOwner();
      const second = await setupOwner();
      await createCustomer({ headers: asHeaders(first.ownerCookie), input: { ...validInput, companyName: "PT Rahasia Sekali" } });

      const result = await listCustomers({ headers: asHeaders(second.ownerCookie), query: "Rahasia" });
      expect(result.items).toHaveLength(0);
      expect(result.totalItems).toBe(0);
    });

    it("counts active, won and total deals per customer, and shows Finance only won deals", async () => {
      const { organizationId, ownerCookie, memberCookie } = await setupOwnerAndMember("FINANCE");
      const headers = asHeaders(ownerCookie);
      const ownerUserId = await ownerUserIdOf(organizationId);
      const customer = await createCustomer({ headers, input: validInput });
      const empty = await createCustomer({ headers, input: { ...validInput, companyName: "PT Tanpa Deal", phone: "08111111111" } });

      const newDeal = (title: string) =>
        createDeal({ headers, input: { customerId: customer.id, title, estimatedValue: "1000000", assignedToId: ownerUserId } });
      await newDeal("Aktif satu");
      await newDeal("Aktif dua");
      let won = await newDeal("Akan menang");
      for (const toStatus of ["PROPOSAL", "NEGOTIATION", "COMMITMENT", "WON"] as const) {
        won = await transitionDeal({ headers, dealId: won.id, expectedVersion: won.version, input: { toStatus } });
      }
      const lost = await newDeal("Akan kalah");
      await transitionDeal({ headers, dealId: lost.id, expectedVersion: lost.version, input: { toStatus: "LOST", lostReason: "OTHER" } });

      const owner = (await listCustomers({ headers })).items;
      const withDeals = owner.find((c) => c.id === customer.id)!;
      expect([withDeals.activeDeals, withDeals.wonDeals, withDeals.totalDeals]).toEqual([2, 1, 4]);
      const without = owner.find((c) => c.id === empty.id)!;
      expect([without.activeDeals, without.wonDeals, without.totalDeals]).toEqual([0, 0, 0]);

      const finance = (await listCustomers({ headers: asHeaders(memberCookie) })).items.find((c) => c.id === customer.id)!;
      expect(finance.wonDeals).toBe(1);
      expect(finance.activeDeals).toBeNull();
      expect(finance.totalDeals).toBeNull();

      const ownerDeals = await listCustomerDeals({ headers, customerId: customer.id });
      expect(ownerDeals).toHaveLength(4);
      expect(ownerDeals.every((d) => d.assignedToName === "Owner")).toBe(true);
      const financeDeals = await listCustomerDeals({ headers: asHeaders(memberCookie), customerId: customer.id });
      expect(financeDeals.map((d) => d.title)).toEqual(["Akan menang"]);
      expect(financeDeals[0]?.wonValue).toBe("1000000");
    });

    it("returns NOT_FOUND for another organization's customer deals (TENANT-04)", async () => {
      const first = await setupOwner();
      const second = await setupOwner();
      const customer = await createCustomer({ headers: asHeaders(first.ownerCookie), input: validInput });
      await expect(listCustomerDeals({ headers: asHeaders(second.ownerCookie), customerId: customer.id })).rejects.toThrow(
        /not found/i,
      );
    });

    it("warns about a similar name or number without blocking, ignoring the customer being edited", async () => {
      const first = await setupOwner();
      const headers = asHeaders(first.ownerCookie);
      const existing = await createCustomer({ headers, input: validInput });

      const byName = await findSimilarCustomers({ headers, companyName: "  pt MAJU jaya " });
      expect(byName.map((c) => c.id)).toEqual([existing.id]);

      const byPhone = await findSimilarCustomers({ headers, phone: "+62 812-3456-789" });
      expect(byPhone.map((c) => c.id)).toEqual([existing.id]);

      expect(await findSimilarCustomers({ headers, companyName: "PT Maju Jaya", excludeCustomerId: existing.id })).toEqual([]);
      expect(await findSimilarCustomers({ headers, companyName: "PT Lain", phone: "0899" })).toEqual([]);
      expect(await findSimilarCustomers({ headers })).toEqual([]);

      // Saving a duplicate stays allowed (CUS-02).
      const duplicate = await createCustomer({ headers, input: validInput });
      expect(duplicate.id).not.toBe(existing.id);

      const other = await setupOwner();
      expect(await findSimilarCustomers({ headers: asHeaders(other.ownerCookie), companyName: "PT Maju Jaya" })).toEqual([]);
    });

    it("keeps the duplicate check to roles that can write customers", async () => {
      const { memberCookie } = await setupOwnerAndMember("FINANCE");
      await expect(findSimilarCustomers({ headers: asHeaders(memberCookie), companyName: "PT Maju Jaya" })).rejects.toThrow();
    });
  });
});
