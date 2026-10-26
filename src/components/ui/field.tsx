"use client";

import { CircleX, Eye, EyeOff } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { formatRupiahInput, parseRupiahInput } from "@/lib/format";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
};

/** Visible label, required marker, and an error tied to the control (UX-04). */
export function Field({ label, htmlFor, required, hint, error, className, children }: FieldProps) {
  return (
    <label className={cn("field", error && "invalid", className)} htmlFor={htmlFor}>
      <span>
        {label}
        {required ? <span className="red" aria-hidden="true"> *</span> : null}
      </span>
      {children}
      {error ? (
        <small id={htmlFor ? `${htmlFor}-error` : undefined} role="alert">
          <CircleX aria-hidden="true" style={{ width: 14, height: 14, marginRight: 5, verticalAlign: -2 }} />
          {error}
        </small>
      ) : hint ? (
        <small>{hint}</small>
      ) : null}
    </label>
  );
}

function describedBy(id: string | undefined, invalid: boolean | undefined) {
  return invalid && id ? `${id}-error` : undefined;
}

export function Input({ invalid, id, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input id={id} aria-invalid={invalid || undefined} aria-describedby={describedBy(id, invalid)} {...props} />;
}

export function Textarea({ invalid, id, ...props }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return <textarea id={id} aria-invalid={invalid || undefined} aria-describedby={describedBy(id, invalid)} {...props} />;
}

export function Select({ invalid, id, ...props }: ComponentProps<"select"> & { invalid?: boolean }) {
  return <select id={id} aria-invalid={invalid || undefined} aria-describedby={describedBy(id, invalid)} {...props} />;
}

export function PasswordInput({ invalid, id, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Sembunyikan password" : "Tampilkan password";
  return (
    <div className="password">
      <input
        id={id}
        type={visible ? "text" : "password"}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(id, invalid)}
        {...props}
      />
      <button type="button" className="iconbtn" aria-label={label} title={label} onClick={() => setVisible((v) => !v)}>
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  );
}

type MoneyInputProps = Omit<ComponentProps<"input">, "value" | "onChange" | "defaultValue"> & {
  value: string;
  onValueChange: (digits: string) => void;
  invalid?: boolean;
};

/**
 * UX-05: the user types a plain number, sees thousands separators while
 * typing, and the value handed back is the exact integer string the
 * server's moneyAmountSchema expects -- never a formatted, ambiguous one.
 */
export function MoneyInput({ value, onValueChange, invalid, id, className, ...props }: MoneyInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div style={{ position: "relative" }}>
      <span
        aria-hidden="true"
        style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }}
      >
        Rp
      </span>
      <input
        id={inputId}
        inputMode="numeric"
        autoComplete="off"
        className={className}
        style={{ paddingLeft: 38 }}
        value={formatRupiahInput(value)}
        onChange={(event) => onValueChange(parseRupiahInput(event.target.value))}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(inputId, invalid)}
        {...props}
      />
    </div>
  );
}
