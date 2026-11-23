import { useEffect, useState } from "react";
import { dismissToast, subscribeToasts } from "./toast";

const TONE = {
  success: { icon: "M20 6 9 17l-5-5", ring: "text-emerald-600" },
  error: { icon: "M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z", ring: "text-red-600" },
  info: { icon: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01", ring: "text-indigo-600" },
};

/** Renders toasts at the bottom of the screen. Mounted once, in App. */
export default function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => subscribeToasts(setItems), []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[200] flex flex-col items-center gap-2 px-4 sm:bottom-6"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={`${t.tone === "error" ? "toast-shake" : "toast-in"} pointer-events-auto flex max-w-md items-start gap-2.5 rounded-lg bg-white px-4 py-3 text-sm text-slate-800 shadow-lg ring-1 ring-slate-200`}
        >
          <svg viewBox="0 0 24 24" className={`mt-0.5 h-4 w-4 shrink-0 ${TONE[t.tone].ring}`} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={TONE[t.tone].icon} {...(t.tone === "success" ? { pathLength: "1", className: "line-draw" } : {})} />
          </svg>
          <span className="flex-1">{t.text}</span>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className="-mr-1 rounded p-0.5 text-slate-400 hover:text-slate-700"
            aria-label="Dismiss"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
