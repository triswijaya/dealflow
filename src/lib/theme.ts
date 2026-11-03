export type ThemePreference = "light" | "dark" | "system";

export const THEME_KEY = "df-theme";

/**
 * Inlined in <head> so the saved theme is on <html> before first paint (no
 * white flash in night mode). "system" follows the OS, live.
 */
export const THEME_SCRIPT = `(function(){try{var m=matchMedia("(prefers-color-scheme: dark)");function a(){var t=localStorage.getItem("${THEME_KEY}")||"system";document.documentElement.dataset.theme=t==="system"?(m.matches?"dark":"light"):t}a();m.addEventListener("change",a)}catch(e){}})()`;
