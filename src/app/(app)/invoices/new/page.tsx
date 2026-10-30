import { Receipt } from "lucide-react";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { one } from "@/lib/url";
import { findReadyBillingItemOfDeal, getInvoiceDraftContext, listInvoiceableItems } from "@/server/invoices/invoice-views";
import { load, requireWorkspace } from "../../workspace";
import { InvoiceWizard } from "../invoice-wizard";

export const metadata: Metadata = { title: "Buat invoice · DealFlow" };

export default async function NewInvoicePage({ searchParams }: PageProps<"/invoices/new">) {
  // Sales have no invoice access (§6.2).
  const workspace = await requireWorkspace(["OWNER", "ADMIN", "FINANCE"]);
  const params = await searchParams;
  const dealId = one(params.dealId);
  // From a deal page: its first billing item that is ready; otherwise the picker, or a given item.
  const billingItemId = one(params.billingItemId) ?? (dealId ? await load((headers) => findReadyBillingItemOfDeal({ headers, dealId })) : undefined);

  const context = billingItemId ? await load((headers) => getInvoiceDraftContext({ headers, billingItemId })) : null;
  const deals = billingItemId || dealId ? [] : await load((headers) => listInvoiceableItems({ headers }));
  const nothingReady = !billingItemId && (Boolean(dealId) || deals.length === 0);

  return (
    <>
      <PageHeader title="Buat invoice" description="Terbitkan tagihan dari termin pesanan yang sudah siap." />
      {nothingReady ? (
        <EmptyState
          icon={Receipt}
          title="Tidak ada termin yang siap ditagih"
          description="Invoice dibuat dari termin pesanan yang sudah siap ditagih dan belum punya invoice."
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
