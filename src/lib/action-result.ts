// API-02's logical error shape, as returned by every Server Action. Kept in
// lib/ (no server imports) so Client Components can type their results.
export type ActionError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
};

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: ActionError };
