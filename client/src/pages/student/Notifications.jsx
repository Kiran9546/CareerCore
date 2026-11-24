import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import Icon from "../../components/ui/Icon";
import { ListSkeleton } from "../../components/ui/Skeleton";
import { toast } from "../../components/ui/toast";
import { errorMessage, formatDateTime, ui } from "../../utils/placement";
import { announceUnread, driveDetails, onUnreadChange } from "../../utils/notifications";

const PAGE_SIZE = 20;

const FILTERS = [
  ["all", "All"],
  ["unread", "Unread"],
  ["read", "Read"],
];

/**
 * The student's notification centre: the full, persistent history behind
 * the bell. Same records as the bell (GET /api/notifications), paginated,
 * with read/unread state the student controls. Drive announcements show the
 * company, role and deadline and open the drive's registration page.
 */
export default function Notifications() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const fetchPage = useCallback(
    (p, append) =>
      api
        .get("/notifications", { params: { page: p, limit: PAGE_SIZE, status: filter } })
        .then((r) => {
          setItems((prev) => (append ? [...prev, ...r.data.notifications] : r.data.notifications));
          setTotal(r.data.total);
          setUnread(r.data.unread);
          setPage(p);
          setError("");
        })
        .catch((e) => setError(errorMessage(e, "Could not load your notifications"))),
    [filter],
  );

  useEffect(() => {
    let live = true;
    fetchPage(1, false).finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [fetchPage]);

  // The bell changed something: reload what is on screen.
  useEffect(() => onUnreadChange((n) => typeof n === "number" && setUnread(n)), []);

  /** Apply a read-state change locally and tell the bell. */
  const applyRead = (ids, isRead, newUnread) => {
    setUnread(newUnread);
    announceUnread(newUnread);
    setItems((prev) => {
      const next = prev.map((n) => (ids === "all" || ids.includes(n._id) ? { ...n, isRead } : n));
      // Under a read/unread filter, items that no longer match drop out.
      return filter === "all" ? next : next.filter((n) => (filter === "unread" ? !n.isRead : n.isRead));
    });
    if (filter !== "all") setTotal((t) => Math.max(t - (ids === "all" ? t : ids.length), 0));
  };

  const setRead = async (n, isRead) => {
    setBusy(n._id);
    try {
      const r = await api.patch(isRead ? "/notifications/read" : "/notifications/unread", { ids: [n._id] });
      applyRead([n._id], isRead, r.data.unread);
    } catch (e) {
      toast(errorMessage(e, "Could not update the notification"), { tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const markAllRead = async () => {
    setBusy("all");
    try {
      const r = await api.patch("/notifications/read", {});
      applyRead("all", true, r.data.unread);
    } catch (e) {
      toast(errorMessage(e, "Could not mark notifications as read"), { tone: "error" });
    } finally {
      setBusy("");
    }
  };

  /** Opening a notification marks it read, then follows its link. */
  const open = async (n) => {
    if (!n.isRead) {
      try {
        const r = await api.patch("/notifications/read", { ids: [n._id] });
        announceUnread(r.data.unread);
      } catch { /* navigate regardless */ }
    }
    if (n.link) navigate(n.link);
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-500">
            {unread > 0 ? `${unread} unread` : "You're all caught up."} Placement drive alerts also arrive by email, and on WhatsApp if you turn it on in your{" "}
            <Link to="/student/profile" className="underline hover:text-slate-700">profile</Link>.
          </p>
        </div>
        {unread > 0 && (
          <button className={ui.secondary} onClick={markAllRead} disabled={busy === "all"}>Mark all read</button>
        )}
      </div>

      <div className="flex gap-1 border-b border-slate-200" role="tablist" aria-label="Filter notifications">
        {FILTERS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={filter === key}
            onClick={() => {
              if (key === filter) return;
              setLoading(true);
              setFilter(key);
            }}
            className={`px-4 py-2 text-sm border-b-2 -mb-px ${filter === key ? "border-slate-900 text-slate-900 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className={ui.error} role="alert">{error}</div>}

      {loading ? (
        <ListSkeleton label="Loading notifications" items={4} />
      ) : items.length === 0 ? (
        <div className={`${ui.card} text-center text-sm text-slate-500`}>
          {filter === "unread" ? "No unread notifications." : filter === "read" ? "No read notifications yet." : "No notifications yet."}
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Notifications">
          {items.map((n) => {
            const drive = driveDetails(n);
            return (
              <li key={n._id} data-testid="notification"
                className={`rounded-xl border bg-white p-4 sm:p-5 ${n.isRead ? "border-slate-200" : "border-indigo-200 bg-indigo-50/30"}`}>
                <div className="flex gap-3">
                  <Icon name={n.type === "drive_opportunity" ? "briefcase" : "bell"}
                    className={`mt-0.5 h-5 w-5 shrink-0 ${n.isRead ? "text-slate-400" : "text-indigo-600"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <p className="font-semibold text-slate-900 break-words">{n.title}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        {!n.isRead && <span className={`${ui.badge} bg-indigo-100 text-indigo-700`}>Unread</span>}
                        <time dateTime={n.createdAt} className="text-xs text-slate-400">{formatDateTime(n.createdAt)}</time>
                      </div>
                    </div>

                    {drive ? (
                      <dl className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm">
                        <div><dt className="text-xs text-slate-500">Company</dt><dd className="text-slate-800">{drive.companyName}</dd></div>
                        <div><dt className="text-xs text-slate-500">Role</dt><dd className="text-slate-800">{drive.role}{drive.ctc ? ` · ₹${drive.ctc} LPA` : ""}</dd></div>
                        <div><dt className="text-xs text-slate-500">Register by</dt><dd className="text-slate-800">{formatDateTime(drive.deadline)}</dd></div>
                      </dl>
                    ) : (
                      <p className="mt-1 text-sm text-slate-600 whitespace-pre-line break-words">{n.body}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {n.link && (
                        <button className={ui.primary} onClick={() => open(n)}>
                          {drive ? "View drive & register" : "Open"}
                        </button>
                      )}
                      <button className={ui.secondary} disabled={busy === n._id} onClick={() => setRead(n, !n.isRead)}>
                        {n.isRead ? "Mark as unread" : "Mark as read"}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && items.length < total && (
        <div className="text-center">
          <button className={ui.secondary} onClick={() => fetchPage(page + 1, true)}>Show older notifications</button>
        </div>
      )}
    </div>
  );
}
