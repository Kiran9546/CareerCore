import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import {
  DRIVE_OUTCOME_LABEL,
  DRIVE_OUTCOME_STYLE,
  STATUS_LABEL,
  STATUS_STYLE,
  RESULT_LABEL,
  RESULT_STYLE,
  FINAL_RESULT_LABEL,
  STUDENT_STATE_LABEL,
  STUDENT_STATE_STYLE,
  formatDate,
  ui,
} from "../../utils/placement";
import { CardSkeleton } from "../ui/Skeleton";

/**
 * Overall placement status and drive-by-drive history, round by round.
 * `endpoint` is the student's own (/student/placement/status) or the
 * officer's view of a student (/placement/students/:id/recruitment).
 */
export default function RecruitmentHistory({ endpoint, linkDrives = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(endpoint)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.message || "Could not load the placement history"));
  }, [endpoint]);

  if (error) return <div className={`${ui.card} text-sm text-slate-500`}>{error}</div>;
  if (!data) return <CardSkeleton rows={4} />;
  const o = data.overall;

  return (
    <div className={`${ui.card} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-900">Placement status</h3>
        <span className={`px-2.5 py-1 rounded text-xs font-medium ${STUDENT_STATE_STYLE[o.state] ?? ""}`}>{STUDENT_STATE_LABEL[o.state]}</span>
      </div>
      {(o.companyName || o.opportunities) && (
        <p className="text-sm text-slate-600">
          {o.companyName && <>{o.companyName} · {o.role}{o.stage ? ` · ${o.stage}` : ""}{o.offers > 1 ? ` · ${o.offers} offers` : ""}</>}
          {o.opportunities && <>{o.opportunities} open drive{o.opportunities > 1 ? "s" : ""} you are eligible for. {linkDrives && <Link to="/student/drives" className="underline">View drives</Link>}</>}
        </p>
      )}

      {data.drives.length === 0 ? (
        <p className="text-sm text-slate-400">No drive history yet.</p>
      ) : (
        <ul className="space-y-3">
          {data.drives.map((d) => (
            <li key={d.driveId} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  {linkDrives && d.workflow === "managed" ? (
                    <Link to={`/student/drives/${d.driveId}`} className="font-medium text-slate-900 hover:underline">{d.companyName}</Link>
                  ) : (
                    <p className="font-medium text-slate-900">{d.companyName}</p>
                  )}
                  <p className="text-sm text-slate-600">{d.role} · {formatDate(d.driveDate)}</p>
                </div>
                <span className={`${ui.badge} h-fit ${DRIVE_OUTCOME_STYLE[d.outcome] ?? ""}`}>
                  {DRIVE_OUTCOME_LABEL[d.outcome] ?? d.outcome}{d.currentStage && d.outcome === "in_process" ? ` · ${d.currentStage}` : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {d.rounds.map((r, i) => {
                  const managed = d.workflow === "managed";
                  const label = managed ? (r.isFinal ? FINAL_RESULT_LABEL : RESULT_LABEL)[r.result] : STATUS_LABEL[r.result];
                  const style = managed ? RESULT_STYLE[r.result] : STATUS_STYLE[r.result];
                  return (
                    <span key={r.roundId || i} className={`${ui.badge} ${r.attendance === "absent" ? "bg-amber-100 text-amber-700" : style || "bg-slate-50 text-slate-400"}`}>
                      {r.name}: {r.attendance === "absent" ? "Absent" : label || (r.entered ? "Awaited" : "–")}
                    </span>
                  );
                })}
              </div>
              {d.offer && (
                <p className="text-xs text-emerald-700 mt-2">
                  Offer {d.offer.ctc ? `₹${d.offer.ctc} LPA` : ""}{d.offer.location ? ` · ${d.offer.location}` : ""}{d.offer.status ? ` · ${d.offer.status}` : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
