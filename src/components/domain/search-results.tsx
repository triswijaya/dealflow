import Link from "next/link";
import { formatPhone, formatRupiah } from "@/lib/format";
import { DEAL_STAGE, INVOICE_STATUS, QUOTATION_STATUS, type DealStage } from "@/lib/labels";
import type { SearchResults } from "@/server/search/search";

type Row = { key: string; href: string; title: string; detail: string };

/** The four result groups, one row per match; shared by the topbar dropdown and the results page. */
export function SearchGroups({ results, onNavigate }: { results: SearchResults; onNavigate?: () => void }) {
  const groups: { label: string; rows: Row[] }[] = [
    {
      label: "Customer",
      rows: results.customers.map((customer) => ({
        key: customer.id,
        href: `/customers/${customer.id}`,
        title: customer.companyName,
        detail: `${customer.contactPerson} · ${formatPhone(customer.phoneNormalized)}`,
      })),
    },
    {
      label: "Deal",
      rows: results.deals.map((deal) => ({
        key: deal.id,
        href: `/deals/${deal.id}`,
        title: deal.title,
        detail: `${deal.customerName} · ${DEAL_STAGE[deal.status as DealStage]?.label ?? deal.status} · ${formatRupiah(deal.status === "WON" && deal.wonValue ? deal.wonValue : deal.estimatedValue)}`,
      })),
    },
    {
      label: "Quotation (nomor)",
      rows: results.quotations.map((quotation) => ({
        key: quotation.id,
        href: `/quotations/${quotation.id}`,
        title: quotation.quotationNumber,
        detail: `${quotation.customerName} · ${QUOTATION_STATUS[quotation.status]?.label ?? quotation.status} · ${quotation.isLatest ? formatRupiah(quotation.total) : "Versi lama"}`,
      })),
    },
    {
      label: "Invoice (nomor)",
      rows: results.invoices.map((invoice) => ({
        key: invoice.id,
        href: `/invoices/${invoice.id}`,
        title: invoice.invoiceNumber,
        detail: `${invoice.customerName} · ${invoice.status === "OVERDUE" ? "Lewat jatuh tempo" : (INVOICE_STATUS[invoice.status]?.label ?? invoice.status)} · ${formatRupiah(invoice.remainingAmount)} tersisa`,
      })),
    },
  ];

  return (
    <>
      {groups
        .filter((group) => group.rows.length > 0)
        .map((group) => (
          <div key={group.label} className="search-group">
            <div className="eyebrow">{group.label}</div>
            {group.rows.map((row) => (
              <Link key={row.key} className="row search-row" href={row.href} onClick={onNavigate}>
                <span>
                  <strong>{row.title}</strong>
                  <small style={{ display: "block" }}>{row.detail}</small>
                </span>
              </Link>
            ))}
          </div>
        ))}
    </>
  );
}

export const hasResults = (results: SearchResults) => results.customers.length + results.deals.length + results.quotations.length + results.invoices.length > 0;
