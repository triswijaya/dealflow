import { formatDate } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/labels";
import type { EmailMessage } from "./send-email";

// X-02: the three account emails. Each carries one action button and a plain
// text twin, because some clients drop HTML and the dev sink prints only text.

type Content = {
  heading: string;
  body: string;
  action: string;
  url: string;
  note: string;
  footer: string;
};

const FOOTER = "Email akun otomatis untuk keamanan dan akses organisasi.";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function render(to: string, subject: string, content: Content): EmailMessage {
  const { heading, body, action, url, note, footer } = content;
  const html = `<!doctype html>
<html lang="id"><body style="margin:0;padding:24px;background:#F5F6F8;font-family:Arial,Helvetica,sans-serif;color:#10213F">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:20px;font-weight:700;letter-spacing:-0.02em;padding-bottom:20px">dealflow</td></tr>
<tr><td style="font-size:22px;font-weight:700;padding-bottom:10px">${escapeHtml(heading)}</td></tr>
<tr><td style="font-size:15px;line-height:1.55;padding-bottom:24px">${escapeHtml(body)}</td></tr>
<tr><td style="padding-bottom:20px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#10213F;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px">${escapeHtml(action)}</a></td></tr>
<tr><td style="font-size:13px;color:#5B6B85;padding-bottom:20px">${escapeHtml(note)}</td></tr>
<tr><td style="font-size:12px;color:#5B6B85;border-top:1px solid #E3E7EE;padding-top:14px">${escapeHtml(footer)}<br>${FOOTER}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${heading}\n\n${body}\n\n${action}: ${url}\n\n${note}\n\n${footer}\n${FOOTER}`;
  return { to, subject, text, html };
}

export function verificationEmail(params: { to: string; name: string; url: string }): EmailMessage {
  return render(params.to, "Verifikasi email Anda", {
    heading: "Verifikasi email Anda",
    body: `Halo ${params.name}, konfirmasikan email akun Anda untuk mengamankan akses ke DealFlow.`,
    action: "Verifikasi email",
    url: params.url,
    note: "Link berlaku 24 jam.",
    footer: "DealFlow",
  });
}

export function resetPasswordEmail(params: { to: string; name: string; url: string }): EmailMessage {
  return render(params.to, "Buat password baru DealFlow", {
    heading: "Buat password baru",
    body: `Halo ${params.name}, kami menerima permintaan untuk membuat password baru untuk akun DealFlow Anda.`,
    action: "Reset password",
    url: params.url,
    note: "Link berlaku 1 jam. Abaikan bila Anda tidak meminta.",
    footer: "DealFlow",
  });
}

export function invitationEmail(params: {
  to: string;
  organizationName: string;
  inviterName: string;
  role: string;
  url: string;
  expiresAt: Date;
  timezone?: string;
}): EmailMessage {
  const role = ROLE_LABEL[params.role as Role] ?? params.role;
  return render(params.to, `Anda diundang ke ${params.organizationName} di DealFlow`, {
    heading: `Anda diundang ke ${params.organizationName}`,
    body: `${params.inviterName} mengundang Anda bergabung ke ${params.organizationName} sebagai ${role}.`,
    action: "Terima undangan",
    url: params.url,
    note: `Undangan berlaku sampai ${formatDate(params.expiresAt.toISOString(), params.timezone)}.`,
    footer: `DealFlow · Ruang kerja ${params.organizationName}`,
  });
}
