"use client";

import { formatDate } from "@/lib/format";
import { Button } from "./button";
import { Field, Input } from "./field";
import { Popover } from "./popover";

const RANGE_ERROR = "Tanggal awal tidak boleh setelah tanggal akhir.";

/**
 * A date range as one toolbar filter: the trigger reads "Dibuat · 1 Okt 2026 –
 * 26 Okt 2026" and opens a small panel with the two dates. An inverted range
 * is flagged on the trigger and explained in the panel; the list ignores it.
 */
export function DateRangeFilter({
  id,
  label,
  from,
  to,
  onChange,
}: {
  id: string;
  label: string;
  from?: string;
  to?: string;
  /** Receives only the bound that changed (both when clearing), so two quick edits never overwrite each other. */
  onChange: (range: { from?: string; to?: string }) => void;
}) {
  const invalid = Boolean(from && to && from > to);
  const set = Boolean(from || to);
  const summary = invalid ? "Rentang tidak valid" : set ? `${from ? formatDate(from) : "…"} – ${to ? formatDate(to) : "…"}` : "Semua tanggal";

  return (
    <Popover
      label={label}
      active={set}
      invalid={invalid}
      trigger={
        <>
          <span className="filter-trigger-label">{label}</span>
          <span>{summary}</span>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <Field label="Sejak" htmlFor={`${id}-from`} error={invalid ? RANGE_ERROR : undefined}>
          <Input id={`${id}-from`} type="date" value={from ?? ""} max={to || undefined} invalid={invalid} onChange={(event) => onChange({ from: event.target.value || undefined })} />
        </Field>
        <Field label="Sampai dengan" htmlFor={`${id}-to`}>
          <Input id={`${id}-to`} type="date" value={to ?? ""} min={from || undefined} onChange={(event) => onChange({ to: event.target.value || undefined })} />
        </Field>
        {set ? (
          <Button variant="tertiary" onClick={() => onChange({ from: undefined, to: undefined })}>
            Hapus tanggal
          </Button>
        ) : null}
      </div>
    </Popover>
  );
}
