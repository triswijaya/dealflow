import { Receipt } from "lucide-react";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { one } from "@/lib/url";
import { getInvoiceDraftContext, listInvoiceableDeals } from "@/server/invoices/invoice-views";
import { load, requireWorkspace } from "../../workspace";
import { InvoiceWizard } from "../invoice-wizard";

export const metadata: Metadata = { title: "Buat invoice · DealFlow" };

export default async function NewInvoicePage({ searchParams }: PageProps<"/invoices/new">) {
  // Sales have no invoice access (§6.2).
  const workspace = await requireWorkspace(["OWNER", "ADMIN", "FINANCE"]);
  const dealId = one((await searchParams).dealId);

  const context = dealId ? await load((headers) => getInvoiceDraftContext({ headers, dealId })) : null;
  const deals = dealId ? [] : await load((headers) => listInvoiceableDeals({ headers }));

  return (
    <>
      <PageHeader title="Buat invoice" description="Terbitkan tagihan dari deal yang sudah menang." />
      {!dealId && deals.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Tidak ada deal yang siap ditagih"
          description="Invoice hanya dapat dibuat dari deal Menang yang belum memiliki invoice."
          action={
            <ButtonLink variant="tertiary" href="/deals?stage=WON">
              Lihat deal menang
            </ButtonLink>
          }
        />
      ) : (
        <InvoiceWizard initialDeals={deals} initialContext={context} today={workspace.today} />
      )}
    </>
  );
}
