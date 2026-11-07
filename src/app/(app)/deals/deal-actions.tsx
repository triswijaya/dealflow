"use client";

import { ArrowLeftRight, MessageCircle, Play, Plus, Trophy } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { ACTIVE_DEAL_STAGES, DEAL_STAGE, isActiveStage } from "@/lib/labels";
import type { AssignableMemberDto, DealDetailDto } from "@/server/deals/deal-views";
import { FollowUpFormDialog, WhatsAppDialog } from "../follow-ups/follow-up-dialogs";
import { resumeDealAction } from "./actions";
import { DealFormDialog, type DealActor } from "./deal-form";
import { DealTransitionDialog, type SourceQuotation, type TransitionMode } from "./transition-dialog";

/**
 * The buttons in a deal's header. An open deal can move to any stage, be held,
 * closed or won; a held deal resumes; a closed deal can be reopened (a won one
 * only by Owner/Admin while it has no live invoice). A won deal can take a
 * further order. Finance only reads.
 */
export function DealActions({
  deal,
  members,
  actor,
  timezone,
  today,
  quotations,
  hasLiveInvoice,
  autoOpen,
  winQuotationId,
}: {
  deal: DealDetailDto;
  members: AssignableMemberDto[];
  actor: DealActor;
  timezone: string;
  today: string;
  quotations: SourceQuotation[];
  hasLiveInvoice: boolean;
  /** Opens a dialog on arrival, from a link like ?edit=1, ?schedule=1 or ?win=<quotation id>. */
  autoOpen?: "edit" | "schedule" | "win";
  /** The accepted quotation the Won dialog starts from, when arriving from it. */
  winQuotationId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const role = actor.role;
  const active = isActiveStage(deal.status);
  const held = active && deal.onHoldUntil !== null;
  const [edit, setEdit] = useState(autoOpen === "edit" && active);
  const [schedule, setSchedule] = useState(autoOpen === "schedule" && active);
  const [whatsapp, setWhatsapp] = useState(false);
  const winOnArrival = autoOpen === "win" && active && !held;
  const [mode, setMode] = useState<TransitionMode | null>(winOnArrival ? { kind: "won" } : null);
  const [modeOpen, setModeOpen] = useState(winOnArrival);
  const [resuming, setResuming] = useState(false);

  if (role === "FINANCE") return null;

  const close = (setter: (value: boolean) => void) => () => {
    setter(false);
    if (autoOpen) router.replace(pathname, { scroll: false });
  };
  const start = (next: TransitionMode) => {
    setMode(next);
    setModeOpen(true);
  };
  async function resume() {
    setResuming(true);
    const result = await resumeDealAction({ dealId: deal.id, expectedVersion: deal.version });
    setResuming(false);
    if (!result.ok) {
      toast(result.error.message, "error");
      return;
    }
    toast("Deal kembali ke pipeline", "success");
    router.refresh();
  }

  const privileged = role === "OWNER" || role === "ADMIN";
  const canReopen = deal.status === "LOST" || (deal.status === "WON" && privileged && !hasLiveInvoice);
  const target = {
    id: deal.id,
    title: deal.title,
    customerName: deal.customer.companyName,
    status: deal.status,
    version: deal.version,
    estimatedValue: deal.estimatedValue,
    onHoldUntil: deal.onHoldUntil,
    onHoldReason: deal.onHoldReason,
  };

  return (
    <>
      {active && !held ? (
        <Menu
          label="Pindah tahap"
          trigger={
            <>
              <ArrowLeftRight aria-hidden="true" />
              <span className="hide-sm">Pindah tahap</span>
            </>
          }
        >
          {ACTIVE_DEAL_STAGES.filter((stage) => stage !== deal.status).map((stage) => (
            <MenuItem key={stage} onSelect={() => start({ kind: "move", to: stage })}>
              {DEAL_STAGE[stage].label}
            </MenuItem>
          ))}
        </Menu>
      ) : null}
      {active ? (
        <Button variant="secondary" onClick={() => setEdit(true)}>
          Edit
        </Button>
      ) : null}
      {active ? (
        <Menu label="Aksi lainnya">
          <MenuItem onSelect={() => start({ kind: "hold" })}>{held ? "Perpanjang penundaan" : "Tahan dulu"}</MenuItem>
          <MenuItem onSelect={() => setWhatsapp(true)}>
            <MessageCircle aria-hidden="true" />
            Buka WhatsApp
          </MenuItem>
          <MenuItem danger onSelect={() => start({ kind: "lost" })}>
            Tidak dilanjutkan
          </MenuItem>
        </Menu>
      ) : null}
      {held ? (
        <Button pending={resuming} pendingText="Memproses..." onClick={resume}>
          <Play aria-hidden="true" />
          Lanjutkan deal
        </Button>
      ) : null}
      {active && !held ? (
        <Button onClick={() => start({ kind: "won" })}>
          <Trophy aria-hidden="true" />
          Konfirmasi menang
        </Button>
      ) : null}
      {deal.status === "WON" ? (
        <Button variant="secondary" onClick={() => start({ kind: "order" })}>
          <Plus aria-hidden="true" />
          Tambah pesanan
        </Button>
      ) : null}
      {canReopen ? (
        <Button variant="secondary" onClick={() => start({ kind: "reopen" })}>
          Buka kembali
        </Button>
      ) : null}

      <DealFormDialog
        open={edit}
        onClose={close(setEdit)}
        members={members}
        actor={actor}
        deal={{
          id: deal.id,
          version: deal.version,
          title: deal.title,
          status: deal.status,
          estimatedValue: deal.estimatedValue,
          assignedToId: deal.assignedToId,
          assignedToName: deal.assignedToName,
          contactId: deal.contact?.id ?? null,
          expectedCloseDate: deal.expectedCloseDate,
          description: deal.description,
          notes: deal.notes,
          hasQuotation: deal.hasQuotation,
          customer: { id: deal.customer.id, companyName: deal.customer.companyName, contactPerson: deal.customer.contactPerson },
        }}
      />
      <FollowUpFormDialog
        open={schedule}
        onClose={close(setSchedule)}
        timezone={timezone}
        deal={{ id: deal.id, title: deal.title, customerName: deal.customer.companyName }}
      />
      <WhatsAppDialog open={whatsapp} onClose={() => setWhatsapp(false)} dealId={deal.id} timezone={timezone} />
      {mode ? <DealTransitionDialog
          open={modeOpen}
          onClose={() => {
            setModeOpen(false);
            if (autoOpen === "win") router.replace(pathname, { scroll: false });
          }}
          mode={mode}
          deal={target}
          role={role}
          today={today}
          quotations={quotations}
          preferredQuotationId={winQuotationId}
        /> : null}
    </>
  );
}
