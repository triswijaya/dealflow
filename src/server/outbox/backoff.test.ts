import { describe, expect, it } from "vitest";
import { backoffMs, MAX_ATTEMPTS } from "./outbox";

describe("backoffMs (ADR-0004)", () => {
  it("doubles from one minute and stops growing at six hours", () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([60_000, 120_000, 240_000, 480_000]);
    expect(backoffMs(9)).toBe(15_360_000);
    expect(backoffMs(10)).toBe(6 * 3_600_000);
    expect(backoffMs(40)).toBe(6 * 3_600_000);
  });

  it("never goes below one minute, whatever the count", () => {
    expect(backoffMs(0)).toBe(60_000);
    expect(backoffMs(-3)).toBe(60_000);
    expect(MAX_ATTEMPTS).toBeGreaterThan(1);
  });
});
