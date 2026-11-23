import { useEffect, useState } from "react";
import api from "../../api/axios";
import Pager from "./Pager";
import { formatDateTime, ui } from "../../utils/placement";
import { SkeletonRows } from "../ui/Skeleton";

const ACTION_LABEL = {
  "drive.created": "Created the drive",
  "drive.updated": "Edited drive details",
  "drive.status_changed": "Changed drive status",
  "drive.cloned": "Cloned the drive",
  "drive.deleted": "Deleted the drive",
  "eligibility.changed": "Changed eligibility criteria",
  "eligibility.calculated": "Calculated eligibility",
  "registration.created": "Registered",
  "registration.withdrawn": "Withdrew registration",
  "registration.eligibility_override": "Overrode eligibility flag",
  "rounds.configured": "Changed the interview process",
  "round.scheduled": "Scheduled a round",
  "round.rescheduled": "Rescheduled a round",
  "round.attendance_changed": "Marked attendance",
  "round.result_changed": "Recorded a result",
  "round.finalized": "Finalized a round",
  "round.reopened": "Reopened a round",
  "final_selection.reverted": "Reverted final selections",
  "offer.updated": "Updated an offer",
};

const show = (v) => {
  if (v === undefined || v === null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.join(" → ");
  return Object.entries(v)
    .filter(([, x]) => x !== undefined && x !== null && x !== "")
    .map(([k, x]) => `${k}: ${Array.isArray(x) ? x.join(", ") : typeof x === "object" ? JSON.stringify(x) : x}`)
    .join(" · ");
};

/** Read-only audit trail for one drive, newest first. */
export default function AuditPanel({ driveId }) {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const qs = new URLSearchParams({ page, limit: 50 });
    if (action) qs.set("action", action);
    api
      .get(`/placement/drives/${driveId}/audit?${qs}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.message || "Could not load the audit history"));
  }, [driveId, action, page]);

  return (
    <div className={ui.card}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="font-semibold text-slate-900">Audit history</h3>
        <select className={ui.select} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label="Action">
          <option value="">All actions</option>
          {Object.entries(ACTION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {!data ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {data.entries.map((e) => (
              <li key={e._id} className="py-2.5 text-sm">
                <p className="text-slate-800">
                  <span className="font-medium">{e.actorName}</span>
                  <span className="text-slate-400"> ({e.actorRole})</span>: {ACTION_LABEL[e.action] || e.action}
                  {e.studentUsn && <> · student <span className="font-mono">{e.studentUsn}</span></>}
                  {e.roundName && <> · {e.roundName}</>}
                </p>
                {(e.from !== undefined || e.to !== undefined) && (
                  <p className="text-xs text-slate-500">
                    {show(e.from) && <>from <span className="text-slate-700">{show(e.from)}</span> </>}
                    {show(e.to) && <>to <span className="text-slate-700">{show(e.to)}</span></>}
                  </p>
                )}
                {e.note && <p className="text-xs text-slate-500">Reason: {e.note}</p>}
                <p className="text-[11px] text-slate-400">{formatDateTime(e.createdAt)}</p>
              </li>
            ))}
            {!data.entries.length && <li className="py-6 text-center text-slate-400 text-sm">No entries.</li>}
          </ul>
          <Pager page={page} limit={data.limit} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
