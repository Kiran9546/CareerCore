import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import {
  DRIVE_STATUS_LABEL,
  DRIVE_STATUS_STYLE,
  formatDate,
  formatDateTime,
  ui,
} from "../../utils/placement";

/** One drive as a card. */
function Card({ d }) {
  return (
    <Link to={`/student/drives/${d._id}`} className="block rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-400">
      <div className="flex justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">{d.companyName}</p>
          <p className="text-sm text-slate-600">{d.role}{d.ctc ? ` · ₹${d.ctc} LPA` : ""}</p>
        </div>
        <span className={`${ui.badge} h-fit ${DRIVE_STATUS_STYLE[d.status] ?? ""}`}>{DRIVE_STATUS_LABEL[d.status]}</span>
      </div>
      <p className="text-xs text-slate-500 mt-2">{d.criteria.join(" · ")}</p>
      <p className="text-xs text-slate-500 mt-1">Drive {formatDate(d.driveDate)} · Register by {formatDateTime(d.registrationDeadline)}</p>
      {d.process.length > 0 && <p className="text-xs text-slate-400 mt-1">{d.process.join(" → ")}</p>}
      <p className="text-sm mt-3 font-medium text-slate-800">
        {d.registrationStatus === "registered" ? "✓ Registered" : d.registrationStatus === "withdrawn" ? "Withdrawn" : "Register →"}
      </p>
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
  if (!drives) return <p className="text-slate-400">Loading…</p>;

  const open = drives.filter((d) => d.canRegister);
  const mine = drives.filter((d) => d.registrationStatus);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Placement drives</h2>
        <p className="text-sm text-slate-500">Drives you are eligible for and the ones you have registered for</p>
      </div>

      <section className="space-y-3">
        <h3 className="font-semibold text-slate-900">Open opportunities</h3>
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
