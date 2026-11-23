import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import Icon from "./ui/Icon";
import usePresence from "../motion/usePresence";

// Icons from the app's own set (components/ui/Icon), one per notification type.
const TYPE_ICON = {
  new_job: "briefcase",
  low_prs: "target",
  skill_reminder: "book",
  application_status: "check",
  recommendation_update: "zap",
  placement_update: "award",
  drive_opportunity: "briefcase",
  system: "bell",
};

const TYPE_COLOR = {
  new_job: "text-blue-600",
  low_prs: "text-amber-600",
  skill_reminder: "text-slate-500",
  application_status: "text-green-600",
  recommendation_update: "text-sky-600",
  placement_update: "text-emerald-600",
  drive_opportunity: "text-indigo-600",
  system: "text-slate-400",
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  // Reading Date.now() straight from render makes the component impure and
  // its timestamps drift out of sync with React. Keep "now" in state instead.
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef(null);
  const navigate = useNavigate();
  // Ring the bell once whenever the unread count goes up (including on
  // arrival with unread notifications). Adjusted during render, React's
  // pattern for state derived from a changing value.
  const [ring, setRing] = useState(0);
  const panel = usePresence(open, 140);
  const [seenUnread, setSeenUnread] = useState(unread);
  if (unread !== seenUnread) {
    setSeenUnread(unread);
    if (unread > seenUnread) setRing((r) => r + 1);
  }

  const load = () => {
    api.get("/notifications")
      .then((r) => { setItems(r.data.notifications); setUnread(r.data.unread); })
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const t = setInterval(() => {
      setNow(Date.now());
      api.get("/notifications/unread", { background: true })
        .then((r) => setUnread(r.data.unread))
        .catch(() => {});
    }, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const toggle = () => {
    if (!open) {
      setNow(Date.now());
      load();
    }
    setOpen(!open);
  };

  const markAllRead = async () => {
    try {
      await api.patch("/notifications/read", {});
    } catch { /* the reload below will resync the badge */ }
    load();
  };

  const openItem = async (n) => {
    if (!n.isRead) {
      try {
        await api.patch("/notifications/read", { ids: [n._id] });
      } catch { /* navigating away anyway */ }
    }
    setOpen(false);
    if (n.link) navigate(n.link);
    else load();
  };

  const timeAgo = (d) => {
    const mins = Math.floor((now - new Date(d)) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors">
        <Icon key={ring} name="bell" className="icon-bell w-5 h-5" data-ring={ring ? "" : undefined} />
        {unread > 0 && (
          <span key={unread} className="badge-pop absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {panel.render && (
        <div data-closing={panel.closing ? "" : undefined} inert={panel.closing} className="dropdown-in absolute right-0 mt-2 w-[min(24rem,calc(100vw-2rem))] bg-white border border-slate-200 rounded-xl shadow-(--cc-shadow-raised) z-50 max-h-[28rem] overflow-hidden flex flex-col">
          <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100">
            <span className="font-semibold text-slate-900 text-sm">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-slate-500 hover:text-slate-900 underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto">
            {items.map((n) => (
              <button key={n._id} onClick={() => openItem(n)}
                className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 ${
                  !n.isRead ? "bg-blue-50/40" : ""
                }`}>
                <div className="flex gap-3">
                  <Icon name={TYPE_ICON[n.type] ?? "bell"} className={`mt-0.5 h-4 w-4 shrink-0 ${TYPE_COLOR[n.type] ?? "text-slate-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{n.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-3 whitespace-pre-line">{n.body}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />}
                </div>
              </button>
            ))}

            {!items.length && (
              <p className="px-4 py-8 text-sm text-slate-400 text-center">No notifications yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}