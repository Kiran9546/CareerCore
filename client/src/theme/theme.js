import { useSyncExternalStore } from "react";

/**
 * Light/dark theme. The class on <html> is the single source of truth; an
 * inline script in index.html sets it before the first paint.
 *
 * An explicit choice is saved in localStorage. Until the user makes one, the
 * theme follows the operating system setting, including live changes.
 */

const KEY = "cc_theme";
const listeners = new Set();
const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

const saved = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage blocked: fall back to the system setting
  }
};

const apply = (dark) => {
  document.documentElement.classList.toggle("dark", dark);
  // Browser chrome (mobile address bar) matches the page background.
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0b1120" : "#ffffff");
  listeners.forEach((l) => l());
};

media?.addEventListener("change", (e) => {
  if (!saved()) apply(e.matches);
});

export const isDark = () => document.documentElement.classList.contains("dark");

export const setTheme = (theme) => {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* the choice still applies to this page view */
  }
  apply(theme === "dark");
};

export const toggleTheme = () => setTheme(isDark() ? "light" : "dark");

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** "dark" or "light", re-rendering when it changes. */
export const useTheme = () => (useSyncExternalStore(subscribe, isDark, () => false) ? "dark" : "light");

/** Colors for chart libraries, which take literal colors rather than classes. */
export const CHART_COLORS = {
  light: { ink: "#0f172a", axis: "#64748b", axisMuted: "#94a3b8", grid: "#e2e8f0", gridMuted: "#cbd5e1", track: "#e2e8f0", tooltipBg: "#ffffff", tooltipBorder: "#e2e8f0" },
  dark: { ink: "#c7d2fe", axis: "#97a4b8", axisMuted: "#7a889f", grid: "#253149", gridMuted: "#354360", track: "#253149", tooltipBg: "#131c2e", tooltipBorder: "#253149" },
};

export const useChartColors = () => CHART_COLORS[useTheme()];

/** Tooltip styling for recharts, matching the current theme. */
export const chartTooltip = (c) => ({
  contentStyle: { background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8, fontSize: 12 },
  labelStyle: { color: c.axis },
  cursor: { fill: c.grid, fillOpacity: 0.5 },
});
