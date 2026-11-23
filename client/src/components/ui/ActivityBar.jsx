import { useEffect, useState } from "react";
import { activeRequests, subscribeActivity } from "../../api/axios";

/**
 * A slim bar along the top edge while the app waits on the server (or on a
 * page's code, when `always` is set). It appears only after a quarter of a
 * second, so quick requests do not flicker it. Announced politely to screen
 * readers as "Loading".
 */
export default function ActivityBar({ always = false, className = "" }) {
  const [busy, setBusy] = useState(always || activeRequests() > 0);
  const [visible, setVisible] = useState(false);
  useEffect(() => (always ? undefined : subscribeActivity((n) => setBusy(n > 0))), [always]);
  useEffect(() => {
    if (!busy) {
      const id = setTimeout(() => setVisible(false), 0);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setVisible(true), 250);
    return () => clearTimeout(id);
  }, [busy]);
  return (
    <div
      className={`activity-bar pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden ${visible ? "opacity-100" : "opacity-0"} ${className}`}
      role="status"
      aria-live="polite"
    >
      {visible && <span className="block h-full w-2/5 rounded-full bg-indigo-500" />}
      <span className="sr-only">{visible ? "Loading" : ""}</span>
    </div>
  );
}
