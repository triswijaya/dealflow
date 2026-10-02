"use client";

import { Alert } from "./alert";
import { Button } from "./button";
import { Dialog, DialogFooter } from "./dialog";

/**
 * DATA-07: shown when a save loses an optimistic-concurrency check. The
 * user's input stays in the form behind it, so "Tutup" lets them copy their
 * changes before choosing to reload.
 */
export function ConflictDialog({ open, onClose, onReload }: { open: boolean; onClose: () => void; onReload: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Data sudah berubah">
      <div className="stack">
        <p>Seseorang baru saja mengubah data ini. Muat ulang untuk melihat versi terbaru sebelum menyimpan lagi.</p>
        <Alert tone="warning">Isian Anda masih tersimpan di formulir. Salin perubahan sebelum memuat ulang.</Alert>
      </div>
      <DialogFooter>
        <Button variant="tertiary" onClick={onClose}>
          Tutup
        </Button>
        <Button onClick={onReload}>Muat ulang</Button>
      </DialogFooter>
    </Dialog>
  );
}
