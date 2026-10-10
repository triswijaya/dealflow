import { expect, test } from "@playwright/test";

test("robots.txt hides private areas and links the sitemap", async ({ request }) => {
  const body = await (await request.get("/robots.txt")).text();
  expect(body).toContain("Disallow: /dashboard");
  expect(body).toContain("Disallow: /invoices");
  expect(body).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
});

test("sitemap.xml lists the public pages", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("/login");
  expect(body).toContain("/register");
  expect(body).not.toContain("/dashboard");
});

test("share card and favicon are real images", async ({ request, page }) => {
  await page.goto("/");
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(ogImage).toBeTruthy();
  const card = await request.get(new URL(ogImage!).pathname);
  expect(card.status()).toBe(200);
  expect(card.headers()["content-type"]).toContain("image/png");

  const icon = await request.get("/icon");
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toContain("image/png");
});

test("one-time link screens are marked noindex", async ({ page }) => {
  // verify-email and onboarding need a session and redirect to login without one, so
  // check the emailed-link screens that stay reachable.
  for (const path of ["/reset-password", "/accept-invitation"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute("content", /noindex/);
  }
});
