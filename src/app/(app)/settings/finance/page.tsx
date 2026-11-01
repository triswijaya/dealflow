import { PageHeader } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/format";
import { listDeadOutboxEvents } from "@/server/outbox/outbox";
import { getWriteOffLimit } from "@/server/settings/company";
import { load, requireWorkspace } from "../../workspace";
import { SettingsTabs } from "../settings-tabs";
import { WriteOffLimitForm } from "./write-off-form";

export const metadata = { title: "Pengaturan keuangan" };

const EVENT_LABEL: Record<string, string> = { "email.document": "Email dokumen" };

export default async function FinanceSettingsPage() {
  const workspace = await requireWorkspace(["OWNER", "ADMIN"]);
  const [limit, dead] = await Promise.all([load((headers) => getWriteOffLimit({ headers })), load((headers) => listDeadOutboxEvents({ headers }))]);
  return (
    <>
      <PageHeader title="Keuangan" description="Aturan pelunasan dan status pengiriman email." />
      <SettingsTabs active="finance" />
      <div className="stack" style={{ marginTop: 16 }}>
        <section className="region">
          <h2>Hapus selisih</h2>
          <WriteOffLimitForm initial={limit} />
        </section>
        <section className="region">
          <h2>Email gagal terkirim</h2>
          {dead.length === 0 ? (
            <p className="quiet-empty">Tidak ada. Email yang gagal setelah beberapa kali dicoba akan tampil di sini.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Jenis</th>
                    <th>Dibuat</th>
                    <th className="num">Percobaan</th>
                    <th>Galat terakhir</th>
                  </tr>
                </thead>
                <tbody>
                  {dead.map((event) => (
                    <tr key={event.id}>
                      <td data-label="Jenis">
                        <div>{EVENT_LABEL[event.type] ?? event.type}</div>
                      </td>
                      <td className="nowrap" data-label="Dibuat">
                        <div>{formatDateTime(event.createdAt, workspace.timezone)}</div>
                      </td>
                      <td className="num" data-label="Percobaan">
                        <div>{event.attempts}</div>
                      </td>
                      <td data-label="Galat terakhir">
                        <div>{event.lastError ?? "-"}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
