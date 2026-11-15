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

test("the product tour shows one screen of the app at a time", async ({ page }) => {
  await page.goto("/");
  const pipeline = page.getByRole("button", { name: /Tahu deal mana yang harus dikejar/ });
  const invoice = page.getByRole("button", { name: /Tagih per termin/ });
  await expect(pipeline).toHaveAttribute("aria-expanded", "true");

  await invoice.click();
  await expect(invoice).toHaveAttribute("aria-expanded", "true");
  await expect(pipeline).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("img", { name: /INV-2026-00002/ })).toBeVisible();
});

test("the phone menu opens, jumps to a section, and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Buka menu" }).click();
  await expect(page.getByRole("button", { name: "Tutup menu" })).toHaveAttribute("aria-expanded", "true");

  await page.locator("#lp-menu").getByRole("link", { name: "Harga" }).click();
  await expect(page.getByRole("button", { name: "Buka menu" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#harga")).toBeInViewport();
});

test("landing page does not scroll sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflows).toBe(false);
});
