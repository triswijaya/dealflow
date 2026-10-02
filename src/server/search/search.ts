import { z } from "zod";
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH } from "./search-limits";
import { requireMembership } from "@/server/auth/require-membership";
import { listCustomers, type CustomerListItemDto } from "@/server/customers/customers";
import { listDealRows, type DealRowDto } from "@/server/deals/deal-views";
import { listInvoiceRows, type InvoiceRowDto } from "@/server/invoices/invoice-views";
import { listQuotationRows, type QuotationRowDto } from "@/server/quotations/quotation-views";

// SEARCH-01/02: one simple database search across what a role may open. It
// asks each module's own list for a few matches, so every group already
// carries that module's tenant and role scope (Finance sees won deals only
// and no quotations; Sales sees no invoices) and none of it is redone here.

export { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH };

export type SearchResults = {
  query: string;
  /** False while the query is too short to search (the UI says so instead of listing everything). */
  searched: boolean;
  customers: Pick<CustomerListItemDto, "id" | "companyName" | "contactPerson" | "phoneNormalized">[];
  deals: Pick<DealRowDto, "id" | "title" | "customerName" | "status" | "estimatedValue" | "wonValue">[];
  quotations: Pick<QuotationRowDto, "id" | "quotationNumber" | "customerName" | "status" | "total" | "isLatest">[];
  invoices: Pick<InvoiceRowDto, "id" | "invoiceNumber" | "customerName" | "status" | "remainingAmount">[];
};

export async function globalSearch(params: { headers: Headers; query: string; limit?: number }): Promise<SearchResults> {
  const member = await requireMembership({ headers: params.headers });
  const query = z.string().trim().max(MAX_QUERY_LENGTH).parse(params.query);
  const limit = z.number().int().min(1).max(25).default(5).parse(params.limit);
  const empty: SearchResults = { query, searched: false, customers: [], deals: [], quotations: [], invoices: [] };
  if (query.length < MIN_QUERY_LENGTH) return empty;

  const role = member.role;
  const canQuotations = role !== "FINANCE";
  const canInvoices = role !== "SALES";

  const [customers, dealRows, quotationRows, invoiceRows] = await Promise.all([
    listCustomers({ headers: params.headers, query, pageSize: limit }),
    listDealRows({ headers: params.headers, filters: { query }, pageSize: limit, sort: "lastActivityAt", direction: "desc" }),
    canQuotations ? listQuotationRows({ headers: params.headers, filters: { query, latestOnly: false }, pageSize: limit }) : null,
    canInvoices ? listInvoiceRows({ headers: params.headers, filters: { query }, pageSize: limit }) : null,
  ]);

  return {
    query,
    searched: true,
    customers: customers.items.map((customer) => ({
      id: customer.id,
      companyName: customer.companyName,
      contactPerson: customer.contactPerson,
      phoneNormalized: customer.phoneNormalized,
    })),
    deals: dealRows.items.map((deal) => ({
      id: deal.id,
      title: deal.title,
      customerName: deal.customerName,
      status: deal.status,
      estimatedValue: deal.estimatedValue,
      wonValue: deal.wonValue,
    })),
    quotations: (quotationRows?.items ?? []).map((quotation) => ({
      id: quotation.id,
      quotationNumber: quotation.quotationNumber,
      customerName: quotation.customerName,
      status: quotation.status,
      total: quotation.total,
      isLatest: quotation.isLatest,
    })),
    invoices: (invoiceRows?.items ?? []).map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      status: invoice.status,
      remainingAmount: invoice.remainingAmount,
    })),
  };
}
