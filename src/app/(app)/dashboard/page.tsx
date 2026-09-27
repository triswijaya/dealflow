import { PageHeader } from "@/components/ui/misc";
import { firstName } from "@/lib/format";
import { requireWorkspace } from "../workspace";

export default async function DashboardPage() {
  const workspace = await requireWorkspace();
  return (
    <PageHeader
      eyebrow="Ringkasan bisnis"
      title="Ruang untuk bertumbuh ✳"
      display
      description={`Halo, ${firstName(workspace.user.name)}. Ini kabar peluang dan percakapan tim hari ini.`}
    />
  );
}
