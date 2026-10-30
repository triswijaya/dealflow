// Display formatting shared by server and client components (UX-05). Money
// arrives from DTOs as integer strings (MONEY-01) and is formatted with
// BigInt, never Number, so large rupiah values stay exact.

export const DEFAULT_TIMEZONE = "Asia/Jakarta";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function toBigInt(value: string | bigint | number): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "Rp30.000.000" */
export function formatRupiah(value: string | bigint | number): string {
  const amount = toBigInt(value);
  const negative = amount < 0n;
  return `Rp${negative ? "-" : ""}${groupThousands((negative ? -amount : amount).toString())}`;
}

/**
 * Dashboard-only compact form (brief §3.1): "Rp134,25 jt", "Rp1,2 M". Two
 * decimals at most, trailing zeros dropped, rounded half up in BigInt.
 */
export function formatRupiahCompact(value: string | bigint | number): string {
  const amount = toBigInt(value);
  const units: [bigint, string][] = [
    [1_000_000_000_000n, "T"],
    [1_000_000_000n, "M"],
    [1_000_000n, "jt"],
  ];
  for (const [unit, suffix] of units) {
    if (amount >= unit) {
      const hundredths = (amount * 100n + unit / 2n) / unit;
      const whole = hundredths / 100n;
      const fraction = (hundredths % 100n).toString().padStart(2, "0").replace(/0+$/, "");
      return `Rp${groupThousands(whole.toString())}${fraction ? `,${fraction}` : ""} ${suffix}`;
    }
  }
  return formatRupiah(amount);
}

/** Digits only, for money inputs: "30.000.000" -> "30000000". */
export function parseRupiahInput(input: string): string {
  return input.replace(/[^0-9]/g, "");
}

/** Live input display: "30000000" -> "30.000.000". */
export function formatRupiahInput(digits: string): string {
  const clean = digits.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
  return clean ? groupThousands(clean) : "";
}

type ZonedParts = { year: number; month: number; day: number; hour: string; minute: string };

function zonedParts(instant: Date, timezone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), hour: get("hour"), minute: get("minute") };
}

/** "WIB" for Asia/Jakarta and friends, otherwise the zone name. */
export function zoneLabel(timezone: string): string {
  if (timezone === "Asia/Jakarta") return "WIB";
  if (timezone === "Asia/Makassar") return "WITA";
  if (timezone === "Asia/Jayapura") return "WIT";
  return timezone;
}

/**
 * "26 Sep 2026". A plain YYYY-MM-DD business date (DATA-04) is formatted
 * from its own parts, never through a Date, so it cannot shift a day.
 */
export function formatDate(value: string, timezone: string = DEFAULT_TIMEZONE): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return `${Number(dateOnly[3])} ${MONTHS[Number(dateOnly[2]) - 1]} ${dateOnly[1]}`;
  }
  const parts = zonedParts(new Date(value), timezone);
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`;
}

/** "14.00" in the organization's timezone. */
export function formatTime(value: string, timezone: string = DEFAULT_TIMEZONE): string {
  const parts = zonedParts(new Date(value), timezone);
  return `${parts.hour}.${parts.minute}`;
}

/** "26 Sep 2026, 14.00 WIB" */
export function formatDateTime(value: string, timezone: string = DEFAULT_TIMEZONE): string {
  return `${formatDate(value, timezone)}, ${formatTime(value, timezone)} ${zoneLabel(timezone)}`;
}

// Minutes-resolution offset of `timezone` from UTC at the given instant.
function zoneOffsetMs(ms: number, timezone: string): number {
  const parts = zonedParts(new Date(ms), timezone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, Number(parts.hour), Number(parts.minute));
  return asUtc - Math.floor(ms / 60_000) * 60_000;
}

/**
 * The instant a wall-clock "YYYY-MM-DDTHH:mm" denotes in `timezone` (what a
 * datetime-local field means when the form says "Jadwal (WIB)"), regardless
 * of the browser's own timezone (DATA-04).
 */
export function zonedLocalToInstant(local: string, timezone: string = DEFAULT_TIMEZONE): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return new Date(Number.NaN);
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // One correction pass settles zones whose offset changes near the guess (DST).
  const first = naive - zoneOffsetMs(naive, timezone);
  return new Date(naive - zoneOffsetMs(first, timezone));
}

/** An instant as the "YYYY-MM-DDTHH:mm" a datetime-local field shows for `timezone`. */
export function instantToZonedLocal(value: string | Date, timezone: string = DEFAULT_TIMEZONE): string {
  const parts = zonedParts(typeof value === "string" ? new Date(value) : value, timezone);
  const pad = (n: number | string) => String(n).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${parts.hour}:${parts.minute}`;
}

/** YYYY-MM-DD of an instant in the given timezone. */
export function zonedDateString(instant: Date, timezone: string = DEFAULT_TIMEZONE): string {
  const parts = zonedParts(instant, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function daysBetween(fromDate: string, toDate: string): number {
  const [a, b] = [fromDate, toDate].map((d) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))));
  return Math.round((b - a) / 86_400_000);
}

/** "5 menit lalu", "Kemarin", "3 hari lalu", else the date. */
export function formatRelative(value: string, now: Date = new Date(), timezone: string = DEFAULT_TIMEZONE): string {
  const instant = new Date(value);
  const diffMs = now.getTime() - instant.getTime();
  if (diffMs >= 0 && diffMs < 60_000) return "Baru saja";
  if (diffMs >= 0 && diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} menit lalu`;
  const days = daysBetween(zonedDateString(instant, timezone), zonedDateString(now, timezone));
  if (days === 0) return diffMs >= 0 ? `${Math.floor(diffMs / 3_600_000)} jam lalu` : "Hari ini";
  if (days === 1) return "Kemarin";
  if (days > 1 && days < 7) return `${days} hari lalu`;
  return formatDate(value, timezone);
}

/** Days from `today` until a YYYY-MM-DD date; negative when it is past. */
export function daysUntil(date: string, today: string): number {
  return daysBetween(today, date);
}

/** Stored "4.000" -> "4", "1.500" -> "1,5" (brief §3.1: comma decimal). */
export function formatQuantity(stored: string): string {
  if (!stored.includes(".")) return stored;
  const trimmed = stored.replace(/0+$/, "").replace(/\.$/, "");
  return (trimmed === "" ? "0" : trimmed).replace(".", ",");
}

/** Normalized "628123456789" -> "+62 812-3456-789". */
export function formatPhone(normalized: string | null | undefined): string {
  if (!normalized) return "-";
  const digits = normalized.replace(/[^0-9]/g, "");
  if (!digits.startsWith("62")) return `+${digits}`;
  const local = digits.slice(2);
  const groups = [local.slice(0, 3), local.slice(3, 7), local.slice(7)].filter(Boolean);
  return `+62 ${groups.join("-")}`;
}

/** "Aditya Pratama" -> "AP" */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[words.length - 1][0]}`;
  return letters.toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
