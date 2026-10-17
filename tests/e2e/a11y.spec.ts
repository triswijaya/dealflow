import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signInAndWait } from "./helpers";

// WCAG 2.1 A and AA rules via axe-core. Each page must come back clean; a failure lists the
// rule, the impact and the first elements so it can be fixed rather than guessed at.
// Needs the demo data: `pnpm db:seed --reset`.

async function scan(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const report = violations.map((violation) => `${violation.id} (${violation.impact}): ${violation.help}\n    ${violation.nodes.slice(0, 3).map((node) => node.target.join(" ")).join("\n    ")}`);
  expect(report, `${label}\n${report.join("\n")}`).toEqual([]);
}

const PUBLIC_PAGES = [
  { path: "/", label: "landing" },
  { path: "/login", label: "login" },
  { path: "/register", label: "register" },
];

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 375, height: 812 },
]) {
  test(`public pages have no accessibility violations on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const { path, label } of PUBLIC_PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // Reveal-on-scroll content must be visible to be scanned for contrast, and mid-transition
      // opacity would be measured as low contrast, so show it and switch the transitions off.
      await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
      await page.evaluate(() => document.querySelectorAll(".lp-reveal").forEach((el) => el.classList.add("lp-in")));
      await scan(page, `${label} (${viewport.name})`);
    }
  });
}

test("signed-in screens have no accessibility violations", async ({ page }) => {
  await signInAndWait(page, "owner");
  for (const path of ["/dashboard", "/pipeline", "/customers", "/quotations", "/invoices", "/follow-ups", "/settings/members"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await scan(page, path);
  }
});
