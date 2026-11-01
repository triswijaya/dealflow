import { TabLinks } from "@/components/ui/misc";

export function SettingsTabs({ active }: { active: "company" | "members" | "finance" }) {
  return (
    <TabLinks
      tabs={[
        { href: "/settings/company", label: "Perusahaan", active: active === "company" },
        { href: "/settings/members", label: "Anggota", active: active === "members" },
        { href: "/settings/finance", label: "Keuangan", active: active === "finance" },
      ]}
    />
  );
}
