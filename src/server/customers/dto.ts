import { customers } from "@/server/db/schema";
import { toIsoDto } from "@/server/shared/dto";

type CustomerRow = typeof customers.$inferSelect;

export type CustomerDto = {
  id: string;
  organizationId: string;
  companyName: string;
  contactPerson: string;
  phoneRaw: string;
  phoneNormalized: string;
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
export function toCustomerDto(row: CustomerRow): CustomerDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    companyName: row.companyName,
    contactPerson: row.contactPerson,
    phoneRaw: row.phoneRaw,
    phoneNormalized: row.phoneNormalized,
    email: row.email,
    address: row.address,
    notes: row.notes,
    version: row.version,
    createdAt: toIsoDto(row.createdAt),
    updatedAt: toIsoDto(row.updatedAt),
    createdById: row.createdById,
    updatedById: row.updatedById,
  };
}
