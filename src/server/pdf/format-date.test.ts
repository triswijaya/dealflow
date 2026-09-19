import { describe, expect, it } from "vitest";
import { formatIndonesianDate } from "./format-date";

describe("formatIndonesianDate", () => {
  it("formats a date with the full Indonesian month name", () => {
    expect(formatIndonesianDate("2026-09-19")).toBe("19 September 2026");
  });

  it("drops a leading zero from the day", () => {
    expect(formatIndonesianDate("2026-01-05")).toBe("5 Januari 2026");
  });

  it("formats every month correctly", () => {
    expect(formatIndonesianDate("2026-01-01")).toBe("1 Januari 2026");
    expect(formatIndonesianDate("2026-12-31")).toBe("31 Desember 2026");
  });

  it("rejects a non-YYYY-MM-DD string rather than guessing", () => {
    expect(() => formatIndonesianDate("19/09/2026")).toThrow();
    expect(() => formatIndonesianDate("2026-9-19")).toThrow();
    expect(() => formatIndonesianDate("")).toThrow();
  });

  it("rejects an out-of-range month", () => {
    expect(() => formatIndonesianDate("2026-13-01")).toThrow();
    expect(() => formatIndonesianDate("2026-00-01")).toThrow();
  });
});
