import { and, eq, exists, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { contacts, customers, deals, user } from "@/server/db/schema";
import { toIsoDto, toMoneyDto } from "@/server/shared/dto";
import { buildPaginatedDto, resolvePagination } from "@/server/shared/pagination";
import { toCustomerDto, type CustomerDto } from "./dto";
import { contactColumns } from "./contacts";
import { normalizePhone } from "./phone";
import { primaryContact, primaryContactColumns, primaryContactJoin } from "./primary-contact";

// CUS-01 field contract. Input is untrusted (API-01: client can't set
// created_by/organization directly), validated here, not upstream.
//
// Empty/missing optional fields transform to null, not undefined. Drizzle's
// .set() treats an undefined value as "leave this column alone", so
// updateCustomer clearing a previously-set email/address/notes requires an
// explicit null; undefined would silently keep the stale value instead.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null);

// CUS-01: NPWP is 15 or 16 digits and may be typed with dots, dashes or spaces.
const taxIdSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value.replace(/[.\-\s]/g, "") : null))
  .refine((value) => value === null || /^[0-9]{15,16}$/.test(value), { message: "Tax ID must be 15 or 16 digits" });

// CUS-04: creating or editing a customer also writes its primary contact, so a
// prospect from WhatsApp needs only a name and a number. The contact's name
// defaults to the customer's; it needs a phone and/or an email.
const customerInputSchema = z
  .object({
    companyName: z.string().trim().min(1).max(200),
    taxId: taxIdSchema,
    contactPerson: z.string().trim().max(150).optional(),
    phone: optionalText(50),
    email: z
      .string()
      .trim()
      .email()
      .optional()
      .or(z.literal(""))
      .transform((value) => value || null),
    address: optionalText(2000),
    notes: optionalText(5000),
  })
  .refine((value) => value.phone !== null || value.email !== null, {
    message: "A contact needs a phone number or an email",
    path: ["phone"],
  });

// What createCustomer/updateCustomer write to the primary contact.
function contactValues(parsed: z.output<typeof customerInputSchema>) {
  return {
    name: parsed.contactPerson || parsed.companyName,
    ...contactColumns(parsed),
  };
}

/** One customer with its primary contact, scoped to the organization. */
async function readCustomer(executor: Pick<typeof db, "select">, organizationId: string, customerId: string) {
  const [row] = await executor
    .select({ customer: customers, contact: primaryContactColumns })
    .from(customers)
    .leftJoin(primaryContact, primaryContactJoin)
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, organizationId)));
  return row ? toCustomerDto(row.customer, row.contact) : null;
}

export async function createCustomer(params: { headers: Headers; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { customer: ["write"] } });
  const parsed = customerInputSchema.parse(params.input);
  const contact = contactValues(parsed);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(customers)
      .values({
        organizationId: actor.organizationId,
        companyName: parsed.companyName,
        taxId: parsed.taxId,
        address: parsed.address,
        notes: parsed.notes,
        createdById: actor.userId,
      })
      .returning();
    await tx.insert(contacts).values({
      organizationId: actor.organizationId,
      customerId: created.id,
      ...contact,
      isPrimary: true,
      createdById: actor.userId,
    });
    return (await readCustomer(tx, actor.organizationId, created.id))!;
  });
}

/**
 * TENANT-04: a customer that doesn't exist and a customer that belongs to a
 * different organization produce the identical NOT_FOUND, never a message
 * that reveals which case it was.
 *
 * DATA-07/API-01: optimistic concurrency via `version`, the same pattern
 * updateDeal uses -- `existing` is read first under full tenant scope so a
 * missing/cross-tenant row (NOT_FOUND) can be told apart from a stale
 * version on a row that does exist (CONFLICT).
 */
export async function updateCustomer(params: {
  headers: Headers;
  customerId: string;
  expectedVersion: number;
  input: unknown;
}) {
  const actor = await requirePermission({ headers: params.headers, permission: { customer: ["write"] } });
  const parsed = customerInputSchema.parse(params.input);
  const contact = contactValues(parsed);

  const existing = await db.query.customers.findFirst({
    where: and(eq(customers.id, params.customerId), eq(customers.organizationId, actor.organizationId)),
  });
  if (!existing) {
    throw new APIError("NOT_FOUND", { message: "Customer not found" });
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(customers)
      .set({
        companyName: parsed.companyName,
        taxId: parsed.taxId,
        address: parsed.address,
        notes: parsed.notes,
        updatedById: actor.userId,
        version: sql`${customers.version} + 1`,
      })
      .where(
        and(
          eq(customers.id, params.customerId),
          eq(customers.organizationId, actor.organizationId),
          eq(customers.version, params.expectedVersion),
        ),
      )
      .returning();

    if (!updated) {
      // existing was found above under the same tenant scope, so reaching
      // here means the version check failed, not a missing/cross-tenant row.
      throw new APIError("CONFLICT", { message: "Customer was modified by someone else, reload and try again" });
    }

    // The customer form edits the primary contact; the other contacts have
    // their own operations.
    await tx
      .update(contacts)
      .set({ ...contact, updatedById: actor.userId, version: sql`${contacts.version} + 1` })
      .where(and(eq(contacts.customerId, updated.id), eq(contacts.organizationId, actor.organizationId), eq(contacts.isPrimary, true)));

    return (await readCustomer(tx, actor.organizationId, updated.id))!;
  });
}

export async function getCustomer(params: { headers: Headers; customerId: string }) {
  const actor = await requirePermission({ headers: params.headers, permission: { customer: ["read"] } });
  const customer = await readCustomer(db, actor.organizationId, params.customerId);
  if (!customer) {
    throw new APIError("NOT_FOUND", { message: "Customer not found" });
  }
  return customer;
}

const listParamsSchema = z.object({
  // SEARCH-02: a query over 200 characters is rejected, not truncated.
  query: z.string().trim().max(200).optional(),
  sort: z.enum(["newest", "name"]).optional(),
});

// Backslash is Postgres' default LIKE escape character, so user input can't
// smuggle % or _ wildcards into the pattern (SEARCH-02: parameterized and
// literal).
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * SEARCH-01: company name, tax id, and the name, email and phone of any of the
 * customer's contacts, case-insensitive. A phone-looking query is also matched
 * against the normalized number, so "0812 3456" finds a contact stored as 62812....
 */
function searchCondition(term: string): SQL | undefined {
  if (!term) return undefined;
  const pattern = `%${escapeLike(term)}%`;
  const contactMatches: (SQL | undefined)[] = [
    ilike(contacts.name, pattern),
    ilike(contacts.email, pattern),
    ilike(contacts.phoneRaw, pattern),
  ];
  const digits = term.replace(/[^0-9]/g, "");
  if (digits.length >= 3 && /^[0-9\s+()\-.]+$/.test(term)) {
    const international = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
    contactMatches.push(ilike(contacts.phoneNormalized, `%${escapeLike(international)}%`));
  }
  const anyContact = exists(
    db
      .select({ one: sql`1` })
      .from(contacts)
      .where(and(eq(contacts.customerId, customers.id), eq(contacts.organizationId, customers.organizationId), or(...contactMatches))),
  );
  return or(ilike(customers.companyName, pattern), ilike(customers.taxId, pattern), anyContact);
}

export type CustomerListItemDto = CustomerDto & {
  // Finance only reads WON deals (§6.2), so for Finance only wonDeals is
  // filled in and the other two stay null instead of leaking counts of
  // deals Finance cannot open.
  activeDeals: number | null;
  totalDeals: number | null;
  wonDeals: number;
};

export async function listCustomers(params: {
  headers: Headers;
  page?: number;
  pageSize?: number;
  query?: string;
  sort?: "newest" | "name";
}) {
  const actor = await requirePermission({ headers: params.headers, permission: { customer: ["read"] } });
  const { page, pageSize, limit, offset } = resolvePagination(params);
  const { query, sort } = listParamsSchema.parse({ query: params.query, sort: params.sort });
  const isFinance = actor.role === "FINANCE";
  const where = and(eq(customers.organizationId, actor.organizationId), searchCondition(query ?? ""));

  const counts = db
    .select({
      customerId: deals.customerId,
      active: sql<number>`count(*) filter (where ${deals.status} not in ('WON', 'LOST'))`.mapWith(Number).as("active_deals"),
      won: sql<number>`count(*) filter (where ${deals.status} = 'WON')`.mapWith(Number).as("won_deals"),
      total: sql<number>`count(*)`.mapWith(Number).as("total_deals"),
    })
    .from(deals)
    .where(eq(deals.organizationId, actor.organizationId))
    .groupBy(deals.customerId)
    .as("deal_counts");

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        customer: customers,
        contact: primaryContactColumns,
        active: sql<number>`coalesce(${counts.active}, 0)`.mapWith(Number),
        won: sql<number>`coalesce(${counts.won}, 0)`.mapWith(Number),
        total: sql<number>`coalesce(${counts.total}, 0)`.mapWith(Number),
      })
      .from(customers)
      .leftJoin(primaryContact, primaryContactJoin)
      .leftJoin(counts, eq(counts.customerId, customers.id))
      .where(where)
      // SEARCH-02: stable sort -- id as a tie-breaker so ties never reorder
      // between pages.
      .orderBy(
        ...(sort === "name"
          ? [sql`lower(${customers.companyName}) asc`, customers.id]
          : [sql`${customers.createdAt} desc`, sql`${customers.id} desc`]),
      )
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(customers).where(where),
  ]);

  const items: CustomerListItemDto[] = rows.map((row) => ({
    ...toCustomerDto(row.customer, row.contact),
    activeDeals: isFinance ? null : row.active,
    totalDeals: isFinance ? null : row.total,
    wonDeals: row.won,
  }));
  return buildPaginatedDto(items, page, pageSize, count);
}

/**
 * CUS-02: a customer with the same name or number is warned about, never
 * rejected -- two real customers can share either. Used by the form, so it
 * needs the same permission as writing a customer.
 */
export async function findSimilarCustomers(params: {
  headers: Headers;
  companyName?: string;
  phone?: string;
  email?: string;
  taxId?: string;
  excludeCustomerId?: string;
}) {
  const actor = await requirePermission({ headers: params.headers, permission: { customer: ["write"] } });
  const input = z
    .object({
      companyName: z.string().trim().max(200).optional(),
      phone: z.string().trim().max(50).optional(),
      email: z.string().trim().max(320).optional(),
      taxId: z.string().trim().max(40).optional(),
    })
    .parse({ companyName: params.companyName, phone: params.phone, email: params.email, taxId: params.taxId });

  const matches: SQL[] = [];
  if (input.companyName) {
    matches.push(sql`lower(${customers.companyName}) = lower(${input.companyName})`);
  }
  const phoneNormalized = input.phone ? normalizePhone(input.phone) : null;
  if (phoneNormalized) {
    matches.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(contacts)
          .where(and(eq(contacts.customerId, customers.id), eq(contacts.organizationId, customers.organizationId), eq(contacts.phoneNormalized, phoneNormalized))),
      )!,
    );
  }
  // CUS-04: the email of any contact, and the NPWP, also count as the same customer.
  if (input.email && input.email.includes("@")) {
    matches.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(contacts)
          .where(and(eq(contacts.customerId, customers.id), eq(contacts.organizationId, customers.organizationId), sql`lower(${contacts.email}) = lower(${input.email})`)),
      )!,
    );
  }
  const taxDigits = input.taxId?.replace(/[.\-\s]/g, "");
  if (taxDigits && /^[0-9]{15,16}$/.test(taxDigits)) {
    matches.push(eq(customers.taxId, taxDigits));
  }
  if (matches.length === 0) return [];

  const rows = await db
    .select({ id: customers.id, companyName: customers.companyName, contactPerson: primaryContact.name })
    .from(customers)
    .leftJoin(primaryContact, primaryContactJoin)
    .where(
      and(
        eq(customers.organizationId, actor.organizationId),
        or(...matches),
        params.excludeCustomerId ? ne(customers.id, params.excludeCustomerId) : undefined,
      ),
    )
    .orderBy(customers.companyName)
    .limit(3);
  return rows.map((row) => ({ ...row, contactPerson: row.contactPerson ?? "" }));
}

export type CustomerDealDto = {
  id: string;
  title: string;
  status: string;
  estimatedValue: string;
  wonValue: string | null;
  lostReason: string | null;
  assignedToId: string;
  assignedToName: string;
  lastActivityAt: string;
};

const CUSTOMER_DEALS_LIMIT = 200;

/**
 * The "Deal customer" list on the customer page. Finance only reads WON
 * deals (§6.2), so for Finance every other deal is simply absent. A customer
 * that doesn't exist or isn't in the caller's organization is the same
 * NOT_FOUND (TENANT-04).
 */
export async function listCustomerDeals(params: { headers: Headers; customerId: string }): Promise<CustomerDealDto[]> {
  const actor = await requirePermission({ headers: params.headers, permission: { deal: ["read"] } });
  const customer = await db.query.customers.findFirst({
    where: and(eq(customers.id, params.customerId), eq(customers.organizationId, actor.organizationId)),
    columns: { id: true },
  });
  if (!customer) {
    throw new APIError("NOT_FOUND", { message: "Customer not found" });
  }

  const rows = await db
    .select({ deal: deals, assignedToName: user.name })
    .from(deals)
    .innerJoin(user, eq(user.id, deals.assignedToId))
    .where(
      and(
        eq(deals.organizationId, actor.organizationId),
        eq(deals.customerId, params.customerId),
        actor.role === "FINANCE" ? eq(deals.status, "WON") : undefined,
      ),
    )
    .orderBy(sql`${deals.lastActivityAt} desc`, sql`${deals.id} desc`)
    .limit(CUSTOMER_DEALS_LIMIT);

  return rows.map(({ deal, assignedToName }) => ({
    id: deal.id,
    title: deal.title,
    status: deal.status,
    estimatedValue: toMoneyDto(deal.estimatedValue),
    wonValue: deal.wonValue !== null ? toMoneyDto(deal.wonValue) : null,
    lostReason: deal.lostReason,
    assignedToId: deal.assignedToId,
    assignedToName,
    lastActivityAt: toIsoDto(deal.lastActivityAt),
  }));
}

export type CustomerOptionDto = { id: string; companyName: string; contactPerson: string };

const OPTION_LIMIT = 8;

/**
 * The customer picker on deal forms and filters: a handful of matches for
 * what the user has typed so far, never the whole table (SEARCH-02). An empty
 * query returns the most recently added customers.
 */
export async function searchCustomerOptions(params: { headers: Headers; query?: string }): Promise<CustomerOptionDto[]> {
  const actor = await requirePermission({ headers: params.headers, permission: { customer: ["read"] } });
  const { query } = listParamsSchema.parse({ query: params.query });
  const rows = await db
    .select({ id: customers.id, companyName: customers.companyName, contactPerson: primaryContact.name })
    .from(customers)
    .leftJoin(primaryContact, primaryContactJoin)
    .where(and(eq(customers.organizationId, actor.organizationId), searchCondition(query ?? "")))
    .orderBy(query ? sql`lower(${customers.companyName}) asc` : sql`${customers.createdAt} desc`, customers.id)
    .limit(OPTION_LIMIT);
  return rows.map((row) => ({ ...row, contactPerson: row.contactPerson ?? "" }));
}
