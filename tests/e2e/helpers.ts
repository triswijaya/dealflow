import { expect, type Page } from "@playwright/test";
import { DEMO_PASSWORD, ORG, SECOND_ORG } from "../../scripts/seed/data";

export type DemoRole = (typeof ORG.people)[number]["key"] | "otherOwner";

const EMAILS: Record<DemoRole, string> = {
  ...(Object.fromEntries(ORG.people.map((person) => [person.key, person.email])) as Record<(typeof ORG.people)[number]["key"], string>),
  otherOwner: SECOND_ORG.owner.email,
};

// Better Auth limits email sign-in to 3 per 10 seconds per IP in a production build (SEC-01),
// and that limit stays on. It keeps counting while requests keep arriving, so after every
// third sign-in this waits for a quiet spell instead of weakening the app. One worker runs
// the suite, so module-level state is enough.
const SIGN_INS_PER_WINDOW = 3;
const QUIET_PERIOD_MS = 10_500;
let signIns = 0;
let lastSignInAt = 0;

/** Signs in through the real login form with a seeded demo account. */
export async function signInAs(page: Page, role: DemoRole, password = DEMO_PASSWORD) {
  if (signIns >= SIGN_INS_PER_WINDOW) {
    const wait = lastSignInAt + QUIET_PERIOD_MS - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    signIns = 0;
  }
  signIns += 1;
  lastSignInAt = Date.now();
  await page.goto("/login");
  await page.locator("#email").fill(EMAILS[role]);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
}

export async function signInAndWait(page: Page, role: DemoRole) {
  await signInAs(page, role);
  await expect(page).toHaveURL(/\/dashboard$/);
}
