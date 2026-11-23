import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import Icon from "../../components/ui/Icon";
import { Skeleton } from "../../components/ui/Skeleton";
import {
  DRIVE_STATUS_LABEL,
  DRIVE_STATUS_STYLE,
  formatDate,
  formatDateTime,
  ui,
} from "../../utils/placement";

const NEW_FOR_DAYS = 7;
/** Posted within the last week, going by when the placement cell created it. */
const isNew = (d) => d.createdAt && Date.now() - new Date(d.createdAt).getTime() < NEW_FOR_DAYS * 86400000;

/** One drive as a card. */
function Card({ d }) {
  return (
    <Link to={`/student/drives/${d._id}`} className="block rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-400">
      <div className="flex justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">{d.companyName}</p>
          <p className="text-sm text-slate-600">{d.role}{d.ctc ? ` · ₹${d.ctc} LPA` : ""}</p>
        </div>
        <div className="flex h-fit shrink-0 gap-1.5">
          {isNew(d) && <span className={`${ui.badge} bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200`}>New</span>}
          <span className={`${ui.badge} ${DRIVE_STATUS_STYLE[d.status] ?? ""}`}>{DRIVE_STATUS_LABEL[d.status]}</span>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-2">{d.criteria.join(" · ")}</p>
      <p className="text-xs text-slate-500 mt-1">Drive {formatDate(d.driveDate)} · Register by {formatDateTime(d.registrationDeadline)}</p>
      {d.process.length > 0 && <p className="text-xs text-slate-400 mt-1">{d.process.join(" → ")}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
          {d.registrationStatus === "registered" ? (
            <>
              <Icon name="tick" className="h-4 w-4 text-emerald-600" strokeWidth={2.25} />
              Registered
            </>
          ) : d.registrationStatus === "withdrawn" ? (
            "Withdrawn"
          ) : d.blockedReason ? (
            <span className="font-normal text-slate-500" title={d.blockedReason}>
              Not open to you under the placement policy
            </span>
          ) : (
            <>
              Register
              <Icon name="arrowRight" className="h-4 w-4" />
            </>
          )}
        </p>
        {d.createdAt && (
          <p className="text-xs text-slate-400">
            Posted <time dateTime={d.createdAt}>{formatDate(d.createdAt)}</time>
            {d.updatedAt && formatDate(d.updatedAt) !== formatDate(d.createdAt) && <>, updated {formatDate(d.updatedAt)}</>}
          </p>
        )}
      </div>
    </Link>
  );
}

/**
 * Placement drives for the signed-in student: open opportunities they are
 * eligible for, and every drive they have registered for. Eligibility is
 * decided by the placement cell from the student's academic record.
 */
export default function Drives() {
  const [drives, setDrives] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/student/drives")
      .then((r) => setDrives(r.data.drives))
      .catch((e) => setError(e.response?.data?.message || "Could not load placement drives"));
  }, []);

  if (error) return <div className={`${ui.card} text-center text-slate-500`}>{error}</div>;
  if (!drives)
    return (
      <div role="status" aria-label="Loading drives" className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-2 h-3 w-56" />
            <Skeleton className="mt-4 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </div>
        ))}
      </div>
    );

  // Newest first, so a drive posted today is at the top of the list.
  // Drives the placement policy rules out stay listed (the student was
  // notified about them), labelled "Not open to you" with the reason.
  const open = drives
    .filter((d) => d.canRegister || (d.blockedReason && !d.registrationStatus))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const newCount = open.filter(isNew).length;
  const mine = drives.filter((d) => d.registrationStatus);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Placement drives</h2>
        <p className="text-sm text-slate-500">Drives you are eligible for and the ones you have registered for</p>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold text-slate-900">Open opportunities</h3>
          {newCount > 0 && (
            <p className="text-sm text-slate-500">
              {newCount} posted in the last {NEW_FOR_DAYS} days, shown first
            </p>
          )}
        </div>
        {open.length ? (
          <div className="grid md:grid-cols-2 gap-4">{open.map((d) => <Card key={d._id} d={d} />)}</div>
        ) : (
          <p className="text-sm text-slate-400">No drives are open for you right now. You will be notified when one is.</p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-slate-900">My drives</h3>
        {mine.length ? (
          <div className="grid md:grid-cols-2 gap-4">{mine.map((d) => <Card key={d._id} d={d} />)}</div>
        ) : (
          <p className="text-sm text-slate-400">You have not registered for any drive yet.</p>
        )}
      </section>
    </div>
  );
}
