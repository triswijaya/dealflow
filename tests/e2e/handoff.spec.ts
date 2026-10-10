import { expect, test } from "@playwright/test";
import { signInAndWait } from "./helpers";

// TEST-04: the sales side and the finance side of one deal, in different sessions, plus
// a tenant-isolation check. This test records a payment, so it needs fresh demo data:
// run `pnpm db:seed --reset` before each run against the same database.

test("sales cannot reach finance screens, finance settles an invoice, another tenant cannot open it", async ({ page, browser }) => {
  // Sales: wins deals but has no invoice or payment access (RBAC / permission matrix).
  await signInAndWait(page, "rina");
  await page.goto("/invoices");
  await expect(page.getByRole("heading", { name: "Anda tidak memiliki akses ke halaman ini" })).toBeVisible();

  // Sales sees the hand-off note on a won deal instead of an invoice action (RBAC-04).
  await page.goto("/deals");
  await page.getByRole("link", { name: /Kamera pengawas ruko/ }).first().click();
  await expect(page.getByText("Deal sudah menang. Finance atau Admin dapat membuat invoice.")).toBeVisible();

  // Finance: opens the unpaid invoice and pays it in full.
  const finance = await browser.newContext();
  const financePage = await finance.newPage();
  await signInAndWait(financePage, "dewi");
  await financePage.goto("/invoices");
  await expect(financePage.getByText("Belum lunas").first()).toBeVisible();
  await financePage.getByRole("row", { name: /Server room dan jaringan kantor/ }).getByRole("link").first().click();
  await expect(financePage).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/);
  const invoiceUrl = financePage.url();

  await financePage.getByRole("button", { name: "Catat pembayaran" }).click();
  const dialog = financePage.getByRole("dialog");
  await dialog.getByRole("button", { name: /Bayar penuh/ }).click();
  await dialog.getByRole("button", { name: "Lanjut" }).click();
  await dialog.getByRole("button", { name: "Simpan pembayaran" }).click();
  await expect(dialog).toBeHidden();
  await expect(financePage.getByText("Lunas").first()).toBeVisible();
  await expect(financePage.getByRole("button", { name: "Catat pembayaran" })).toHaveCount(0);

  // A different organization cannot open that invoice, even with the exact URL.
  const outsider = await browser.newContext();
  const outsiderPage = await outsider.newPage();
  await signInAndWait(outsiderPage, "otherOwner");
  await outsiderPage.goto(invoiceUrl);
  await expect(outsiderPage.getByRole("heading", { name: "Halaman tidak ditemukan" })).toBeVisible();
  await expect(outsiderPage.getByText("Server room dan jaringan kantor")).toHaveCount(0);

  await finance.close();
  await outsider.close();
});

test("another organization only sees its own customers", async ({ page }) => {
  await signInAndWait(page, "otherOwner");
  await page.goto("/customers");
  await expect(page.getByText("Kopi Senja Nusantara")).toBeVisible();
  await expect(page.getByText("PT Sentra Niaga")).toHaveCount(0);
  await expect(page.getByText("PT Maju Jaya Logistik")).toHaveCount(0);
});
