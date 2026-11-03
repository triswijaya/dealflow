import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, formatRupiah } from "@/lib/format";
import { ORDER_STATUS, commitmentLabel } from "@/lib/labels";
import { one, positiveInt } from "@/lib/url";
import { listOrders } from "@/server/orders/orders";
import { load, requireWorkspace } from "../workspace";

export const metadata: Metadata = { title: "Pesanan · DealFlow" };

const pct = (part: string, whole: string) => (BigInt(whole) > 0n ? Number((BigInt(part) * 100n) / BigInt(whole)) : 0);

/** ORD-01: every commitment and its plan of termin, newest first. */
export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  await requireWorkspace();
  const params = await searchParams;
  const result = await load((headers) => listOrders({ headers, page: positiveInt(one(params.page)), pageSize: 25 }));

  return (
    <>
      <PageHeader title="Pesanan" description="Komitmen pembelian dan rencana tagihnya. Uang ditagih per termin." />
      {result.items.length === 0 ? (
        <EmptyState title="Belum ada pesanan" description="Pesanan dibuat saat deal dikonfirmasi menang dengan bukti PO, kontrak, atau pembayaran." />
      ) : (
        <div className="table-wrap" style={{ marginTop: 20 }}>
          <table>
            <thead>
              <tr>
                <th>Nomor</th>
                <th>Customer · pesanan</th>
                <th>Komitmen</th>
                <th className="num">Nilai</th>
                <th>Ditagih</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((order) => {
                const status = ORDER_STATUS[order.status];
                const billed = pct(order.billedAmount, order.currentValue);
                const ready = order.billingItems.filter((item) => item.status === "READY").reduce((sum, item) => sum + BigInt(item.amount), 0n);
                const amended = BigInt(order.currentValue) - BigInt(order.originalValue);
                return (
                  <tr key={order.id}>
                    <td data-label="Nomor" className="nowrap">
                      <div>
                        <b>
                          <Link className="doc-id" href={`/orders/${order.id}`}>
                            {order.orderNumber}
                          </Link>
                        </b>
                        <small>{formatDate(order.commitmentDate)}</small>
                      </div>
                    </td>
                    <td data-label="Customer · pesanan" className="cell-primary">
                      <div>
                        <b>{order.customerName}</b>
                        <small>
                          {order.title}
                          {order.dealId ? "" : " · pesanan langsung"}
                        </small>
                      </div>
                    </td>
                    <td data-label="Komitmen">
                      <div>
                        {commitmentLabel(order.commitmentType)}
                        <small>{order.commitmentRef ?? "-"}</small>
                      </div>
                    </td>
                    <td data-label="Nilai" className="num">
                      <div>
                        {formatRupiah(order.currentValue)}
                        {amended !== 0n ? <small>{`${amended > 0n ? "+" : "−"}${formatRupiah(amended > 0n ? amended : -amended)} amandemen`}</small> : null}
                      </div>
                    </td>
                    <td data-label="Ditagih">
                      {order.status === "CANCELLED" ? (
                        "-"
                      ) : (
                        <div style={{ minWidth: 140 }}>
                          <div className="progress" style={{ margin: "2px 0 4px" }}>
                            <span style={{ width: `${Math.min(100, billed)}%` }} />
                          </div>
                          <small>
                            {billed}%{ready > 0n ? ` · siap ${formatRupiah(ready)}` : ""}
                          </small>
                        </div>
                      )}
                    </td>
                    <td data-label="Status">
                      <div>
                        <Badge tone={status?.tone}>{status?.label ?? order.status}</Badge>
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
