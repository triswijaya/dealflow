import { z } from "zod";

// SEARCH-02: "pagination server (default 25, maksimum 100 per halaman)".
// API-04 restates the same ceiling ("pagination maksimum 100") as a
// general request-limit rule; both point at the same two numbers, kept
// here as the single source of truth every list operation shares.
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const paginationInputSchema = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

export type PaginationInput = { page?: number; pageSize?: number };

// §15 contract table: "list/search/dashboard | ... | Scoped DTOs + bounded
// pagination metadata". page/pageSize/totalItems/totalPages give the
// client everything a page-numbered table needs (current page, page
// jump, "Showing X of Y") without a second round trip.
export type PaginatedDto<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

/**
 * Validates and defaults the raw page/pageSize input, then derives the
 * SQL-ready limit/offset pair. page is 1-indexed; offset is 0-indexed, the
 * usual translation between the two.
 */
export function resolvePagination(input: PaginationInput): {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
} {
  const { page, pageSize } = paginationInputSchema.parse(input);
  const resolvedPage = page ?? 1;
  const resolvedPageSize = pageSize ?? DEFAULT_PAGE_SIZE;
  return {
    page: resolvedPage,
    pageSize: resolvedPageSize,
    limit: resolvedPageSize,
    offset: (resolvedPage - 1) * resolvedPageSize,
  };
}

export function buildPaginatedDto<T>(items: T[], page: number, pageSize: number, totalItems: number): PaginatedDto<T> {
  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  };
}
