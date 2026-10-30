import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { contacts, customers } from "@/server/db/schema";

// CUS-04: a customer's own contact details are its primary contact's. Every
// reader that needs a name, phone or email for a customer joins through here,
// so there is one definition of "the customer's contact".

export const primaryContact = alias(contacts, "primary_contact");

/** The join condition: the customer's one primary contact, inside the same organization. */
export const primaryContactJoin = and(
  eq(primaryContact.organizationId, customers.organizationId),
  eq(primaryContact.customerId, customers.id),
  eq(primaryContact.isPrimary, true),
);

/** What a reader selects from the joined primary contact. */
export const primaryContactColumns = {
  contactId: primaryContact.id,
  contactPerson: primaryContact.name,
  phoneRaw: primaryContact.phoneRaw,
  phoneNormalized: primaryContact.phoneNormalized,
  email: primaryContact.email,
};

export type PrimaryContactRow = {
  contactId: string | null;
  contactPerson: string | null;
  phoneRaw: string | null;
  phoneNormalized: string | null;
  email: string | null;
};

/**
 * Every customer has a primary contact (created with it, never removable
 * while it is primary), so the left join is expected to match; the empty
 * string keeps a broken row readable instead of crashing a page.
 */
export function contactFields(row: PrimaryContactRow | null) {
  return {
    contactPerson: row?.contactPerson ?? "",
    phoneRaw: row?.phoneRaw ?? null,
    phoneNormalized: row?.phoneNormalized ?? null,
    email: row?.email ?? null,
  };
}
