import { useEffect, useState } from "react";
import { prefersReducedMotion } from "./motion";

/**
 * Keeps an overlay (dialog, menu, drawer) mounted for a moment after it is
 * closed, so it can animate out instead of vanishing.
 *
 *   const { render, closing } = usePresence(open);
 *   {render && <div data-closing={closing ? "" : undefined} inert={closing}>…}
 *
 * The CSS for [data-closing] runs the exit animation. While closing, the
 * element is inert (no clicks or focus). With reduced motion it unmounts
 * at once.
 */
export default function usePresence(open, ms = 180) {
  const [shown, setShown] = useState(open);
  // Opening is immediate (adjusted during render, React's pattern for state
  // that follows a prop).
  if (open && !shown) setShown(true);
  const closing = !open && shown;
  useEffect(() => {
    if (!closing) return undefined;
    const id = setTimeout(() => setShown(false), prefersReducedMotion() ? 0 : ms);
    return () => clearTimeout(id);
  }, [closing, ms]);
  return { render: shown, closing };
}
