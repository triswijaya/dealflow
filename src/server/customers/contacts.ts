import { and, asc, desc, eq, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { contacts, customers, deals } from "@/server/db/schema";
import { toIsoDto } from "@/server/shared/dto";
import { normalizePhone } from "./phone";

// CUS-04: the people at a customer. Exactly one is primary (a unique index
// enforces it); the customer's own contact details are the primary contact's.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null);

export const contactInputSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    role: optionalText(100),
    phone: optionalText(50),
    email: z
      .string()
      .trim()
      .email()
      .optional()
      .or(z.literal(""))
      .transform((value) => value || null),
  })
  .refine((value) => value.phone !== null || value.email !== null, {
    message: "A contact needs a phone number or an email",
    path: ["phone"],
  });

export function normalizeOrThrow(phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    throw new APIError("BAD_REQUEST", { message: "Invalid phone number" });
  }
  return normalized;
}

/** The columns a contact's phone and email occupy, from validated input. */
export function contactColumns(parsed: { phone: string | null; email: string | null }) {
  return {
    phoneRaw: parsed.phone,
    phoneNormalized: parsed.phone ? normalizeOrThrow(parsed.phone) : null,
    email: parsed.email,
  };
}

export type ContactDto = {
  id: string;
  customerId: string;
  name: string;
  role: string | null;
  phoneRaw: string | null;
  phoneNormalized: string | null;
  email: string | null;
  isPrimary: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type ContactRow = typeof contacts.$inferSelect;

export function toContactDto(row: ContactRow): ContactDto {
  return {
    id: row.id,
    customerId: row.customerId,
    name: row.name,
    role: row.role,
    phoneRaw: row.phoneRaw,
    phoneNormalized: row.phoneNormalized,
    email: row.email,
    isPrimary: row.isPrimary,
    version: row.version,
    createdAt: toIsoDto(row.createdAt),
    updatedAt: toIsoDto(row.updatedAt),
  };
}

async function assertCustomer(organizationId: string, customerId: string) {
  const customer = await db.query.customers.findFirst({
    where: and(eq(customers.id, customerId), eq(customers.organizationId, organizationId)),
    columns: { id: true },
  });
  if (!customer) {
    throw new APIError("NOT_FOUND", { message: "Customer not found" });
  }
}

async function findContact(organizationId: string, contactId: string) {
  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, contactId), eq(contacts.organizationId, organizationId)),
  });
  if (!contact) {
    throw new APIError("NOT_FOUND", { message: "Contact not found" });
  }
  return contact;
}

/** The primary contact first, then the others by name. A customer that is not the caller's is NOT_FOUND (TENANT-04). */
export async function listContacts(params: { headers: Headers; customerId: string }): Promise<ContactDto[]> {
  const actor = await requirePermission({ headers: params.headers, permission: { customer: ["read"] } });
  await assertCustomer(actor.organizationId, params.customerId);
  const rows = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.organizationId, actor.organizationId), eq(contacts.customerId, params.customerId)))
    .orderBy(desc(contacts.isPrimary), asc(sql`lower(${contacts.name})`), asc(contacts.id));
  return rows.map(toContactDto);
}

/** A new contact is never primary: use setPrimaryContact to change who is. */
export async function createContact(params: { headers: Headers; customerId: string; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { customer: ["write"] } });
  const parsed = contactInputSchema.parse(params.input);
  const columns = contactColumns(parsed);
  await assertCustomer(actor.organizationId, params.customerId);

  const [created] = await db
    .insert(contacts)
    .values({
      organizationId: actor.organizationId,
      customerId: params.customerId,
      name: parsed.name,
      role: parsed.role,
      ...columns,
      isPrimary: false,
      createdById: actor.userId,
    })
    .returning();
  return toContactDto(created);
}

/**
 * DATA-07: optimistic concurrency, like customers. Editing the primary contact
 * changes what the customer shows, so the customer's version moves too: a
 * customer form opened before the change then conflicts instead of
 * overwriting it.
 */
export async function updateContact(params: { headers: Headers; contactId: string; expectedVersion: number; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { customer: ["write"] } });
  const parsed = contactInputSchema.parse(params.input);
  const columns = contactColumns(parsed);
  const existing = await findContact(actor.organizationId, params.contactId);

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(contacts)
      .set({ name: parsed.name, role: parsed.role, ...columns, updatedById: actor.userId, version: sql`${contacts.version} + 1` })
      .where(and(eq(contacts.id, existing.id), eq(contacts.organizationId, actor.organizationId), eq(contacts.version, params.expectedVersion)))
      .returning();
    if (!updated) {
      throw new APIError("CONFLICT", { message: "Contact was modified by someone else, reload and try again" });
    }
    if (updated.isPrimary) await bumpCustomer(tx, actor, updated.customerId);
    return toContactDto(updated);
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function bumpCustomer(tx: Tx, actor: { organizationId: string; userId: string }, customerId: string) {
  await tx
    .update(customers)
    .set({ updatedById: actor.userId, version: sql`${customers.version} + 1` })
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, actor.organizationId)));
}

/**
 * Makes this contact the customer's primary one and demotes the current one.
 * The customer row is locked first so two swaps cannot interleave; the old
 * primary is cleared before the new one is set because the unique index
 * allows only one at any statement boundary. Choosing the contact that is
 * already primary changes nothing.
 */
export async function setPrimaryContact(params: { headers: Headers; contactId: string; expectedVersion: number }) {
  const actor = await requirePermission({ headers: params.headers, permission: { customer: ["write"] } });
  const existing = await findContact(actor.organizationId, params.contactId);

  return db.transaction(async (tx) => {
    await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, existing.customerId), eq(customers.organizationId, actor.organizationId)))
      .for("update");

    const [current] = await tx
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, existing.id), eq(contacts.organizationId, actor.organizationId)));
    if (!current) {
      throw new APIError("NOT_FOUND", { message: "Contact not found" });
    }
    if (current.isPrimary) {
      return toContactDto(current);
    }
    if (current.version !== params.expectedVersion) {
      throw new APIError("CONFLICT", { message: "Contact was modified by someone else, reload and try again" });
    }

    await tx
      .update(contacts)
      .set({ isPrimary: false, updatedById: actor.userId, version: sql`${contacts.version} + 1` })
      .where(and(eq(contacts.customerId, current.customerId), eq(contacts.organizationId, actor.organizationId), eq(contacts.isPrimary, true)));
    const [promoted] = await tx
      .update(contacts)
      .set({ isPrimary: true, updatedById: actor.userId, version: sql`${contacts.version} + 1` })
      .where(and(eq(contacts.id, current.id), eq(contacts.organizationId, actor.organizationId)))
      .returning();
    await bumpCustomer(tx, actor, current.customerId);
    return toContactDto(promoted);
  });
}

/**
 * The primary contact cannot be deleted (a customer always has one), and neither
 * can a contact a deal points at: clear it on the deal first.
 */
export async function deleteContact(params: { headers: Headers; contactId: string; expectedVersion: number }) {
  const actor = await requirePermission({ headers: params.headers, permission: { customer: ["write"] } });
  const existing = await findContact(actor.organizationId, params.contactId);
  if (existing.isPrimary) {
    throw new APIError("BAD_REQUEST", { message: "The primary contact cannot be deleted, make another contact primary first" });
  }

  return db.transaction(async (tx) => {
    const [usedBy] = await tx
      .select({ id: deals.id })
      .from(deals)
      .where(and(eq(deals.organizationId, actor.organizationId), eq(deals.contactId, existing.id)))
      .limit(1);
    if (usedBy) {
      throw new APIError("BAD_REQUEST", { message: "This contact is the contact of a deal and cannot be deleted" });
    }
    const [deleted] = await tx
      .delete(contacts)
      .where(and(eq(contacts.id, existing.id), eq(contacts.organizationId, actor.organizationId), eq(contacts.version, params.expectedVersion), eq(contacts.isPrimary, false)))
      .returning({ id: contacts.id });
    if (!deleted) {
      throw new APIError("CONFLICT", { message: "Contact was modified by someone else, reload and try again" });
    }
    return { id: deleted.id };
  });
}

/** The deal's contact when it has a phone, else the customer's primary contact when it does (WA-01). */
export async function findWhatsAppContact(organizationId: string, deal: { customerId: string; contactId: string | null }) {
  const candidates = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.organizationId, organizationId), eq(contacts.customerId, deal.customerId)));
  const dealContact = deal.contactId ? candidates.find((contact) => contact.id === deal.contactId) : undefined;
  const primary = candidates.find((contact) => contact.isPrimary);
  return [dealContact, primary].find((contact) => contact?.phoneNormalized) ?? null;
}
