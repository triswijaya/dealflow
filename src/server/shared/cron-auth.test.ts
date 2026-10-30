import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/env", () => ({ env: { CRON_SECRET: "a-secret-of-sixteen-plus" } }));

const { isAuthorizedCron } = await import("./cron-auth");
const request = (authorization?: string) => new Request("https://example.test/api/cron/outbox", { headers: authorization ? { authorization } : {} });

describe("isAuthorizedCron (OBS-05)", () => {
  it("accepts the exact bearer secret", () => {
    expect(isAuthorizedCron(request("Bearer a-secret-of-sixteen-plus"))).toBe(true);
  });

  it("refuses a missing, wrong, shorter, longer or differently-schemed credential", () => {
    expect(isAuthorizedCron(request())).toBe(false);
    expect(isAuthorizedCron(request("Bearer wrong-secret-of-the-same-1"))).toBe(false);
    expect(isAuthorizedCron(request("Bearer a-secret"))).toBe(false);
    expect(isAuthorizedCron(request("Bearer a-secret-of-sixteen-plus-and-more"))).toBe(false);
    expect(isAuthorizedCron(request("Basic a-secret-of-sixteen-plus"))).toBe(false);
    expect(isAuthorizedCron(request("a-secret-of-sixteen-plus"))).toBe(false);
  });
});
