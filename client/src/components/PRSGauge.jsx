import { useEffect, useState } from "react";
import AnimatedNumber from "../motion/AnimatedNumber";
import { useReducedMotion } from "../motion/motion";

/**
 * The Placement Readiness Score ring. The ring draws itself from empty to the
 * student's real score, and the number counts up alongside it; with reduced
 * motion both appear at once.
 */
export default function PRSGauge({ score, level }) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(100, score ?? 0));
  const r = 70;
  const circ = 2 * Math.PI * r;

  // Start empty, then fill on the next frame so the CSS transition runs.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const shownPct = reduce || drawn ? pct : 0;
  const offset = circ - (shownPct / 100) * circ;

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
        <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160" aria-hidden="true">
          <circle
            cx="80"
            cy="80"
            r={r}
            fill="none"
            className="stroke-slate-200"
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
            style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold text-slate-900">
            <AnimatedNumber value={pct.toFixed(1)} duration={1000} />
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
