/** A query value from Next's searchParams: only a single string counts. */
export function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function positiveInt(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

/**
 * An href for the same page with some query values replaced or removed
 * (null or empty removes). Filters live in the URL (FILTER-01), so every
 * chip, sort header and pager is just a link built from the current state.
 */
export function withParams(
  path: string,
  current: Record<string, string | string[] | undefined>,
  changes: Record<string, string | number | null | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (typeof value === "string" && value !== "") params.set(key, value);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
