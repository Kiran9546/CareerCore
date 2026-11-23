import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { APP_SHELL, NOT_FOUND, forSearch, headTags, isAppPath, normalizeSiteUrl, pageFor, parseNoindex } from "./meta";

const NOINDEX_ALL = parseNoindex(import.meta.env.VITE_SITE_NOINDEX);
let SITE_URL = "";
try {
  SITE_URL = normalizeSiteUrl(import.meta.env.VITE_SITE_URL);
} catch (e) {
  console.error(e.message);
}

/** Replace every data-seo tag in <head> with this set. */
const apply = (tags) => {
  document.head.querySelectorAll("[data-seo]").forEach((el) => el.remove());
  for (const t of tags) {
    const el = document.createElement(t.tag);
    for (const [k, v] of Object.entries(t.attrs)) el.setAttribute(k, v);
    if (t.text) el.textContent = t.text;
    el.setAttribute("data-seo", "");
    document.head.appendChild(el);
  }
};

/**
 * Keeps <title> and the managed <head> tags in step as the visitor moves
 * between pages without a reload. The first page arrives with its tags
 * already written by the build (scripts/prerender.mjs); this produces the
 * same set from the same source, src/seo/meta.js.
 *
 * Workspace pages set their own <title> (AppShell) and are marked noindex.
 */
export default function SeoManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (isAppPath(pathname)) {
      apply([
        { tag: "meta", attrs: { name: "description", content: APP_SHELL.description } },
        { tag: "meta", attrs: { name: "robots", content: APP_SHELL.robots } },
      ]);
      return;
    }
    const page = forSearch(pageFor(pathname) || NOT_FOUND, NOINDEX_ALL);
    document.title = page.title;
    apply(headTags(page, SITE_URL));
  }, [pathname]);

  return null;
}
