import { describe, expect, it } from "vitest";
import { dealSignals, STALE_AFTER_DAYS, type DealHealthInput } from "./deal-health";

const base: DealHealthInput = {
  status: "PROPOSAL",
  onHoldUntil: null,
  stageEnteredOn: "2026-10-20",
  expectedCloseDate: "2026-12-01",
  openTasks: 1,
  overdueTasks: 0,
  today: "2026-10-29",
};
const signals = (overrides: Partial<DealHealthInput>) => dealSignals({ ...base, ...overrides });

describe("dealSignals (DEAL-09)", () => {
  it("is empty for a healthy deal", () => {
    expect(signals({})).toEqual([]);
  });

  it("flags a deal without an open task", () => {
    expect(signals({ openTasks: 0 })).toEqual(["NO_NEXT_STEP"]);
  });

  it("flags an overdue task but not NO_NEXT_STEP, since a task exists", () => {
    expect(signals({ openTasks: 2, overdueTasks: 1 })).toEqual(["TASK_OVERDUE"]);
  });

  it("goes stale only after the stage limit, per stage", () => {
    const limit = STALE_AFTER_DAYS.PROPOSAL;
    expect(signals({ stageEnteredOn: "2026-10-15" })).toEqual([]); // 14 days: at the limit
    expect(signals({ stageEnteredOn: "2026-10-14" })).toEqual(["STALE"]); // 15 days
    expect(limit).toBe(14);
    expect(signals({ status: "NEGOTIATION", stageEnteredOn: "2026-10-08" })).toEqual([]); // 21 days
    expect(signals({ status: "NEGOTIATION", stageEnteredOn: "2026-10-07" })).toEqual(["STALE"]);
    expect(signals({ status: "COMMITMENT", stageEnteredOn: "2026-09-29" })).toEqual([]); // 30 days
    expect(signals({ status: "COMMITMENT", stageEnteredOn: "2026-09-28" })).toEqual(["STALE"]);
  });

  it("counts the close date as past only after it", () => {
    expect(signals({ expectedCloseDate: "2026-10-29" })).toEqual([]);
    expect(signals({ expectedCloseDate: "2026-10-28" })).toEqual(["PAST_CLOSE_DATE"]);
    expect(signals({ expectedCloseDate: null })).toEqual([]);
  });

  it("combines signals in a stable order", () => {
    expect(signals({ openTasks: 0, stageEnteredOn: "2026-01-01", expectedCloseDate: "2026-02-01" })).toEqual(["NO_NEXT_STEP", "STALE", "PAST_CLOSE_DATE"]);
  });

  it("gives a deal on hold only the review signal, from the review date on", () => {
    const parked = { onHoldUntil: "2026-10-30", openTasks: 0, stageEnteredOn: "2026-01-01", expectedCloseDate: "2026-02-01" };
    expect(signals(parked)).toEqual([]);
    expect(signals({ ...parked, onHoldUntil: "2026-10-29" })).toEqual(["HOLD_REVIEW_DUE"]);
    expect(signals({ ...parked, onHoldUntil: "2026-10-01" })).toEqual(["HOLD_REVIEW_DUE"]);
  });

  it("gives closed deals no signals", () => {
    expect(signals({ status: "WON", openTasks: 0, expectedCloseDate: "2020-01-01" })).toEqual([]);
    expect(signals({ status: "LOST", openTasks: 0 })).toEqual([]);
  });

  it("does not drift across a month or leap-year boundary", () => {
    expect(signals({ today: "2028-03-01", expectedCloseDate: null, stageEnteredOn: "2028-02-16" })).toEqual([]); // 14 days via Feb 29
    expect(signals({ today: "2028-03-01", expectedCloseDate: null, stageEnteredOn: "2028-02-15" })).toEqual(["STALE"]); // 15 days
  });
});
