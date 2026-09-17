// CUS-01: store the raw input and a normalized international form. Real
// Indonesian input is rarely clean (dashes, spaces, parens around area
// codes), so formatting characters are stripped before the prefix rule
// applies. Output has no "+", matching the format WA-01's wa.me links need.
const MIN_DIGITS = 8;
const MAX_DIGITS = 15; // E.164 upper bound

export function normalizePhone(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  const hasPlusPrefix = trimmed.startsWith("+");
  const digitsOnly = trimmed.replace(/[^0-9]/g, "");

  if (digitsOnly.length === 0) {
    return null;
  }

  let normalized: string;
  if (digitsOnly.startsWith("0")) {
    // Indonesian local format: 0812... -> 62812...
    normalized = `62${digitsOnly.slice(1)}`;
  } else if (hasPlusPrefix || digitsOnly.startsWith("62")) {
    // Already has an explicit country code (+62812... or 62812...).
    normalized = digitsOnly;
  } else {
    // No leading 0 and no explicit country code: can't tell what this is.
    return null;
  }

  if (normalized.length < MIN_DIGITS || normalized.length > MAX_DIGITS) {
    return null;
  }

  return normalized;
}
