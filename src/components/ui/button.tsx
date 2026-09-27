import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Brief §3.3: five levels, at most one Primer per working area.
export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger" | "destructive";

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  full?: boolean;
  pending?: boolean;
  pendingText?: string;
};

export function Button({
  variant = "primary",
  full,
  pending,
  pendingText = "Memproses...",
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn("btn", variant, full && "wfull", className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending ? pendingText : children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: ButtonVariant; full?: boolean };

export function ButtonLink({ variant = "primary", full, className, ...props }: ButtonLinkProps) {
  return <Link className={cn("btn", variant, full && "wfull", className)} {...props} />;
}

type IconButtonProps = ComponentProps<"button"> & { label: string; children: ReactNode };

/** Icon-only action: tooltip and accessible name are mandatory (brief §3.3). */
export function IconButton({ label, className, type = "button", ...props }: IconButtonProps) {
  return <button type={type} className={cn("iconbtn", className)} aria-label={label} title={label} {...props} />;
}

type IconLinkProps = ComponentProps<"a"> & { label: string; children: ReactNode };

export function IconLink({ label, className, ...props }: IconLinkProps) {
  return <a className={cn("iconbtn", className)} aria-label={label} title={label} {...props} />;
}
