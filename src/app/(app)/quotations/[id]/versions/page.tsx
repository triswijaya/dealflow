import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SetBreadcrumb } from "@/components/app-shell/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { listQuotationVersions } from "@/server/quotations/quotation-views";
import { load, requireWorkspace } from "../../../workspace";
import { VersionCompare } from "./version-compare";

export const metadata: Metadata = { title: "Riwayat versi · DealFlow" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function QuotationVersionsPage({ params }: PageProps<"/quotations/[id]/versions">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  await requireWorkspace(["OWNER", "ADMIN", "SALES"]);
  const { familyNumber, versions } = await load((headers) => listQuotationVersions({ headers, quotationId: id }));

  return (
    <>
      <SetBreadcrumb trail={[familyNumber, "Riwayat versi"]} />
      <PageHeader
        title="Riwayat versi"
        description={`Keluarga ${familyNumber}`}
        actions={
          <ButtonLink variant="tertiary" href={`/quotations/${id}`}>
            ← Kembali ke quotation
          </ButtonLink>
        }
      />
      <VersionCompare versions={versions} />
    </>
  );
}
