import { expect, test } from "@playwright/test";
import { signInAndWait } from "./helpers";

// Needs the demo data: `pnpm db:seed --reset`. The second test adds an order to a won deal that no
// other spec touches, so a rerun on the same data only adds one more order to it.

test("the dashboard lists open deals that need attention, each linking to its deal", async ({ page }) => {
  await signInAndWait(page, "owner");

  const widget = page.locator("section.region").filter({ has: page.getByRole("heading", { name: "Perlu perhatian", exact: true }) });
  await expect(widget).toBeVisible();
  const first = widget.getByRole("link").filter({ hasNotText: "Buka pipeline" }).first();
  await expect(first).toBeVisible();

  await first.click();
  await expect(page).toHaveURL(/\/deals\/[0-9a-f-]{36}$/);
});

test("a won deal takes a further order with its own termin plan", async ({ page }) => {
  await signInAndWait(page, "owner");
  await page.goto("/deals?stage=WON");
  await page.getByRole("link", { name: /CCTV dermaga dan gudang transit/ }).first().click();
  await expect(page).toHaveURL(/\/deals\/[0-9a-f-]{36}$/);

  // The won banner links every order of the deal.
  const orderLinks = page.getByRole("status").filter({ hasText: "Tagihan diatur per termin" }).locator("a.doc-id");
  const before = await orderLinks.count();

  await page.getByRole("button", { name: "Tambah pesanan" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Tambah pesanan" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Buat pesanan" })).toBeDisabled();

  await dialog.getByLabel("Purchase order (PO)").check();
  await dialog.getByLabel("Nomor bukti").fill("PO/E2E/SUSULAN");
  await dialog.getByLabel(/Nilai pesanan/).fill("5000000");
  await expect(dialog.getByRole("cell", { name: "Pelunasan 100%" })).toBeVisible();
  await dialog.getByRole("button", { name: "Buat pesanan" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Pesanan tambahan dan rencana terminnya dibuat.")).toBeVisible();
  await expect(orderLinks).toHaveCount(before + 1);
});
