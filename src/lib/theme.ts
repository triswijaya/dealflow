export type ThemePreference = "light" | "dark";

export const THEME_KEY = "df-theme";

/**
 * Inlined in <head> so the saved theme is on <html> before first paint (no
 * white flash in night mode). Light is the default; only a saved "dark" turns
 * night mode on, so an old "system" value reads as light. Printing always uses
 * the light theme, since paper is white.
 */
export const THEME_SCRIPT = `(function(){try{function a(){document.documentElement.dataset.theme=localStorage.getItem("${THEME_KEY}")==="dark"?"dark":"light"}a();addEventListener("beforeprint",function(){document.documentElement.dataset.theme="light"});addEventListener("afterprint",a)}catch(e){document.documentElement.dataset.theme="light"}})()`;
