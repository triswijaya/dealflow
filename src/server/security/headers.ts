// SEC-04: security headers and Content Security Policy, kept as a pure function so the
// policy can be unit tested and next.config.ts only has to apply the result.
//
// The CSP is the "without nonces" variant from the Next.js guide: inline scripts are
// allowed because Next injects them, everything else is limited to this origin. There
// is no iframe, embed or third-party resource in the app (fonts are self-hosted by
// next/font), so framing and object embedding are switched off entirely. Sentry
// (OBS-01) will need its ingest host added to connect-src when it is wired up.

export type SecurityHeaderOptions = {
  /** `next dev`: React needs eval for debugging, and hot reload uses a websocket. */
  isDev: boolean;
  /** Served over HTTPS (production, preview, demo): adds HSTS and upgrade-insecure-requests. */
  hosted: boolean;
};

export function contentSecurityPolicy({ isDev, hosted }: SecurityHeaderOptions): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (hosted) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function securityHeaders(options: SecurityHeaderOptions): { key: string; value: string }[] {
  const headers = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (options.hosted) headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  return headers;
}
