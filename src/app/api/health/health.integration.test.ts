import { describe, expect, it } from "vitest";
import { GET as liveness } from "./route";
import { GET as readiness } from "./ready/route";

describe("health endpoints (OBS-03)", () => {
  it("liveness answers without touching anything else", async () => {
    const response = liveness();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("readiness reports ready against a reachable database and exposes nothing else", async () => {
    const response = await readiness();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
