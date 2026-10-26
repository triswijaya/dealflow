import { FileText, Handshake, Receipt, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import type { BadgeTone } from "@/lib/labels";

// A static, fictional glimpse of the product beside the form.
const PREVIEW_METRICS: { label: string; value: string; note: string; icon: LucideIcon; hue: string }[] = [
  { label: "Nilai pipeline", value: "Rp726 jt", note: "15 peluang aktif", icon: Handshake, hue: "indigo" },
  { label: "Menang bulan ini", value: "Rp81 jt", note: "4 deal", icon: FileText, hue: "mint" },
  { label: "Belum lunas", value: "Rp90 jt", note: "4 invoice", icon: Receipt, hue: "butter" },
];
const PREVIEW_DEALS: { title: string; customer: string; stage: string; tone: BadgeTone }[] = [
  { title: "Smart building cabling", customer: "PT Karya Teknik Utama", stage: "Negosiasi", tone: "warning" },
  { title: "Fiber optic backbone kampus", customer: "Yayasan Pendidikan Cahaya", stage: "Terkualifikasi", tone: "info" },
  { title: "Kamera pengawas ruko", customer: "PT Jaringan Andalan Prima", stage: "Menang", tone: "success" },
];

/**
 * The frame around every signed-out screen. "split" puts a product statement
 * on the tinted shell beside a white panel holding the form (login, register,
 * forgot and reset password, accepting an invitation); "state" is a single
 * centred card for a short status message (verifying, expired link, preparing
 * the workspace).
 */
export function AuthShell({ children, variant = "split" }: { children: ReactNode; variant?: "split" | "state" }) {
  if (variant === "state") {
    return (
      <div className="df auth-root-state">
        <main className="auth-page">
          <div className="auth-state stack" style={{ gap: 24 }}>
            <Brand />
            <div className="card stack" style={{ gap: 14 }}>
              {children}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="df">
      <main className="auth-page">
        <div className="auth-stage">
          <aside className="brand-panel">
            <Brand />
            <div className="brand-lead">
              <p className="brand-title">Dari calon customer sampai pembayaran, dalam satu alur.</p>
              <p>Pipeline, penawaran, follow-up, dan invoice tim Anda di satu ruang kerja.</p>
            </div>
            <div className="auth-preview" aria-hidden="true">
              <div className="metrics">
                {PREVIEW_METRICS.map((metric) => (
                  <div key={metric.label} className="metric-card">
                    <div className="metric-head">
                      <span className="marker" data-hue={metric.hue}>
                        <metric.icon />
                      </span>
                      <h3>{metric.label}</h3>
                    </div>
                    <div>
                      <strong className="metric-value">{metric.value}</strong>
                      <span className="metric-label">{metric.note}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                {PREVIEW_DEALS.map((deal) => (
                  <div key={deal.title} className="preview-row">
                    <div>
                      <strong>{deal.title}</strong>
                      <small>{deal.customer}</small>
                    </div>
                    <Badge tone={deal.tone}>{deal.stage}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </aside>
          <section className="auth-main">
            <div className="auth-form">{children}</div>
            <p className="auth-foot">DealFlow · Ruang kerja yang rapi, percakapan yang berarti.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
