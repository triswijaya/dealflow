"use client";

import { searchCustomersAction } from "@/app/(app)/customers/actions";
import { Combobox } from "@/components/ui/combobox";
import type { CustomerOptionDto } from "@/server/customers/customers";

export const customerLabel = (customer: Pick<CustomerOptionDto, "companyName" | "contactPerson">) =>
  `${customer.companyName} · ${customer.contactPerson}`;

/** Customer selector for deal forms and filters. */
export function CustomerPicker(props: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  value: CustomerOptionDto | null;
  onChange: (customer: CustomerOptionDto | null) => void;
  clearable?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <Combobox<CustomerOptionDto>
      {...props}
      placeholder={props.placeholder ?? "Cari nama perusahaan atau kontak"}
      noResults="Tidak ada customer yang cocok."
      search={(query) => searchCustomersAction({ query })}
      display={customerLabel}
      renderOption={(customer) => (
        <>
          <b>{customer.companyName}</b>
          <small>{customer.contactPerson}</small>
        </>
      )}
    />
  );
}
