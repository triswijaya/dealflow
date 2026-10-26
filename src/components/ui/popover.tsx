"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useFloating, type Placement } from "./use-floating";

const FOCUSABLE = "input, select, textarea, button, a[href]";

/**
 * A ghost dropdown trigger with a small panel of controls under it (DESIGN.md
 * 9.4 and 9.14), used for toolbar filters that need more than one field. The
 * panel floats in the top layer; Escape or a click outside closes it.
 */
export function Popover({
  label,
  trigger,
  active,
  invalid,
  placement = "bottom-start",
  children,
}: {
  /** Names the panel for assistive technology. */
  label: string;
  trigger: ReactNode;
  /** A value is set: the trigger reads as a filled chip. */
  active?: boolean;
  invalid?: boolean;
  placement?: Placement;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useFloating(open, button, panel, { placement });

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="popover-anchor">
      <button
        ref={button}
        type="button"
        className={cn("filter-trigger", active && "active", invalid && "invalid")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div ref={panel} className="popover" role="dialog" aria-label={label} popover="manual">
          {children}
        </div>
      ) : null}
    </div>
  );
}
