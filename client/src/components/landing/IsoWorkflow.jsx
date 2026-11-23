import { useRef } from "react";
import { useEntrance } from "../../motion/useInView";

/**
 * The four steps of a drive as an isometric illustration, for the dark
 * "How a drive runs" band: platforms rising left to right, each carrying a
 * simple object for its step, joined by a path that draws itself once the
 * band scrolls into view. Numbers match the step cards below it.
 *
 * Built from a true isometric projection (30 degrees) in plain SVG; no
 * looping motion. Decorative: the step cards carry the words.
 */
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
const S = 46; // pixels per unit

const iso = (x, y, z) => [(x - y) * COS * S, (x + y) * SIN * S - z * S];
const pts = (list) => list.map((p) => iso(...p).map((v) => v.toFixed(1)).join(",")).join(" ");

/** A box from (x,y,z) of size (w,d,h): top, left and right faces. */
function Box({ x, y, z = 0, w, d, h, top, left, right, stroke = "rgb(255 255 255 / 0.14)" }) {
  const t = z + h;
  return (
    <g stroke={stroke} strokeWidth="1" strokeLinejoin="round">
      <polygon points={pts([[x, y + d, t], [x + w, y + d, t], [x + w, y + d, z], [x, y + d, z]])} fill={left} />
      <polygon points={pts([[x + w, y, t], [x + w, y + d, t], [x + w, y + d, z], [x + w, y, z]])} fill={right} />
      <polygon points={pts([[x, y, t], [x + w, y, t], [x + w, y + d, t], [x, y + d, t]])} fill={top} />
    </g>
  );
}

const PLATFORM = { top: "rgb(255 255 255 / 0.10)", left: "rgb(255 255 255 / 0.03)", right: "rgb(255 255 255 / 0.06)" };
const ACCENT = { top: "#818cf8", left: "#4338ca", right: "#4f46e5" };
const DONE = { top: "#34d399", left: "#047857", right: "#059669" };

// Platform positions along the diagonal, rising with each step.
const STEPS = [
  { x: 0, h: 0.25 },
  { x: 2.1, h: 0.55 },
  { x: 4.2, h: 0.85 },
  { x: 6.3, h: 1.15 },
];
const SIZE = 1.5;

export default function IsoWorkflow() {
  const ref = useRef(null);
  const state = useEntrance(ref);
  const centre = (s) => iso(s.x + SIZE / 2, SIZE / 2, s.h);
  const path = STEPS.map((s, i) => {
    const [x, y] = centre(s);
    return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  // Fit the viewBox around every corner.
  const corners = STEPS.flatMap((s) => [iso(s.x, 0, s.h + 1.2), iso(s.x + SIZE, 0, 0), iso(s.x, SIZE, 0), iso(s.x + SIZE, SIZE, 0)]);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const pad = 24;
  const vb = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2];

  return (
    <div ref={ref} data-in={state} className="w-full" aria-hidden="true">
      <svg viewBox={vb.map((v) => v.toFixed(1)).join(" ")} className="h-auto w-full">
        {/* The route between steps, under the platforms. */}
        <path d={path} pathLength="1" className="line-draw" style={{ "--i": 3 }} fill="none" stroke="#a5b4fc" strokeWidth="2" strokeDasharray="1" strokeLinecap="round" />
        {STEPS.map((s, i) => {
          const [lx, ly] = iso(s.x + SIZE / 2, SIZE + 0.35, 0);
          return (
            <g key={i} className="iso-rise" style={{ "--i": i }}>
              <Box x={s.x} y={0} w={SIZE} d={SIZE} h={s.h} {...PLATFORM} />
              {i === 0 && <Box x={s.x + 0.5} y={0.65} z={s.h} w={0.5} d={0.12} h={0.75} top="#e0e7ff" left="#a5b4fc" right="#c7d2fe" />}
              {i === 1 &&
                [0.25, 0.65, 1.05].map((o) => (
                  <Box key={o} x={s.x + o} y={0.6} z={s.h} w={0.26} d={0.26} h={0.4} {...ACCENT} />
                ))}
              {i === 2 &&
                [0, 1, 2].map((k) => (
                  <Box key={k} x={s.x + 0.3 + k * 0.1} y={0.3 + k * 0.1} z={s.h + k * 0.16} w={0.9 - k * 0.2} d={0.9 - k * 0.2} h={0.12} {...ACCENT} />
                ))}
              {i === 3 && <Box x={s.x + 0.45} y={0.45} z={s.h} w={0.6} d={0.6} h={0.45} {...DONE} />}
              <text x={lx} y={ly + 6} textAnchor="middle" className="fill-indigo-300 font-mono text-[13px]">
                {String(i + 1).padStart(2, "0")}
              </text>
            </g>
          );
        })}
        {(() => {
          const [x, y] = centre(STEPS[3]);
          return <path d={`M${x - 7},${y - 30} l5,5 l10,-11`} transform="translate(0,-4)" fill="none" stroke="#ecfdf5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" className="line-draw" style={{ "--i": 14 }} />;
        })()}
      </svg>
    </div>
  );
}
