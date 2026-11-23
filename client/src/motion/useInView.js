import { useEffect, useState } from "react";
import { prefersReducedMotion } from "./motion";

/**
 * Tracks whether an element is on screen, with one IntersectionObserver.
 *
 * - `once`: stop watching after the first time it appears (entrances).
 * - Otherwise it keeps reporting, for things that pause off screen.
 *
 * Returns null until the first observation, so callers can tell "not yet
 * known" (render as in the static HTML) from "off screen".
 */
export default function useInView(ref, { once = false, rootMargin = "0px", threshold = 0 } = {}) {
  const [inView, setInView] = useState(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        setInView(e.isIntersecting);
        if (once && e.isIntersecting) io.disconnect();
      },
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, rootMargin, threshold]);
  return inView;
}

/**
 * For one-time entrances: "false" while waiting below the fold, "true" once
 * seen, undefined when the element was already visible at load or motion is
 * reduced (so nothing is ever hidden that was on screen).
 */
export function useEntrance(ref, options) {
  const [state, setState] = useState(undefined);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return undefined;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) return undefined;
    // Below the fold: hold it back until it scrolls in.
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setState("true");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", ...options },
    );
    io.observe(el);
    // Hold it back on the next frame (it is below the fold, so unseen); if it
    // has already appeared by then, it stays shown.
    const raf = requestAnimationFrame(() => setState((s) => s ?? "false"));
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
    // Options are literal objects at call sites; observe once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
  return state;
}
