export default function PRSGauge({ score, level }) {
  const pct = Math.max(0, Math.min(100, score ?? 0));
  const r = 70;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  const color =
    pct <= 40
      ? "#dc2626"
      : pct <= 60
        ? "#f59e0b"
        : pct <= 75
          ? "#10b981"
          : "#059669";

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-44 h-44">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
          <circle
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="12"
          />
          <circle
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold text-slate-900">
            {pct.toFixed(1)}
          </span>
          <span className="text-xs text-slate-400 uppercase tracking-wide">
            PRS
          </span>
        </div>
      </div>
      <span
        className="mt-3 px-3 py-1 rounded-full text-sm font-medium text-white"
        style={{ backgroundColor: color }}
      >
        {level}
      </span>
    </div>
  );
}
