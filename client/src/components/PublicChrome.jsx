import { Link, NavLink } from "react-router-dom";
import Logo from "./ui/Logo";
import ThemeToggle from "./ui/ThemeToggle";
import ScrollProgress from "./ui/ScrollProgress";
import { LEGAL_LINKS, SITE } from "../config/site";
import { useAuth } from "../context/useAuth";
import { workspacePath } from "../config/roles";

/**
 * Header for the public pages. `nav` adds in-page links; `progress` shows a
 * reading-progress bar for long pages. A signed-in visitor gets a link back
 * to their workspace instead of the sign-in buttons.
 */
export function PublicHeader({ nav = null, progress = false }) {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" aria-label="CareerCore home" className="shrink-0">
          <Logo />
        </Link>
        {nav}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <NavLink
            to="/contact"
            className={({ isActive }) =>
              `hidden whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100 sm:inline-block ${isActive ? "text-slate-900" : "text-slate-600"}`
            }
          >
            Contact
          </NavLink>
          <ThemeToggle />
          {user ? (
            <Link
              to={workspacePath(user.role)}
              className="whitespace-nowrap rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Open workspace
            </Link>
          ) : (
            <>
              <Link to="/login" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                Sign in
              </Link>
              <Link
                to="/register"
                className="hidden whitespace-nowrap rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 sm:inline-block"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
      {progress && <ScrollProgress />}
    </header>
  );
}

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      // Plain anchors: from another page they load the landing page at that
      // section; on the landing page they scroll to it.
      { href: "/#workspaces", label: "Who it is for" },
      { href: "/#features", label: "Features" },
      { href: "/#how", label: "How a drive runs" },
    ],
  },
  {
    title: "Account",
    links: [
      { to: "/login", label: "Sign in" },
      { to: "/register", label: "Create an account" },
    ],
  },
  {
    title: "Help and legal",
    links: [{ to: "/contact", label: "Contact" }, ...LEGAL_LINKS],
  },
];

const footerLink = "text-slate-600 hover:text-slate-900 hover:underline underline-offset-4";

/** Footer shared by the public pages. */
export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <div className="max-w-xs">
            <Link to="/" aria-label="CareerCore home" className="inline-block">
              <Logo />
            </Link>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Campus placement management for students, faculty, placement officers and administrators.
            </p>
            {SITE.operator && <p className="mt-2 text-sm text-slate-500">Operated by {SITE.operator}.</p>}
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-labelledby={`footer-${col.title.replace(/W+/g, "-").toLowerCase()}`}>
              <h2 id={`footer-${col.title.replace(/W+/g, "-").toLowerCase()}`} className="text-sm font-semibold text-slate-900">
                {col.title}
              </h2>
              <ul className="mt-4 space-y-3 text-sm">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.href ? (
                      <a href={l.href} className={footerLink}>{l.label}</a>
                    ) : (
                      <Link to={l.to} className={footerLink}>{l.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 border-t border-slate-200 pt-6 text-sm text-slate-500">
          <p>© {new Date().getFullYear()} CareerCore{SITE.operator ? `, ${SITE.operator}` : ""}</p>
        </div>
      </div>
    </footer>
  );
}
