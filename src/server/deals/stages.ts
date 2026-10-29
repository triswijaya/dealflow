// DEAL-03: the deal vocabulary the server stores. No imports on purpose: the
// schema's CHECK constraints read these, so this file must not depend on it.

/** Stage order is the pipeline's left-to-right order (§7.3), not a required path. */
export const ACTIVE_STAGES = ["PROSPECT", "PROPOSAL", "NEGOTIATION", "COMMITMENT"] as const;
export const DEAL_STATUSES = [...ACTIVE_STAGES, "WON", "LOST"] as const;

export type ActiveStage = (typeof ACTIVE_STAGES)[number];

// DEAL-05.
export const LOST_REASONS = [
  "PRICE_TOO_HIGH",
  "LOST_TO_COMPETITOR",
  "BUDGET_UNAVAILABLE",
  "NO_NEED",
  "NO_RESPONSE",
  "PROJECT_CANCELLED",
  "OTHER",
] as const;

// §7.3 "Data wajib": every stage after PROSPECT needs a positive estimated value.
// An estimated value of 0 is how "not estimated yet" is stored.
export function stageNeedsValue(stage: string): boolean {
  return stage !== "PROSPECT" && (ACTIVE_STAGES as readonly string[]).includes(stage);
}
