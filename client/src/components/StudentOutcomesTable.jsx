import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { downloadPlacementExport } from "../utils/download";

/**
 * The placement cell's student roster — one row per student, showing how far
 * each got in every round.
 *
 * There is deliberately no PRS column here. The readiness score belongs to
 * the profile side of the system and is still shown on the individual
 * profile and in the comparison, where contrasting it against the outcome is
 * the whole point. On this list it competed for attention with what the
 * officer is actually scanning for — which round each student is stuck at —
 * so the columns are the rounds themselves.
 *
 * Each round cell reads `cleared / attempted`, and shows a dash when the
 * round was never reached. A dash is not a zero: it means the student never
 * sat that round, so there is nothing to have passed or failed.
 */

/** cleared / attempted, or a dash when the round was never reached. */
const RoundCell = ({ passed, attempts }) => {
  if (!attempts) {
    return (
      <td
        className="py-2.5 text-slate-300"
        title="Never reached this round — not counted as an attempt"
      >
        —
      </td>
    );
  }
  const all = passed === attempts;
  const none = passed === 0;
  return (
    <td className="py-2.5">
      <span
        className={`font-medium ${
          all ? "text-green-700" : none ? "text-red-700" : "text-slate-700"
        }`}
      >
        {passed}/{attempts}
      </span>
    </td>
  );
};

export default function StudentOutcomesTable({ basePath }) {
  const [students, setStudents] = useState([]);
  const [batch, setBatch] = useState("");
  const [branch, setBranch] = useState("");
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams();
    if (batch) q.set("batch", batch);
    if (branch) q.set("branch", branch);
    api
      .get(`/placement/students${q.toString() ? `?${q}` : ""}`)
      .then((r) => {
        setStudents(r.data.students);
        setError("");
      })
      .catch((e) =>
        setError(e.response?.data?.message || "Could not load students"),
      )
      .finally(() => setLoading(false));
  }, [batch, branch]);

  // Filter options come from the loaded roster rather than a second request.
  const filters = useMemo(
    () => ({
      batches: [...new Set(students.map((s) => s.batch))].sort(),
      branches: [...new Set(students.map((s) => s.branch))].sort(),
    }),
    [students],
  );

  const shown = students.filter((s) => {
    if (
      search &&
      !s.name?.toLowerCase().includes(search.toLowerCase()) &&
      !s.usn?.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    if (outcome === "placed" && s.offers === 0) return false;
    if (outcome === "unplaced" && s.offers > 0) return false;
    if (outcome === "no_history" && s.drives > 0) return false;
    if (outcome === "attended" && s.drives === 0) return false;
    // "Stuck at X" means they sat that round and have never cleared it —
    // students who never reached it are a different problem and excluded.
    if (
      outcome === "stuck_aptitude" &&
      !(s.aptitudeAttempts > 0 && s.aptitudePassed === 0)
    )
      return false;
    if (
      outcome === "stuck_technical" &&
      !(s.technicalAttempts > 0 && s.technicalPassed === 0)
    )
      return false;
    return true;
  });

  const exportSheet = async () => {
    setExporting(true);
    setError("");
    try {
      await downloadPlacementExport({ batch, branch });
    } catch (e) {
      setError(e.message || "Could not build the export");
    } finally {
      setExporting(false);
    }
  };

  const select = "px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or USN…"
          className="flex-1 min-w-[180px] px-3 py-1.5 text-sm rounded-lg border border-slate-300"
        />
        <select value={batch} onChange={(e) => setBatch(e.target.value)} className={select}>
          <option value="">All batches</option>
          {filters.batches.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <select value={branch} onChange={(e) => setBranch(e.target.value)} className={select}>
          <option value="">All branches</option>
          {filters.branches.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={select}>
          <option value="">All outcomes</option>
          <option value="placed">Has an offer</option>
          <option value="unplaced">No offer</option>
          <option value="stuck_aptitude">Stuck at aptitude</option>
          <option value="stuck_technical">Stuck at technical</option>
          <option value="attended">Attended a drive</option>
          <option value="no_history">No drive history</option>
        </select>
        <Link
          to={`${basePath}/compare`}
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
        >
          Compare
        </Link>
        <button
          onClick={exportSheet}
          disabled={exporting}
          className="px-3 py-1.5 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {exporting ? "Building…" : "Download Excel"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 overflow-x-auto">
        <p className="text-sm text-slate-500 mb-4">
          {loading ? "Loading…" : `${shown.length} students`}
          <span className="text-slate-400">
            {" "}· each round shows cleared / attempted. A dash means the round
            was never reached, which is not a failure.
          </span>
        </p>
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="pb-2 font-medium">Student</th>
              <th className="pb-2 font-medium">Branch</th>
              <th className="pb-2 font-medium">CGPA</th>
              <th className="pb-2 font-medium">Drives</th>
              <th className="pb-2 font-medium">Aptitude</th>
              <th className="pb-2 font-medium">Technical</th>
              <th className="pb-2 font-medium">Interview</th>
              <th className="pb-2 font-medium">Offers</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s._id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2.5">
                  <Link
                    to={`${basePath}/students/${s._id}`}
                    className="text-slate-800 hover:underline"
                  >
                    {s.name}
                  </Link>
                  <p className="text-xs text-slate-400">{s.usn}</p>
                </td>
                <td className="py-2.5 text-slate-600">{s.branch}</td>
                <td className="py-2.5 text-slate-600">{s.cgpa}</td>
                <td className="py-2.5 text-slate-600">{s.drives}</td>

                <RoundCell passed={s.aptitudePassed} attempts={s.aptitudeAttempts} />
                <RoundCell passed={s.technicalPassed} attempts={s.technicalAttempts} />
                <RoundCell passed={s.interviewsPassed} attempts={s.interviewsReached} />

                <td className="py-2.5 font-semibold text-slate-900">{s.offers}</td>
                <td className="py-2.5">
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${
                      s.offers > 0
                        ? "bg-emerald-100 text-emerald-700"
                        : s.drives > 0
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {s.offers > 0 ? "Placed" : s.drives > 0 ? "Unplaced" : "No history"}
                  </span>
                </td>
              </tr>
            ))}
            {!loading && !shown.length && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-slate-400">
                  No students match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
