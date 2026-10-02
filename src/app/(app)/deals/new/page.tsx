import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { one } from "@/lib/url";
import { getCustomer, type CustomerOptionDto } from "@/server/customers/customers";
import { listAssignableMembers } from "@/server/deals/deal-views";
import { load, requireWorkspace } from "../../workspace";
import { NewDealForm } from "./new-deal-form";

export const metadata: Metadata = { title: "Buat deal · DealFlow" };

export default async function NewDealPage({ searchParams }: PageProps<"/deals/new">) {
  // Finance reads won deals only; creating one is a sales action (§6.2).
  const workspace = await requireWorkspace(["OWNER", "ADMIN", "SALES"]);
  const customerId = one((await searchParams).customerId);
  const members = await load((headers) => listAssignableMembers({ headers }));
  const customer: CustomerOptionDto | null = customerId
    ? await load(async (headers) => {
        try {
          const found = await getCustomer({ headers, customerId });
          return { id: found.id, companyName: found.companyName, contactPerson: found.contactPerson };
        } catch {
          return null; // a stale or foreign id just means "no customer chosen yet"
        }
      })
    : null;

  return (
    <>
      <PageHeader title="Buat deal" description="Mulai peluang baru untuk customer Anda." />
      <NewDealForm members={members} actor={{ userId: workspace.user.id, name: workspace.user.name, role: workspace.role }} initialCustomer={customer} />
    </>
  );
}
