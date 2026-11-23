import { useCallback, useEffect, useState } from "react";
import api from "../../api/axios";
import { roleLabel } from "../../config/roles";
import CopyButton from "../../components/ui/CopyButton";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { toast } from "../../components/ui/toast";

const FILTERS = [
  ["new", "New"],
  ["resolved", "Resolved"],
  ["", "All"],
];

const when = (d) => new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Messages sent through the contact form, newest first. */
export default function Messages() {
  const [status, setStatus] = useState("new");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null);

  const load = useCallback(() => {
    api
      .get(`/admin/messages${status ? `?status=${status}` : ""}`)
      .then((r) => {
        setData({ ...r.data, status });
        setError("");
      })
      .catch((e) => {
        setData({ messages: [], newCount: 0, status });
        setError(e.response?.data?.message || "Messages could not be loaded.");
      });
  }, [status]);

  useEffect(load, [load]);
  // Data for another filter is still on screen until this one arrives.
  const ready = data && data.status === status;

  const mark = async (m, next) => {
    if (pending) return;
    setPending(m._id);
    try {
      await api.patch(`/admin/messages/${m._id}`, { status: next });
      toast(next === "resolved" ? "Marked as resolved" : "Moved back to new");
      load();
    } catch (e) {
      toast(e.response?.data?.message || "The message could not be updated.", { tone: "error" });
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-white p-1 ring-1 ring-slate-200" role="tablist" aria-label="Filter messages">
          {FILTERS.map(([v, l]) => (
            <button
              key={l}
              role="tab"
              aria-selected={status === v}
              onClick={() => setStatus(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${status === v ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              {l}
              {v === "new" && data?.newCount ? ` (${data.newCount})` : ""}
            </button>
          ))}
        </div>
        <p className="text-sm text-slate-500">Replies go out from your own email, using the copy buttons.</p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">
          {error}
        </div>
      )}

      {!ready ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <SkeletonRows rows={4} />
        </div>
      ) : !data.messages.length ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="font-medium text-slate-900">{status === "new" ? "No new messages" : "No messages here"}</p>
          <p className="mt-1 text-sm text-slate-500">Messages sent from the Contact page appear here, newest first.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.messages.map((m) => (
            <li key={m._id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{m.topicLabel}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-600">
                    <span>{m.name}</span>
                    <span className="text-slate-300">·</span>
                    <a href={`mailto:${m.email}`} className="text-indigo-700 hover:underline">{m.email}</a>
                    <CopyButton value={m.email} label="email address" />
                    {m.account && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        Signed in as {roleLabel(m.account.role).toLowerCase()}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <time dateTime={m.createdAt}>{when(m.createdAt)}</time>
                  {m.status === "resolved" && m.resolvedAt && <p className="mt-0.5">Resolved {when(m.resolvedAt)}</p>}
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{m.message}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.topicLabel}`)}`}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Reply by email
                </a>
                <button
                  type="button"
                  disabled={pending === m._id}
                  onClick={() => mark(m, m.status === "new" ? "resolved" : "new")}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-60"
                >
                  {pending === m._id ? "Saving…" : m.status === "new" ? "Mark as resolved" : "Move back to new"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
