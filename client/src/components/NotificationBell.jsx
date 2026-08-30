import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

const TYPE_ICON = {
  new_job: "◆",
  low_prs: "▲",
  skill_reminder: "●",
  application_status: "✓",
  recommendation_update: "◇",
  placement_update: "★",
  system: "■",
};

const TYPE_COLOR = {
  new_job: "text-blue-600",
  low_prs: "text-amber-600",
  skill_reminder: "text-slate-500",
  application_status: "text-green-600",
  recommendation_update: "text-purple-600",
  placement_update: "text-emerald-600",
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

  const load = () => {
    api.get("/notifications")
      .then((r) => { setItems(r.data.notifications); setUnread(r.data.unread); })
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const t = setInterval(() => {
      setNow(Date.now());
      api.get("/notifications/unread")
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
        className="relative px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50">
        Notifications
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] font-medium flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-[28rem] overflow-hidden flex flex-col">
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
                  <span className={`text-sm mt-0.5 ${TYPE_COLOR[n.type]}`}>{TYPE_ICON[n.type]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{n.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
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