import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./motion";

/** Digits after the decimal point in the value as it would normally be shown. */
const placesOf = (raw) => {
  const s = String(raw);
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
};

/** A finite number, from a number or a plain numeric string; otherwise null. */
const asNumber = (raw) => {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && /^-?\d+(\.\d+)?$/.test(raw.trim())) return Number(raw);
  return null;
};

/**
 * Shows a real statistic, counting up to it when it first appears or when it
 * changes (a filter, say). The animation only ever moves towards the value
 * the API returned, and finishes on exactly the text the page showed before
 * (same number of decimals, same suffix).
 *
 * Anything that is not a number ("–" for no data, say) is shown as-is.
 * With reduced motion the final value is shown straight away.
 */
export default function AnimatedNumber({ value, prefix = "", suffix = "", duration = 700, className = "" }) {
  const reduce = useReducedMotion();
  const target = asNumber(value);
  const places = target === null ? 0 : placesOf(value);
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (target === null || reduce) return undefined;
    let raf = 0;
    const start = performance.now();
    const a = from.current;
    const tick = (now) => {
      // A frame's timestamp can be a little earlier than `start`; clamp so
      // the count never dips below where it began.
      const k = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - (1 - k) ** 3;
      const v = k === 1 ? target : a + (target - a) * eased;
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduce, duration]);

  if (target === null) return <span className={className}>{value ?? "–"}</span>;
  const v = reduce ? target : shown;
  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}
      {v === target ? String(value).trim() : v.toFixed(places)}
      {suffix}
    </span>
  );
}
