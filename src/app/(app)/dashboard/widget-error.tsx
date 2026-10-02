"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** A widget that failed to load shows its own error and retry; the rest of the dashboard carries on (UX-04). */
export function WidgetError({ title }: { title: string }) {
  const router = useRouter();
  return (
    <div className="card" role="group" aria-label={title}>
      <h2>{title}</h2>
      <Alert tone="error">Gagal memuat data. Coba lagi.</Alert>
      <div className="footer">
        <Button variant="secondary" onClick={() => router.refresh()}>
          <RefreshCw aria-hidden="true" />
          Coba lagi
        </Button>
      </div>
    </div>
  );
}
