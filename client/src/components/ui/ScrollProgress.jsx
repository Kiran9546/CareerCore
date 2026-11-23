import { useEffect, useRef } from "react";

/**
 * A thin bar along the bottom edge of the sticky header showing how far the
 * page has been read. It writes a transform directly (no React re-render per
 * scroll event) and only once per animation frame.
 */
export default function ScrollProgress() {
  const bar = useRef(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0;
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5" aria-hidden="true">
      <div ref={bar} className="h-full origin-left bg-indigo-600" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}
