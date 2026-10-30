// Spreadsheet export. A cell that starts with = + - @ (or a tab or carriage return)
// would be run as a formula by Excel or Sheets, so it is prefixed with a quote;
// customer names and notes are free text and cannot be trusted.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV with CRLF line ends and a BOM, so Excel opens the UTF-8 right. */
export function toCsv(columns: string[], rows: unknown[][]): string {
  return `﻿${[columns, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}
