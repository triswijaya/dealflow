import { describe, expect, it } from "vitest";
import { one, positiveInt, withParams } from "./url";

describe("search param readers", () => {
  it("accepts only a single non-empty string", () => {
    expect(one("abc")).toBe("abc");
    expect(one("")).toBeUndefined();
    expect(one(undefined)).toBeUndefined();
    expect(one(["a", "b"])).toBeUndefined();
  });

  it("accepts only integers from 1 up", () => {
    expect(positiveInt("3")).toBe(3);
    expect(positiveInt("0")).toBeUndefined();
    expect(positiveInt("-1")).toBeUndefined();
    expect(positiveInt("1.5")).toBeUndefined();
    expect(positiveInt("abc")).toBeUndefined();
    expect(positiveInt("")).toBeUndefined();
    expect(positiveInt(undefined)).toBeUndefined();
  });
});

describe("withParams", () => {
  it("keeps current values and applies changes on top", () => {
    expect(withParams("/deals", { q: "abc", page: "2" }, { sort: "name" })).toBe("/deals?q=abc&page=2&sort=name");
    expect(withParams("/deals", { page: "2" }, { page: 3 })).toBe("/deals?page=3");
  });

  it("removes a key when its change is null, undefined or empty", () => {
    expect(withParams("/deals", { q: "abc", page: "2" }, { page: null })).toBe("/deals?q=abc");
    expect(withParams("/deals", { q: "abc" }, { q: undefined })).toBe("/deals");
    expect(withParams("/deals", { q: "abc" }, { q: "" })).toBe("/deals");
  });

  it("drops current values that are empty or repeated, so only clean links come out", () => {
    expect(withParams("/deals", { q: "", stage: ["NEW", "WON"], page: "1" }, {})).toBe("/deals?page=1");
  });

  it("returns the bare path when nothing is left", () => {
    expect(withParams("/deals", {}, {})).toBe("/deals");
  });

  it("encodes values", () => {
    expect(withParams("/customers", {}, { q: "PT Maju & Jaya" })).toBe("/customers?q=PT+Maju+%26+Jaya");
  });
});
