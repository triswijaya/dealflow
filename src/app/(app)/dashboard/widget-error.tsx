"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

/** A widget that failed to load shows its own error and retry; the rest of the dashboard carries on (UX-04). */
export function WidgetError({ title }: { title: string }) {
  const router = useRouter();
  return (
    <section className="region" aria-label={title}>
      <h2>{title}</h2>
      <EmptyState
        size="region"
        tone="error"
        title="Gagal memuat data"
        description="Bagian lain tetap bisa dipakai. Coba muat ulang bagian ini."
        action={
          <Button variant="secondary" onClick={() => router.refresh()}>
            <RefreshCw aria-hidden="true" />
            Coba lagi
          </Button>
        }
      />
    </section>
  );
}
