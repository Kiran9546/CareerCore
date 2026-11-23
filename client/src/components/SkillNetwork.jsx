import { useEffect, useRef, useState } from "react";

const MAX_MET = 5;
const MAX_GAPS = 7;

/** 3 -> "3", 2.5 -> "2.5". */
const lvl = (v) => String(Number(Number(v || 0).toFixed(1)));

const STATE = {
  met: {
    pill: "bg-emerald-50 border-emerald-200 text-emerald-900",
    meta: "text-emerald-700",
    stroke: "#059669",
    label: "Meets the requirement",
  },
  partial: {
    pill: "bg-amber-50 border-amber-200 text-amber-900",
    meta: "text-amber-700",
    stroke: "#d97706",
    label: "Below the required level",
  },
  missing: {
    pill: "bg-white border-dashed border-slate-300 text-slate-800",
    meta: "text-slate-500",
    stroke: "#94a3b8",
    label: "Not on your profile yet",
  },
};

const curve = (x1, y1, x2, y2) => {
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
};

/**
 * How the student's skills connect to their target career path, drawn from
 * the readiness analysis the dashboard already loads (no extra request and
 * nothing estimated):
 *
 *   You  ──>  each skill the path requires  ──>  the career path
 *
 * - A line from "You" means the skill is on the student's profile; it is
 *   thicker the higher their level.
 * - Every required skill links to the path; the line is thicker the more the
 *   path weights that skill, and dashed while the requirement is not met.
 *
 * Pointing at, focusing or tapping a skill highlights its two connections and
 * spells out the levels in words. The skills are a real list, so screen
 * readers get the same information; the lines are decoration.
 */
export default function SkillNetwork({ careerPath, matched = [], gaps = [], matchedCount, totalGaps }) {
  const rows = [
    ...matched.slice(0, MAX_MET).map((m) => ({
      skill: m.skill,
      state: "met",
      have: m.level,
      need: null,
      importance: m.importance,
    })),
    ...gaps.slice(0, MAX_GAPS).map((g) => ({
      skill: g.skill,
      state: g.currentLevel > 0 ? "partial" : "missing",
      have: g.currentLevel,
      need: g.targetLevel,
      importance: g.importance,
    })),
  ];
  const hidden =
    Math.max(0, (matchedCount ?? matched.length) - Math.min(matched.length, MAX_MET)) +
    Math.max(0, (totalGaps ?? gaps.length) - Math.min(gaps.length, MAX_GAPS));

  const wrap = useRef(null);
  const you = useRef(null);
  const path = useRef(null);
  const pills = useRef([]);
  const [geo, setGeo] = useState(null);
  const [active, setActive] = useState(null);

  // Line end points come from where the boxes actually are, re-measured
  // whenever the card changes size (window resize, sidebar, font load).
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const box = (n) => {
        const r = n.getBoundingClientRect();
        return { l: r.left - base.left, r: r.right - base.left, y: r.top - base.top + r.height / 2 };
      };
      if (!you.current || !path.current) return;
      // Phones show the list without the side nodes and lines.
      if (!you.current.getClientRects().length) {
        setGeo(null);
        return;
      }
      setGeo({
        w: base.width,
        h: base.height,
        you: box(you.current),
        path: box(path.current),
        pills: pills.current.slice(0, rows.length).map((p) => (p ? box(p) : null)),
      });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows.length]);

  if (!rows.length) return null;

  const weight = (v, base, span) => base + Math.max(0, Math.min(1, v)) * span;
  const focus = active === null ? null : rows[active];
  const describe = (row) => {
    if (!row) return "Point at or tap a skill to see how it connects to the path.";
    if (row.state === "met") return `${row.skill}: you are at level ${lvl(row.have)}, which meets what ${careerPath} asks for.`;
    if (row.state === "partial") return `${row.skill}: you are at level ${lvl(row.have)}; ${careerPath} asks for level ${lvl(row.need)}.`;
    return `${row.skill}: not on your profile yet; ${careerPath} asks for level ${lvl(row.need)}.`;
  };
  const dim = (i) => active !== null && active !== i;

  return (
    <div>
      <div ref={wrap} className="relative">
        {geo && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden="true">
            {rows.map((row, i) => {
              const p = geo.pills[i];
              if (!p) return null;
              const st = STATE[row.state];
              const op = dim(i) ? 0.15 : 1;
              return (
                <g key={row.skill} style={{ opacity: op, transition: "opacity 200ms ease" }}>
                  {row.have > 0 && (
                    <path
                      d={curve(geo.you.r, geo.you.y, p.l, p.y)}
                      pathLength="1"
                      className="line-draw"
                      style={{ "--i": i }}
                      fill="none"
                      stroke={st.stroke}
                      strokeOpacity={active === i ? 0.95 : 0.6}
                      strokeWidth={weight(row.have / 5, 1, 2.2) + (active === i ? 0.8 : 0)}
                      strokeLinecap="round"
                    />
                  )}
                  <path
                    d={curve(p.r, p.y, geo.path.l, geo.path.y)}
                    {...(row.state === "met" ? { pathLength: "1", className: "line-draw" } : { className: "fade-in", strokeDasharray: "4 5" })}
                    style={{ "--i": i + 2 }}
                    fill="none"
                    stroke={row.state === "met" ? STATE.met.stroke : "#94a3b8"}
                    strokeOpacity={active === i ? 0.95 : 0.5}
                    strokeWidth={weight(row.importance, 1, 2.2) + (active === i ? 0.8 : 0)}
                    strokeLinecap="round"
                  />
                </g>
              );
            })}
          </svg>
        )}

        {/* Phones: the two ends of the map as one line, then the list. */}
        <div className="mb-3 flex items-center gap-2 text-xs sm:hidden" aria-hidden="true">
          <span className="rounded-full bg-slate-900 px-3 py-1 font-semibold text-white">You</span>
          <span className="h-px flex-1 bg-slate-300" />
          <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-900">{careerPath}</span>
        </div>

        <div className="relative grid grid-cols-1 items-center sm:grid-cols-[minmax(5rem,1fr)_minmax(0,2fr)_minmax(7.5rem,1fr)] sm:gap-x-12">
          <div className="hidden justify-start sm:flex">
            <div ref={you} className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full bg-slate-900 text-white shadow-(--cc-shadow-raised)">
              <span className="text-sm font-semibold">You</span>
            </div>
          </div>

          <ul className="space-y-2" aria-label={`Skills ${careerPath} requires`}>
            {rows.map((row, i) => {
              const st = STATE[row.state];
              return (
                <li key={row.skill} className="rise-in" style={{ "--i": i }}>
                  <button
                    type="button"
                    ref={(n) => {
                      pills.current[i] = n;
                    }}
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    onClick={() => setActive((a) => (a === i ? null : i))}
                    aria-describedby={`skillnet-${i}`}
                    className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm shadow-(--cc-shadow-rest) ${st.pill} ${
                      dim(i) ? "opacity-45" : ""
                    } ${active === i ? "shadow-(--cc-shadow-raised)" : ""}`}
                  >
                    <span className="min-w-0 font-medium leading-snug sm:truncate" title={row.skill}>{row.skill}</span>
                    <span className={`shrink-0 text-xs tabular-nums ${st.meta}`}>
                      {row.state === "met" ? `Level ${lvl(row.have)}` : `${lvl(row.have)} of ${lvl(row.need)}`}
                    </span>
                  </button>
                  <span id={`skillnet-${i}`} className="sr-only">{describe(row)}</span>
                </li>
              );
            })}
          </ul>

          <div className="hidden justify-end sm:flex">
            <div ref={path} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-center shadow-(--cc-shadow-raised)">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Target path</p>
              <p className="mt-1 text-sm font-semibold leading-snug text-slate-900 break-words">{careerPath}</p>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 min-h-[2.5rem] text-sm text-slate-600" aria-hidden="true">
        {focus ? (
          describe(focus)
        ) : (
          <>
            <span className="sm:hidden">Tap a skill to see your level and the level the path asks for.</span>
            <span className="hidden sm:inline">Point at or tap a skill to see how it connects to the path.</span>
          </>
        )}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
        {Object.entries(STATE).map(([k, s]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded border ${s.pill}`} aria-hidden="true" />
            {s.label}
          </span>
        ))}
        <span className="hidden sm:inline">Thicker lines: higher level, or more weight in the path.</span>
        {hidden > 0 && <span>{hidden} more required skills not shown.</span>}
      </div>
    </div>
  );
}
