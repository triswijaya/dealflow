"use client";

import Link from "next/link";
import { Ellipsis } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const CloseContext = createContext<() => void>(() => {});

/** The ⋯ overflow menu for rarely used actions (brief §3.3). */
export function Menu({
  label = "Aksi lainnya",
  trigger,
  children,
  className,
}: {
  label?: string;
  trigger?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
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
    <div ref={root} className={cn("menu", className)}>
      <button
        ref={button}
        type="button"
        className={trigger ? "btn secondary" : "iconbtn"}
        aria-label={trigger ? undefined : label}
        title={trigger ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger ?? <Ellipsis aria-hidden="true" />}
      </button>
      {open ? (
        <div className="menu-content" role="menu">
          <CloseContext.Provider value={() => setOpen(false)}>{children}</CloseContext.Provider>
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  onSelect,
  href,
  danger,
  disabled,
  title,
  children,
}: {
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}) {
  const close = useContext(CloseContext);
  if (href && !disabled) {
    return (
      <Link role="menuitem" href={href} className={cn(danger && "red")} onClick={close}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(danger && "red")}
      disabled={disabled}
      title={title}
      onClick={() => {
        close();
        onSelect?.();
      }}
    >
      {children}
    </button>
  );
}
