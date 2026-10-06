import { expect, test } from "@playwright/test";

test("health endpoints answer", async ({ request }) => {
  const live = await request.get("/api/health");
  expect(live.status()).toBe(200);
  expect(await live.json()).toEqual({ status: "ok" });

  const ready = await request.get("/api/health/ready");
  expect(ready.status()).toBe(200);
  expect(await ready.json()).toEqual({ status: "ready" });
});

test("landing page shows the promise and leads to registration", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dari chat pertama sampai uang masuk.");

  const cta = page.getByRole("link", { name: "Buat ruang kerja" }).first();
  await expect(cta).toHaveAttribute("href", "/register");
  await cta.click();
  await expect(page).toHaveURL(/\/register$/);
});

test("landing page does not scroll sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflows).toBe(false);
});
