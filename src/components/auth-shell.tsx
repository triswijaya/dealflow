import { CalendarClock, Columns3, ReceiptText, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { cn } from "@/lib/utils";

const POINTS: { icon: LucideIcon; label: string }[] = [
  { icon: Columns3, label: "Pipeline per tahap" },
  { icon: CalendarClock, label: "Follow-up tepat waktu" },
  { icon: ReceiptText, label: "Quotation sampai invoice" },
];

/**
 * The frame around every signed-out screen (DESIGN.md 8.12, centred auth):
 * the shell gradient as the page, the brand in the corner, and one white card
 * in the middle. "form" holds a sign-in style form (login, register, forgot
 * and reset password, accepting an invitation) with a quiet line of what the
 * product does under it; "state" is a short status message (verifying, an
 * expired link, preparing the workspace).
 */
export function AuthShell({ children, variant = "form" }: { children: ReactNode; variant?: "form" | "state" }) {
  return (
    <div className="df">
      <div className="auth-page">
        <header className="auth-top">
          <Brand />
        </header>
        <main className="auth-center">
          <div className={cn("auth-card", variant === "state" && "auth-card-state")}>{children}</div>
          {variant === "form" ? (
            <ul className="auth-points">
              {POINTS.map((point) => (
                <li key={point.label}>
                  <point.icon aria-hidden="true" />
                  {point.label}
                </li>
              ))}
            </ul>
          ) : null}
        </main>
        <footer className="auth-foot">DealFlow · Ruang kerja yang rapi, percakapan yang berarti.</footer>
      </div>
    </div>
  );
}
