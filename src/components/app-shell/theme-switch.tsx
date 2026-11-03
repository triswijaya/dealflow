"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY, type ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Terang" },
  { value: "dark", label: "Gelap" },
  { value: "system", label: "Sistem" },
];
const CHANGE = "df-theme-change";

function read(): ThemePreference {
  try {
    return (localStorage.getItem(THEME_KEY) as ThemePreference | null) ?? "system";
  } catch {
    return "system";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function choose(value: ThemePreference) {
  try {
    localStorage.setItem(THEME_KEY, value);
  } catch {
    // Private mode: the choice still applies to this tab.
  }
  const dark = value === "dark" || (value === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  window.dispatchEvent(new Event(CHANGE));
}

/** Terang / Gelap / Sistem, saved per browser. */
export function ThemeSwitch() {
  const current = useSyncExternalStore(subscribe, read, () => "system" as const);
  return (
    <div className="theme-switch">
      <span id="theme-label">Tema</span>
      <div className="seg" role="group" aria-labelledby="theme-label">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`btn ${current === option.value ? "secondary" : "tertiary"}`}
            aria-pressed={current === option.value}
            onClick={() => choose(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
