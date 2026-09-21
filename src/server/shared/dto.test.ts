import { describe, expect, it } from "vitest";
import { MAX_MONEY_AMOUNT } from "@/server/money/amount";
import { toIsoDto, toMoneyDto } from "./dto";

describe("toMoneyDto", () => {
  it("converts zero", () => {
    expect(toMoneyDto(0n)).toBe("0");
  });

  it("converts an ordinary amount without separators", () => {
    expect(toMoneyDto(30_000_000n)).toBe("30000000");
  });

  it("stays exact at the maximum money amount (MONEY-04), never routing through Number", () => {
    expect(toMoneyDto(MAX_MONEY_AMOUNT)).toBe("1000000000000000");
  });

  it("stays exact past Number.MAX_SAFE_INTEGER, where Number rounding would lose a digit", () => {
    // 2^53 + 1 has no exact float64 representation: Number(...) rounds it
    // down to 2^53 (9007199254740992), one less than the true value. A
    // conversion that routed through Number at any point would silently
    // return the rounded value instead of this one.
    const beyondSafeInteger = BigInt(Number.MAX_SAFE_INTEGER) + 2n;
    expect(toMoneyDto(beyondSafeInteger)).toBe("9007199254740993");
    expect(toMoneyDto(beyondSafeInteger)).not.toBe(Number(beyondSafeInteger).toString());
  });
});

describe("toIsoDto", () => {
  it("formats a known instant as an ISO-8601 string", () => {
    expect(toIsoDto(new Date("2026-03-05T10:30:00.000Z"))).toBe("2026-03-05T10:30:00.000Z");
  });
});

describe("boundary proof: why a raw domain row cannot be the wire contract", () => {
  it("JSON.stringify throws on a plain object carrying a bigint field", () => {
    const rawRow = { total: 15_000_000n };
    expect(() => JSON.stringify(rawRow)).toThrow(TypeError);
  });

  it("JSON.stringify succeeds once the same field is converted through toMoneyDto", () => {
    const dto = { total: toMoneyDto(15_000_000n) };
    expect(JSON.stringify(dto)).toBe('{"total":"15000000"}');
  });
});
