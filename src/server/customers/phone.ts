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
  if (hasPlusPrefix) {
    // An explicit "+" commits the input to being an international number,
    // so the digits after it are a country code, never re-interpreted as
    // an Indonesian local "0" prefix -- no valid E.164 country code starts
    // with 0, so "+0..." is self-contradictory input, not a number this
    // function can guess the intent of and silently "correct".
    if (digitsOnly.startsWith("0")) {
      return null;
    }
    normalized = digitsOnly;
  } else if (digitsOnly.startsWith("0")) {
    // Indonesian local format: 0812... -> 62812...
    normalized = `62${digitsOnly.slice(1)}`;
  } else if (digitsOnly.startsWith("62")) {
    // Bare digits already carrying the country code, no leading 0 and no +.
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
