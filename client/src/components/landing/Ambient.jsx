import { useRef } from "react";
import useInView from "../../motion/useInView";

/**
 * A faint field of connected nodes behind a section's content: two groups
 * drifting a few pixels in opposite directions over half a minute, which
 * reads as depth rather than motion.
 *
 * Transforms only (no layout or paint work per frame), paused whenever the
 * section is off screen, fewer nodes on phones, and still with reduced
 * motion or on low-power devices. Decorative: hidden from assistive tech and
 * from pointer events, and kept to low contrast so text stays readable.
 *
 * tone: "light" for pale sections, "dark" for the dark band.
 */
const NODES_A = [
  [6, 18], [14, 62], [22, 30], [31, 80], [44, 12], [58, 70], [70, 22], [83, 58], [93, 30],
];
const NODES_B = [
  [10, 42], [26, 8], [38, 52], [51, 88], [64, 40], [77, 84], [88, 10], [96, 72],
];
// Join each node to its nearest neighbours within the same group.
const edges = (nodes) => {
  const out = [];
  nodes.forEach((a, i) => {
    nodes
      .map((b, j) => ({ j, d: Math.hypot(a[0] - b[0], (a[1] - b[1]) * 0.6) }))
      .filter((x) => x.j > i)
      .sort((x, y) => x.d - y.d)
      .slice(0, 2)
      .forEach(({ j }) => out.push([a, nodes[j]]));
  });
  return out;
};
const EDGES_A = edges(NODES_A);
const EDGES_B = edges(NODES_B);

/** One drifting group: lines in SVG, round dots in HTML (an SVG circle would stretch). */
function Group({ nodes, lines, className }) {
  return (
    <div className={`absolute inset-0 ${className}`}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {lines.map(([p, q], i) => (
          <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.55" />
        ))}
      </svg>
      {nodes.map(([x, y], i) => (
        <span
          key={i}
          className={`absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ${i % 2 ? "max-sm:hidden" : ""}`}
          style={{ left: `${x}%`, top: `${y}%` }}
        />
      ))}
    </div>
  );
}

export default function Ambient({ tone = "light" }) {
  const ref = useRef(null);
  const running = useInView(ref);
  return (
    <div
      ref={ref}
      className={`ambient pointer-events-none absolute inset-0 overflow-hidden ${tone === "dark" ? "text-white/[0.07]" : "text-slate-300/60"}`}
      data-run={running ? "" : undefined}
      aria-hidden="true"
    >
      <Group nodes={NODES_A} lines={EDGES_A} className="ambient-a" />
      <Group nodes={NODES_B} lines={EDGES_B} className="ambient-b max-sm:hidden" />
    </div>
  );
}
