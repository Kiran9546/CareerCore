import { useCallback, useEffect, useState } from "react";
import api from "../../api/axios";
import Pager from "./Pager";
import { CardSkeleton } from "../ui/Skeleton";
import { confirmAction } from "../ui/confirm";
import { formatDateTime, ui } from "../../utils/placement";

const CHANNEL_LABEL = { email: "Email", whatsapp: "WhatsApp" };

const STATUS_LABEL = {
  pending: "Pending",
  processing: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
  skipped: "Not sent",
  simulated: "Simulated (sandbox)",
};

const STATUS_STYLE = {
  pending: "bg-amber-100 text-amber-700",
  processing: "bg-amber-100 text-amber-700",
  sent: "bg-green-100 text-green-700",
  delivered: "bg-emerald-100 text-emerald-700",
  read: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-slate-100 text-slate-500",
  simulated: "bg-sky-100 text-sky-700",
};

const SKIP_LABEL = {
  no_email: "No email address",
  no_phone: "No WhatsApp number",
  invalid_phone: "Invalid WhatsApp number",
  no_consent: "No WhatsApp consent",
  unverified_phone: "WhatsApp number not verified yet",
  email_unverified: "Email not verified yet",
  email_opt_out: "Student turned placement emails off",
  account_inactive: "Account deactivated",
  no_longer_eligible: "No longer eligible",
  registration_closed: "Registration closed before sending",
  student_removed: "Student record removed",
};

/** One figure, read straight from the summary. */
function Figure({ label, value, tone = "text-slate-900", onClick, hint }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className={`text-left rounded-lg border border-slate-200 bg-white px-3 py-2.5 ${onClick ? "hover:border-slate-400" : ""}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </Tag>
  );
}

/** Config banner: tells the officer plainly when nothing real is being sent. */
function ChannelState({ config }) {
  const notes = [];
  if (config.mode === "sandbox") {
    notes.push(`Sandbox mode: ${config.whatsapp.enabled ? "email and WhatsApp messages are" : "emails are"} rendered and recorded as simulated. Nothing is sent to students.`);
  }
  if (config.mode === "off") notes.push("External delivery is turned off on the server. Students are notified in CareerCore only.");
  for (const c of ["email", "whatsapp"]) {
    const s = config[c];
    if (config.mode === "off") continue;
    // WhatsApp switched off is the normal setup (in-app + email only).
    if (!s.enabled && c === "whatsapp") continue;
    if (!s.enabled) notes.push(`${CHANNEL_LABEL[c]} notifications are switched off on the server.`);
    else if (!s.configured) notes.push(`${CHANNEL_LABEL[c]} is switched on but its credentials are not configured, so messages fail as "not configured" until they are.`);
  }
  // Live problems found while sending (an expired WhatsApp token, a rejected
  // email login): the channel is paused and its messages are kept.
  const alerts = Object.entries(config.alerts || {});
  if (!notes.length && !alerts.length) return null;
  return (
    <div className="space-y-2">
      {alerts.map(([c, a]) => (
        <div key={c} className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800" role="alert">
          <strong>{CHANNEL_LABEL[c]} paused:</strong> {a.message}
        </div>
      ))}
      {notes.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 space-y-1" role="status">
          {notes.map((n) => <p key={n}>{n}</p>)}
        </div>
      )}
    </div>
  );
}

/**
 * Notification delivery overview for one managed drive: what was created in
 * the app, what each external channel sent, failed or skipped, and why.
 * Every number comes from GET /placement/drives/:id/notifications/summary.
 */
export default function NotificationDeliveryPanel({ drive, canRetry, onError, onNotice }) {
  const [summary, setSummary] = useState(null);
  const [list, setList] = useState(null);
  const [filter, setFilter] = useState({ channel: "", status: "", q: "" });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [busy, setBusy] = useState("");

  const loadSummary = useCallback(
    () =>
      api
        .get(`/placement/drives/${drive._id}/notifications/summary`, { background: true })
        .then((r) => setSummary(r.data.summary))
        .catch((e) => onError(e, "Could not load the notification report")),
    [drive._id, onError],
  );

  const loadList = useCallback(
    () =>
      api
        .get(`/placement/drives/${drive._id}/notifications/deliveries`, {
          background: true,
          params: { page, limit, ...(filter.channel && { channel: filter.channel }), ...(filter.status && { status: filter.status }), ...(filter.q && { q: filter.q }) },
        })
        .then((r) => setList(r.data))
        .catch((e) => onError(e, "Could not load the delivery list")),
    [drive._id, page, limit, filter, onError],
  );

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);
  useEffect(() => {
    loadList();
  }, [loadList]);

  // Refresh while anything is still queued, so progress is visible.
  const inFlight = summary ? summary.email.pending + summary.whatsapp.pending : 0;
  useEffect(() => {
    if (!inFlight) return undefined;
    const t = setInterval(() => {
      loadSummary();
      loadList();
    }, 10000);
    return () => clearInterval(t);
  }, [inFlight, loadSummary, loadList]);

  const show = (channel, status) => {
    setPage(1);
    setFilter((f) => ({ ...f, channel, status }));
  };

  /** Rows the server will re-queue: failed, never-really-sent, or fixable skips. */
  const resendable = (channel) => {
    const s = summary[channel];
    const fixable = ["no_email", "no_phone", "invalid_phone", "no_consent", "unverified_phone", "email_unverified", "email_opt_out"]
      .reduce((n, k) => n + (s.skippedBy[k] || 0), 0);
    return { failed: s.failed, simulated: summary.config.mode === "live" ? s.simulated : 0, fixable };
  };

  const retry = async (channel) => {
    const r0 = resendable(channel);
    const parts = [
      r0.failed && `${r0.failed} failed`,
      r0.simulated && `${r0.simulated} only simulated in sandbox mode`,
      r0.fixable && `${r0.fixable} not sent for a missing address, number or consent (checked again)`,
    ].filter(Boolean);
    const message = parts.length
      ? `Send ${CHANNEL_LABEL[channel]} again for: ${parts.join("; ")}? Messages already sent are never sent again.`
      : `Queue ${CHANNEL_LABEL[channel]} messages for eligible students who have none yet? Messages already sent are never sent again.`;
    if (!(await confirmAction(message))) return;
    setBusy(channel);
    try {
      const r = await api.post(`/placement/drives/${drive._id}/notifications/retry`, { channel });
      onNotice(`${r.data.retried} ${CHANNEL_LABEL[channel]} message(s) queued to be sent.`);
      await Promise.all([loadSummary(), loadList()]);
    } catch (e) {
      onError(e, "Could not retry the notifications");
    } finally {
      setBusy("");
    }
  };

  if (!summary) return <CardSkeleton rows={5} />;
  const open = drive.status === "open";
  const notPublished = drive.status === "draft";
  // WhatsApp appears only when the server uses it, or this drive has WhatsApp history.
  const showWhatsApp = summary.config.whatsapp.enabled || summary.whatsapp.total > 0;

  const channelCard = (c) => {
    const s = summary[c];
    const r = resendable(c);
    const unsent = r.failed + r.simulated + r.fixable;
    return (
      <div className={ui.card} key={c}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-slate-900">{CHANNEL_LABEL[c]}</h3>
          {canRetry && open && summary.config[c].enabled && (
            <button className={ui.secondary} disabled={busy === c} onClick={() => retry(c)}>
              {busy === c ? "Queuing…" : r.failed && r.failed === unsent ? `Retry ${r.failed} failed` : unsent ? `Send ${unsent} unsent` : "Queue missing"}
            </button>
          )}
        </div>
        {!summary.config[c].enabled && s.total === 0 ? (
          <p className="text-sm text-slate-400">Not sent for this drive: the channel is switched off.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Figure label="Sent successfully" value={s.succeeded} tone="text-green-700" onClick={() => show(c, "sent")}
                hint={c === "whatsapp" && s.succeeded ? `${s.delivered + s.read} delivered · ${s.read} read` : c === "email" ? "Accepted by mail server" : undefined} />
              <Figure label="Pending" value={s.pending} tone="text-amber-700" onClick={() => show(c, "pending")} />
              <Figure label="Failed" value={s.failed} tone="text-red-700" onClick={() => show(c, "failed")} />
              <Figure label="Not sent" value={s.skipped} tone="text-slate-600" onClick={() => show(c, "skipped")}
                hint={c === "whatsapp" ? `${summary.whatsapp.unreachable} without valid number or consent` : undefined} />
            </div>
            {s.simulated > 0 && (
              <p className="text-xs text-sky-700 mt-2">
                <button className="underline" onClick={() => show(c, "simulated")}>{s.simulated} simulated in sandbox mode</button> — not delivered to anyone.
              </p>
            )}
            {Object.keys(s.skippedBy).length > 0 && (
              <ul className="mt-3 text-xs text-slate-500 space-y-0.5">
                {Object.entries(s.skippedBy).map(([k, n]) => (
                  <li key={k}>{SKIP_LABEL[k] || k}: {n}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <ChannelState config={summary.config} />
      {notPublished && (
        <p className={`${ui.card} text-sm text-slate-500`}>Nobody is notified until the drive is published.</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Figure label="Eligible students" value={summary.eligible} />
        <Figure label="Notified" value={summary.notified} hint="Eligible students told about the drive" />
        <Figure label="In-app & website notifications" value={summary.inApp.created} hint="One record shown in the bell and the notification centre" />
        <Figure label="Opened in CareerCore" value={summary.inApp.read} hint="Marked read by the student" />
      </div>

      <div className={`grid gap-4 ${showWhatsApp ? "lg:grid-cols-2" : ""}`}>
        {channelCard("email")}
        {showWhatsApp && channelCard("whatsapp")}
      </div>

      <div className={ui.card}>
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <h3 className="font-semibold text-slate-900 mr-auto">Delivery details</h3>
          <select className={ui.select} aria-label="Channel" value={filter.channel}
            onChange={(e) => show(e.target.value, filter.status)}>
            <option value="">All channels</option>
            <option value="email">Email</option>
            {showWhatsApp && <option value="whatsapp">WhatsApp</option>}
          </select>
          <select className={ui.select} aria-label="Status" value={filter.status}
            onChange={(e) => show(filter.channel, e.target.value)}>
            <option value="">Any status</option>
            <option value="sent">Sent</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="skipped">Not sent</option>
            <option value="simulated">Simulated</option>
          </select>
          <input className={`${ui.input} sm:w-56`} placeholder="Search name or USN" aria-label="Search students"
            defaultValue={filter.q}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPage(1);
                setFilter((f) => ({ ...f, q: e.currentTarget.value.trim() }));
              }
            }} />
        </div>

        {!list ? (
          <CardSkeleton rows={4} />
        ) : list.deliveries.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No messages match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-2 font-medium">Student</th>
                  <th className="pb-2 font-medium">Channel</th>
                  <th className="pb-2 font-medium">Recipient</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Detail</th>
                  <th className="pb-2 font-medium text-right">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {list.deliveries.map((d) => (
                  <tr key={d._id} className="border-b border-slate-100 align-top">
                    <td className="py-2.5">
                      <p className="text-slate-800">{d.student.name || "–"}</p>
                      <p className="text-xs text-slate-400">{d.student.usn}{d.student.branch ? ` · ${d.student.branch}` : ""}</p>
                    </td>
                    <td className="py-2.5 text-slate-600">{CHANNEL_LABEL[d.channel]}</td>
                    <td className="py-2.5 text-slate-500 text-xs">{d.recipientMasked || "–"}</td>
                    <td className="py-2.5"><span className={`${ui.badge} ${STATUS_STYLE[d.status]}`}>{STATUS_LABEL[d.status]}</span></td>
                    <td className="py-2.5 text-xs text-slate-500 max-w-[18rem]">
                      {d.status === "skipped" && (SKIP_LABEL[d.skipReason] || d.skipReason)}
                      {d.lastError && d.status !== "skipped" && <span className="break-words">{d.lastError.message}</span>}
                      {d.status === "pending" && d.nextAttemptAt && d.attempts > 0 && <span className="block">Next attempt {formatDateTime(d.nextAttemptAt)}</span>}
                      {d.readAt ? `Read ${formatDateTime(d.readAt)}` : d.deliveredAt ? `Delivered ${formatDateTime(d.deliveredAt)}` : d.sentAt && !d.lastError ? `Sent ${formatDateTime(d.sentAt)}` : null}
                    </td>
                    <td className="py-2.5 text-right text-slate-600">{d.attempts}{d.manualRetries ? ` (${d.manualRetries} manual)` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list && (
          <Pager page={page} limit={limit} total={list.total} onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
        )}
      </div>
    </div>
  );
}
