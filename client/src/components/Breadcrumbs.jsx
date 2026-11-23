import { Link } from "react-router-dom";
import { pageFor } from "../seo/meta";

/**
 * Visible breadcrumb trail for a public page. It reads the same trail as the
 * page's BreadcrumbList structured data (src/seo/meta.js), so the two match.
 */
export default function Breadcrumbs({ path, className = "" }) {
  const page = pageFor(path);
  if (!page?.crumbs.length) return null;
  const trail = [{ name: "Home", path: "/" }, ...page.crumbs];
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
        {trail.map((c, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={c.path} className="flex items-center gap-1.5">
              {last ? (
                <span aria-current="page" className="text-slate-700">{c.name}</span>
              ) : (
                <>
                  <Link to={c.path} className="hover:text-slate-900 hover:underline underline-offset-4">{c.name}</Link>
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
