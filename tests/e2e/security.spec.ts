import { expect, test } from "@playwright/test";

const PAGES = ["/", "/login", "/register"];

test("pages carry the security headers", async ({ request }) => {
  for (const path of PAGES) {
    const headers = (await request.get(path)).headers();
    expect(headers["content-security-policy"], path).toContain("default-src 'self'");
    expect(headers["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
  }
});

test("the policy does not break the pages it protects", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/content security policy/i.test(message.text())) violations.push(message.text());
  });
  page.on("pageerror", (error) => violations.push(error.message));

  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(violations).toEqual([]);
});
