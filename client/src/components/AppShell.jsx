import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { ROLE_META, WORKSPACES_FOR, roleLabel } from "../config/roles";
import NotificationBell from "./NotificationBell";
import Icon from "./ui/Icon";
import Logo from "./ui/Logo";
import ThemeToggle from "./ui/ThemeToggle";
import SearchDialog from "./SearchDialog";
import { PageSkeleton } from "./ui/Skeleton";
import usePresence from "../motion/usePresence";
import ActivityBar from "./ui/ActivityBar";

/**
 * The page area. Marked as entering for its first moment, so the page's
 * sections arrive one after another (index.css); anything that appears after
 * that (a tab, a form, loaded data) rises in at once, without a delay.
 */
function PageEnter({ children }) {
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 700);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="page-enter" data-entering={entering ? "" : undefined}>
      {children}
    </div>
  );
}

const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("") || "?";

/** The section the current URL belongs to, for the page title. */
const activeItem = (nav, pathname) =>
  [...nav]
    .sort((a, b) => b.to.length - a.to.length)
    .find((n) => (n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`)));

function SidebarNav({ workspace, onNavigate }) {
  const meta = ROLE_META[workspace];
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label={`${meta.label} navigation`}>
      <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {meta.label} workspace
      </p>
      <ul className="space-y-0.5">
        {meta.nav.map((n) => (
          <li key={n.to}>
            <NavLink
              to={n.to}
              end={n.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `nav-link group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-white/10 text-white font-medium"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    name={n.icon}
                    className={`nav-icon w-[18px] h-[18px] ${isActive ? "text-indigo-300" : "text-slate-500 group-hover:text-slate-300"}`}
                  />
                  {n.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function WorkspaceSwitcher({ role, workspace, onNavigate }) {
  const spaces = WORKSPACES_FOR[role] || [];
  if (spaces.length < 2) return null;
  return (
    <div className="px-3 pb-3">
      <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        Switch workspace
      </p>
      <div className="space-y-0.5">
        {spaces
          .filter((s) => s !== workspace)
          .map((s) => (
            <Link
              key={s}
              to={ROLE_META[s].path}
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-100"
            >
              <Icon name="swap" className="w-[18px] h-[18px] text-slate-500" />
              {ROLE_META[s].label}
            </Link>
          ))}
      </div>
    </div>
  );
}

function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const meta = ROLE_META[user.role];

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const menu = usePresence(open, 140);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100 transition-colors"
      >
        <span className="w-8 h-8 rounded-full bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center">
          {initials(user.name)}
        </span>
        <span className="hidden md:block text-left leading-tight">
          <span className="block text-sm font-medium text-slate-900 max-w-[10rem] truncate">{user.name}</span>
          <span className="block text-xs text-slate-500">{roleLabel(user.role)}</span>
        </span>
        <Icon name="chevronDown" className="w-4 h-4 text-slate-400 hidden md:block" />
      </button>

      {menu.render && (
        <div
          role="menu"
          data-closing={menu.closing ? "" : undefined}
          inert={menu.closing}
          className="dropdown-in absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white shadow-(--cc-shadow-raised) z-50 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
            <span className={`mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${meta?.badge}`}>
              {roleLabel(user.role)}
              {user.department ? ` · ${user.department}` : ""}
            </span>
          </div>
          <Link
            role="menuitem"
            to="/contact"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Icon name="mail" className="w-4 h-4 text-slate-400" />
            Help and contact
          </Link>
          <button
            role="menuitem"
            onClick={onSignOut}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Icon name="logout" className="w-4 h-4 text-slate-400" />
            Sign out of this tab
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The frame around every signed-in page: a sidebar with the workspace's
 * sections, a top bar with the page title, notifications and the account
 * menu, and the page itself. One shell for every user category; the
 * category only changes which sections it lists.
 */
export default function AppShell({ workspace }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);
  const drawerPresence = usePresence(drawer, 200);
  const meta = ROLE_META[workspace];
  const current = activeItem(meta.nav, pathname);

  useEffect(() => {
    document.title = `${current?.label ?? meta.label} · CareerCore`;
  }, [current, meta.label]);

  // While the mobile drawer is open the page behind it stays put, Escape
  // closes it, and so does growing the window past the drawer breakpoint
  // (rotating a tablet), where the fixed sidebar takes over.
  useEffect(() => {
    if (!drawer) return;
    const root = document.documentElement;
    root.classList.add("cc-scroll-lock");
    const esc = (e) => e.key === "Escape" && setDrawer(false);
    const wide = window.matchMedia("(min-width: 1024px)");
    const onWide = (e) => e.matches && setDrawer(false);
    document.addEventListener("keydown", esc);
    wide.addEventListener("change", onWide);
    return () => {
      root.classList.remove("cc-scroll-lock");
      document.removeEventListener("keydown", esc);
      wide.removeEventListener("change", onWide);
    };
  }, [drawer]);

  const signOut = () => {
    logout();
    navigate("/login");
  };

  const sidebar = (onNavigate) => (
    <div className="keep-palette flex h-full flex-col bg-slate-950">
      <div className="h-16 flex items-center px-6 border-b border-white/5">
        <Link to={meta.path} onClick={onNavigate} aria-label="CareerCore home">
          <Logo tone="light" />
        </Link>
      </div>
      <SidebarNav workspace={workspace} onNavigate={onNavigate} />
      <WorkspaceSwitcher role={user?.role} workspace={workspace} onNavigate={onNavigate} />
      <div className="px-6 py-4 border-t border-white/5 text-[11px] text-slate-500">
        <p>© {new Date().getFullYear()} CareerCore</p>
        <nav aria-label="Help and legal" className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          <Link to="/contact" onClick={onNavigate} className="hover:text-slate-300">Contact</Link>
          <Link to="/privacy" onClick={onNavigate} className="hover:text-slate-300">Privacy</Link>
          <Link to="/terms" onClick={onNavigate} className="hover:text-slate-300">Terms</Link>
        </nav>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="shell-side hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">{sidebar()}</aside>

      {/* Mobile drawer */}
      {drawerPresence.render && (
        <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" inert={drawerPresence.closing}>
          <div className="modal-backdrop fixed inset-0 bg-slate-900/60" data-closing={drawerPresence.closing ? "" : undefined} onClick={() => setDrawer(false)} />
          <div className="drawer-in relative w-72 max-w-[calc(100%-3.5rem)]" data-closing={drawerPresence.closing ? "" : undefined}>
            {sidebar(() => setDrawer(false))}
            <button
              onClick={() => setDrawer(false)}
              className="absolute top-3 -right-12 rounded-full p-2 text-white"
              aria-label="Close menu"
            >
              <Icon name="x" className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="shell-top sticky top-0 z-30 h-16 bg-white/85 backdrop-blur border-b border-slate-200">
          {/* Shows while the page waits on the server. */}
          <ActivityBar />
          <div className="h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1.5 sm:gap-3">
            <button
              onClick={() => setDrawer(true)}
              className="lg:hidden -ml-2 rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              aria-label="Open menu"
              aria-expanded={drawer}
            >
              <Icon name="menu" className="w-6 h-6" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 leading-none mb-1">
                {meta.label}
                {workspace === "faculty" && user?.department ? ` · ${user.department}` : ""}
              </p>
              <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate leading-tight">
                {current?.label ?? meta.label}
              </h1>
            </div>
            <SearchDialog user={user} />
            <ThemeToggle />
            <NotificationBell />
            {user && <UserMenu user={user} onSignOut={signOut} />}
          </div>
        </header>

        <main id="main" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {/* Only the page area waits while a page's code loads; the sidebar
              and header stay put. */}
          <Suspense
            fallback={
              <>
                <div className="fixed inset-x-0 top-0 z-[60] h-0.5">
                  <ActivityBar always />
                </div>
                <PageSkeleton label="Loading page" />
              </>
            }
          >
            {/* Keyed by path so each page settles in when you navigate. Every
                workspace route is its own page (no nested routes), so this
                remounts nothing that would not remount anyway. */}
            <PageEnter key={pathname}>
              <Outlet />
            </PageEnter>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
