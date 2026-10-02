"use client";

import { Copy } from "lucide-react";
import { IconButton } from "./button";
import { useToast } from "./toast";

export function CopyButton({ value, label, done }: { value: string; label: string; done: string }) {
  const toast = useToast();
  return (
    <IconButton
      label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast(done, "success");
        } catch {
          toast("Tidak dapat menyalin. Salin nomor secara manual.", "error");
        }
      }}
    >
      <Copy aria-hidden="true" />
    </IconButton>
  );
}
