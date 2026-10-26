"use client";

import { X } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useFloating } from "./use-floating";

const DEBOUNCE_MS = 250;

type ComboboxProps<T extends { id: string }> = {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  value: T | null;
  onChange: (value: T | null) => void;
  /** Returns a few matches for what has been typed; an empty query returns suggestions. */
  search: (query: string) => Promise<{ ok: true; data: T[] } | { ok: false }>;
  /** The text shown once something is chosen. */
  display: (value: T) => string;
  renderOption: (value: T) => ReactNode;
  clearable?: boolean;
  disabled?: boolean;
  placeholder?: string;
  noResults?: string;
};

/**
 * Search-as-you-type selector (SEARCH-02: a few matches per keystroke, never
 * the whole table). A combobox with a listbox, operable from the keyboard:
 * arrows move, Enter chooses, Escape closes.
 */
export function Combobox<T extends { id: string }>({
  id,
  label,
  required,
  hint,
  error,
  value,
  onChange,
  search,
  display,
  renderOption,
  clearable,
  disabled,
  placeholder,
  noResults = "Tidak ada hasil yang cocok.",
}: ComboboxProps<T>) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ticket = useRef(0);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [searched, setSearched] = useState(false);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  useFloating(open, root, list, { matchWidth: true });

  function run(query: string) {
    clearTimeout(timer.current);
    const mine = ++ticket.current;
    timer.current = setTimeout(
      async () => {
        const result = await search(query);
        if (mine !== ticket.current) return; // a newer keystroke superseded this answer
        setFailed(!result.ok);
        setResults(result.ok ? result.data : []);
        setSearched(true);
        setActive(0);
      },
      query ? DEBOUNCE_MS : 0,
    );
  }

  function choose(next: T) {
    onChange(next);
    setOpen(false);
    setText("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        run(text);
        return;
      }
      if (results.length > 0) {
        setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
      }
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      const picked = results[active];
      if (picked) choose(picked);
    } else if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className={cn("field", error && "invalid")}>
      <span>
        <label htmlFor={id}>
          {label}
          {required ? (
            <span className="red" aria-hidden="true">
              {" "}
              *
            </span>
          ) : null}
        </label>
      </span>
      <div
        className="picker"
        ref={root}
        onBlur={(event) => {
          if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${listId}-${results[active].id}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={value ? undefined : placeholder}
          value={open ? text : value ? display(value) : ""}
          onFocus={() => {
            setOpen(true);
            setText("");
            run("");
          }}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            run(event.target.value.trim());
          }}
          onKeyDown={onKeyDown}
        />
        {clearable && value && !disabled ? (
          <button type="button" className="iconbtn picker-clear" aria-label={`Hapus pilihan ${label}`} title="Hapus pilihan" onClick={() => onChange(null)}>
            <X aria-hidden="true" />
          </button>
        ) : null}
        {open ? (
          <ul ref={list} className="picker-list" id={listId} role="listbox" aria-label={label} popover="manual">
            {failed ? (
              <li className="picker-empty" role="presentation">
                Gagal memuat pilihan. Coba lagi.
              </li>
            ) : searched && results.length === 0 ? (
              <li className="picker-empty" role="presentation">
                {noResults}
              </li>
            ) : (
              results.map((option, index) => (
                <li
                  key={option.id}
                  id={`${listId}-${option.id}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  onMouseEnter={() => setActive(index)}
                >
                  {renderOption(option)}
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
      {error ? (
        <small id={`${id}-error`} role="alert">
          {error}
        </small>
      ) : hint ? (
        <small>{hint}</small>
      ) : null}
    </div>
  );
}
