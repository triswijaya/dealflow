import { CalendarCheck, SearchX } from "lucide-react";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, TabLinks } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { FOLLOW_UP_TYPES } from "@/lib/labels";
import { one, positiveInt, withParams } from "@/lib/url";
import { listAssignableMembers } from "@/server/deals/deal-views";
import { getFollowUpCounts, listFollowUpRows, type FollowUpTab } from "@/server/follow-ups/follow-up-views";
import { load, requireWorkspace } from "../workspace";
import { FollowUpItem } from "./follow-up-item";
import { FollowUpToolbar } from "./follow-up-toolbar";
import { ScheduleFollowUpButton } from "./follow-up-dialogs";

export const metadata: Metadata = { title: "Follow-up · DealFlow" };

const PAGE_SIZES = [25, 50, 100];
const TABS: { key: string; tab: FollowUpTab; label: string; count: "today" | "overdue" | "upcoming" | "done" }[] = [
  { key: "hari-ini", tab: "TODAY", label: "Hari ini", count: "today" },
  { key: "terlambat", tab: "OVERDUE", label: "Terlambat", count: "overdue" },
  { key: "mendatang", tab: "UPCOMING", label: "Mendatang", count: "upcoming" },
  { key: "selesai", tab: "DONE", label: "Selesai", count: "done" },
];
const EMPTY: Record<FollowUpTab, { title: string; description: string }> = {
  TODAY: { title: "Tidak ada follow-up hari ini.", description: "Tetap produktif!" },
  OVERDUE: { title: "Tidak ada follow-up yang terlambat.", description: "Semua percakapan terjadwal masih sesuai waktunya." },
  UPCOMING: { title: "Belum ada follow-up mendatang.", description: "Jadwalkan percakapan berikutnya dari halaman deal atau tombol di atas." },
  DONE: { title: "Belum ada follow-up yang selesai.", description: "Follow-up yang Anda tandai selesai akan tampil di sini." },
};

export default async function FollowUpsPage({ searchParams }: PageProps<"/follow-ups">) {
  // Finance has no follow-up access at all (§6.2).
  const workspace = await requireWorkspace(["OWNER", "ADMIN", "SALES"]);
  const params = await searchParams;

  const current = TABS.find((candidate) => candidate.key === one(params.tab)) ?? TABS[0]!;
  const type = (FOLLOW_UP_TYPES as readonly { value: string }[]).some((option) => option.value === one(params.type)) ? one(params.type)! : "";
  const assignedToId = one(params.sales) ?? "";
  const from = one(params.from);
  const to = one(params.to);
  const rangeValid = !(from && to && from > to);
  const pageSize = positiveInt(one(params.pageSize));
  const filters = {
    type: (type || undefined) as "CALL" | "WHATSAPP" | "EMAIL" | "MEETING" | "OTHER" | undefined,
    assignedToId: assignedToId || undefined,
    from: rangeValid ? from : undefined,
    to: rangeValid ? to : undefined,
  };

  const [members, counts, result] = await Promise.all([
    load((headers) => listAssignableMembers({ headers })),
    load((headers) => getFollowUpCounts({ headers, filters })),
    load((headers) =>
      listFollowUpRows({
        headers,
        tab: current.tab,
        filters,
        page: positiveInt(one(params.page)),
        pageSize: pageSize && PAGE_SIZES.includes(pageSize) ? pageSize : undefined,
      }),
    ),
  ]);

  const filtered = Boolean(type || assignedToId || from || to);
  const href = (key: string) => withParams("/follow-ups", params, { page: null, tab: key === "hari-ini" ? null : key });

  return (
    <>
      <PageHeader
        title="Follow-up"
        description="Jaga percakapan dengan customer tetap berjalan."
        actions={<ScheduleFollowUpButton timezone={workspace.timezone} />}
      />
      <TabLinks tabs={TABS.map((tab) => ({ href: href(tab.key), label: `${tab.label} (${counts[tab.count]})`, active: tab.key === current.key }))} />
      <FollowUpToolbar type={type} assignedToId={assignedToId} from={from} to={to} members={members} />

      {result.items.length === 0 ? (
        filtered || result.totalItems > 0 ? (
          <EmptyState
            icon={SearchX}
            title="Tidak ada hasil untuk filter ini"
            description="Coba ubah kata pencarian atau pilihan filter."
            action={
              <ButtonLink variant="tertiary" href={withParams("/follow-ups", { tab: one(params.tab) }, {})}>
                Reset filter
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState
            icon={CalendarCheck}
            title={EMPTY[current.tab].title}
            description={EMPTY[current.tab].description}
            action={
              current.tab === "TODAY" ? (
                <ButtonLink variant="tertiary" href={href("mendatang")}>
                  Lihat mendatang
                </ButtonLink>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          <section className="region">
            {result.items.map((row) => (
              <FollowUpItem key={row.id} row={row} timezone={workspace.timezone} today={workspace.today} canAct />
            ))}
          </section>
          <div className="bleed">
            <Pagination page={result.page} pageSize={result.pageSize} totalItems={result.totalItems} totalPages={result.totalPages} />
          </div>
        </>
      )}
    </>
  );
}
