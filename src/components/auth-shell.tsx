import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { cn } from "@/lib/utils";

const POINTS = ["Pipeline per tahap", "Follow-up tepat waktu", "Quotation sampai invoice"];

/**
 * The frame around every signed-out screen (DESIGN.md 8.12, centred auth):
 * the shell grey as the page, the brand centred above one white card. "form"
 * holds a sign-in style form (login, register, forgot and reset password,
 * accepting an invitation) with a quiet line of what the product does under it; "state" is a short status message (verifying, an
 * expired link, preparing the workspace).
 */
export function AuthShell({ children, variant = "form" }: { children: ReactNode; variant?: "form" | "state" }) {
  return (
    <div className="df">
      <div className="auth-page">
        <main className="auth-center">
          <div className="auth-brand">
            <Brand />
          </div>
          <div className={cn("auth-card", variant === "state" && "auth-card-state")}>{children}</div>
          {variant === "form" ? (
            <ul className="auth-points">
              {POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          ) : null}
        </main>
        <footer className="auth-foot">DealFlow · Ruang kerja yang rapi, percakapan yang berarti.</footer>
      </div>
    </div>
  );
}
