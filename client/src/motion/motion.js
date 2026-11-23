import { useSyncExternalStore } from "react";

/**
 * Motion preferences, in one place.
 *
 * - Reduced motion follows the operating-system setting
 *   (prefers-reduced-motion), live.
 * - Low-power devices get the same treatment for the effects that run
 *   continuously or track the pointer. index.html marks them early with the
 *   class `cc-lowfx` on <html>: Data Saver on, or at most two CPU cores or
 *   2 GB of memory where the browser reports it.
 */

const REDUCE = "(prefers-reduced-motion: reduce)";
const FINE = "(hover: hover) and (pointer: fine)";

const media = (q) => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(q) : null);

export const prefersReducedMotion = () => !!media(REDUCE)?.matches;

const subscribeReduce = (cb) => {
  const m = media(REDUCE);
  if (!m) return () => {};
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/**
 * True when animations should be skipped. During the build-time render it is
 * true, so pre-rendered HTML always shows the finished state.
 */
export const useReducedMotion = () => useSyncExternalStore(subscribeReduce, prefersReducedMotion, () => true);

/** Pointer-tracking and looping effects are off: reduced motion or a low-power device. */
export const lowEffects = () =>
  prefersReducedMotion() || (typeof document !== "undefined" && document.documentElement.classList.contains("cc-lowfx"));

/** A mouse or trackpad that can hover; touch screens get no pointer-tracking effects. */
export const finePointer = () => !!media(FINE)?.matches;

/** Whether this browser can create a WebGL context (checked once, then released). */
let webgl = null;
export const webglAvailable = () => {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl");
    webgl = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
};

/** Run when the browser is idle (or after a short delay where that is not supported). */
export const whenIdle = (fn, timeout = 1500) => {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 600);
  return () => clearTimeout(id);
};

const subscribeMedia = (query) => (cb) => {
  const m = media(query);
  if (!m) return () => {};
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const mediaCache = new Map();
/**
 * Whether a media query matches, live. Null during the build-time render and
 * hydration, so decorative parts that depend on screen size can mount right
 * after hydration, only in the variant the screen needs.
 */
export const useMedia = (query) => {
  if (!mediaCache.has(query)) mediaCache.set(query, subscribeMedia(query));
  return useSyncExternalStore(mediaCache.get(query), () => !!media(query)?.matches, () => null);
};
