import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { contacts, customers, deals, organization, organizationSettings } from "@/server/db/schema";
import { primaryContact, primaryContactColumns, primaryContactJoin } from "@/server/customers/primary-contact";
import type { CustomerSnapshot, SellerSnapshot } from "./document-snapshot-types";

/**
 * The point-in-time company/customer snapshot a document freeze captures.
 *
 * Shared rather than quotation-specific: §14.1 lists snapshots on both
 * `quotations` and `invoices`, and INV-02 requires an invoice to carry the
 * same customer snapshot shape a quotation does, so a second copy of these
 * types could drift from the contract instead of merely from each other.
 *
 * The types themselves live in document-snapshot-types.ts (re-exported
 * here for every existing importer) so schema.ts can use them in a jsonb
 * column's `.$type<>()` without importing this file and creating a cycle
 * back through the `customers`/`organization` tables above.
 */
export type { SellerSnapshot, CustomerSnapshot } from "./document-snapshot-types";

/**
 * Reads current master data; the caller decides whether that is appropriate
 * (only ever call this for a row that is about to be frozen for the first
 * time -- see the frozenAt-is-null guards in reviseQuotation and
 * createInvoice). Accepts either a transaction or the plain client, so a
 * freeze inside a transaction and a read-only rebuild can share one shape.
 */
export async function buildDocumentSnapshots(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db,
  params: { organizationId: string; customerId: string; dealId?: string | null },
): Promise<{ seller: SellerSnapshot; customer: CustomerSnapshot }> {
  const [org] = await tx.select().from(organization).where(eq(organization.id, params.organizationId));
  const settings = await tx.query.organizationSettings.findFirst({
    where: eq(organizationSettings.organizationId, params.organizationId),
  });
  // CUS-04: the snapshot's contact person and phone come from the customer's primary contact.
  const [row] = await tx
    .select({ customer: customers, contact: primaryContactColumns })
    .from(customers)
    .leftJoin(primaryContact, primaryContactJoin)
    .where(and(eq(customers.id, params.customerId), eq(customers.organizationId, params.organizationId)));
  const customer = row?.customer;

  // The contact the document is for: the deal's contact when it has one, else the primary contact.
  let contact = row?.contact;
  if (params.dealId) {
    const [dealContact] = await tx
      .select({ contactPerson: contacts.name, phoneNormalized: contacts.phoneNormalized, email: contacts.email })
      .from(deals)
      .innerJoin(contacts, and(eq(contacts.id, deals.contactId), eq(contacts.organizationId, deals.organizationId)))
      .where(and(eq(deals.id, params.dealId), eq(deals.organizationId, params.organizationId)));
    if (dealContact) contact = { ...contact!, ...dealContact };
  }

  return {
    seller: {
      name: org?.name ?? null,
      address: settings?.address ?? null,
      contactEmail: settings?.contactEmail ?? null,
      contactPhone: settings?.contactPhone ?? null,
    },
    customer: {
      companyName: customer?.companyName ?? null,
      contactPerson: contact?.contactPerson ?? null,
      phone: contact?.phoneNormalized ?? null,
      email: contact?.email ?? null,
      address: customer?.address ?? null,
      taxId: customer?.taxId ?? null,
    },
  };
}
