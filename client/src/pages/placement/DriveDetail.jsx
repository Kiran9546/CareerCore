import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../../api/axios";
import ManagedDrive from "../../components/drive/ManagedDrive";
import {
  STAGE_LABEL,
  STAGE_STATUSES,
  FINAL_STATUSES,
  STATUS_LABEL,
  STATUS_STYLE,
  DRIVE_STATUS_STYLE,
  formatDate,
} from "../../utils/placement";
import { DetailSkeleton } from "../../components/ui/Skeleton";
import { confirmAction } from "../../components/ui/confirm";

/**
 * Participant and result management for one drive.
 *
 * The result grid is the only place in the application where an official
 * outcome is written. Two rules from the API are surfaced directly in the
 * UI so the officer is not fighting the server:
 *
 *  - A later stage cannot be set until the previous one is passed. The
 *    select is disabled with an explanation rather than allowed and then
 *    rejected.
 *  - Marking a stage failed resets the stages after it to `not_reached`,
 *    because a student who failed the aptitude round did not then sit and
 *    fail the technical one.
 */
export default function DriveDetail() {
  const { id } = useParams();
  const [workflow, setWorkflow] = useState(null);
  const [error, setError] = useState("");

  // Drives created through the recruitment workflow get the full dashboard;
  // drives recorded the original way keep the result grid below.
  useEffect(() => {
    api
      .get(`/placement/drives/${id}`)
      .then((r) => setWorkflow(r.data.drive.workflow || "recorded"))
      .catch((e) => setError(e.response?.data?.message || "Could not load this drive"));
  }, [id]);

  if (error) return <p className="text-slate-500">{error}</p>;
  if (!workflow) return <DetailSkeleton label="Loading drive" />;
  return workflow === "managed" ? <ManagedDrive key={id} id={id} /> : <RecordedDriveDetail key={id} id={id} />;
}

function RecordedDriveDetail({ id }) {
  const [drive, setDrive] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [eligible, setEligible] = useState([]);
  const [picked, setPicked] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingId, setSavingId] = useState(null);

  const loadParticipants = useCallback(() => {
    api
      .get(`/placement/drives/${id}/participants`)
      .then((r) => {
        setDrive(r.data.drive);
        setParticipants(r.data.participants);
      })
      .catch((e) =>
        setError(e.response?.data?.message || "Could not load this drive"),
      );
  }, [id]);

  const loadEligible = useCallback(() => {
    api
      .get(`/placement/drives/${id}/eligible`)
      .then((r) => setEligible(r.data.students))
      .catch(() => setEligible([]));
  }, [id]);

  useEffect(loadParticipants, [loadParticipants]);
  useEffect(() => {
    if (showAdd) loadEligible();
  }, [showAdd, loadEligible]);

  const runsStage = (stage) => drive?.stages?.includes(stage);

  /** Ordered stages this drive actually runs — mirrors Drive.orderedStages(). */
  const orderedStages = ["aptitude", "technical", "interview", "final"].filter(
    (s) => runsStage(s),
  );

  /**
   * A stage is editable only once the previous stage it runs has been
   * passed. The first stage is always editable.
   */
  const canEdit = (p, stage) => {
    const i = orderedStages.indexOf(stage);
    if (i <= 0) return true;
    return p.stages[orderedStages[i - 1]]?.status === "passed";
  };

  const setStage = async (p, stage, status) => {
    setError("");
    setNotice("");
    setSavingId(`${p._id}:${stage}`);
    try {
      await api.patch(`/placement/participations/${p._id}/stage`, {
        stage,
        status,
      });
      loadParticipants();
      setNotice(`${STAGE_LABEL[stage]} result recorded`);
    } catch (e) {
      setError(e.response?.data?.message || "Could not record the result");
    } finally {
      setSavingId(null);
    }
  };

  const registerPicked = async () => {
    setError("");
    setNotice("");
    try {
      const res = await api.post(`/placement/drives/${id}/participants`, {
        studentIds: picked,
      });
      setNotice(res.data.message);
      setPicked([]);
      setShowAdd(false);
      loadParticipants();
    } catch (e) {
      setError(e.response?.data?.message || "Could not register participants");
    }
  };

  const removeParticipant = async (p) => {
    if (!(await confirmAction(`Remove ${p.student?.name ?? p.name ?? "this student"} from the drive? Their recorded results for it are removed too.`))) return;
    setError("");
    setNotice("");
    try {
      await api.delete(`/placement/participations/${p._id}`);
      setNotice("Participant removed");
      loadParticipants();
    } catch (e) {
      setError(e.response?.data?.message || "Could not remove the participant");
    }
  };

  if (error && !drive)
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <p className="text-slate-500">{error}</p>
        <Link
          to="/placement-officer/drives"
          className="inline-block mt-4 text-sm text-slate-700 underline"
        >
          Back to drives
        </Link>
      </div>
    );
  if (!drive) return <DetailSkeleton label="Loading drive" />;

  const shownEligible = eligible.filter(
    (s) =>
      !search ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.usn?.toLowerCase().includes(search.toLowerCase()),
  );

  const offers = participants.filter(
    (p) => p.stages.final?.status === "selected",
  ).length;

  return (
    <div className="space-y-5">
      <Link
        to="/placement-officer/drives"
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← All drives
      </Link>

      {/* ── Drive header ───────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{drive.companyName}</h2>
            <p className="text-sm text-slate-500">
              {drive.role} · {formatDate(drive.driveDate)}
              {drive.location ? ` · ${drive.location}` : ""}
              {drive.ctc ? ` · ₹${drive.ctc} LPA` : ""}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              CGPA ≥ {drive.eligibility?.minCgpa ?? 0} · backlogs ≤{" "}
              {drive.eligibility?.maxBacklogs ?? 0} ·{" "}
              {drive.eligibility?.branches?.length
                ? drive.eligibility.branches.join(", ")
                : "all branches"}
            </p>
          </div>
          <div className="text-right">
            <span
              className={`px-2.5 py-1 rounded text-xs font-medium ${DRIVE_STATUS_STYLE[drive.status] ?? ""}`}
            >
              {drive.status}
            </span>
            <p className="text-xs text-slate-500 mt-2">
              {participants.length} participants · {offers} offers
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Stages: {orderedStages.map((s) => STAGE_LABEL[s]).join(" → ")}
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {notice && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
          <p className="text-sm text-green-700">{notice}</p>
        </div>
      )}

      {/* ── Register participants ──────────────────────────── */}
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-slate-900">Participants & results</h3>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="px-3 py-1.5 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800"
        >
          {showAdd ? "Close" : "Register students"}
        </button>
      </div>

      {showAdd && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex gap-3 items-center mb-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search eligible students by name or USN…"
              className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300"
            />
            <button
              onClick={registerPicked}
              disabled={!picked.length}
              className="px-3 py-1.5 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
            >
              Register {picked.length || ""}
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Only students meeting this drive's eligibility criteria are listed,
            and eligibility is re-checked on the server when they are registered.
          </p>
          <div className="max-h-72 overflow-y-auto">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="sticky top-0 z-10 bg-white pb-2 font-medium w-8"></th>
                  <th className="sticky top-0 z-10 bg-white pb-2 font-medium">Student</th>
                  <th className="sticky top-0 z-10 bg-white pb-2 font-medium">Branch</th>
                  <th className="sticky top-0 z-10 bg-white pb-2 font-medium">CGPA</th>
                  <th className="sticky top-0 z-10 bg-white pb-2 font-medium">Backlogs</th>
                  <th className="sticky top-0 z-10 bg-white pb-2 font-medium">PRS</th>
                </tr>
              </thead>
              <tbody>
                {shownEligible.map((s) => (
                  <tr
                    key={s._id}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() =>
                      setPicked((p) =>
                        p.includes(s._id)
                          ? p.filter((x) => x !== s._id)
                          : [...p, s._id],
                      )
                    }
                  >
                    <td className="py-2">
                      <input
                        type="checkbox"
                        readOnly
                        checked={picked.includes(s._id)}
                        className="pointer-events-none"
                      />
                    </td>
                    <td className="py-2">
                      <p className="text-slate-800">{s.name}</p>
                      <p className="text-xs text-slate-400">{s.usn}</p>
                    </td>
                    <td className="py-2 text-slate-600">{s.branch}</td>
                    <td className="py-2 text-slate-600">{s.cgpa}</td>
                    <td className="py-2 text-slate-600">{s.backlogs}</td>
                    <td className="py-2 text-slate-900 font-medium">{s.prs}</td>
                  </tr>
                ))}
                {!shownEligible.length && (
                  <tr>
                    <td colSpan={6} className="py-4 text-slate-400 text-sm">
                      No eligible students left to register.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Result grid ────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="pb-2 font-medium">Student</th>
              <th className="pb-2 font-medium">CGPA</th>
              <th className="pb-2 font-medium">PRS</th>
              {orderedStages.map((s) => (
                <th key={s} className="pb-2 font-medium">
                  {STAGE_LABEL[s]}
                </th>
              ))}
              <th className="pb-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={p._id} className="border-b border-slate-100">
                <td className="py-2.5">
                  <p className="text-slate-800">{p.student.name}</p>
                  <p className="text-xs text-slate-400">
                    {p.student.usn} · {p.student.branch}
                  </p>
                </td>
                <td className="py-2.5 text-slate-600">{p.student.cgpa}</td>
                <td className="py-2.5 text-slate-900 font-medium">{p.student.prs}</td>

                {orderedStages.map((stage) => {
                  const options = stage === "final" ? FINAL_STATUSES : STAGE_STATUSES;
                  const status = p.stages[stage]?.status ?? "not_reached";
                  const editable = canEdit(p, stage);
                  const saving = savingId === `${p._id}:${stage}`;

                  return (
                    <td key={stage} className="py-2.5">
                      <select
                        value={status}
                        disabled={!editable || saving}
                        onChange={(e) => setStage(p, stage, e.target.value)}
                        title={
                          editable
                            ? undefined
                            : `Locked: the student has not cleared the ${
                                STAGE_LABEL[
                                  orderedStages[orderedStages.indexOf(stage) - 1]
                                ]
                              } stage`
                        }
                        className={`px-2 py-1 text-xs rounded border ${
                          editable
                            ? "border-slate-300 bg-white"
                            : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        {options.map((o) => (
                          <option key={o} value={o}>
                            {STATUS_LABEL[o]}
                          </option>
                        ))}
                      </select>
                      <span
                        className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${STATUS_STYLE[status] ?? ""}`}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                    </td>
                  );
                })}

                <td className="py-2.5 text-right whitespace-nowrap">
                  <Link
                    to={`/placement-officer/students/${p.student._id}`}
                    className="text-xs text-slate-600 hover:text-slate-900 underline mr-3"
                  >
                    Profile
                  </Link>
                  <button
                    onClick={() => removeParticipant(p)}
                    className="text-xs text-red-600 hover:text-red-800 underline"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {!participants.length && (
              <tr>
                <td
                  colSpan={4 + orderedStages.length}
                  className="py-6 text-center text-slate-400"
                >
                  No students registered for this drive yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="text-xs text-slate-400 mt-4">
          Marking a stage failed resets the stages after it to “Not reached”.
          Rounds a student never reached are never counted as attempts in their
          placement profile.
        </p>
      </div>
    </div>
  );
}
