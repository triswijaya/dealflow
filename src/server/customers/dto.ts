import { customers } from "@/server/db/schema";
import { toIsoDto } from "@/server/shared/dto";
import { contactFields, type PrimaryContactRow } from "./primary-contact";

type CustomerRow = typeof customers.$inferSelect;

export type CustomerDto = {
  id: string;
  organizationId: string;
  companyName: string;
  /** NPWP, digits only. */
  taxId: string | null;
  /** CUS-04: the customer's contact details are its primary contact's. */
  primaryContactId: string | null;
  contactPerson: string;
  phoneRaw: string | null;
  phoneNormalized: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  updatedById: string | null;
};

// CUS-01/§14.1: explicit field-by-field mapping, never a spread -- a new
// raw column added to the customers table later has to be a deliberate
// decision to expose here, not something that leaks through automatically.
export function toCustomerDto(row: CustomerRow, contact: PrimaryContactRow | null): CustomerDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    companyName: row.companyName,
    taxId: row.taxId,
    primaryContactId: contact?.contactId ?? null,
    ...contactFields(contact),
    address: row.address,
    notes: row.notes,
    version: row.version,
    createdAt: toIsoDto(row.createdAt),
    updatedAt: toIsoDto(row.updatedAt),
    createdById: row.createdById,
    updatedById: row.updatedById,
  };
}
