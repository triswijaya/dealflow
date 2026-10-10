import { expect, test } from "@playwright/test";
import { signInAndWait, signInAs } from "./helpers";

// Needs the demo data: `pnpm db:seed --reset` against the database the server uses.

test("owner signs in and lands on the dashboard", async ({ page }) => {
  await signInAndWait(page, "owner");
  await expect(page.getByText("NusaTech Solutions").first()).toBeVisible();
});

test("a wrong password keeps the user on the login page", async ({ page }) => {
  await signInAs(page, "owner", "not-the-right-password");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Masuk" })).toBeVisible();
});

test("signed-out visitors are sent to login", async ({ page }) => {
  await page.goto("/pipeline");
  await expect(page).toHaveURL(/\/login/);
});
