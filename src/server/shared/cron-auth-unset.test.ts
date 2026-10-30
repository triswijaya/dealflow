import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/env", () => ({ env: {} }));

const { isAuthorizedCron } = await import("./cron-auth");

describe("isAuthorizedCron without a configured secret", () => {
  it("refuses everyone, including an empty bearer", () => {
    expect(isAuthorizedCron(new Request("https://example.test", { headers: { authorization: "Bearer " } }))).toBe(false);
    expect(isAuthorizedCron(new Request("https://example.test", { headers: { authorization: "Bearer undefined" } }))).toBe(false);
  });
});
