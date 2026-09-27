"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * SEARCH-02: server pagination, 25/50/100 per page. Page and size live in
 * the URL so a filtered, paged view can be shared or reloaded as-is.
 */
export function Pagination({
  page,
  pageSize,
  totalItems,
  totalPages,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function go(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  if (totalItems === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div className="pagination">
      <span>
        Menampilkan {from}-{to} dari {totalItems}
      </span>
      <div className="row" style={{ gap: 8 }}>
        <label className="row" style={{ gap: 6 }}>
          <span>Per halaman</span>
          <select value={pageSize} onChange={(event) => go({ pageSize: event.target.value, page: "1" })}>
            {[25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="row pages" style={{ gap: 6 }}>
          <button
            type="button"
            className="iconbtn"
            aria-label="Halaman sebelumnya"
            title="Halaman sebelumnya"
            disabled={page <= 1}
            onClick={() => go({ page: String(page - 1) })}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <span>
            {page} / {Math.max(totalPages, 1)}
          </span>
          <button
            type="button"
            className="iconbtn"
            aria-label="Halaman berikutnya"
            title="Halaman berikutnya"
            disabled={page >= totalPages}
            onClick={() => go({ page: String(page + 1) })}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
