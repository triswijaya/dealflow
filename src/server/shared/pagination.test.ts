import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, buildPaginatedDto, resolvePagination } from "./pagination";

describe("resolvePagination", () => {
  it("defaults to page 1 and DEFAULT_PAGE_SIZE (SEARCH-02) when omitted", () => {
    expect(resolvePagination({})).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      limit: DEFAULT_PAGE_SIZE,
      offset: 0,
    });
  });

  it("respects an explicit page and pageSize", () => {
    expect(resolvePagination({ page: 3, pageSize: 10 })).toEqual({
      page: 3,
      pageSize: 10,
      limit: 10,
      offset: 20,
    });
  });

  it("computes offset correctly for page 2 at the default page size", () => {
    expect(resolvePagination({ page: 2 })).toMatchObject({ offset: DEFAULT_PAGE_SIZE });
  });

  it("accepts exactly MAX_PAGE_SIZE (API-04)", () => {
    expect(resolvePagination({ pageSize: MAX_PAGE_SIZE })).toMatchObject({ pageSize: MAX_PAGE_SIZE });
  });

  it("rejects a pageSize over MAX_PAGE_SIZE", () => {
    expect(() => resolvePagination({ pageSize: MAX_PAGE_SIZE + 1 })).toThrow();
  });

  it("rejects page below 1", () => {
    expect(() => resolvePagination({ page: 0 })).toThrow();
  });

  it("rejects a non-integer pageSize", () => {
    expect(() => resolvePagination({ pageSize: 25.5 })).toThrow();
  });

  it("rejects a non-positive pageSize", () => {
    expect(() => resolvePagination({ pageSize: 0 })).toThrow();
  });
});

describe("buildPaginatedDto", () => {
  it("computes totalPages by ceiling division", () => {
    const dto = buildPaginatedDto(["a", "b"], 1, 25, 51);
    expect(dto.totalPages).toBe(3);
  });

  it("computes totalPages exactly when evenly divisible", () => {
    const dto = buildPaginatedDto(["a"], 1, 25, 50);
    expect(dto.totalPages).toBe(2);
  });

  it("reports 0 totalPages, not 1, when there are no items", () => {
    const dto = buildPaginatedDto([], 1, 25, 0);
    expect(dto.totalPages).toBe(0);
  });

  it("carries the given page/pageSize/totalItems through unchanged", () => {
    const dto = buildPaginatedDto(["x", "y"], 4, 10, 37);
    expect(dto.page).toBe(4);
    expect(dto.pageSize).toBe(10);
    expect(dto.totalItems).toBe(37);
    expect(dto.items).toEqual(["x", "y"]);
  });
});
