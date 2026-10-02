"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function SettingsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="stack">
      <Alert tone="error">Gagal memuat data. Coba lagi.</Alert>
      <div>
        <Button variant="secondary" onClick={reset}>
          Coba lagi
        </Button>
      </div>
    </div>
  );
}
