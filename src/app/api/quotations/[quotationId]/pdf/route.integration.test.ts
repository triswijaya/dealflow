import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { auth } from "@/server/auth/auth";
import { inviteMember, acceptInvitation } from "@/server/auth/members";
import { registerOwner } from "@/server/auth/register-owner";
import { createCustomer } from "@/server/customers/customers";
import { createDeal } from "@/server/deals/deals";
import { db } from "@/server/db/client";
import { createQuotation } from "@/server/quotations/quotations";
import { GET } from "./route";

async function sessionCookieFor(email: string, password: string): Promise<string> {
  // signIn.token (the JSON body) is not the same value the cookie needs; see
  // deals.integration.test.ts for the full explanation.
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("sign-in did not return a session cookie");
  }
  return setCookie.split(";")[0];
}

function pdfRequest(quotationId: string, cookie?: string) {
  const request = new Request(`http://localhost:3000/api/quotations/${quotationId}/pdf`, {
    headers: cookie ? { cookie } : {},
  });
  const ctx = { params: Promise.resolve({ quotationId }) };
  return GET(request, ctx);
}

describe("GET /api/quotations/[quotationId]/pdf", () => {
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

  async function setupOwnerWithQuotation() {
    const ownerEmail = `owner-${Date.now()}-${Math.random()}@example.test`;
    const password = "correct-horse-battery-staple";
    const { organizationId, userId } = await registerOwner({
      email: ownerEmail,
      password,
      name: "Owner",
      companyName: `PDF Route Co ${Date.now()}`,
    });
    const ownerCookie = await sessionCookieFor(ownerEmail, password);
    const customer = await createCustomer({
      headers: new Headers({ cookie: ownerCookie }),
      input: { companyName: "PT Maju Jaya", contactPerson: "Budi Santoso", phone: "08123456789" },
    });
    const deal = await createDeal({
      headers: new Headers({ cookie: ownerCookie }),
      input: {
        customerId: customer.id,
        title: "CCTV Installation - Bekasi",
        estimatedValue: "30000000",
        assignedToId: userId,
      },
    });
    const quotation = await createQuotation({
      headers: new Headers({ cookie: ownerCookie }),
      input: {
        dealId: deal.id,
        validUntil: "2099-12-31",
        items: [{ description: "CCTV Camera 4MP", quantity: "4", unit: "pcs", unitPrice: "1500000" }],
      },
    });
    return { organizationId, ownerCookie, quotationId: quotation.id, quotationNumber: quotation.quotationNumber };
  }

  it("returns a real PDF for an authorized request (PDF-04)", async () => {
    const { ownerCookie, quotationId, quotationNumber } = await setupOwnerWithQuotation();

    const response = await pdfRequest(quotationId, ownerCookie);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(quotationNumber);
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("rejects a request with no session (401)", async () => {
    const { quotationId } = await setupOwnerWithQuotation();
    const response = await pdfRequest(quotationId);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("hides a quotation from a different organization behind 404, not 403 (TENANT-04)", async () => {
    const orgA = await setupOwnerWithQuotation();
    const orgB = await setupOwnerWithQuotation();

    const response = await pdfRequest(orgA.quotationId, orgB.ownerCookie);
    expect(response.status).toBe(404);
  });

  it("rejects FINANCE, who has no quotation permission at all (§6.2)", async () => {
    const owner = await setupOwnerWithQuotation();
    const email = `finance-${Date.now()}-${Math.random()}@example.test`;
    const password = "correct-horse-battery-staple";
    const invite = await inviteMember({
      email,
      role: "FINANCE",
      organizationId: owner.organizationId,
      headers: new Headers({ cookie: owner.ownerCookie }),
    });
    await auth.api.signUpEmail({ body: { email, password, name: "Finance" } });
    const financeCookie = await sessionCookieFor(email, password);
    const user = await db.query.user.findFirst({ where: (u, { eq: eqOp }) => eqOp(u.email, email) });
    await acceptInvitation({ invitationId: invite.id, userId: user!.id, headers: new Headers({ cookie: financeCookie }) });

    const response = await pdfRequest(owner.quotationId, financeCookie);
    expect(response.status).toBe(403);
  });

  it("returns 404 for a nonexistent quotation id rather than a raw crash", async () => {
    const { ownerCookie } = await setupOwnerWithQuotation();
    const response = await pdfRequest("00000000-0000-0000-0000-000000000000", ownerCookie);
    expect(response.status).toBe(404);
  });
});
