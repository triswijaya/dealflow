import { PageHeader } from "@/components/ui/misc";
import { getCompanySettings } from "@/server/settings/company";
import { load, requireWorkspace } from "../../workspace";
import { SettingsTabs } from "../settings-tabs";
import { CompanyForm } from "./company-form";

export const metadata = { title: "Pengaturan perusahaan" };

export default async function CompanySettingsPage() {
  await requireWorkspace(["OWNER", "ADMIN"]);
  const settings = await load((headers) => getCompanySettings({ headers }));
  return (
    <>
      <PageHeader title="Profil perusahaan" description="Identitas dan ketentuan untuk dokumen penjualan." />
      <SettingsTabs active="company" />
      {/* Keyed by the concurrency token so a saved or reloaded profile re-seeds the form. */}
      <CompanyForm key={settings.updatedAt} settings={settings} />
    </>
  );
}
