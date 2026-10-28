import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../../api/axios";
import {
  ATTENDANCE_LABEL,
  DRIVE_OUTCOME_LABEL,
  DRIVE_OUTCOME_STYLE,
  DRIVE_STATUS_LABEL,
  DRIVE_STATUS_STYLE,
  FINAL_RESULT_LABEL,
  RESULT_LABEL,
  RESULT_STYLE,
  errorMessage,
  formatDate,
  formatDateTime,
  ui,
} from "../../utils/placement";

/**
 * One drive from the student's side: what it is, whether they can register,
 * their schedule and, once each round is finalized, their result. Name, USN,
 * branch and CGPA are read from the student's record — never typed here.
 */
export default function DriveView() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get(`/student/drives/${id}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(errorMessage(e, "Could not load this drive")));
  }, [id]);

  useEffect(load, [load]);

  const act = async (action) => {
    if (action === "withdraw" && !window.confirm("Withdraw your registration? You can register again only while registration is open.")) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/student/drives/${id}/${action}`);
      setNotice(action === "register" ? "You are registered for this drive." : "Your registration has been withdrawn.");
      load();
    } catch (e) {
      setNotice("");
      setError(errorMessage(e, "Request failed"));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <div className={`${ui.card} text-center text-slate-500`}>{error}</div> : <p className="text-slate-400">Loading…</p>;
  const { drive, me, registration, progress } = data;

  return (
    <div className="space-y-5 max-w-4xl">
      <Link to="/student/drives" className="text-sm text-slate-500 hover:text-slate-700">← All drives</Link>
      {error && <div className={ui.error}>{error}</div>}
      {notice && <div className={ui.notice}>{notice}</div>}

      <div className={ui.card}>
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{drive.companyName}</h2>
            <p className="text-slate-600">{drive.role}{drive.ctc ? ` · ₹${drive.ctc} LPA` : ""}{drive.location ? ` · ${drive.location}` : ""}</p>
          </div>
          <span className={`${ui.badge} h-fit ${DRIVE_STATUS_STYLE[drive.status] ?? ""}`}>{DRIVE_STATUS_LABEL[drive.status]}</span>
        </div>
        {drive.description && <p className="text-sm text-slate-600 mt-3 whitespace-pre-line">{drive.description}</p>}
        <dl className="grid sm:grid-cols-2 gap-3 mt-4 text-sm">
          <div><dt className="text-xs text-slate-500">Eligibility</dt><dd className="text-slate-800">{drive.criteria.join(" · ")}</dd></div>
          <div><dt className="text-xs text-slate-500">Drive date</dt><dd className="text-slate-800">{formatDate(drive.driveDate)}</dd></div>
          <div><dt className="text-xs text-slate-500">Registration deadline</dt><dd className="text-slate-800">{formatDateTime(drive.registrationDeadline)}</dd></div>
          <div><dt className="text-xs text-slate-500">Interview process</dt><dd className="text-slate-800">{drive.process.length ? drive.process.join(" → ") : "To be announced"}</dd></div>
        </dl>
      </div>

      <div className={ui.card}>
        <h3 className="font-semibold text-slate-900 mb-2">Your registration</h3>
        <p className="text-sm text-slate-600">
          {me.name} · {me.usn} · {me.branch} · CGPA {me.cgpa} · {me.backlogs} backlog{me.backlogs === 1 ? "" : "s"}
        </p>
        <p className="text-xs text-slate-400 mt-1">Taken from your academic record. Contact the placement cell if anything is wrong.</p>
        {!me.eligibleNow && !registration && (
          <p className="text-sm text-red-700 mt-2">Not eligible: {me.reasons.join("; ")}</p>
        )}
        <div className="flex flex-wrap items-center gap-3 mt-4">
          {registration?.status === "registered" && <span className={`${ui.badge} bg-green-100 text-green-700`}>Registered {formatDateTime(registration.registeredAt)}</span>}
          {registration?.status === "withdrawn" && <span className={`${ui.badge} bg-slate-100 text-slate-600`}>Withdrawn {formatDateTime(registration.withdrawnAt)}</span>}
          {data.canRegister && me.eligibleNow && (
            <button className={ui.primary} disabled={busy} onClick={() => act("register")}>Register for drive</button>
          )}
          {data.canWithdraw && (
            <button className={ui.secondary} disabled={busy} onClick={() => act("withdraw")}>Withdraw registration</button>
          )}
          {!data.canRegister && !registration && <span className="text-sm text-slate-500">Registration is closed.</span>}
        </div>
      </div>

      {progress && (
        <div className={ui.card}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="font-semibold text-slate-900">Your progress</h3>
            <span className={`${ui.badge} ${DRIVE_OUTCOME_STYLE[progress.outcome] ?? ""}`}>
              {DRIVE_OUTCOME_LABEL[progress.outcome]}{progress.currentStage ? ` · ${progress.currentStage}` : ""}
            </span>
          </div>
          <ol className="space-y-3">
            {progress.rounds.map((r) => {
              const labels = r.isFinal ? FINAL_RESULT_LABEL : RESULT_LABEL;
              return (
                <li key={r.roundId} className={`rounded-lg border p-3 ${r.entered ? "border-slate-300" : "border-slate-100 opacity-60"}`}>
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="font-medium text-slate-800">{r.order}. {r.name}</p>
                    {r.result && r.attendance === "appeared" ? (
                      <span className={`${ui.badge} ${RESULT_STYLE[r.result]}`}>{labels[r.result]}</span>
                    ) : r.attendance === "absent" ? (
                      <span className={`${ui.badge} bg-amber-100 text-amber-700`}>{ATTENDANCE_LABEL.absent}</span>
                    ) : (
                      <span className="text-xs text-slate-400">{r.entered ? (r.roundStatus === "finalized" ? "" : "Result awaited") : "Not reached"}</span>
                    )}
                  </div>
                  {r.schedule?.date && (
                    <p className="text-xs text-slate-500 mt-1">
                      {formatDate(r.schedule.date)} {r.schedule.startTime}{r.schedule.endTime ? `–${r.schedule.endTime}` : ""} ·{" "}
                      {r.schedule.mode === "online"
                        ? r.schedule.meetingLink
                          ? <a href={r.schedule.meetingLink} target="_blank" rel="noreferrer" className="underline">Join online</a>
                          : "Online"
                        : r.schedule.venue}
                      {r.schedule.instructions && <span className="block text-slate-400">{r.schedule.instructions}</span>}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          {progress.offer && (
            <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
              Offer: {progress.offer.ctc ? `₹${progress.offer.ctc} LPA` : "package to be confirmed"}
              {progress.offer.location ? ` · ${progress.offer.location}` : ""} · {progress.offer.status || "pending"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
