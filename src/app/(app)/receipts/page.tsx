import { Banknote, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ChipLink, EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, formatRupiah } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/labels";
import { one, positiveInt, withParams } from "@/lib/url";
import { listReceipts } from "@/server/receipts/receipts";
import { load, requireWorkspace } from "../workspace";
import { RecordReceiptButton } from "./receipt-controls";

export const metadata: Metadata = { title: "Uang masuk · DealFlow" };

export default async function ReceiptsPage({ searchParams }: PageProps<"/receipts">) {
  const workspace = await requireWorkspace(["OWNER", "ADMIN", "FINANCE"]);
  const params = await searchParams;
  const open = one(params.open) === "1";
  const result = await load((headers) => listReceipts({ headers, open, page: positiveInt(one(params.page)) }));
  const href = (changes: Record<string, string | number | null>) => withParams("/receipts", params, { page: null, ...changes });

  return (
    <>
      <PageHeader title="Uang masuk" description="Semua uang yang diterima, lalu dialokasikan ke invoice. Sisanya menjadi kredit customer." actions={<RecordReceiptButton today={workspace.today} />} />
      <div className="chips" style={{ marginBottom: 14 }}>
        <ChipLink href={href({ open: null })} active={!open}>
          Semua
        </ChipLink>
        <ChipLink href={href({ open: "1" })} active={open}>
          Belum teralokasi
        </ChipLink>
      </div>

      {result.items.length === 0 ? (
        open ? (
          <EmptyState
            icon={SearchX}
            title="Semua uang masuk sudah teralokasi"
            description="Tidak ada sisa yang menunggu dialokasikan."
            action={
              <ButtonLink variant="tertiary" href="/receipts">
                Lihat semua
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState icon={Banknote} title="Belum ada uang masuk" description="Catat setiap transfer yang masuk, termasuk DP sebelum invoice terbit." />
        )
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Dari</th>
                <th>Metode · referensi</th>
                <th className="num">Jumlah</th>
                <th className="num">Teralokasi</th>
                <th className="num">Sisa</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((receipt) => {
                const reversed = receipt.status === "REVERSED";
                const left = BigInt(receipt.availableAmount) > 0n;
                return (
                  <tr key={receipt.id} className={reversed ? "reversed" : undefined}>
                    <td className="nowrap" data-label="Tanggal">
                      <div>
                        <Link href={`/receipts/${receipt.id}`}>{formatDate(receipt.receivedOn)}</Link>
                      </div>
                    </td>
                    <td className="cell-primary" data-label="Dari">
                      <div>
                        {receipt.customerId ? <Link href={`/receipts/${receipt.id}`}>{receipt.customerName}</Link> : <Link href={`/receipts/${receipt.id}`}>Pengirim belum dikenali</Link>}
                      </div>
                    </td>
                    <td data-label="Metode · referensi">
                      <div>
                        {paymentMethodLabel(receipt.method)}
                        {receipt.reference ? <small>{receipt.reference}</small> : null}
                      </div>
                    </td>
                    <td className="num" data-label="Jumlah">
                      <div className="money">{formatRupiah(receipt.amount)}</div>
                    </td>
                    <td className="num" data-label="Teralokasi">
                      <div>{formatRupiah(receipt.allocatedAmount)}</div>
                    </td>
                    <td className="num" data-label="Sisa">
                      <div>
                        <b>{formatRupiah(receipt.availableAmount)}</b>
                      </div>
                    </td>
                    <td data-label="Status">
                      <div>
                        {reversed ? (
                          <Badge tone="neutral">Dibatalkan</Badge>
                        ) : !receipt.customerId ? (
                          <Badge tone="warning">Perlu identifikasi</Badge>
                        ) : left ? (
                          <Badge tone="info">Ada sisa</Badge>
                        ) : (
                          <Badge tone="success">Teralokasi</Badge>
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
