import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { ROLE_META, WORKSPACES_FOR } from "../config/roles";
import { HELP_INDEX } from "../config/helpIndex";
import Icon from "./ui/Icon";
import usePresence from "../motion/usePresence";

const STAFF_SEARCH = ["placement_officer", "admin", "faculty"];

const matches = (q, ...fields) => {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = fields.filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

/** Where a student result opens, for the workspace the user can reach. */
const studentLink = (role, s) =>
  role === "faculty" ? `/faculty/students?q=${encodeURIComponent(s.usn)}` : `/placement-officer/students/${s._id}`;

/**
 * Search across the signed-in user's workspace: its pages, the records the
 * user may see (students and drives for staff, the student's own drives),
 * and the help pages. Opens with the header button or Ctrl+K / Cmd+K.
 */
export default function SearchDialog({ user }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const presence = usePresence(open, 160);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  // Results are tagged with the query they answer, so a stale response is
  // never shown and "loading" is simply "the latest answer is for another query".
  const [remote, setRemote] = useState({ term: "", students: [], drives: [], failed: false });
  const [myDrives, setMyDrives] = useState(null);
  const [drivesFailed, setDrivesFailed] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const role = user?.role;

  const openSearch = useCallback(() => {
    setQ("");
    setActive(0);
    setOpen(true);
  }, []);

  // Keyboard shortcut, available on every signed-in page.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = "";
    };
  }, [open]);

  // A student's drives are few and already scoped: load them once, filter here.
  useEffect(() => {
    if (!open || role !== "student" || myDrives) return;
    api
      .get("/student/drives")
      .then((r) => setMyDrives(r.data.drives || []))
      .catch(() => {
        setMyDrives([]);
        setDrivesFailed(true);
      });
  }, [open, role, myDrives]);

  // Staff records come from the server, debounced while typing.
  const staff = STAFF_SEARCH.includes(role);
  const term = q.trim();
  const wantRemote = open && staff && term.length >= 2;
  useEffect(() => {
    if (!wantRemote) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .get("/search", { params: { q: term }, background: true })
        .then((r) => !cancelled && setRemote({ term, ...r.data, failed: false }))
        .catch(() => !cancelled && setRemote({ term, students: [], drives: [], failed: true }));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term, wantRemote]);
  const current = useMemo(
    () => (wantRemote && remote.term === term ? remote : { students: [], drives: [], failed: false }),
    [wantRemote, remote, term],
  );
  const loading = wantRemote && remote.term !== term;
  const failed = drivesFailed || current.failed;

  const groups = useMemo(() => {
    const spaces = WORKSPACES_FOR[role] || [];
    const pages = spaces.flatMap((ws) =>
      ROLE_META[ws].nav.map((n) => ({
        key: `page:${n.to}`,
        to: n.to,
        icon: n.icon,
        title: n.label,
        meta: `${ROLE_META[ws].label} workspace`,
      })),
    );
    if (!term) return [{ label: "Go to", items: pages.slice(0, 8) }];

    const out = [];
    const pageHits = pages.filter((p) => matches(term, p.title, p.meta));
    if (pageHits.length) out.push({ label: "Pages", items: pageHits.slice(0, 6) });

    if (role === "student") {
      const hits = (myDrives || []).filter((d) => matches(term, d.companyName, d.role, d.location));
      if (hits.length)
        out.push({
          label: "Your drives",
          items: hits.slice(0, 6).map((d) => ({
            key: `drive:${d._id}`,
            to: `/student/drives/${d._id}`,
            icon: "briefcase",
            title: `${d.companyName} · ${d.role}`,
            meta: fmtDate(d.driveDate),
          })),
        });
    } else {
      if (current.students.length)
        out.push({
          label: "Students",
          items: current.students.map((s) => ({
            key: `student:${s._id}`,
            to: studentLink(role, s),
            icon: "user",
            title: s.name || s.usn,
            meta: `${s.usn} · ${s.branch} · ${s.batch}`,
          })),
        });
      if (current.drives.length)
        out.push({
          label: "Drives",
          items: current.drives.map((d) => ({
            key: `drive:${d._id}`,
            to: `/placement-officer/drives/${d._id}`,
            icon: "briefcase",
            title: `${d.companyName} · ${d.role}`,
            meta: fmtDate(d.driveDate),
          })),
        });
    }

    const help = HELP_INDEX.filter((h) => matches(term, h.title, h.page, h.keywords));
    if (help.length) out.push({ label: "Help", items: help.slice(0, 5).map((h) => ({ ...h, key: `help:${h.to}`, meta: h.page })) });
    return out;
  }, [term, role, myDrives, current]);

  const flat = groups.flatMap((g) => g.items);

  const go = useCallback(
    (item) => {
      if (!item) return;
      setOpen(false);
      navigate(item.to);
    },
    [navigate],
  );

  const onKeyDown = (e) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[active]);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let index = -1;

  return (
    <>
      <button
        type="button"
        onClick={openSearch}
        className="flex h-9 items-center gap-2 rounded-lg text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 w-9 justify-center md:w-56 md:justify-start md:bg-slate-100/70 md:px-3 md:ring-1 md:ring-inset md:ring-slate-200"
        aria-label="Search"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Icon name="search" className="icon-nudge h-[18px] w-[18px] shrink-0" />
        <span className="hidden flex-1 text-left md:inline">Search</span>
        <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 font-sans text-[11px] text-slate-400 md:inline">Ctrl K</kbd>
      </button>

      {/* Portalled to <body>: the header's backdrop blur would otherwise
          confine a fixed overlay to the header's own box. */}
      {presence.render && createPortal(
        <div className="fixed inset-0 z-[100] flex items-start justify-center p-0 sm:p-4 sm:pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search" inert={presence.closing}>
          <div className="modal-backdrop fixed inset-0 bg-slate-900/60" data-closing={presence.closing ? "" : undefined} onClick={() => setOpen(false)} />
          <div data-closing={presence.closing ? "" : undefined} className="modal-panel relative flex max-h-full w-full flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-slate-200 sm:max-h-[70vh] sm:max-w-xl sm:rounded-xl">
            <div className="flex items-center gap-3 border-b border-slate-200 px-4">
              <Icon name="search" className="h-5 w-5 shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder={
                  role === "student"
                    ? "Search pages, your drives and help"
                    : staff
                      ? "Search pages, students by name or USN, drives"
                      : "Search pages and help"
                }
                className="h-14 min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 sm:text-sm"
                role="combobox"
                aria-expanded="true"
                aria-controls="search-results"
                aria-activedescendant={flat[active] ? `search-item-${active}` : undefined}
                autoComplete="off"
                spellCheck="false"
              />
              {loading && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" aria-label="Searching" />}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
              >
                Esc
              </button>
            </div>

            <div ref={listRef} id="search-results" role="listbox" className="flex-1 overflow-y-auto p-2">
              {groups.map((g) => (
                <div key={g.label} className="mb-2 last:mb-0">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.label}</p>
                  {g.items.map((item) => {
                    index += 1;
                    const i = index;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        id={`search-item-${i}`}
                        data-index={i}
                        role="option"
                        aria-selected={i === active}
                        onMouseMove={() => setActive(i)}
                        onClick={() => go(item)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${i === active ? "bg-slate-100" : ""}`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-slate-500 ring-1 ring-slate-200">
                          <Icon name={item.icon} className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">{item.title}</span>
                          {item.meta && <span className="block truncate text-xs text-slate-500">{item.meta}</span>}
                        </span>
                        {i === active && <Icon name="arrowRight" className="h-4 w-4 shrink-0 text-slate-400" />}
                      </button>
                    );
                  })}
                </div>
              ))}

              {term && !flat.length && !loading && (
                <div className="px-6 py-10 text-center">
                  <Icon name="search" className="mx-auto h-6 w-6 text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-900">No results for “{term}”</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {staff && term.length < 2
                      ? "Type at least two characters to search records."
                      : staff
                        ? "Try part of a name, a USN or a company name."
                        : "Try a page name such as Resume or Drives, or a company name."}
                  </p>
                </div>
              )}
              {failed && (
                <p className="px-3 py-2 text-xs text-amber-700" role="alert">
                  Records could not be searched right now. Pages and help are still listed.
                </p>
              )}
            </div>

            <div className="hidden items-center gap-4 border-t border-slate-200 px-4 py-2 text-[11px] text-slate-400 sm:flex">
              <span><kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> to move</span>
              <span><kbd className="font-sans">Enter</kbd> to open</span>
              <span><kbd className="font-sans">Esc</kbd> to close</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
