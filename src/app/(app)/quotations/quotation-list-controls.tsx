"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CustomerPicker } from "@/components/domain/customer-picker";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Menu, MenuItem } from "@/components/ui/menu";
import type { CustomerOptionDto } from "@/server/customers/customers";
import type { DealOptionDto } from "@/server/deals/deal-views";
import { searchDealOptionsAction } from "../follow-ups/actions";
import { WhatsAppDialog } from "../follow-ups/follow-up-dialogs";

const DEBOUNCE_MS = 350;

/** Search, customer filter and the "latest versions only" switch, all in the URL (FILTER-01). */
export function QuotationToolbar({ query, customer, latestOnly }: { query: string; customer: CustomerOptionDto | null; latestOnly: boolean }) {
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
      <Field label="Cari nomor quotation, deal, atau customer" htmlFor="quotation-search">
        <Input
          ref={input}
          id="quotation-search"
          type="search"
          defaultValue={query}
          maxLength={200}
          autoComplete="off"
          placeholder="Cari quotation, deal, atau customer"
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
        id="quotation-customer-filter"
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
      <label className="toggle">
        <input type="checkbox" checked={latestOnly} onChange={(event) => push({ versions: event.target.checked ? undefined : "all" })} />
        Hanya versi terbaru
      </label>
    </form>
  );
}

/** "Buat dari deal →": pick an active deal, then continue to the editor. */
export function NewFromDealButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deal, setDeal] = useState<DealOptionDto | null>(null);
  const [error, setError] = useState<string | undefined>();

  return (
    <>
      <Button variant="tertiary" onClick={() => setOpen(true)}>
        Buat dari deal →
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Buat quotation dari deal">
        <div className="stack">
          <Combobox<DealOptionDto>
            id="quotation-deal"
            label="Cari deal aktif"
            error={error}
            placeholder="Judul deal atau customer"
            noResults="Tidak ada deal aktif yang cocok."
            value={deal}
            onChange={(next) => {
              setDeal(next);
              setError(undefined);
            }}
            search={(query) => searchDealOptionsAction({ query })}
            display={(option) => `${option.title} · ${option.customerName}`}
            renderOption={(option) => (
              <>
                <b>{option.title}</b>
                <small>{option.customerName}</small>
              </>
            )}
          />
        </div>
        <DialogFooter>
          <Button variant="tertiary" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            onClick={() => {
              if (!deal) {
                setError("Pilih deal.");
                return;
              }
              router.push(`/quotations/new?dealId=${deal.id}`);
            }}
          >
            Lanjut
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

/** The ⋯ menu on a list row. */
export function QuotationRowMenu({ id, dealId, timezone }: { id: string; dealId: string; timezone: string }) {
  const [whatsapp, setWhatsapp] = useState(false);
  return (
    <>
      <Menu label="Menu tindakan">
        <MenuItem href={`/quotations/${id}`}>Buka</MenuItem>
        <a role="menuitem" href={`/api/quotations/${id}/pdf`}>
          Unduh PDF
        </a>
        <MenuItem onSelect={() => setWhatsapp(true)}>Kirim via WhatsApp</MenuItem>
      </Menu>
      <WhatsAppDialog open={whatsapp} onClose={() => setWhatsapp(false)} dealId={dealId} timezone={timezone} initialQuotationId={id} />
    </>
  );
}
