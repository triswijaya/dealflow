import { describe, expect, it } from "vitest";
import { dayRange, rolling, stageSeries } from "./trends";

describe("dashboard trends", () => {
  const days = dayRange("2026-11-03", 4);

  it("lists the days ending today, across a month boundary", () => {
    expect(days).toEqual(["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  it("sums what falls in the window ending each day", () => {
    expect(rolling(days, [{ day: "2026-10-31", amount: 5 }, { day: "2026-11-02", amount: 2 }], 2)).toEqual([5, 5, 2, 2]);
  });

  it("puts a deal in the stage it held at the end of each day, from its events", () => {
    const series = stageSeries(
      days,
      [
        { id: "a", createdDay: "2026-10-31", status: "WON", value: 100 },
        { id: "b", createdDay: "2026-11-02", status: "PROPOSAL", value: 40 },
      ],
      [
        { dealId: "a", day: "2026-11-01", fromStatus: "PROPOSAL", toStatus: "NEGOTIATION" },
        { dealId: "a", day: "2026-11-03", fromStatus: "NEGOTIATION", toStatus: "WON" },
      ],
    );
    expect(series.PROPOSAL.value).toEqual([100, 0, 40, 40]);
    expect(series.NEGOTIATION.value).toEqual([0, 100, 100, 0]);
    expect(series.NEGOTIATION.count).toEqual([0, 1, 1, 0]);
  });
});
