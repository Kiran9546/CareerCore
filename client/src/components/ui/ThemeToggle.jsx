import { useState } from "react";
import { toggleTheme, useTheme } from "../../theme/theme";

const SUN = "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42";
const MOON = "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z";

/** Switches between light and dark. `tone="light"` is for dark backgrounds. */
export default function ThemeToggle({ tone = "dark", className = "" }) {
  const dark = useTheme() === "dark";
  const [switched, setSwitched] = useState(false);
  const colors =
    tone === "light"
      ? "text-slate-400 hover:bg-white/10 hover:text-white"
      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900";
  return (
    <button
      type="button"
      onClick={() => {
        toggleTheme();
        setSwitched(true);
      }}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${colors} ${className}`}
    >
      <svg key={dark ? "sun" : "moon"} viewBox="0 0 24 24" className={`h-[18px] w-[18px] ${switched ? "icon-swap" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={dark ? SUN : MOON} />
      </svg>
    </button>
  );
}
