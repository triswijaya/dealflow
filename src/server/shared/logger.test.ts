import { describe, expect, it } from "vitest";
import { createLogger, getRequestId, redact, REDACTED, safeError } from "./logger";

function capture() {
  const lines: { line: string; level: string }[] = [];
  const logger = createLogger({ sink: (line, level) => lines.push({ line, level }), now: () => new Date("2026-10-10T03:04:05.678Z") });
  return { logger, lines, last: () => JSON.parse(lines[lines.length - 1].line) as Record<string, unknown> };
}

describe("logger (OBS-02)", () => {
  it("writes one JSON line with timestamp, level and operation", () => {
    const { logger, lines, last } = capture();
    logger.info("invoice.create", { requestId: "req-12345678", durationMs: 42, status: 201 });
    expect(lines).toHaveLength(1);
    expect(last()).toEqual({
      timestamp: "2026-10-10T03:04:05.678Z",
      level: "info",
      operation: "invoice.create",
      requestId: "req-12345678",
      durationMs: 42,
      status: 201,
    });
  });

  it("routes levels to the sink with the level it was given", () => {
    const { logger, lines } = capture();
    logger.warn("a");
    logger.error("b");
    expect(lines.map((entry) => entry.level)).toEqual(["warn", "error"]);
  });
});

describe("redaction (SEC-08)", () => {
  it("hides values under sensitive keys at any depth", () => {
    expect(
      redact({
        password: "hunter2",
        nested: { sessionToken: "abc", cookie: "a=b", apiKey: "k", Authorization: "Bearer x", keep: "visible" },
        list: [{ resetToken: "t", id: 7 }],
      }),
    ).toEqual({
      password: REDACTED,
      nested: { sessionToken: REDACTED, cookie: REDACTED, apiKey: REDACTED, Authorization: REDACTED, keep: "visible" },
      list: [{ resetToken: REDACTED, id: 7 }],
    });
  });

  it("hides connection strings and bearer credentials inside ordinary values", () => {
    const text = redact("failed to reach postgresql://dealflow:s3cret@db.internal:5432/dealflow and Bearer abc.def.ghi") as string;
    expect(text).not.toContain("s3cret");
    expect(text).not.toContain("abc.def.ghi");
    expect(text).toContain(REDACTED);
  });

  it("keeps harmless values untouched", () => {
    expect(redact({ operation: "payment.record", amount: "10000000", ok: true, nothing: null })).toEqual({
      operation: "payment.record",
      amount: "10000000",
      ok: true,
      nothing: null,
    });
  });

  it("stops at a bounded depth instead of walking forever", () => {
    type Node = { next?: Node };
    const root: Node = {};
    let cursor = root;
    for (let i = 0; i < 20; i++) cursor = cursor.next = {};
    expect(JSON.stringify(redact(root))).toContain("[truncated]");
  });

  it("reduces errors to a safe name and code, never message or stack", () => {
    const error = Object.assign(new Error("connect failed postgresql://u:pw@host/db"), { code: "ECONNREFUSED" });
    expect(safeError(error)).toEqual({ name: "Error", code: "ECONNREFUSED" });
    expect(safeError("boom")).toEqual({ name: "UnknownError" });

    const { logger, lines } = capture();
    logger.error("health.ready", { error });
    expect(lines[0].line).not.toContain("pw@host");
    expect(lines[0].line).toContain("ECONNREFUSED");
  });
});

describe("getRequestId", () => {
  it("keeps a sane incoming id and replaces a hostile one", () => {
    expect(getRequestId(new Request("http://x", { headers: { "x-request-id": "abc-12345678" } }))).toBe("abc-12345678");
    const replaced = getRequestId(new Request("http://x", { headers: { "x-request-id": "bad id; with spaces <script>" } }));
    expect(replaced).toMatch(/^[0-9a-f-]{36}$/);
    expect(getRequestId(new Request("http://x"))).toMatch(/^[0-9a-f-]{36}$/);
  });
});
