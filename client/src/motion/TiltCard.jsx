import { useEffect, useRef } from "react";
import { lowEffects } from "./motion";

/**
 * A card with a little physical depth: it lifts on hover and leans a few
 * degrees towards the pointer, then settles back when the pointer leaves.
 *
 * - Mouse and trackpad only. Touch, pen and keyboard users see the card as
 *   usual; interactive cards still get press feedback from the global
 *   button styles.
 * - Off with reduced motion and on low-power devices (see motion.js).
 * - The tilt is written straight to CSS variables on the element, so moving
 *   the pointer never re-renders React. The transform itself is in
 *   index.css (.card-3d).
 *
 * `max` is the largest lean in degrees; keep it small so text stays crisp.
 */
export default function TiltCard({ as: Tag = "div", className = "", max = 4, children, ...rest }) {
  const ref = useRef(null);
  const rect = useRef(null);
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const enter = (e) => {
    if (e.pointerType !== "mouse" || lowEffects() || !ref.current) return;
    // Measured once at rest: measuring while tilted would feed the tilt back
    // into itself.
    rect.current = ref.current.getBoundingClientRect();
  };

  const move = (e) => {
    const el = ref.current;
    const r = rect.current;
    if (!el || !r || e.pointerType !== "mouse") return;
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty("--rx", `${((0.5 - py) * max).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${((px - 0.5) * max).toFixed(2)}deg`);
      if (el.dataset.tilt !== "on") el.dataset.tilt = "on";
    });
  };

  const leave = () => {
    const el = ref.current;
    rect.current = null;
    cancelAnimationFrame(frame.current);
    if (!el) return;
    for (const p of ["--rx", "--ry"]) el.style.removeProperty(p);
    delete el.dataset.tilt;
  };

  return (
    <Tag
      ref={ref}
      className={`card-3d ${className}`}
      onPointerEnter={enter}
      onPointerMove={move}
      onPointerLeave={leave}
      {...rest}
    >
      {children}
    </Tag>
  );
}
