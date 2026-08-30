import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
} from "recharts";
import { DRIVE_STATUS_STYLE, formatDate, showMetric } from "../../utils/placement";

/**
 * Placement cell overview — the cohort funnel and where it narrows.
 *
 * Every number here is aggregated from the same driveParticipation records
 * that produce individual student profiles, so the cohort view and any
 * student's page always agree.
 */
export default function Overview() {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ batches: [], branches: [] });
  const [batch, setBatch] = useState("");
  const [branch, setBranch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/placement/students")
      .then((r) => {
        // Build filter options from the roster the officer can already see,
        // rather than adding a second endpoint for the same information.
        setFilters({
          batches: [...new Set(r.data.students.map((s) => s.batch))].sort(),
          branches: [...new Set(r.data.students.map((s) => s.branch))].sort(),
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = new URLSearchParams();
    if (batch) q.set("batch", batch);
    if (branch) q.set("branch", branch);
    api
      .get(`/placement/overview${q.toString() ? `?${q}` : ""}`)
      .then((r) => {
        setData(r.data);
        setError("");
      })
      .catch((e) =>
        setError(e.response?.data?.message || "Could not load the overview"),
      );
  }, [batch, branch]);

  if (error && !data)
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <p className="text-slate-500">{error}</p>
      </div>
    );
  if (!data) return <p className="text-slate-400">Loading…</p>;

  const s = data.summary;
  const select = "px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3">
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
        </div>
        <Link
          to="/placement_officer/drives"
          className="px-3 py-1.5 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800"
        >
          Manage drives
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          ["Students tracked", s.studentsTracked],
          ["With drive history", s.studentsWithHistory],
          ["Registrations", s.registrations],
          ["Interviews reached", s.interviewsReached],
          ["Offers", s.offers],
          ["Students placed", `${showMetric(s.placementPercent, "%")}`],
        ].map(([label, value]) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-1">Cohort funnel</h3>
          <p className="text-xs text-slate-500 mb-4">
            Counted across every recorded participation. Rounds a student never
            reached are excluded from the attempt counts.
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={s.funnel} layout="vertical" margin={{ left: 40 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="stage"
                width={130}
                tick={{ fontSize: 11 }}
              />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {s.funnel.map((_, i) => (
                  <Cell key={i} fill="#0f172a" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Stage pass rates</h3>
            <div className="space-y-3">
              {[
                ["Aptitude", s.aptitudePassPercent, s.aptitudePassed, s.aptitudeAttempts],
                ["Technical", s.technicalPassPercent, s.technicalPassed, s.technicalAttempts],
              ].map(([label, percent, passed, attempts]) => (
                <div key={label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">{label}</span>
                    <span className="text-slate-900 font-medium">
                      {showMetric(percent, "%")}
                      <span className="text-xs text-slate-400 ml-1">
                        ({passed}/{attempts})
                      </span>
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-800 rounded-full"
                      style={{ width: `${percent ?? 0}%`, transition: "width .5s ease" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Upcoming drives</h3>
            {data.upcomingDrives.length ? (
              <ul className="space-y-2">
                {data.upcomingDrives.map((d) => (
                  <li key={d._id} className="flex justify-between items-center">
                    <div>
                      <Link
                        to={`/placement_officer/drives/${d._id}`}
                        className="text-sm text-slate-800 hover:underline"
                      >
                        {d.companyName}
                      </Link>
                      <p className="text-xs text-slate-400">{d.role}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">{formatDate(d.driveDate)}</p>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] ${DRIVE_STATUS_STYLE[d.status] ?? ""}`}
                      >
                        {d.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No upcoming drives scheduled.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
