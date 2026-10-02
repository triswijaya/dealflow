import { FileText, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ChipLink, EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { daysUntil, formatDate, formatRupiah } from "@/lib/format";
import { QUOTATION_STATUS } from "@/lib/labels";
import { one, positiveInt, withParams } from "@/lib/url";
import { getCustomer, type CustomerOptionDto } from "@/server/customers/customers";
import { listQuotationRows } from "@/server/quotations/quotation-views";
import { load, requireWorkspace } from "../workspace";
import { NewFromDealButton, QuotationRowMenu, QuotationToolbar } from "./quotation-list-controls";

export const metadata: Metadata = { title: "Penawaran · DealFlow" };

const PAGE_SIZES = [25, 50, 100];
const STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"] as const;
type Status = (typeof STATUSES)[number];

export default async function QuotationsPage({ searchParams }: PageProps<"/quotations">) {
  // Finance has no quotation access in this milestone (§6.2).
  const workspace = await requireWorkspace(["OWNER", "ADMIN", "SALES"]);
  const params = await searchParams;

  const query = (one(params.q) ?? "").slice(0, 200);
  const statusParam = one(params.status);
  const status = (STATUSES as readonly string[]).includes(statusParam ?? "") ? (statusParam as Status) : undefined;
  const latestOnly = one(params.versions) !== "all";
  const customerId = one(params.customer);
  const pageSize = positiveInt(one(params.pageSize));

  const customer: CustomerOptionDto | null = customerId
    ? await load(async (headers) => {
        try {
          const found = await getCustomer({ headers, customerId });
          return { id: found.id, companyName: found.companyName, contactPerson: found.contactPerson };
        } catch {
          return null;
        }
      })
    : null;

  const result = await load((headers) =>
    listQuotationRows({
      headers,
      page: positiveInt(one(params.page)),
      pageSize: pageSize && PAGE_SIZES.includes(pageSize) ? pageSize : undefined,
      filters: { query: query || undefined, status, customerId: customer?.id, latestOnly },
    }),
  );

  const href = (changes: Record<string, string | number | null>) => withParams("/quotations", params, { page: null, ...changes });
  const filtered = Boolean(query || status || customer || !latestOnly);

  return (
    <>
      <PageHeader title="Penawaran" description="Semua quotation dan revisinya." actions={<NewFromDealButton />} />
      <QuotationToolbar query={query} customer={customer} latestOnly={latestOnly} />
      <div className="chips" style={{ margin: "14px 0" }}>
        {STATUSES.map((value) => (
          <ChipLink key={value} href={href({ status: status === value ? null : value })} active={status === value}>
            {QUOTATION_STATUS[value]?.label ?? value}
          </ChipLink>
        ))}
      </div>

      {result.items.length === 0 ? (
        filtered || result.totalItems > 0 ? (
          <EmptyState
            icon={SearchX}
            title="Tidak ada hasil untuk filter ini"
            description="Coba ubah kata pencarian atau pilihan filter."
            action={
              <ButtonLink variant="tertiary" href="/quotations">
                Reset filter
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState icon={FileText} title="Belum ada quotation" description="Buat quotation dari halaman deal, atau pilih deal dengan tombol di atas." />
        )
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nomor</th>
                <th>Customer</th>
                <th>Deal</th>
                <th>Status</th>
                <th>Tanggal terbit</th>
                <th>Berlaku sampai</th>
                <th className="num">Total</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((row) => {
                const info = QUOTATION_STATUS[row.status];
                const days = daysUntil(row.validUntil, workspace.today);
                const open = row.status === "SENT" || row.status === "DRAFT";
                const soon = open && days >= 0 && days <= 3;
                const past = open && days < 0;
                return (
                  <tr key={row.id}>
                    <td data-label="Nomor">
                      <div>
                        <Link href={`/quotations/${row.id}`}>
                          <b style={{ fontFamily: "ui-monospace, monospace" }}>{row.quotationNumber}</b>
                        </Link>
                      </div>
                    </td>
                    <td data-label="Customer">
                      <div>{row.customerName}</div>
                    </td>
                    <td data-label="Deal">
                      <div>
                        <Link href={`/deals/${row.dealId}`}>{row.dealTitle}</Link>
                      </div>
                    </td>
                    <td data-label="Status">
                      <div>
                        <Badge tone={info?.tone}>{info?.label ?? row.status}</Badge>
                      </div>
                    </td>
                    <td data-label="Tanggal terbit">
                      <div>{formatDate(row.issueDate)}</div>
                    </td>
                    <td data-label="Berlaku sampai">
                      <div>
                        {soon ? (
                          <span style={{ color: "var(--df-warn-ink)" }}>
                            {formatDate(row.validUntil)} · {days === 0 ? "hari ini" : `${days} hari lagi`}
                          </span>
                        ) : past ? (
                          <span className="red">{formatDate(row.validUntil)} · sudah lewat</span>
                        ) : (
                          formatDate(row.validUntil)
                        )}
                      </div>
                    </td>
                    <td className="num" data-label="Total">
                      <div>{formatRupiah(row.total)}</div>
                    </td>
                    <td data-label="Aksi">
                      <div>
                        <QuotationRowMenu id={row.id} dealId={row.dealId} timezone={workspace.timezone} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={result.page} pageSize={result.pageSize} totalItems={result.totalItems} totalPages={result.totalPages} />
        </div>
      )}
    </>
  );
}
