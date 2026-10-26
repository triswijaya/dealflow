import { CircleCheck, Receipt, SearchX, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ChipLink, EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { StatusTile } from "@/components/ui/stat";
import { daysUntil, formatDate, formatRupiah, formatRupiahCompact } from "@/lib/format";
import { INVOICE_STATUS } from "@/lib/labels";
import { one, positiveInt, withParams } from "@/lib/url";
import { getCustomer, type CustomerOptionDto } from "@/server/customers/customers";
import { getInvoiceSummary, listInvoiceRows } from "@/server/invoices/invoice-views";
import { load, requireWorkspace } from "../workspace";
import { InvoiceRowMenu, InvoiceToolbar } from "./invoice-controls";

export const metadata: Metadata = { title: "Invoice · DealFlow" };

const PAGE_SIZES = [25, 50, 100];

// Full rupiah while it fits a tile, compact once it would not; the title attribute keeps the exact value.
const kpiAmount = (value: string) => (BigInt(value) >= 1_000_000_000n ? formatRupiahCompact(value) : formatRupiah(value));
const STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID", "OVERDUE"] as const;
type Status = (typeof STATUSES)[number];

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  // Sales have no invoice access (§6.2).
  const workspace = await requireWorkspace(["OWNER", "ADMIN", "FINANCE"]);
  const params = await searchParams;
  const canCreate = true; // Owner, Admin and Finance can all issue invoices.

  const query = (one(params.q) ?? "").slice(0, 200);
  const statusParam = one(params.status);
  const status = (STATUSES as readonly string[]).includes(statusParam ?? "") ? (statusParam as Status) : undefined;
  const from = one(params.from);
  const to = one(params.to);
  const rangeValid = !(from && to && from > to);
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

  const [summary, result] = await Promise.all([
    load((headers) => getInvoiceSummary({ headers })),
    load((headers) =>
      listInvoiceRows({
        headers,
        page: positiveInt(one(params.page)),
        pageSize: pageSize && PAGE_SIZES.includes(pageSize) ? pageSize : undefined,
        filters: { query: query || undefined, status, customerId: customer?.id, dueFrom: rangeValid ? from : undefined, dueTo: rangeValid ? to : undefined },
      }),
    ),
  ]);

  const href = (changes: Record<string, string | number | null>) => withParams("/invoices", params, { page: null, ...changes });
  const filtered = Boolean(query || status || customer || from || to);

  return (
    <>
      <PageHeader
        title="Invoice"
        description="Tagihan dan status pembayaran."
        actions={canCreate ? <ButtonLink href="/invoices/new">Buat invoice</ButtonLink> : undefined}
      />
      <div className="tiles">
        <StatusTile
          status="warning"
          icon={Receipt}
          value={kpiAmount(summary.outstandingTotal)}
          label={summary.outstandingCount > 0 ? `Belum lunas · ${summary.outstandingCount} invoice` : "Semua invoice lunas"}
          href={href({ status: "UNPAID" })}
          selected={status === "UNPAID"}
        />
        <StatusTile
          status="danger"
          icon={TriangleAlert}
          value={kpiAmount(summary.overdueTotal)}
          label={summary.overdueCount > 0 ? `Lewat jatuh tempo · ${summary.overdueCount} invoice` : "Tidak ada invoice terlambat"}
          href={href({ status: "OVERDUE" })}
          selected={status === "OVERDUE"}
        />
        <StatusTile
          status="success"
          icon={CircleCheck}
          value={summary.paidThisMonth}
          label={summary.paidThisMonth > 0 ? "Invoice lunas bulan ini" : "Belum ada invoice lunas"}
          href={href({ status: "PAID" })}
          selected={status === "PAID"}
        />
      </div>

      {/* Nothing to filter yet on a first run: the empty state says what to do first. */}
      {filtered || result.totalItems > 0 ? (
        <>
          <InvoiceToolbar query={query} customer={customer} from={from} to={to} />
          <div className="chips" style={{ marginTop: 14, marginBottom: 14 }}>
            {STATUSES.map((value) => (
              <ChipLink key={value} href={href({ status: status === value ? null : value })} active={status === value}>
                {value === "OVERDUE" ? "Lewat jatuh tempo" : INVOICE_STATUS[value]?.label}
              </ChipLink>
            ))}
          </div>
        </>
      ) : null}

      {result.items.length === 0 ? (
        filtered || result.totalItems > 0 ? (
          <EmptyState
            icon={SearchX}
            title="Tidak ada hasil untuk filter ini"
            description="Coba ubah kata pencarian atau pilihan filter."
            action={
              <ButtonLink variant="tertiary" href="/invoices">
                Reset filter
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState
            icon={Receipt}
            title="Belum ada invoice"
            description="Invoice dibuat dari deal yang sudah menang."
            action={
              <ButtonLink variant="secondary" href="/invoices/new">
                Buat invoice
              </ButtonLink>
            }
          />
        )
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nomor</th>
                <th>Customer · deal</th>
                <th>Tanggal terbit</th>
                <th>Jatuh tempo</th>
                <th className="num">Total</th>
                <th className="num">Terbayar</th>
                <th className="num">Sisa</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((row) => {
                const info = INVOICE_STATUS[row.status];
                const total = BigInt(row.total);
                const percent = total === 0n ? 0 : Number((BigInt(row.paidAmount) * 10000n) / total) / 100;
                const late = row.status === "OVERDUE" ? -daysUntil(row.dueDate, workspace.today) : 0;
                return (
                  <tr key={row.id}>
                    <td data-label="Nomor">
                      <div>
                        <Link href={`/invoices/${row.id}`}>
                          <b className="doc-id">{row.invoiceNumber}</b>
                        </Link>
                      </div>
                    </td>
                    <td data-label="Customer · deal" className="cell-primary">
                      <div>
                        <Link href={`/customers/${row.customerId}`}>{row.customerName}</Link>
                        <small>
                          <Link href={`/deals/${row.dealId}`}>{row.dealTitle}</Link>
                        </small>
                      </div>
                    </td>
                    <td className="nowrap" data-label="Tanggal terbit">
                      <div>{formatDate(row.issueDate)}</div>
                    </td>
                    <td className="nowrap" data-label="Jatuh tempo">
                      <div>
                        {formatDate(row.dueDate)}
                        {late > 0 ? <small className="red">lewat {late} hari</small> : null}
                      </div>
                    </td>
                    <td className="num" data-label="Total">
                      <div>{formatRupiah(row.total)}</div>
                    </td>
                    <td className="num" data-label="Terbayar">
                      <div>{formatRupiah(row.paidAmount)}</div>
                    </td>
                    <td className="num" data-label="Sisa">
                      <div>
                        <b>{formatRupiah(row.remainingAmount)}</b>
                        <div className="progress" role="img" aria-label={`${Math.round(percent)}% terbayar`}>
                          <span style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    </td>
                    <td data-label="Status">
                      <div>
                        <Badge tone={info?.tone}>{row.status === "OVERDUE" ? "Lewat jatuh tempo" : (info?.label ?? row.status)}</Badge>
                      </div>
                    </td>
                    <td data-label="Aksi">
                      <div>
                        <InvoiceRowMenu
                          today={workspace.today}
                          invoice={{ id: row.id, invoiceNumber: row.invoiceNumber, customerName: row.customerName, issueDate: row.issueDate, total: row.total, remainingAmount: row.remainingAmount }}
                        />
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
