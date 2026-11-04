import { describe, expect, it } from "vitest";
import { THEME_KEY, THEME_SCRIPT } from "./theme";

// Runs the inline head script against stand-ins for the browser globals it reads.
function run(saved: string | null) {
  const windowListeners: Record<string, () => void> = {};
  const html = { dataset: {} as { theme?: string } };
  const store = new Map(saved ? [[THEME_KEY, saved]] : []);
  new Function("localStorage", "document", "addEventListener", THEME_SCRIPT)(
    { getItem: (key: string) => store.get(key) ?? null },
    { documentElement: html },
    (type: string, fn: () => void) => (windowListeners[type] = fn),
  );
  return { html, windowListeners };
}

describe("theme head script", () => {
  it("is light by default", () => {
    expect(run(null).html.dataset.theme).toBe("light");
  });

  it("applies a saved choice, and reads an old or unknown value as light", () => {
    expect(run("dark").html.dataset.theme).toBe("dark");
    expect(run("light").html.dataset.theme).toBe("light");
    expect(run("system").html.dataset.theme).toBe("light");
  });

  it("prints in the light theme and restores the choice afterwards", () => {
    const { html, windowListeners } = run("dark");
    windowListeners.beforeprint!();
    expect(html.dataset.theme).toBe("light");
    windowListeners.afterprint!();
    expect(html.dataset.theme).toBe("dark");
  });
});
