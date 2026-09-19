import { describe, expect, it } from "vitest";
import { MAX_QUANTITY_SCALED, formatQuantityForDisplay, formatQuantityScaled, quantitySchema } from "./quantity";

describe("quantitySchema", () => {
  it("scales a whole number by 1000", () => {
    expect(quantitySchema.parse("1")).toBe(1000n);
    expect(quantitySchema.parse("12")).toBe(12000n);
  });

  it("scales a fractional quantity exactly (MONEY-02)", () => {
    expect(quantitySchema.parse("1.5")).toBe(1500n);
    expect(quantitySchema.parse("0.333")).toBe(333n);
    expect(quantitySchema.parse("2.25")).toBe(2250n);
  });

  it("treats trailing zeros as the same value", () => {
    expect(quantitySchema.parse("1.000")).toBe(1000n);
    expect(quantitySchema.parse("1.50")).toBe(1500n);
  });

  it("accepts the smallest representable quantity", () => {
    expect(quantitySchema.parse("0.001")).toBe(1n);
  });

  it("accepts exactly the maximum quantity (MONEY-04)", () => {
    expect(quantitySchema.parse("1000000.000")).toBe(MAX_QUANTITY_SCALED);
  });

  it("rejects a quantity over the maximum (MONEY-04)", () => {
    expect(() => quantitySchema.parse("1000000.001")).toThrow();
  });

  it("rejects zero (MONEY-04 requires q > 0)", () => {
    expect(() => quantitySchema.parse("0")).toThrow();
    expect(() => quantitySchema.parse("0.000")).toThrow();
  });

  it("rejects more than three decimals instead of truncating (MONEY-02)", () => {
    expect(() => quantitySchema.parse("1.0001")).toThrow();
    expect(() => quantitySchema.parse("0.3335")).toThrow();
  });

  it("rejects a negative quantity (MONEY-05)", () => {
    expect(() => quantitySchema.parse("-1")).toThrow();
    expect(() => quantitySchema.parse("-0.5")).toThrow();
  });

  it("rejects exponent notation, NaN, and Infinity (MONEY-05)", () => {
    expect(() => quantitySchema.parse("1e3")).toThrow();
    expect(() => quantitySchema.parse("1E3")).toThrow();
    expect(() => quantitySchema.parse("NaN")).toThrow();
    expect(() => quantitySchema.parse("Infinity")).toThrow();
  });

  it("rejects malformed decimals and an empty string", () => {
    expect(() => quantitySchema.parse(".5")).toThrow();
    expect(() => quantitySchema.parse("1.")).toThrow();
    expect(() => quantitySchema.parse("1.2.3")).toThrow();
    expect(() => quantitySchema.parse("")).toThrow();
  });

  it("rejects surrounding whitespace rather than trimming it", () => {
    expect(() => quantitySchema.parse(" 1")).toThrow();
    expect(() => quantitySchema.parse("1 ")).toThrow();
  });
});

describe("formatQuantityScaled", () => {
  it("renders the decimal string the numeric(12,3) column stores", () => {
    expect(formatQuantityScaled(333n)).toBe("0.333");
    expect(formatQuantityScaled(1500n)).toBe("1.500");
    expect(formatQuantityScaled(1000n)).toBe("1.000");
    expect(formatQuantityScaled(1n)).toBe("0.001");
    expect(formatQuantityScaled(MAX_QUANTITY_SCALED)).toBe("1000000.000");
  });

  it("round-trips through the schema without losing precision", () => {
    for (const input of ["0.333", "1.500", "12.005", "1000000.000"]) {
      expect(formatQuantityScaled(quantitySchema.parse(input))).toBe(input);
    }
  });

  it("refuses a negative scaled quantity", () => {
    expect(() => formatQuantityScaled(-1n)).toThrow();
  });
});

describe("formatQuantityForDisplay", () => {
  it("drops trailing zeros for a whole-number quantity", () => {
    expect(formatQuantityForDisplay("4.000")).toBe("4");
    expect(formatQuantityForDisplay("1000000.000")).toBe("1000000");
  });

  it("trims a partial trailing zero but keeps significant fraction digits", () => {
    expect(formatQuantityForDisplay("1.500")).toBe("1.5");
    expect(formatQuantityForDisplay("12.340")).toBe("12.34");
  });

  it("leaves an already-exact fraction untouched", () => {
    expect(formatQuantityForDisplay("0.333")).toBe("0.333");
  });

  it("leaves a value with no decimal point untouched", () => {
    expect(formatQuantityForDisplay("4")).toBe("4");
  });

  it("never mutates the underlying stored string, only its own return value", () => {
    const stored = formatQuantityScaled(quantitySchema.parse("4"));
    expect(stored).toBe("4.000"); // the exact stored form is unaffected
    expect(formatQuantityForDisplay(stored)).toBe("4");
  });
});
