import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import { formatDate, showMetric } from "../../utils/placement";

/**
 * Students who were eligible for a drive and never registered.
 *
 * This is the one group the rest of the placement section cannot show. A
 * placement profile is built from participation records, so a student who
 * never registered has no row at all — they look exactly like a student who
 * was never eligible. The two need completely different responses: one
 * needs coaching, the other needs chasing before the next drive closes.
 *
 * Two views of the same data, because the officer asks two different
 * questions: "which drive is losing people?" and "who keeps skipping?"
 */
export default function Missed() {
  const [data, setData] = useState(null);
  const [view, setView] = useState("students");
  const [batch, setBatch] = useState("");
  const [branch, setBranch] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = new URLSearchParams();
    if (batch) q.set("batch", batch);
    if (branch) q.set("branch", branch);
    api
      .get(`/placement/missed${q.toString() ? `?${q}` : ""}`)
      .then((r) => {
        setData(r.data);
        setError("");
      })
      .catch((e) => setError(e.response?.data?.message || "Could not load this report"))
      .finally(() => setLoading(false));
  }, [batch, branch]);

  const filters = useMemo(() => {
    const rows = data?.byStudent ?? [];
    return {
      batches: [...new Set(rows.map((s) => s.batch))].filter(Boolean).sort(),
      branches: [...new Set(rows.map((s) => s.branch))].filter(Boolean).sort(),
    };
  }, [data]);

  if (error)
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <p className="text-slate-500">{error}</p>
      </div>
    );
  if (loading || !data) return <p className="text-slate-400">Loading…</p>;

  const s = data.summary;
  const select = "px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white";

  const shownStudents = data.byStudent.filter(
    (r) =>
      !search ||
      r.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.usn?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Eligible but not registered</h2>
        <p className="text-sm text-slate-500">
          Students who met a drive's criteria and were never registered for it.
          They have no participation record, so they appear nowhere else in the
          placement section.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          ["Drives considered", s.drivesConsidered],
          ["Students considered", s.studentsConsidered],
          ["Missed at least one", s.studentsWhoMissedAtLeastOne],
          ["Missed registrations", s.totalMissedSlots],
          ["Registration rate", showMetric(s.overallRegistrationPercent, "%")],
        ].map(([label, value]) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex rounded-lg border border-slate-300 overflow-hidden">
          {[
            ["students", "By student"],
            ["drives", "By drive"],
          ].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-sm transition-colors ${
                view === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "students" && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or USN…"
            className="flex-1 min-w-[180px] px-3 py-1.5 text-sm rounded-lg border border-slate-300"
          />
        )}
        <select value={batch} onChange={(e) => setBatch(e.target.value)} className={select}>
          <option value="">All batches</option>
          {filters.batches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={branch} onChange={(e) => setBranch(e.target.value)} className={select}>
          <option value="">All branches</option>
          {filters.branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {view === "students" ? (
        <div className="bg-white rounded-xl border border-slate-200 p-5 overflow-x-auto">
          <p className="text-sm text-slate-500 mb-4">
            {shownStudents.length} students, most missed first
          </p>
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-2 font-medium">Student</th>
                <th className="pb-2 font-medium">Branch</th>
                <th className="pb-2 font-medium">CGPA</th>
                <th className="pb-2 font-medium">PRS</th>
                <th className="pb-2 font-medium">Drives missed</th>
                <th className="pb-2 font-medium">Which</th>
              </tr>
            </thead>
            <tbody>
              {shownStudents.map((r) => (
                <tr key={r._id} className="border-b border-slate-100">
                  <td className="py-2.5">
                    <Link
                      to={`/placement_officer/students/${r._id}`}
                      className="text-slate-800 hover:underline"
                    >
                      {r.name}
                    </Link>
                    <p className="text-xs text-slate-400">{r.usn}</p>
                  </td>
                  <td className="py-2.5 text-slate-600">{r.branch}</td>
                  <td className="py-2.5 text-slate-600">{r.cgpa}</td>
                  <td className="py-2.5 text-slate-600">{r.prs}</td>
                  <td className="py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        r.missedCount >= 3
                          ? "bg-red-100 text-red-700"
                          : r.missedCount === 2
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {r.missedCount}
                    </span>
                  </td>
                  <td className="py-2.5 text-xs text-slate-500">
                    {r.drives.map((d) => d.company).join(", ")}
                  </td>
                </tr>
              ))}
              {!shownStudents.length && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    Every eligible student registered for every drive.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          {data.byDrive.map((d) => (
            <div key={d.driveId} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{d.company}</h3>
                  <p className="text-sm text-slate-500">
                    {d.role} · {formatDate(d.driveDate)}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    CGPA ≥ {d.eligibility?.minCgpa ?? 0} · backlogs ≤{" "}
                    {d.eligibility?.maxBacklogs ?? 0} ·{" "}
                    {d.eligibility?.branches?.length
                      ? d.eligibility.branches.join(", ")
                      : "all branches"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-900 font-medium">
                    {d.registeredCount} / {d.eligibleCount} registered
                  </p>
                  <p className="text-xs text-slate-500">
                    {showMetric(d.registrationPercent, "%")} take-up
                  </p>
                  <span
                    className={`inline-block mt-1 px-2 py-0.5 rounded text-xs ${
                      d.missedCount === 0
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {d.missedCount} missed
                  </span>
                </div>
              </div>

              {d.missedCount > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => setExpanded(expanded === d.driveId ? null : d.driveId)}
                    className="text-xs text-slate-600 underline"
                  >
                    {expanded === d.driveId ? "Hide" : "Show"} the {d.missedCount} who did not register
                  </button>
                  {expanded === d.driveId && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {d.students.map((st) => (
                        <Link
                          key={st._id}
                          to={`/placement_officer/students/${st._id}`}
                          className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 hover:bg-slate-100"
                        >
                          {st.name} · {st.usn} · {st.branch} · {st.cgpa}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {!data.byDrive.length && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <p className="text-slate-500">No drives to report on yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
