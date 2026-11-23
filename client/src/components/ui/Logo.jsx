/** The CareerCore mark and wordmark. `tone` is "dark" on light backgrounds. */
export default function Logo({ tone = "dark", compact = false, className = "" }) {
  const text = tone === "dark" ? "text-slate-900" : "text-white";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="w-8 h-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#4f46e5" />
        <path
          d="M21.5 11.2A7 7 0 1 0 21.5 20.8"
          fill="none"
          stroke="#fff"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <circle cx="16" cy="16" r="2.6" fill="#a5b4fc" />
      </svg>
      {!compact && (
        <span className={`font-semibold tracking-tight text-[17px] ${text}`}>
          CareerCore
        </span>
      )}
    </span>
  );
}
