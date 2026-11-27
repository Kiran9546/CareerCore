import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Scroll positions by history entry, so Back returns to where you were. Kept
 * in sessionStorage (per tab) so they survive a reload of the page.
 */
const STORE = "cc_scroll";
const positions = (() => {
  try {
    return new Map(JSON.parse(sessionStorage.getItem(STORE) || "[]"));
  } catch {
    return new Map();
  }
})();
const remember = (key, y) => {
  positions.delete(key);
  positions.set(key, Math.round(y));
  while (positions.size > 50) positions.delete(positions.keys().next().value);
  try {
    sessionStorage.setItem(STORE, JSON.stringify([...positions]));
  } catch {
    // Storage full or blocked: Back simply starts at the top.
  }
};
const MAX_WAIT_MS = 2500;

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Page scrolling for a single-page app, where the browser cannot do it:
 *
 * - Opening a page starts at its top (otherwise a long list scrolled to the
 *   bottom on a phone opens the next page half-way down).
 * - A link to /page#section scrolls to that section once it has rendered.
 *   Pages load their data after they open, so it waits for the element.
 * - Back and Forward return to the position the page was left at, once the
 *   page is tall enough to get there again.
 * - Changing only the query string (a tab, a filter) never moves the page.
 */
export default function ScrollManager() {
  const { pathname, hash, key } = useLocation();
  const nav = useNavigationType();

  // Remember where each history entry was left (every entry, including a tab
  // or filter change), for Back/Forward. The position is followed from scroll
  // events: by the time the entry changes, the next page has replaced the
  // DOM and the browser may already have clamped scrollY to its height.
  useEffect(() => {
    let y = window.scrollY;
    const onScroll = () => {
      y = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      remember(key, y);
    };
  }, [key]);

  useEffect(() => {
    let frame = 0;
    let stopped = false;
    const started = performance.now();
    const instant = { behavior: "instant" };

    // Retry each frame until `attempt` reports success or time runs out.
    const until = (attempt) => {
      const step = () => {
        if (stopped || attempt() || performance.now() - started > MAX_WAIT_MS) return;
        frame = requestAnimationFrame(step);
      };
      step();
    };

    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      until(() => {
        const el = document.getElementById(id);
        if (!el) return false;
        el.scrollIntoView({ block: "start", behavior: reduceMotion() ? "instant" : "smooth" });
        return true;
      });
    } else if (nav === "POP") {
      // Back/Forward. Without a saved position (the first page of a visit),
      // leave it to the browser's own restoration.
      if (positions.has(key)) {
        const y = positions.get(key);
        until(() => {
          const reachable = document.documentElement.scrollHeight - window.innerHeight >= y - 2;
          if (reachable) window.scrollTo({ top: y, ...instant });
          return reachable;
        });
      }
    } else {
      window.scrollTo({ top: 0, ...instant });
    }

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
    // Query-string changes (tabs, filters) keep `pathname` and `hash`, and must not scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, hash]);

  return null;
}
