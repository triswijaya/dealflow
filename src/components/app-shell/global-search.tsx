"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { globalSearchAction } from "@/app/(app)/search/actions";
import { SearchGroups, hasResults } from "@/components/domain/search-results";
import { MIN_QUERY_LENGTH } from "@/server/search/search-limits";
import type { SearchResults } from "@/server/search/search";

const DEBOUNCE_MS = 300;
const noSubscribe = () => () => {};

/**
 * The topbar search. After two characters and a pause it shows a few matches
 * per group (SEARCH-02: debounced, bounded); Enter or "Lihat semua hasil"
 * opens the full results page.
 */
export function GlobalSearchBox() {
  const router = useRouter();
  const root = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ticket = useRef(0);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [failed, setFailed] = useState(false);
  // Read once on the client; the server render assumes a non-Apple keyboard.
  const apple = useSyncExternalStore(noSubscribe, () => /Mac|iPhone|iPad/.test(navigator.platform), () => false);
  const shortcut = apple ? "⌘ K" : "Ctrl K";

  useEffect(() => () => clearTimeout(timer.current), []);

  // Ctrl+K / Cmd+K jumps to the search from anywhere in the app.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  function onChange(value: string) {
    setText(value);
    clearTimeout(timer.current);
    const query = value.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      ticket.current++;
      setResults(null);
      setFailed(false);
      setOpen(query.length > 0);
      return;
    }
    setOpen(true);
    const mine = ++ticket.current;
    timer.current = setTimeout(async () => {
      const result = await globalSearchAction({ query });
      if (mine !== ticket.current) return; // a newer keystroke superseded this answer
      setFailed(!result.ok);
      setResults(result.ok ? result.data : null);
    }, DEBOUNCE_MS);
  }

  const query = text.trim();
  return (
    <form
      ref={root}
      className="global-search"
      action="/search"
      role="search"
      style={{ position: "relative" }}
      onSubmit={(event) => {
        event.preventDefault();
        setOpen(false);
        router.push(`/search?q=${encodeURIComponent(query)}`);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <Search aria-hidden="true" />
      <label className="sr-only" htmlFor="global-search">
        Cari customer, deal, nomor quotation atau invoice
      </label>
      <input
        ref={input}
        id="global-search"
        name="q"
        type="search"
        maxLength={200}
        autoComplete="off"
        placeholder="Cari customer, deal, dokumen"
        value={text}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => query.length > 0 && setOpen(true)}
      />
      <kbd className="kbd" aria-hidden="true">
        {shortcut}
      </kbd>
      {open ? (
        <div className="search-dropdown" role="region" aria-label="Hasil pencarian" aria-live="polite">
          {query.length < MIN_QUERY_LENGTH ? (
            <small>Ketik minimal {MIN_QUERY_LENGTH} karakter untuk mencari.</small>
          ) : failed ? (
            <small className="red">Gagal memuat data. Coba lagi.</small>
          ) : !results ? (
            <small>Mencari...</small>
          ) : hasResults(results) ? (
            <>
              <SearchGroups results={results} onNavigate={() => setOpen(false)} />
              <Link className="btn tertiary" href={`/search?q=${encodeURIComponent(query)}`} onClick={() => setOpen(false)}>
                Lihat semua hasil →
              </Link>
              <small style={{ display: "block" }}>Enter membuka semua hasil · Esc menutup</small>
            </>
          ) : (
            <>
              <strong>Tidak ditemukan hasil untuk &lsquo;{query}&rsquo;</strong>
              <small style={{ display: "block" }}>Cek ejaan atau coba kata yang lebih singkat.</small>
            </>
          )}
        </div>
      ) : null}
    </form>
  );
}
