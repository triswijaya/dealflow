import { describe, expect, it } from "vitest";
import { MAX_MONEY_AMOUNT, moneyAmountSchema } from "./amount";

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
