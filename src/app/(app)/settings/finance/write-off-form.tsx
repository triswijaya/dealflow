"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, MoneyInput } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { saveWriteOffLimitAction } from "../actions";

export function WriteOffLimitForm({ initial }: { initial: string }) {
  const toast = useToast();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await saveWriteOffLimitAction({ writeOffLimit: value || "0" });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setSaved(result.data);
    toast("Batas hapus selisih disimpan", "success");
  }

  return (
    <form className="stack" onSubmit={submit} style={{ maxWidth: 420 }}>
      <Field label="Batas hapus selisih per invoice (Rp)" htmlFor="write-off-limit" hint="Finance hanya bisa menghapus selisih sampai batas ini. Owner dan Admin tidak dibatasi.">
        <MoneyInput id="write-off-limit" value={value} onValueChange={setValue} />
      </Field>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div>
        <Button type="submit" disabled={value === saved} pending={pending} pendingText="Menyimpan...">
          Simpan
        </Button>
      </div>
    </form>
  );
}
