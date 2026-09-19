import { describe, expect, it } from "vitest";
import { MAX_MONEY_AMOUNT, formatRupiah, moneyAmountSchema } from "./amount";

describe("moneyAmountSchema", () => {
  it("parses a valid integer string into a bigint", () => {
    expect(moneyAmountSchema.parse("30000000")).toBe(30000000n);
  });

  it("accepts zero", () => {
    expect(moneyAmountSchema.parse("0")).toBe(0n);
  });

  it("accepts exactly the maximum allowed amount", () => {
    expect(moneyAmountSchema.parse(MAX_MONEY_AMOUNT.toString())).toBe(MAX_MONEY_AMOUNT);
  });

  it("rejects an amount over the maximum (MONEY-04)", () => {
    expect(() => moneyAmountSchema.parse((MAX_MONEY_AMOUNT + 1n).toString())).toThrow();
  });

  it("rejects a negative amount (MONEY-05)", () => {
    expect(() => moneyAmountSchema.parse("-1")).toThrow();
  });

  it("rejects a decimal amount", () => {
    expect(() => moneyAmountSchema.parse("100.50")).toThrow();
  });

  it("rejects exponent notation", () => {
    expect(() => moneyAmountSchema.parse("1e10")).toThrow();
  });

  it("rejects NaN and Infinity as literal strings", () => {
    expect(() => moneyAmountSchema.parse("NaN")).toThrow();
    expect(() => moneyAmountSchema.parse("Infinity")).toThrow();
  });

  it("rejects an empty string", () => {
    expect(() => moneyAmountSchema.parse("")).toThrow();
  });
});

describe("formatRupiah", () => {
  it("formats with a period thousands separator (UX-05: 'Rp30.000.000')", () => {
    expect(formatRupiah(30_000_000n)).toBe("Rp30.000.000");
  });

  it("formats an amount under 1000 with no separator", () => {
    expect(formatRupiah(500n)).toBe("Rp500");
  });

  it("formats zero", () => {
    expect(formatRupiah(0n)).toBe("Rp0");
  });

  it("places separators correctly for a non-multiple-of-3 digit count", () => {
    expect(formatRupiah(1_234n)).toBe("Rp1.234");
    expect(formatRupiah(12_345n)).toBe("Rp12.345");
  });

  it("stays exact at the maximum money amount, never routing through Number", () => {
    expect(formatRupiah(MAX_MONEY_AMOUNT)).toBe("Rp1.000.000.000.000.000");
  });

  it("formats a negative amount with the sign before Rp", () => {
    expect(formatRupiah(-500_000n)).toBe("Rp-500.000");
  });

  it("round-trips through moneyAmountSchema's parse direction", () => {
    expect(formatRupiah(moneyAmountSchema.parse("24420000"))).toBe("Rp24.420.000");
  });
});
