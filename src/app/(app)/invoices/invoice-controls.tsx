"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CustomerPicker } from "@/components/domain/customer-picker";
import { Button } from "@/components/ui/button";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { Field, Input } from "@/components/ui/field";
import { Menu, MenuItem } from "@/components/ui/menu";
import type { CustomerOptionDto } from "@/server/customers/customers";
import { PaymentDialog, type PayableInvoice } from "./payment-dialog";

const DEBOUNCE_MS = 350;

/** Search, customer and a due-date range, all in the URL (FILTER-01). */
export function InvoiceToolbar({ query, customer, from, to }: { query: string; customer: CustomerOptionDto | null; from?: string; to?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pushed = useRef(query);
  const [selected, setSelected] = useState(customer);
  const [selectedId, setSelectedId] = useState(customer?.id ?? null);
  if ((customer?.id ?? null) !== selectedId) {
    setSelectedId(customer?.id ?? null);
    setSelected(customer);
  }

  function push(changes: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  useEffect(() => {
    if (query !== pushed.current && input.current) {
      input.current.value = query;
      pushed.current = query;
    }
  }, [query]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <form className="toolbar" role="search" onSubmit={(event) => event.preventDefault()}>
      <Field label="Cari nomor invoice, deal, atau customer" htmlFor="invoice-search">
        <Input
          ref={input}
          id="invoice-search"
          type="search"
          defaultValue={query}
          maxLength={200}
          autoComplete="off"
          placeholder="Cari invoice, deal, atau customer"
          onChange={(event) => {
            const value = event.target.value.trim();
            clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              pushed.current = value;
              push({ q: value });
            }, DEBOUNCE_MS);
          }}
        />
      </Field>
      <CustomerPicker
        id="invoice-customer-filter"
        label="Customer"
        value={selected}
        clearable
        placeholder="Semua customer"
        onChange={(next) => {
          setSelected(next);
          setSelectedId(next?.id ?? null);
          push({ customer: next?.id });
        }}
      />
      <DateRangeFilter id="invoice-due" label="Jatuh tempo" from={from} to={to} onChange={push} />
    </form>
  );
}

/** The ⋯ menu on a list row: open it, or record a payment when something is still owed. */
export function InvoiceRowMenu({ invoice, today }: { invoice: PayableInvoice; today: string }) {
  const [paying, setPaying] = useState(false);
  const owed = BigInt(invoice.remainingAmount) > 0n;
  return (
    <>
      <Menu label="Menu tindakan">
        <MenuItem href={`/invoices/${invoice.id}`}>Buka</MenuItem>
        {owed ? <MenuItem onSelect={() => setPaying(true)}>Catat pembayaran</MenuItem> : null}
      </Menu>
      {owed ? <PaymentDialog open={paying} onClose={() => setPaying(false)} invoice={invoice} today={today} /> : null}
    </>
  );
}

/** The "Catat pembayaran" button on the invoice page. */
export function RecordPaymentButton({ invoice, today }: { invoice: PayableInvoice; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Catat pembayaran</Button>
      <PaymentDialog open={open} onClose={() => setOpen(false)} invoice={invoice} today={today} />
    </>
  );
}
