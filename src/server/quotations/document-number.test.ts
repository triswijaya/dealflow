import { describe, expect, it } from "vitest";
import { formatQuotationNumber, formatRevisionNumber } from "./document-number";

describe("formatQuotationNumber", () => {
  it("pads the sequence to 5 digits (QUO-04)", () => {
    expect(formatQuotationNumber(2026, 42)).toBe("QT-2026-00042");
    expect(formatQuotationNumber(2026, 1)).toBe("QT-2026-00001");
  });

  it("widens past 99999 instead of rolling over or truncating (QUO-04)", () => {
    expect(formatQuotationNumber(2026, 100000)).toBe("QT-2026-100000");
    expect(formatQuotationNumber(2026, 123456)).toBe("QT-2026-123456");
  });

  it("uses the exact 5-digit boundary without extra padding", () => {
    expect(formatQuotationNumber(2026, 99999)).toBe("QT-2026-99999");
  });
});

describe("formatRevisionNumber", () => {
  it("appends -R1, -R2 to the original number (QUO-04)", () => {
    const original = formatQuotationNumber(2026, 42);
    expect(formatRevisionNumber(original, 1)).toBe("QT-2026-00042-R1");
    expect(formatRevisionNumber(original, 2)).toBe("QT-2026-00042-R2");
  });

  it("always suffixes the original base number, never a source that is itself a revision", () => {
    // A revision made from "-R1" must become "-R2", not "-R1-R2" -- this is
    // a contract about which string the caller passes in, proven by the
    // integration test that actually builds a three-version family.
    const original = "QT-2026-00042";
    expect(formatRevisionNumber(original, 3)).toBe("QT-2026-00042-R3");
  });
});
