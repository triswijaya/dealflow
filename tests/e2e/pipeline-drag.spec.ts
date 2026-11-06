import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInAndWait } from "./helpers";

// Needs the demo data: `pnpm db:seed --reset`. The card goes forward and back again, so the data is left as found.

/** Playwright's dragTo can finish before the browser starts the drag; stepping the mouse by hand is reliable. */
async function drag(page: Page, source: Locator, target: Locator) {
  await source.hover();
  await page.mouse.down();
  await target.hover({ position: { x: 40, y: 60 } });
  await target.hover({ position: { x: 50, y: 70 } });
  await page.mouse.up();
}

test("a deal card dragged to another stage moves there and stays after a reload", async ({ page }) => {
  await signInAndWait(page, "owner");
  await page.goto("/pipeline");
  await page.waitForLoadState("networkidle");

  const from = page.getByRole("region", { name: "Gali kebutuhan", exact: true });
  const to = page.getByRole("region", { name: "Penawaran dikirim", exact: true });
  const card = (column: Locator) => column.getByRole("article").filter({ hasText: "Fiber optic backbone kampus" });
  // The footer is not a link or a button, so the drag starts on the card itself.
  const grip = (column: Locator) => card(column).locator(".deal-card-foot");

  await drag(page, grip(from), to);
  await expect(card(to)).toBeVisible();
  await expect(card(from)).toHaveCount(0);

  await page.reload();
  await expect(card(to)).toBeVisible();

  await drag(page, grip(to), from);
  await expect(card(from)).toBeVisible();
  await page.reload();
  await expect(card(from)).toBeVisible();
});
