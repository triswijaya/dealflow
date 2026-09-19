import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("normalizes a clean Indonesian local number (0-prefix) to 62", () => {
    expect(normalizePhone("08123456789")).toBe("628123456789");
  });

  it("strips dashes and spaces before applying the prefix rule", () => {
    expect(normalizePhone("0812-3456-7890")).toBe("6281234567890");
    expect(normalizePhone("0812 3456 7890")).toBe("6281234567890");
    expect(normalizePhone("(021) 555-1234")).toBe(normalizePhone("0215551234"));
  });

  it("accepts an explicit +62 international format", () => {
    expect(normalizePhone("+62 812-3456-7890")).toBe("6281234567890");
  });

  it("accepts a 62-prefixed number with no + sign", () => {
    expect(normalizePhone("6281234567890")).toBe("6281234567890");
  });

  it("produces no + or formatting characters in the output (wa.me format)", () => {
    const normalized = normalizePhone("+62 812-3456-7890");
    expect(normalized).toMatch(/^[0-9]+$/);
  });

  it("rejects a number with no leading 0 and no country code", () => {
    expect(normalizePhone("8123456789")).toBeNull();
  });

  it("rejects an empty or whitespace-only input", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
  });

  it("rejects a result that's too short to be a real phone number", () => {
    expect(normalizePhone("0123")).toBeNull();
  });

  it("rejects a result that exceeds E.164's 15-digit maximum", () => {
    expect(normalizePhone("+62812345678901234")).toBeNull();
  });

  it("rejects an explicit '+0...' instead of silently reinterpreting it as an Indonesian local number (CUS-01)", () => {
    // No valid E.164 country code starts with 0, so a "+" paired with a
    // leading 0 is self-contradictory input, not a number this function
    // should guess the intent of.
    expect(normalizePhone("+0812345678")).toBeNull();
    expect(normalizePhone("+044 1234567")).toBeNull();
  });

  it("still normalizes a plain (no +) local 0-prefixed number the same as before", () => {
    expect(normalizePhone("08123456789")).toBe("628123456789");
  });
});
