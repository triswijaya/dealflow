import { and, eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { customers } from "@/server/db/schema";
import { normalizePhone } from "./phone";

// CUS-01 field contract. Input is untrusted (API-01: client can't set
// created_by/organization directly), validated here, not upstream.
//
// Empty/missing optional fields transform to null, not undefined. Drizzle's
// .set() treats an undefined value as "leave this column alone", so
// updateCustomer clearing a previously-set email/address/notes requires an
// explicit null; undefined would silently keep the stale value instead.
const customerInputSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  contactPerson: z.string().trim().min(1).max(150),
  phone: z.string().trim().min(1),
  email: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null),
  address: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null),
  notes: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null),
});

function normalizeOrThrow(phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    throw new APIError("BAD_REQUEST", { message: "Invalid phone number" });
  }
  return normalized;
}

export async function createCustomer(params: { headers: Headers; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { customer: ["write"] } });
  const parsed = customerInputSchema.parse(params.input);
  const phoneNormalized = normalizeOrThrow(parsed.phone);

  const [created] = await db
    .insert(customers)
    .values({
      organizationId: actor.organizationId,
      companyName: parsed.companyName,
      contactPerson: parsed.contactPerson,
      phoneRaw: parsed.phone,
      phoneNormalized,
      email: parsed.email,
      address: parsed.address,
      notes: parsed.notes,
      createdById: actor.userId,
    })
    .returning();
  return created;
}

/**
 * TENANT-04: a customer that doesn't exist and a customer that belongs to a
 * different organization produce the identical NOT_FOUND, never a message
 * that reveals which case it was.
 */
export async function updateCustomer(params: { headers: Headers; customerId: string; input: unknown }) {
  const actor = await requirePermission({ headers: params.headers, permission: { customer: ["write"] } });
  const parsed = customerInputSchema.parse(params.input);
  const phoneNormalized = normalizeOrThrow(parsed.phone);

  const [updated] = await db
    .update(customers)
    .set({
      companyName: parsed.companyName,
      contactPerson: parsed.contactPerson,
      phoneRaw: parsed.phone,
      phoneNormalized,
      email: parsed.email,
      address: parsed.address,
      notes: parsed.notes,
      updatedById: actor.userId,
    })
    .where(and(eq(customers.id, params.customerId), eq(customers.organizationId, actor.organizationId)))
    .returning();

  if (!updated) {
    throw new APIError("NOT_FOUND", { message: "Customer not found" });
  }
  return updated;
}

export async function getCustomer(params: { headers: Headers; customerId: string }) {
  const actor = await requirePermission({ headers: params.headers, permission: { customer: ["read"] } });
  const customer = await db.query.customers.findFirst({
    where: and(eq(customers.id, params.customerId), eq(customers.organizationId, actor.organizationId)),
  });
  if (!customer) {
    throw new APIError("NOT_FOUND", { message: "Customer not found" });
  }
  return customer;
}

export async function listCustomers(params: { headers: Headers }) {
  const actor = await requirePermission({ headers: params.headers, permission: { customer: ["read"] } });
  return db.query.customers.findMany({
    where: eq(customers.organizationId, actor.organizationId),
    orderBy: (customer, { desc }) => desc(customer.createdAt),
  });
}
