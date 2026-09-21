/**
 * Split out from document-snapshots.ts so schema.ts can import these types
 * for its jsonb columns' `.$type<>()` without a circular import
 * (document-snapshots.ts itself imports tables from schema.ts). Type-only,
 * no runtime code, so there is nothing for that cycle to actually run.
 */

export type SellerSnapshot = {
  name: string | null;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

export type CustomerSnapshot = {
  companyName: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};
