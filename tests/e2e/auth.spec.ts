import { expect, test, type Page } from "@playwright/test";
import { DEMO_PASSWORD, ORG } from "../../scripts/seed/data";

// Needs the demo data: `pnpm db:seed --reset` against the database the server uses.
const byKey = (key: string) => ORG.people.find((person) => person.key === key)!;

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
}

test("owner signs in and lands on the dashboard", async ({ page }) => {
  await signIn(page, byKey("owner").email, DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("NusaTech Solutions").first()).toBeVisible();
});

test("a wrong password keeps the user on the login page", async ({ page }) => {
  await signIn(page, byKey("owner").email, "not-the-right-password");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Masuk" })).toBeVisible();
});

test("signed-out visitors are sent to login", async ({ page }) => {
  await page.goto("/pipeline");
  await expect(page).toHaveURL(/\/login/);
});
