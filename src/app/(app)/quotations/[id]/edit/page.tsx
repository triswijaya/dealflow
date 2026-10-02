import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { getQuotationDetail, getQuotationEditorContext } from "@/server/quotations/quotation-views";
import { load, requireWorkspace } from "../../../workspace";
import { QuotationEditor } from "../../quotation-editor";

export const metadata: Metadata = { title: "Edit quotation · DealFlow" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditQuotationPage({ params }: PageProps<"/quotations/[id]/edit">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  await requireWorkspace(["OWNER", "ADMIN", "SALES"]);
  const quotation = await load((headers) => getQuotationDetail({ headers, quotationId: id }));

  // QUO-05: only the newest draft can still be edited; everything else is a
  // frozen document and changes go through a revision.
  if (quotation.status !== "DRAFT" || !quotation.isLatest || quotation.frozenAt) {
    return (
      <>
        <PageHeader title={quotation.quotationNumber} />
        <Alert tone="warning">Quotation ini sudah dikunci dan tidak dapat diedit. Buat revisi untuk perubahan.</Alert>
        <div style={{ marginTop: 16 }}>
          <ButtonLink variant="secondary" href={`/quotations/${quotation.id}`}>
            Buka detail
          </ButtonLink>
        </div>
      </>
    );
  }

  const context = await load((headers) => getQuotationEditorContext({ headers, dealId: quotation.dealId }));
  return (
    <QuotationEditor
      // A save refreshes this page with the new edit version; remounting resets what counts as "unsaved".
      key={quotation.editVersion}
      deal={context.deal}
      customer={context.customer}
      defaultTerms={context.defaultTerms}
      today={context.today}
      quotation={{
        id: quotation.id,
        quotationNumber: quotation.quotationNumber,
        editVersion: quotation.editVersion,
        issueDate: quotation.issueDate,
        validUntil: quotation.validUntil,
        items: quotation.items.map((item) => ({ description: item.description, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice })),
        discount: quotation.discount,
        tax: quotation.tax,
        notes: quotation.notes,
        terms: quotation.terms,
      }}
    />
  );
}
