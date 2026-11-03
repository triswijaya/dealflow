import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { ChipLink, PageHeader, EmptyState } from "@/components/ui/misc";
import { one, withParams } from "@/lib/url";
import { getCustomer, type CustomerOptionDto } from "@/server/customers/customers";
import { getPipelineBoard, listAssignableMembers, PIPELINE_COLUMN_LIMIT } from "@/server/deals/deal-views";
import { load, requireWorkspace } from "../workspace";
import { DealToolbar } from "../deals/deal-toolbar";
import { NewDealButton } from "../deals/deal-form";
import { PipelineBoard } from "./pipeline-board";

export const metadata: Metadata = { title: "Pipeline · DealFlow" };

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const workspace = await requireWorkspace(["OWNER", "ADMIN", "SALES"]);
  const params = await searchParams;
  const query = (one(params.q) ?? "").slice(0, 200);
  const assignedToId = one(params.sales) ?? "";
  const customerId = one(params.customer);
  // DEAL-07: deals on hold leave the board; this toggle shows only them.
  const held = one(params.held) === "1";

  const members = await load((headers) => listAssignableMembers({ headers }));
  const customer: CustomerOptionDto | null = customerId
    ? await load(async (headers) => {
        try {
          const found = await getCustomer({ headers, customerId });
          return { id: found.id, companyName: found.companyName, contactPerson: found.contactPerson };
        } catch {
          return null; // a stale or foreign id in the URL just means "no customer filter"
        }
      })
    : null;
  const filters = { query: query || undefined, assignedToId: assignedToId || undefined, customerId: customer?.id, held: held || undefined };
  const board = await load((headers) => getPipelineBoard({ headers, filters }));

  const actor = { userId: workspace.user.id, name: workspace.user.name, role: workspace.role };
  const filtered = Boolean(query || assignedToId || customer || held);
  const toggleHeld = withParams("/pipeline", params, { held: held ? null : "1" });
  const empty = board.stages.every((stage) => stage.count === 0);

  return (
    <>
      <PageHeader
        title="Pipeline deal"
        description={held ? "Deal yang ditahan. Tidak dihitung di pipeline sampai dilanjutkan." : "Empat tahap, bebas maju atau mundur."}
        actions={
          <>
            <div className="chips seg">
              <ButtonLink variant="secondary" href="/pipeline">
                Pipeline
              </ButtonLink>
              <ButtonLink variant="tertiary" href="/deals">
                Tabel
              </ButtonLink>
            </div>
            <NewDealButton members={members} actor={actor} />
          </>
        }
      />
      {/* A brand-new pipeline has nothing to filter: the empty state says what to do first. */}
      {empty && !filtered ? null : (
        <>
          <DealToolbar query={query} assignedToId={assignedToId} customer={customer} members={members} />
          <div className="row" style={{ marginBottom: 16, gap: 8 }}>
            <ChipLink href={toggleHeld} active={held}>
              {held ? "Kembali ke deal aktif" : "Ditunda"}
            </ChipLink>
            <ButtonLink variant="tertiary" href="/deals?stage=WON">
              Deal menang dan tidak dilanjutkan →
            </ButtonLink>
          </div>
        </>
      )}

      {empty ? (
        filtered ? (
          <EmptyState
            title={held ? "Tidak ada deal yang ditahan" : "Tidak ada hasil untuk filter ini"}
            description={held ? "Semua deal sedang berjalan di pipeline." : "Coba ubah kata pencarian atau pilihan filter."}
            action={
              <ButtonLink variant="tertiary" href="/pipeline">
                Reset filter
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState
            title="Belum ada deal aktif"
            description="Buat peluang pertama untuk mulai mengelola pipeline."
            action={<NewDealButton members={members} actor={actor} />}
          />
        )
      ) : (
        <PipelineBoard stages={board.stages} filters={filters} role={workspace.role} pageSize={PIPELINE_COLUMN_LIMIT} timezone={workspace.timezone} today={workspace.today} />
      )}
    </>
  );
}
