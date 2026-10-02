"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CustomerPicker } from "@/components/domain/customer-picker";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ROLE_LABEL, type Role } from "@/lib/labels";
import type { CustomerOptionDto } from "@/server/customers/customers";
import type { AssignableMemberDto } from "@/server/deals/deal-views";

const DEBOUNCE_MS = 350;

/**
 * Filters for the pipeline and the deal list (FILTER-01). Every control
 * writes to the URL and returns to page one, so a filtered view can be
 * reloaded or shared. The date range is only offered on the table, where
 * deals of every age are listed.
 */
export function DealToolbar({
  query,
  assignedToId,
  customer,
  members,
  dateRange,
  from,
  to,
}: {
  query: string;
  assignedToId: string;
  customer: CustomerOptionDto | null;
  members: AssignableMemberDto[];
  dateRange?: boolean;
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The last value this box pushed to the URL, so an echo of it is not
  // mistaken for an outside change (a "Reset filter" link) that would
  // overwrite fresh typing.
  const pushed = useRef(query);
  const [selected, setSelected] = useState(customer);
  const [selectedId, setSelectedId] = useState(customer?.id ?? null);
  if ((customer?.id ?? null) !== selectedId) {
    setSelectedId(customer?.id ?? null);
    setSelected(customer);
  }
  const rangeInvalid = Boolean(from && to && from > to);

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
    <>
      <form className="toolbar" role="search" onSubmit={(event) => event.preventDefault()}>
        <Field label="Cari judul deal atau customer" htmlFor="deal-search">
          <Input
            ref={input}
            id="deal-search"
            type="search"
            defaultValue={query}
            maxLength={200}
            autoComplete="off"
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
        <Field label="Assigned sales" htmlFor="deal-sales">
          <Select id="deal-sales" value={assignedToId} onChange={(event) => push({ sales: event.target.value })}>
            <option value="">Semua</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name} · {ROLE_LABEL[member.role as Role] ?? member.role}
              </option>
            ))}
          </Select>
        </Field>
        <CustomerPicker
          id="deal-customer-filter"
          label="Customer"
          value={selected}
          clearable
          placeholder="Semua"
          onChange={(next) => {
            setSelected(next);
            setSelectedId(next?.id ?? null);
            push({ customer: next?.id });
          }}
        />
      </form>
      {dateRange ? (
        <div className="toolbar" style={{ marginTop: 14 }}>
          <Field label="Dibuat sejak" htmlFor="deal-from" error={rangeInvalid ? "Tanggal awal tidak boleh setelah tanggal akhir." : undefined}>
            <Input id="deal-from" type="date" value={from ?? ""} max={to || undefined} onChange={(event) => push({ from: event.target.value })} invalid={rangeInvalid} />
          </Field>
          <Field label="Sampai dengan" htmlFor="deal-to">
            <Input id="deal-to" type="date" value={to ?? ""} min={from || undefined} onChange={(event) => push({ to: event.target.value })} />
          </Field>
          {from || to ? (
            <Button variant="tertiary" onClick={() => push({ from: undefined, to: undefined })}>
              Reset tanggal
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
