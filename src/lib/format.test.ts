import { describe, expect, it } from "vitest";
import {
  daysUntil,
  firstName,
  formatDate,
  formatDateTime,
  formatPhone,
  formatQuantity,
  formatRelative,
  formatRupiah,
  formatRupiahCompact,
  formatRupiahInput,
  formatTime,
  initials,
  parseRupiahInput,
  zoneLabel,
} from "./format";

describe("rupiah formatting", () => {
  it("groups thousands with dots and keeps the sign", () => {
    expect(formatRupiah("30000000")).toBe("Rp30.000.000");
    expect(formatRupiah(0)).toBe("Rp0");
    expect(formatRupiah(-5000)).toBe("Rp-5.000");
  });

  it("stays exact for values beyond Number's safe range (MONEY-01)", () => {
    expect(formatRupiah("123456789012345678901234")).toBe("Rp123.456.789.012.345.678.901.234");
  });

  it("compacts to jt, M and T with at most two decimals", () => {
    expect(formatRupiahCompact(999_999)).toBe("Rp999.999");
    expect(formatRupiahCompact(1_000_000)).toBe("Rp1 jt");
    expect(formatRupiahCompact(134_250_000)).toBe("Rp134,25 jt");
    expect(formatRupiahCompact(1_200_000_000)).toBe("Rp1,2 M");
    expect(formatRupiahCompact(2_000_000_000_000n)).toBe("Rp2 T");
  });

  it("rounds the compact form half up", () => {
    expect(formatRupiahCompact(1_005_000)).toBe("Rp1,01 jt");
  });

  it("strips non-digits from money input and regroups it for display", () => {
    expect(parseRupiahInput("Rp 30.000.000")).toBe("30000000");
    expect(formatRupiahInput("30000000")).toBe("30.000.000");
    expect(formatRupiahInput("0030000")).toBe("30.000");
    expect(formatRupiahInput("0")).toBe("0");
    expect(formatRupiahInput("abc")).toBe("");
  });
});

describe("dates and times", () => {
  it("formats a plain business date from its own parts, with Indonesian month names", () => {
    expect(formatDate("2026-09-26")).toBe("26 Sep 2026");
    expect(formatDate("2026-05-01")).toBe("1 Mei 2026");
    expect(formatDate("2026-08-17")).toBe("17 Agu 2026");
  });

  it("formats an instant in the organization's timezone, across midnight", () => {
    // 18:00 UTC on the 26th is 01:00 on the 27th in Jakarta.
    expect(formatDate("2026-09-26T18:00:00Z", "Asia/Jakarta")).toBe("27 Sep 2026");
    expect(formatTime("2026-09-26T18:00:00Z", "Asia/Jakarta")).toBe("01.00");
    expect(formatDateTime("2026-09-26T07:00:00Z", "Asia/Jakarta")).toBe("26 Sep 2026, 14.00 WIB");
  });

  it("labels the three Indonesian zones and falls back to the zone name", () => {
    expect(zoneLabel("Asia/Jakarta")).toBe("WIB");
    expect(zoneLabel("Asia/Makassar")).toBe("WITA");
    expect(zoneLabel("Asia/Jayapura")).toBe("WIT");
    expect(zoneLabel("Europe/London")).toBe("Europe/London");
  });

  it("counts whole days until a date, negative when past", () => {
    expect(daysUntil("2026-09-30", "2026-09-26")).toBe(4);
    expect(daysUntil("2026-09-26", "2026-09-26")).toBe(0);
    expect(daysUntil("2026-09-24", "2026-09-26")).toBe(-2);
  });
});

describe("relative time", () => {
  // 14:00 WIB on 26 Sep 2026.
  const now = new Date("2026-09-26T07:00:00Z");

  it("steps from seconds to minutes to hours within the same day", () => {
    expect(formatRelative("2026-09-26T06:59:30Z", now)).toBe("Baru saja");
    expect(formatRelative("2026-09-26T06:55:00Z", now)).toBe("5 menit lalu");
    expect(formatRelative("2026-09-26T05:30:00Z", now)).toBe("1 jam lalu");
    expect(formatRelative("2026-09-26T04:00:00Z", now)).toBe("3 jam lalu");
  });

  it("goes by calendar day in the organization's timezone, not by 24-hour blocks", () => {
    // 23:59 WIB the evening before is "Kemarin" even though it is only 14 hours ago.
    expect(formatRelative("2026-09-25T16:59:00Z", now)).toBe("Kemarin");
    expect(formatRelative("2026-09-23T07:00:00Z", now)).toBe("3 hari lalu");
  });

  it("falls back to the date after a week, and for other days in the future", () => {
    expect(formatRelative("2026-09-16T07:00:00Z", now)).toBe("16 Sep 2026");
    expect(formatRelative("2026-09-28T07:00:00Z", now)).toBe("28 Sep 2026");
  });

  it("calls a later time today 'Hari ini'", () => {
    expect(formatRelative("2026-09-26T10:00:00Z", now)).toBe("Hari ini");
  });
});

describe("small display helpers", () => {
  it("trims stored quantities and uses a decimal comma", () => {
    expect(formatQuantity("4.000")).toBe("4");
    expect(formatQuantity("1.500")).toBe("1,5");
    expect(formatQuantity("0.250")).toBe("0,25");
    expect(formatQuantity("0.000")).toBe("0");
    expect(formatQuantity("12")).toBe("12");
  });

  it("formats Indonesian numbers in groups and leaves foreign numbers alone", () => {
    expect(formatPhone("628123456789")).toBe("+62 812-3456-789");
    expect(formatPhone("62812")).toBe("+62 812");
    expect(formatPhone("14155550123")).toBe("+14155550123");
  });

  it("builds initials from the first and last word", () => {
    expect(initials("Aditya Pratama")).toBe("AP");
    expect(initials("Siti Nur Aini")).toBe("SA");
    expect(initials("andi wijaya")).toBe("AW");
    expect(initials("Budi")).toBe("BU");
    expect(initials("   ")).toBe("?");
  });

  it("takes the first word as the first name", () => {
    expect(firstName("Aditya Pratama")).toBe("Aditya");
    expect(firstName("  Budi  ")).toBe("Budi");
  });
});
