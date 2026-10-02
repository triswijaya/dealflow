"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/field";
import { formatRupiah } from "@/lib/format";
import { calculateDocumentTotals, calculateItemSubtotal } from "@/server/money/calculation";
import { quantitySchema } from "@/server/money/quantity";
import { MAX_DOCUMENT_ITEMS } from "@/server/shared/document-items";

// Shared by the quotation editor and the invoice wizard: both edit the same
// line-item shape under the same rules (INV-02: invoice items match
// quotation items), so the table and its arithmetic live in one place.

export type Row = { key: number; description: string; quantity: string; unit: string; unitPrice: string };
export type RowErrors = Partial<Record<"description" | "quantity" | "unit" | "unitPrice", string>>;

const UNITS = ["pcs", "meter", "paket", "jam"];
const DESCRIPTION_LIMIT = 1000;
const UNIT_LIMIT = 50;

export const normalizeQuantity = (value: string) => value.trim().replace(",", ".");

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function rowErrors(row: Row): RowErrors {
  const errors: RowErrors = {};
  const description = row.description.trim();
  if (!description || description.length > DESCRIPTION_LIMIT) errors.description = "Deskripsi wajib diisi. Maksimal 1.000 karakter.";
  if (!quantitySchema.safeParse(normalizeQuantity(row.quantity)).success) errors.quantity = "Qty harus lebih dari 0, maksimal 3 desimal.";
  const unit = row.unit.trim();
  if (!unit || unit.length > UNIT_LIMIT) errors.unit = "Satuan wajib diisi. Maksimal 50 karakter.";
  if (row.unitPrice === "") errors.unitPrice = "Harga satuan wajib diisi.";
  return errors;
}

/** Live totals from the lines complete so far, using the server's own calculation module. */
export function useDocumentCalculation(rows: Row[], discount: string, tax: string) {
  return useMemo(() => {
    const lines = rows.map((row) => {
      const quantity = quantitySchema.safeParse(normalizeQuantity(row.quantity));
      if (!quantity.success || row.unitPrice === "") return null;
      return { quantityScaled: quantity.data, unitPrice: BigInt(row.unitPrice) };
    });
    const valid = lines.filter((line): line is NonNullable<typeof line> => line !== null);
    const subtotals = lines.map((line) => (line ? calculateItemSubtotal(line.quantityScaled, line.unitPrice) : null));
    const subtotal = subtotals.reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n);
    const discountValue = discount === "" ? 0n : BigInt(discount);
    const taxValue = tax === "" ? 0n : BigInt(tax);
    const calc = valid.length > 0 ? calculateDocumentTotals({ items: valid, discount: discountValue, tax: taxValue }) : null;
    const total = calc?.ok ? calc.totals.total : subtotal - discountValue + taxValue;
    return {
      subtotals,
      subtotal,
      discountValue,
      taxValue,
      calc,
      total: total < 0n ? 0n : total,
      discountTooHigh: discountValue > subtotal,
    };
  }, [rows, discount, tax]);
}

export type Calculation = ReturnType<typeof useDocumentCalculation>;

/** The editable item table with reorder, delete and add (QUO-02: 1 to 200 items). */
export function ItemsTable({
  rows,
  setRows,
  rowCounter,
  setRowCounter,
  calculation,
  submitted,
  serverErrors,
  idPrefix = "item",
}: {
  rows: Row[];
  setRows: (update: (current: Row[]) => Row[]) => void;
  rowCounter: number;
  setRowCounter: (update: (current: number) => number) => void;
  calculation: Calculation;
  submitted: boolean;
  serverErrors: Record<string, string>;
  idPrefix?: string;
}) {
  const update = (key: number, change: Partial<Row>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  const move = (index: number, by: -1 | 1) =>
    setRows((current) => {
      const next = [...current];
      [next[index], next[index + by]] = [next[index + by]!, next[index]!];
      return next;
    });
  const serverRow = (index: number, field: keyof RowErrors) => serverErrors[`items.${index}.${field}`];

  return (
    <>
      <div className="table-wrap editor-table">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Deskripsi</th>
              <th>Qty</th>
              <th>Satuan</th>
              <th>Harga satuan</th>
              <th>Subtotal</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const errors = submitted ? rowErrors(row) : {};
              const field = (name: string) => `${idPrefix}-${row.key}-${name}`;
              return (
                <tr key={row.key}>
                  <td data-label="Urutan">
                    <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                      {index + 1}
                      <IconButton label="Naikkan item" disabled={index === 0} onClick={() => move(index, -1)}>
                        <ArrowUp aria-hidden="true" />
                      </IconButton>
                      <IconButton label="Turunkan item" disabled={index === rows.length - 1} onClick={() => move(index, 1)}>
                        <ArrowDown aria-hidden="true" />
                      </IconButton>
                    </div>
                  </td>
                  <td data-label="Deskripsi">
                    <Field label="" htmlFor={field("description")} error={errors.description ?? serverRow(index, "description")} className="cell-field">
                      <Textarea
                        id={field("description")}
                        aria-label={`Deskripsi item ${index + 1}`}
                        value={row.description}
                        onChange={(event) => update(row.key, { description: event.target.value })}
                        invalid={!!(errors.description ?? serverRow(index, "description"))}
                      />
                    </Field>
                  </td>
                  <td data-label="Qty">
                    <Field label="" htmlFor={field("quantity")} error={errors.quantity ?? serverRow(index, "quantity")} className="cell-field">
                      <Input
                        id={field("quantity")}
                        aria-label={`Qty item ${index + 1}`}
                        inputMode="decimal"
                        value={row.quantity}
                        onChange={(event) => update(row.key, { quantity: event.target.value })}
                        invalid={!!(errors.quantity ?? serverRow(index, "quantity"))}
                      />
                    </Field>
                  </td>
                  <td data-label="Satuan">
                    <Field label="" htmlFor={field("unit")} error={errors.unit ?? serverRow(index, "unit")} className="cell-field">
                      <Input
                        id={field("unit")}
                        aria-label={`Satuan item ${index + 1}`}
                        list={`${idPrefix}-units`}
                        value={row.unit}
                        onChange={(event) => update(row.key, { unit: event.target.value })}
                        invalid={!!(errors.unit ?? serverRow(index, "unit"))}
                      />
                    </Field>
                  </td>
                  <td data-label="Harga satuan">
                    <Field label="" htmlFor={field("price")} error={errors.unitPrice ?? serverRow(index, "unitPrice")} className="cell-field">
                      <MoneyInput
                        id={field("price")}
                        aria-label={`Harga satuan item ${index + 1}`}
                        value={row.unitPrice}
                        onValueChange={(digits) => update(row.key, { unitPrice: digits })}
                        invalid={!!(errors.unitPrice ?? serverRow(index, "unitPrice"))}
                      />
                    </Field>
                  </td>
                  <td data-label="Subtotal" className="num">
                    <span className="money">{formatRupiah(calculation.subtotals[index] ?? 0n)}</span>
                  </td>
                  <td data-label="Aksi">
                    <IconButton label="Hapus item" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((candidate) => candidate.key !== row.key))}>
                      <Trash2 aria-hidden="true" />
                    </IconButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <datalist id={`${idPrefix}-units`}>
        {UNITS.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>
      <div className="row between" style={{ marginTop: 14 }}>
        <Button
          variant="secondary"
          disabled={rows.length >= MAX_DOCUMENT_ITEMS}
          onClick={() => {
            setRows((current) => [...current, { key: rowCounter, description: "", quantity: "1", unit: "pcs", unitPrice: "" }]);
            setRowCounter((current) => current + 1);
          }}
        >
          + Tambah item
        </Button>
        <small>Maksimal {MAX_DOCUMENT_ITEMS} item.</small>
      </div>
      {serverErrors.items ? (
        <Alert tone="error" className="mt">
          {serverErrors.items}
        </Alert>
      ) : null}
    </>
  );
}
