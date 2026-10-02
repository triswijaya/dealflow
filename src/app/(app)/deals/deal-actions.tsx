"use client";

import { MessageCircle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { isBuilt } from "@/components/app-shell/nav";
import { Button, ButtonLink, IconButton } from "@/components/ui/button";
import { NEXT_DEAL_STAGE, isActiveStage, type Role } from "@/lib/labels";
import type { AssignableMemberDto, DealDetailDto } from "@/server/deals/deal-views";
import { FollowUpFormDialog, WhatsAppDialog } from "../follow-ups/follow-up-dialogs";
import { DealFormDialog, type DealActor } from "./deal-form";
import { DealTransitionDialog, type TransitionMode } from "./transition-dialog";

/**
 * The buttons in a deal's header. What is offered follows the stage (an open
 * deal can move, be edited or lost; a won deal heads to its invoice; a lost
 * deal is read-only) and the role (Finance only ever follows to the invoice).
 */
export function DealActions({
  deal,
  members,
  actor,
  timezone,
  invoice,
  autoOpen,
}: {
  deal: DealDetailDto;
  members: AssignableMemberDto[];
  actor: DealActor;
  timezone: string;
  invoice: { id: string; invoiceNumber: string } | null;
  /** Opens a dialog on arrival, from a link like ?edit=1 or ?schedule=1. */
  autoOpen?: "edit" | "schedule";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const role: Role = actor.role;
  const active = isActiveStage(deal.status);
  const [edit, setEdit] = useState(autoOpen === "edit" && active);
  const [schedule, setSchedule] = useState(autoOpen === "schedule" && active);
  const [whatsapp, setWhatsapp] = useState(false);
  const [transition, setTransition] = useState<TransitionMode | null>(null);
  const [transitionOpen, setTransitionOpen] = useState(false);

  const close = (setter: (value: boolean) => void) => () => {
    setter(false);
    if (autoOpen) router.replace(pathname, { scroll: false });
  };
  const start = (mode: TransitionMode) => {
    setTransition(mode);
    setTransitionOpen(true);
  };

  const invoiceReady = isBuilt("/invoices");
  const canInvoice = role === "OWNER" || role === "ADMIN" || role === "FINANCE";

  if (role === "FINANCE") {
    return invoice && invoiceReady ? (
      <ButtonLink variant="secondary" href={`/invoices/${invoice.id}`}>
        Lihat invoice {invoice.invoiceNumber}
      </ButtonLink>
    ) : null;
  }

  const next = active ? NEXT_DEAL_STAGE[deal.status as keyof typeof NEXT_DEAL_STAGE] : null;
  const zeroValue = BigInt(deal.estimatedValue) <= 0n;
  const wonBlocked = next?.to === "WON" && zeroValue;
  const target = {
    id: deal.id,
    title: deal.title,
    customerName: deal.customer.companyName,
    status: deal.status,
    version: deal.version,
    estimatedValue: deal.estimatedValue,
  };

  return (
    <>
      {active ? (
        <Button variant="danger" onClick={() => start("lost")}>
          Tandai kalah
        </Button>
      ) : null}
      {active ? (
        <Button variant="secondary" onClick={() => setEdit(true)}>
          Edit
        </Button>
      ) : null}
      <IconButton label="Buka WhatsApp" onClick={() => setWhatsapp(true)}>
        <MessageCircle aria-hidden="true" />
      </IconButton>
      {next ? (
        <span title={wonBlocked ? "Isi nilai deal lebih dari Rp0 sebelum menandai menang." : undefined}>
          <Button disabled={wonBlocked} onClick={() => start(next.to === "WON" ? "won" : "advance")}>
            {next.action}
          </Button>
        </span>
      ) : null}
      {deal.status === "WON" && canInvoice && invoiceReady ? (
        invoice ? (
          <ButtonLink variant="secondary" href={`/invoices/${invoice.id}`}>
            Lihat invoice {invoice.invoiceNumber}
          </ButtonLink>
        ) : (
          <ButtonLink href={`/invoices/new?dealId=${deal.id}`}>Buat invoice</ButtonLink>
        )
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
          estimatedValue: deal.estimatedValue,
          assignedToId: deal.assignedToId,
          assignedToName: deal.assignedToName,
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
      {transition ? <DealTransitionDialog open={transitionOpen} onClose={() => setTransitionOpen(false)} mode={transition} deal={target} role={role} /> : null}
    </>
  );
}
