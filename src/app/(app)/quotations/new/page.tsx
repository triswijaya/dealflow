import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { one } from "@/lib/url";
import { getQuotationEditorContext } from "@/server/quotations/quotation-views";
import { load, requireWorkspace } from "../../workspace";
import { QuotationEditor } from "../quotation-editor";

export const metadata: Metadata = { title: "Quotation baru · DealFlow" };

export default async function NewQuotationPage({ searchParams }: PageProps<"/quotations/new">) {
  // Finance has no quotation access in this milestone (§6.2).
  await requireWorkspace(["OWNER", "ADMIN", "SALES"]);
  const dealId = one((await searchParams).dealId);
  if (!dealId) notFound();
  const context = await load((headers) => getQuotationEditorContext({ headers, dealId }));

  if (context.deal.status === "WON" || context.deal.status === "LOST") {
    return (
      <>
        <PageHeader title="Quotation baru" />
        <Alert tone="warning">Quotation baru hanya untuk deal yang masih berjalan. Untuk deal menang, buat revisi dari quotation yang ada.</Alert>
        <div style={{ marginTop: 16 }}>
          <ButtonLink variant="secondary" href={`/deals/${context.deal.id}`}>
            Kembali ke deal
          </ButtonLink>
        </div>
      </>
    );
  }

  return <QuotationEditor deal={context.deal} customer={context.customer} defaultTerms={context.defaultTerms} today={context.today} />;
}
