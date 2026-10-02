"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { Field, Input, Select } from "@/components/ui/field";

const DEBOUNCE_MS = 350;

/**
 * SEARCH-02: debounced search. The query and sort live in the URL, so a
 * filtered list can be reloaded or shared (FILTER-01), and every change
 * returns to page one.
 */
export function CustomerToolbar({ query, sort }: { query: string; sort: "newest" | "name" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The last value this box pushed to the URL, so an echo of it is not
  // mistaken for an outside change (which would overwrite fresh typing).
  const pushed = useRef(query);

  function push(next: { q?: string; sort?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  // "Reset filter" is a plain link, so the URL can change from outside.
  useEffect(() => {
    if (query !== pushed.current && input.current) {
      input.current.value = query;
      pushed.current = query;
    }
  }, [query]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <form className="toolbar" role="search" onSubmit={(event) => event.preventDefault()}>
      <Field label="Cari nama, kontak, atau nomor telepon" htmlFor="customer-search">
        <Input
          ref={input}
          id="customer-search"
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
      <Field label="Urutkan" htmlFor="customer-sort">
        <Select id="customer-sort" value={sort} onChange={(event) => push({ sort: event.target.value === "name" ? "name" : "" })}>
          <option value="newest">Terbaru dibuat</option>
          <option value="name">Nama A-Z</option>
        </Select>
      </Field>
    </form>
  );
}
