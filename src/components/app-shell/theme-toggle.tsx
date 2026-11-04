"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { THEME_KEY, type ThemePreference } from "@/lib/theme";

const CHANGE = "df-theme-change";

function read(): ThemePreference {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
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
  document.documentElement.dataset.theme = value;
  window.dispatchEvent(new Event(CHANGE));
}

/** One button, as in the prototype: moon in light mode, sun in night mode. Saved per browser. */
export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, read, () => "light" as const) === "dark";
  const label = dark ? "Ganti ke tema terang" : "Ganti ke tema gelap";
  return (
    <button type="button" className="iconbtn square" aria-label={label} title={label} onClick={() => choose(dark ? "light" : "dark")}>
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  );
}
