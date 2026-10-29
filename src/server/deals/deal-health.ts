import type { ActiveStage } from "./stages";

// DEAL-09: health is computed when a deal is read, never stored. The
// thresholds are code constants, not settings.

/** Days a deal may sit in a stage before it counts as stale. */
export const STALE_AFTER_DAYS: Record<ActiveStage, number> = {
  PROSPECT: 14,
  PROPOSAL: 14,
  NEGOTIATION: 21,
  COMMITMENT: 30,
};

export const DEAL_SIGNALS = ["NO_NEXT_STEP", "TASK_OVERDUE", "STALE", "PAST_CLOSE_DATE", "HOLD_REVIEW_DUE"] as const;
export type DealSignal = (typeof DEAL_SIGNALS)[number];

export type DealHealthInput = {
  status: string;
  onHoldUntil: string | null;
  /** The organization-calendar date the deal entered its current stage (YYYY-MM-DD). */
  stageEnteredOn: string;
  expectedCloseDate: string | null;
  /** Open tasks: neither done nor cancelled. */
  openTasks: number;
  /** Open tasks scheduled before today. */
  overdueTasks: number;
  /** The organization's today (YYYY-MM-DD). */
  today: string;
};

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * WON and LOST deals have no signals. A deal on hold has only HOLD_REVIEW_DUE,
 * because a parked deal is not expected to have a next step or to age.
 */
export function dealSignals(input: DealHealthInput): DealSignal[] {
  if (input.status === "WON" || input.status === "LOST") return [];
  if (input.onHoldUntil) return input.onHoldUntil <= input.today ? ["HOLD_REVIEW_DUE"] : [];

  const signals: DealSignal[] = [];
  if (input.openTasks === 0) signals.push("NO_NEXT_STEP");
  if (input.overdueTasks > 0) signals.push("TASK_OVERDUE");
  const limit = STALE_AFTER_DAYS[input.status as ActiveStage];
  if (limit !== undefined && daysBetween(input.stageEnteredOn, input.today) > limit) signals.push("STALE");
  if (input.expectedCloseDate && input.expectedCloseDate < input.today) signals.push("PAST_CLOSE_DATE");
  return signals;
}
