import { describe, expect, it } from "vitest";
import { formatQuotationNumber } from "./document-number";

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
