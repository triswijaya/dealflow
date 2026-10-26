"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** "drawer" slides in from the right for long forms; it is a bottom sheet on phones like the others. */
  size?: "default" | "large" | "drawer";
  children?: ReactNode;
};

/**
 * Native modal <dialog>: the browser provides the focus trap, Esc to close,
 * inert background, and focus return to the trigger (UX-04). The header stays
 * put, the body scrolls, and a DialogFooter at the end sticks to the bottom,
 * so the actions are always in reach. On mobile it becomes a bottom sheet.
 */
export function Dialog({ open, onClose, title, description, size = "default", children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cn("dialog", size !== "default" && size)}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (event.target === ref.current) onClose();
      }}
    >
      {open ? (
        <div className={cn("dialog-panel", size !== "default" && size)}>
          <div className="sheet-handle" aria-hidden="true" />
          <div className="dialog-head">
            <h2 id={titleId}>{title}</h2>
            {description ? <div className="dialog-desc">{description}</div> : null}
          </div>
          <div className="dialog-body">{children}</div>
          {/* After the content so the first field, not the close button, takes focus on open. */}
          <button type="button" className="iconbtn dialog-close" aria-label="Tutup" title="Tutup" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </dialog>
  );
}

/** Footer order from the brief: Tersier, Sekunder, then Primer on the right. */
export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="footer">{children}</div>;
}
