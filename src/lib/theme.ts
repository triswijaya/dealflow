export type ThemePreference = "light" | "dark" | "system";

export const THEME_KEY = "df-theme";

/**
 * Inlined in <head> so the saved theme is on <html> before first paint (no
 * white flash in night mode). "system" follows the OS, live. Printing always
 * uses the light theme, since paper is white.
 */
export const THEME_SCRIPT = `(function(){try{var m=matchMedia("(prefers-color-scheme: dark)");function a(){var t=localStorage.getItem("${THEME_KEY}")||"system";document.documentElement.dataset.theme=t==="system"?(m.matches?"dark":"light"):t}a();m.addEventListener("change",a);addEventListener("beforeprint",function(){document.documentElement.dataset.theme="light"});addEventListener("afterprint",a)}catch(e){}})()`;
