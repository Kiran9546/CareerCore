import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import Icon from "./ui/Icon";
import usePresence from "../motion/usePresence";
import Logo from "./ui/Logo";
import ThemeToggle from "./ui/ThemeToggle";
import ScrollProgress from "./ui/ScrollProgress";
import { LEGAL_LINKS, SITE } from "../config/site";
import { useAuth } from "../context/useAuth";
import { workspacePath } from "../config/roles";

/**
 * Header for the public pages. `sections` adds in-page links ({ href, label });
 * `progress` shows a reading-progress bar for long pages. A signed-in visitor
 * gets a link back to their workspace instead of the sign-in buttons.
 *
 * From lg up everything sits in the bar. Below that the bar keeps the logo,
 * theme toggle and the main call to action, and a menu button opens a panel
 * with the section links, Contact and the account links.
 */
export function PublicHeader({ sections = [], progress = false }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const panel = usePresence(open, 160);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    const wide = window.matchMedia("(min-width: 1024px)");
    const onWide = (e) => e.matches && setOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  const close = () => setOpen(false);
  const menuLink = "block rounded-lg px-3 py-3 text-base font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900";

  return (
    <header ref={ref} className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" aria-label="CareerCore home" className="shrink-0">
          <Logo />
        </Link>
        {sections.length > 0 && (
          <nav aria-label="Sections" className="hidden items-center gap-8 text-sm text-slate-600 lg:flex">
            {sections.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-slate-900">
                {l.label}
              </a>
            ))}
          </nav>
        )}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <NavLink
            to="/contact"
            className={({ isActive }) =>
              `hidden whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100 lg:inline-block ${isActive ? "text-slate-900" : "text-slate-600"}`
            }
          >
            Contact
          </NavLink>
          <ThemeToggle />
          {user ? (
            <Link
              to={workspacePath(user.role)}
              className="whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 sm:px-3.5"
            >
              <span className="sm:hidden">Workspace</span>
              <span className="hidden sm:inline">Open workspace</span>
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
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="public-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="-mr-2 rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            <Icon name={open ? "x" : "menu"} className="h-6 w-6" />
          </button>
        </div>
      </div>

      {panel.render && (
        <div
          id="public-menu"
          data-closing={panel.closing ? "" : undefined}
          inert={panel.closing}
          className="dropdown-in absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-slate-200 bg-white shadow-(--cc-shadow-raised) lg:hidden"
        >
          <nav aria-label="Menu" className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
            {sections.length > 0 && (
              <ul className="border-b border-slate-100 pb-2">
                {sections.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} onClick={close} className={menuLink}>
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <ul className="pt-2">
              <li>
                <Link to="/contact" onClick={close} className={menuLink}>
                  Contact
                </Link>
              </li>
              {user ? (
                <li>
                  <Link to={workspacePath(user.role)} onClick={close} className={menuLink}>
                    Open workspace
                  </Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link to="/login" onClick={close} className={menuLink}>
                      Sign in
                    </Link>
                  </li>
                  <li className="px-3 pb-2 pt-2">
                    <Link
                      to="/register"
                      onClick={close}
                      className="block rounded-lg bg-indigo-600 px-4 py-3 text-center text-base font-semibold text-white shadow-sm hover:bg-indigo-500"
                    >
                      Create account
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </nav>
        </div>
      )}
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
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
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
