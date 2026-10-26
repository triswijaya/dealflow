import { HandCoins, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Avatar, ChipLink, EmptyState, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, formatRupiah, formatTime } from "@/lib/format";
import { DEAL_STAGE, DEAL_STAGES, type DealStage } from "@/lib/labels";
import { one, positiveInt, withParams } from "@/lib/url";
import { getCustomer, type CustomerOptionDto } from "@/server/customers/customers";
import { listAssignableMembers, listDealRows, type DealSort } from "@/server/deals/deal-views";
import { load, requireWorkspace } from "../workspace";
import { NewDealButton } from "./deal-form";
import { DealRowActions } from "./deal-row-actions";
import { DealToolbar } from "./deal-toolbar";

export const metadata: Metadata = { title: "Deal · DealFlow" };

const PAGE_SIZES = [25, 50, 100];
const SORTS: Record<string, DealSort> = { value: "estimatedValue", close: "expectedCloseDate", activity: "lastActivityAt", created: "createdAt" };
const SORT_LABEL: Record<string, string> = { value: "Nilai", close: "Target closing", activity: "Aktivitas terakhir", created: "Dibuat" };

export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  const workspace = await requireWorkspace();
  const params = await searchParams;
  const finance = workspace.role === "FINANCE";

  const query = (one(params.q) ?? "").slice(0, 200);
  const assignedToId = one(params.sales) ?? "";
  const stageParam = one(params.stage);
  const stage = (DEAL_STAGES as readonly string[]).includes(stageParam ?? "") ? (stageParam as DealStage) : undefined;
  const from = one(params.from);
  const to = one(params.to);
  // An inverted range is shown as an error in the toolbar and not applied.
  const rangeValid = !(from && to && from > to);
  const sortKey = one(params.sort) && SORTS[one(params.sort)!] ? one(params.sort)! : "created";
  const direction = one(params.dir) === "asc" ? "asc" : "desc";
  const pageSize = positiveInt(one(params.pageSize));

  const members = await load((headers) => listAssignableMembers({ headers }));
  const customerId = one(params.customer);
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
    listDealRows({
      headers,
      page: positiveInt(one(params.page)),
      pageSize: pageSize && PAGE_SIZES.includes(pageSize) ? pageSize : undefined,
      sort: SORTS[sortKey],
      direction,
      filters: {
        query: query || undefined,
        status: finance ? undefined : stage,
        assignedToId: assignedToId || undefined,
        customerId: customer?.id,
        createdFrom: rangeValid ? from : undefined,
        createdTo: rangeValid ? to : undefined,
      },
    }),
  );

  const actor = { userId: workspace.user.id, name: workspace.user.name, role: workspace.role };
  const href = (changes: Record<string, string | number | null>) => withParams("/deals", params, { page: null, ...changes });
  const memberName = (id: string) => members.find((member) => member.userId === id);

  const activeFilters: { key: string; label: string; remove: string }[] = [];
  if (assignedToId) activeFilters.push({ key: "sales", label: `Assigned sales: ${memberName(assignedToId)?.name ?? "—"}`, remove: href({ sales: null }) });
  if (stage && !finance) activeFilters.push({ key: "stage", label: DEAL_STAGE[stage].label, remove: href({ stage: null }) });
  if (customer) activeFilters.push({ key: "customer", label: `Customer: ${customer.companyName}`, remove: href({ customer: null }) });
  if (query) activeFilters.push({ key: "q", label: `Cari: ${query}`, remove: href({ q: null }) });
  if (rangeValid && (from || to)) {
    activeFilters.push({ key: "range", label: `${from ? formatDate(from) : "…"} – ${to ? formatDate(to) : "…"}`, remove: href({ from: null, to: null }) });
  }
  const filtered = activeFilters.length > 0;

  function sortHeader(key: string) {
    const current = sortKey === key;
    const next = current && direction === "desc" ? "asc" : "desc";
    return (
      <Link href={href({ sort: key === "created" && next === "desc" ? null : key, dir: next === "desc" ? null : next })}>
        {SORT_LABEL[key]} <span aria-hidden="true">{current ? (direction === "desc" ? "↓" : "↑") : "↕"}</span>
      </Link>
    );
  }
  const ariaSort = (key: string) => (sortKey === key ? (direction === "desc" ? "descending" : "ascending") : undefined);

  return (
    <>
      <PageHeader
        title={finance ? "Deal menang" : "Deal"}
        description={finance ? "Kesepakatan final yang dapat ditagih." : "Semua peluang, dari percakapan hingga kesepakatan."}
        actions={
          finance ? undefined : (
            <>
              <div className="chips seg">
                <ButtonLink variant="tertiary" href="/pipeline">
                  Pipeline
                </ButtonLink>
                <ButtonLink variant="secondary" href="/deals">
                  Tabel
                </ButtonLink>
              </div>
              <NewDealButton members={members} actor={actor} />
            </>
          )
        }
      />
      <DealToolbar query={query} assignedToId={assignedToId} customer={customer} members={members} dateRange from={from} to={to} />
      {finance ? null : (
        <div className="chips" style={{ marginTop: 14 }}>
          <ChipLink href={href({ stage: null })} active={!stage}>
            Semua
          </ChipLink>
          {DEAL_STAGES.map((value) => (
            <ChipLink key={value} href={href({ stage: value })} active={stage === value}>
              {DEAL_STAGE[value].label}
            </ChipLink>
          ))}
        </div>
      )}
      {filtered ? (
        <div className="chips" style={{ marginTop: 14, marginBottom: 14 }} aria-label="Filter aktif">
          {activeFilters.map((filter) => (
            <Link key={filter.key} className="chip active" href={filter.remove} aria-label={`Hapus filter ${filter.label}`}>
              {filter.label} ×
            </Link>
          ))}
          <ButtonLink variant="tertiary" href="/deals">
            Reset filter
          </ButtonLink>
        </div>
      ) : (
        <div style={{ height: 14 }} />
      )}

      {result.items.length === 0 ? (
        filtered || result.totalItems > 0 ? (
          <EmptyState
            icon={SearchX}
            title="Tidak ada hasil untuk filter ini"
            description="Coba ubah kata pencarian atau pilihan filter."
            action={
              <ButtonLink variant="tertiary" href="/deals">
                Reset filter
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState
            icon={HandCoins}
            title={finance ? "Belum ada deal menang" : "Belum ada deal"}
            description={finance ? "Deal yang dimenangkan tim sales akan muncul di sini." : "Buat peluang pertama untuk mulai mengelola pipeline."}
            action={finance ? undefined : <NewDealButton members={members} actor={actor} />}
          />
        )
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Judul deal</th>
                <th>Customer</th>
                <th>Tahap</th>
                <th className="num" aria-sort={ariaSort("value")}>
                  {sortHeader("value")}
                </th>
                <th>Assigned sales</th>
                <th aria-sort={ariaSort("close")}>{sortHeader("close")}</th>
                <th aria-sort={ariaSort("activity")}>{sortHeader("activity")}</th>
                <th aria-sort={ariaSort("created")}>{sortHeader("created")}</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((deal) => {
                const stageInfo = DEAL_STAGE[deal.status as DealStage];
                const won = deal.status === "WON";
                return (
                  <tr key={deal.id}>
                    <td data-label="Judul deal">
                      <div>
                        <b>
                          <Link href={`/deals/${deal.id}`}>{deal.title}</Link>
                        </b>
                      </div>
                    </td>
                    <td data-label="Customer">
                      <div>
                        <Link href={`/customers/${deal.customerId}`}>{deal.customerName}</Link>
                      </div>
                    </td>
                    <td data-label="Tahap">
                      <div>
                        <Badge tone={stageInfo?.tone}>{stageInfo?.label ?? deal.status}</Badge>
                      </div>
                    </td>
                    <td className="num" data-label="Nilai">
                      <div>
                        <span title={won ? "Nilai menang" : "Nilai estimasi"}>{formatRupiah(won && deal.wonValue ? deal.wonValue : deal.estimatedValue)}</span>
                      </div>
                    </td>
                    <td className="nowrap" data-label="Assigned sales">
                      <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                        <Avatar name={deal.assignedToName} />
                        {deal.assignedToName}
                      </div>
                    </td>
                    <td className="nowrap" data-label="Target closing">
                      <div>{deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : "-"}</div>
                    </td>
                    <td className="nowrap" data-label="Aktivitas terakhir">
                      <div>
                        {formatDate(deal.lastActivityAt, workspace.timezone)}
                        <small>{formatTime(deal.lastActivityAt, workspace.timezone)}</small>
                      </div>
                    </td>
                    <td className="nowrap" data-label="Dibuat">
                      <div>{formatDate(deal.createdAt, workspace.timezone)}</div>
                    </td>
                    <td data-label="Aksi">
                      <div>
                        {deal.status === "WON" || deal.status === "LOST" || finance ? (
                          <ButtonLink variant="tertiary" href={`/deals/${deal.id}`}>
                            Buka
                          </ButtonLink>
                        ) : (
                          <DealRowActions deal={deal} role={workspace.role} />
                        )}
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
