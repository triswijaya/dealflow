import { Download } from "lucide-react";
import type { Metadata } from "next";
import { ChipLink, PageHeader } from "@/components/ui/misc";
import { formatDate, formatRupiah } from "@/lib/format";
import { one } from "@/lib/url";
import { getReportSummary, type AgingBucket } from "@/server/reports/reports";
import { load, requireWorkspace } from "../workspace";

export const metadata: Metadata = { title: "Laporan · DealFlow" };

const PERIODS = { month: "Bulan ini", quarter: "Kuartal ini", year: "Tahun ini" } as const;
type Period = keyof typeof PERIODS;

const AGING: Record<AgingBucket, { label: string; color: string }> = {
  NOT_DUE: { label: "Belum jatuh tempo", color: "var(--stage-PROPOSAL)" },
  "1_30": { label: "Lewat 1-30 hari", color: "var(--status-warning-fill)" },
  "31_60": { label: "Lewat 31-60 hari", color: "var(--status-danger-fill)" },
  "61_90": { label: "Lewat 61-90 hari", color: "var(--status-danger-glyph)" },
  OVER_90: { label: "Lewat > 90 hari", color: "var(--status-danger-ink)" },
};

function periodStart(period: Period, today: string) {
  if (period === "year") return `${today.slice(0, 4)}-01-01`;
  if (period === "quarter") return `${today.slice(0, 4)}-${String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  return `${today.slice(0, 7)}-01`;
}

/** RPT-01: numbers with locked definitions, the same ones finance uses; each block shows only for the roles that may see it. */
export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const workspace = await requireWorkspace();
  const params = await searchParams;
  const asked = one(params.period);
  const period: Period = asked && asked in PERIODS ? (asked as Period) : "month";
  const range = { from: periodStart(period, workspace.today), to: workspace.today };
  const report = await load((headers) => getReportSummary({ headers, range }));

  const metrics: [string, string, string][] = [];
  if (report.bookings) metrics.push(["Bookings", formatRupiah(report.bookings.total), `${report.bookings.orders} pesanan baru, ditambah amandemen. Nilai deal tidak dihitung dua kali.`]);
  if (report.billed) metrics.push(["Ditagih", formatRupiah(report.billed.total), `${report.billed.invoices} invoice non-void menurut tanggal terbit.`]);
  if (report.cashReceived) metrics.push(["Kas diterima", formatRupiah(report.cashReceived.total), "Uang masuk aktif dikurangi refund. Potongan PPh tidak termasuk."]);
  if (report.winRate)
    metrics.push([
      "Win rate",
      report.winRate.rate === null ? "-" : `${Math.round(report.winRate.rate * 100)}%`,
      `${report.winRate.won} menang dan ${report.winRate.lost} tidak dilanjutkan${report.winRate.medianDaysToWin === null ? "." : `. Median ${report.winRate.medianDaysToWin} hari sampai menang.`}`,
    ]);
  if (report.outstanding) metrics.push(["Piutang", formatRupiah(report.outstanding.total), `${report.outstanding.invoices} invoice belum lunas per hari ini.`]);
  if (report.readyToBill) metrics.push(["Siap ditagih", formatRupiah(report.readyToBill.total), `${report.readyToBill.items} termin. Retensi tertahan ${formatRupiah(report.readyToBill.retentionHeld)}.`]);
  if (report.customerCredit) metrics.push(["Kredit customer", formatRupiah(report.customerCredit.total), "Sisa uang masuk yang belum dialokasikan. Bukan pendapatan."]);

  const agingTotal = report.aging ? report.aging.reduce((sum, bucket) => sum + BigInt(bucket.amount), 0n) : 0n;
  const query = `from=${range.from}&to=${range.to}`;
  const exports = report.billed
    ? [
        ["invoices", "Invoice", "Nomor, tanggal, customer, pesanan, termin, total, terlunasi, sisa, status"],
        ["receipts", "Uang masuk", "Tanggal, customer, metode, referensi, jumlah, dialokasikan, sisa"],
        ["orders", "Pesanan", "Nomor, tanggal komitmen, customer, nilai awal, nilai sekarang, status"],
      ]
    : [["orders", "Pesanan", "Nomor, tanggal komitmen, customer, nilai awal, nilai sekarang, status"]];

  return (
    <>
      <PageHeader title="Laporan" description="Angka dengan definisi yang dikunci, sama dengan yang dipakai finance." />
      <div className="chips" style={{ marginBottom: 8 }}>
        {(Object.keys(PERIODS) as Period[]).map((key) => (
          <ChipLink key={key} href={`/reports?period=${key}`} active={key === period}>
            {PERIODS[key]}
          </ChipLink>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
        {PERIODS[period]}: {formatDate(report.period.from)} sampai {formatDate(report.period.to)}
      </p>

      <div className="metrics">
        {metrics.map(([label, value, note]) => (
          <div key={label} className="metric-card">
            <h3 style={{ fontSize: 13 }}>{label}</h3>
            <div>
              <span className="metric-value">{value}</span>
              <span className="metric-label">{note}</span>
            </div>
          </div>
        ))}
      </div>

      {report.aging ? (
        <section className="region" style={{ marginTop: 16 }}>
          <div className="card-head">
            <div>
              <h2>Aging piutang</h2>
              <p className="muted" style={{ fontSize: 12 }}>
                Per hari ini, menurut umur lewat jatuh tempo
              </p>
            </div>
            <b className="money">{formatRupiah(agingTotal)}</b>
          </div>
          {agingTotal > 0n ? (
            <div className="stackbar" role="img" aria-label={report.aging.map((bucket) => `${AGING[bucket.bucket].label} ${formatRupiah(bucket.amount)}`).join(", ")}>
              {report.aging
                .filter((bucket) => BigInt(bucket.amount) > 0n)
                .map((bucket) => (
                  <i key={bucket.bucket} style={{ width: `${Number((BigInt(bucket.amount) * 10000n) / agingTotal) / 100}%`, background: AGING[bucket.bucket].color }} />
                ))}
            </div>
          ) : null}
          <div className="legend-row">
            {report.aging.map((bucket) => (
              <span key={bucket.bucket}>
                <i style={{ background: AGING[bucket.bucket].color }} />
                {AGING[bucket.bucket].label} <b className="money">{formatRupiah(bucket.amount)}</b> <span className="muted">· {bucket.invoices} invoice</span>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="region" style={{ marginTop: 16 }}>
        <h2>Ekspor untuk akuntansi</h2>
        <p className="muted" style={{ fontSize: 12 }}>
          CSV {PERIODS[period].toLowerCase()}, siap diimpor ke software akuntansi.
        </p>
        <ul className="queue-list">
          {exports.map(([kind, label, columns]) => (
            <li key={kind}>
              <div>
                <b>{label}</b>
                <small>{columns}</small>
              </div>
              <div className="queue-side">
                <a className="btn secondary" href={`/api/export/${kind}?${query}`} download>
                  <Download aria-hidden="true" />
                  Unduh CSV
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
