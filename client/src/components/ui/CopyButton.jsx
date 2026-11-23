import { useState } from "react";
import { copyText } from "./toast";

const COPY = "M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1";
const DONE = "M20 6 9 17l-5-5";

/**
 * A small icon button that copies `value`. `label` names what is copied, for
 * screen readers and the confirmation ("Email copied").
 */
export default function CopyButton({ value, label = "text", className = "" }) {
  const [done, setDone] = useState(false);
  if (!value) return null;

  const onClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const name = label.charAt(0).toUpperCase() + label.slice(1);
    if (await copyText(value, `${name} copied`)) {
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={done ? 2.5 : 1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={done ? DONE : COPY} />
      </svg>
    </button>
  );
}
