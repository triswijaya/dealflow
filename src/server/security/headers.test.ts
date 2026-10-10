import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./headers";

const production = { isDev: false, hosted: true };
const localBuild = { isDev: false, hosted: false };
const dev = { isDev: true, hosted: false };

describe("content security policy (SEC-04)", () => {
  it("limits everything to this origin and forbids framing and plugins", () => {
    const csp = contentSecurityPolicy(production);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("only allows eval and websockets in development", () => {
    expect(contentSecurityPolicy(dev)).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy(dev)).toContain("ws:");
    expect(contentSecurityPolicy(production)).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy(production)).not.toContain("ws:");
  });

  it("never allows a wildcard or an external script host", () => {
    for (const options of [production, localBuild, dev]) {
      const scriptSrc = contentSecurityPolicy(options).split("; ").find((directive) => directive.startsWith("script-src"))!;
      expect(scriptSrc).not.toContain("*");
      expect(scriptSrc).not.toContain("http");
    }
  });

  it("upgrades insecure requests only where HTTPS is guaranteed", () => {
    expect(contentSecurityPolicy(production)).toContain("upgrade-insecure-requests");
    expect(contentSecurityPolicy(localBuild)).not.toContain("upgrade-insecure-requests");
  });
});

describe("security headers", () => {
  const names = (options: Parameters<typeof securityHeaders>[0]) => securityHeaders(options).map((header) => header.key);

  it("always sends the baseline set", () => {
    for (const options of [production, localBuild, dev]) {
      expect(names(options)).toEqual(
        expect.arrayContaining(["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Cross-Origin-Opener-Policy"]),
      );
    }
  });

  it("sends HSTS only when hosted, so local http is not pinned to https", () => {
    expect(names(production)).toContain("Strict-Transport-Security");
    expect(names(localBuild)).not.toContain("Strict-Transport-Security");
  });

  it("has no duplicate header names", () => {
    const list = names(production);
    expect(new Set(list).size).toBe(list.length);
  });
});
