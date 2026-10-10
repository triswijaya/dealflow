import { describe, expect, it } from "vitest";
import robots, { PRIVATE_PATHS } from "./robots";
import sitemap, { PUBLIC_PATHS } from "./sitemap";

describe("robots.txt", () => {
  it("keeps every signed-in area and one-time link out of search", () => {
    const rule = (robots().rules as { disallow: string[] }[])[0];
    for (const path of ["/dashboard", "/invoices", "/quotations", "/settings", "/reset-password", "/api/"]) {
      expect(rule.disallow).toContain(path);
    }
  });

  it("points at the sitemap on the configured origin", () => {
    expect(robots().sitemap).toBe("http://localhost:3000/sitemap.xml");
  });

  it("never blocks a public page", () => {
    for (const path of PUBLIC_PATHS) {
      expect(PRIVATE_PATHS.some((blocked) => path !== "/" && path.startsWith(blocked))).toBe(false);
    }
  });
});

describe("sitemap.xml", () => {
  it("lists only the public pages as absolute URLs", () => {
    expect(sitemap().map((entry) => entry.url)).toEqual(["http://localhost:3000", "http://localhost:3000/login", "http://localhost:3000/register"]);
  });
});
