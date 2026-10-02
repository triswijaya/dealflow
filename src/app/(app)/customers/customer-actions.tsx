"use client";

import { useState, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { CustomerFormDialog, type EditableCustomer } from "./customer-form-dialog";

export function NewCustomerButton({ variant = "primary", children = "Tambah customer" }: { variant?: ButtonVariant; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <CustomerFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function EditCustomerButton({ customer }: { customer: EditableCustomer }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <CustomerFormDialog open={open} onClose={() => setOpen(false)} customer={customer} />
    </>
  );
}

/** The ⋯ menu on a list row: rare actions stay out of the way (brief §3.3). */
export function CustomerRowActions({ customer, dealsReady }: { customer: EditableCustomer; dealsReady: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Menu label="Menu tindakan">
        <MenuItem href={`/customers/${customer.id}`}>Lihat detail</MenuItem>
        <MenuItem onSelect={() => setEditing(true)}>Edit</MenuItem>
        {dealsReady ? <MenuItem href={`/deals/new?customerId=${customer.id}`}>Buat deal</MenuItem> : null}
      </Menu>
      <CustomerFormDialog open={editing} onClose={() => setEditing(false)} customer={customer} />
    </>
  );
}
