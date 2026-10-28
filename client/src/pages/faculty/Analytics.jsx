import { useEffect, useState } from "react";
import api from "../../api/axios";
import {
  BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";

export default function Analytics() {
  const [filters, setFilters] = useState({ batches: [], branches: [] });
  const [batch, setBatch] = useState("");
  const [branch, setBranch] = useState("");
  const [overview, setOverview] = useState(null);
  const [branches, setBranches] = useState([]);
  const [components, setComponents] = useState([]);
  const [gaps, setGaps] = useState(null);
  const [loadingGaps, setLoadingGaps] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/faculty/filters")
      .then((r) => setFilters(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = new URLSearchParams();
    if (batch) q.set("batch", batch);
    if (branch) q.set("branch", branch);
    const qs = q.toString() ? `?${q}` : "";

    // Without these catches a single failed request left the whole page on
    // "Loading…" with an unhandled rejection in the console.
    api
      .get(`/faculty/overview${qs}`)
      .then((r) => { setOverview(r.data); setError(""); })
      .catch((e) => setError(e.response?.data?.message || "Could not load analytics"));
    api
      .get(`/faculty/components${qs}`)
      .then((r) => setComponents(r.data.components))
      .catch(() => setComponents([]));
    api
      .get(`/faculty/branches${batch ? `?batch=${batch}` : ""}`)
      .then((r) => setBranches(r.data.branches))
      .catch(() => setBranches([]));
  }, [batch, branch]);

  const loadGaps = async () => {
    setLoadingGaps(true);
    const q = new URLSearchParams();
    if (batch) q.set("batch", batch);
    if (branch) q.set("branch", branch);
    try {
      const res = await api.get(`/faculty/skill-gaps${q.toString() ? `?${q}` : ""}`);
      setGaps(res.data);
    } catch (e) {
      setGaps({ gaps: [] });
      setError(e.response?.data?.message || "Could not load skill gaps");
    } finally {
      setLoadingGaps(false);
    }
  };

  if (error && !overview)
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <p className="text-slate-500">{error}</p>
      </div>
    );
  if (!overview) return <p className="text-slate-400">Loading…</p>;

  const s = overview.summary;
  const select = "px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white";

  return (
    <div className="space-y-6">

      <div className="flex gap-3">
        <select value={batch} onChange={(e) => setBatch(e.target.value)} className={select}>
          <option value="">All batches</option>
          {filters.batches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={branch} onChange={(e) => setBranch(e.target.value)} className={select}>
          <option value="">All branches</option>
          {filters.branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {[
          ["Students", s.totalStudents],
          ["Avg PRS", s.avgPRS],
          ["Avg CGPA", s.avgCGPA],
          ["Placement Ready", `${s.placementReadyPercent}%`],
          ["Total Backlogs", s.totalBacklogs],
        ].map(([label, value]) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Readiness Distribution</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={overview.distribution}>
              <XAxis dataKey="level" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {overview.distribution.map((d) => <Cell key={d.level} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-1">Cohort Component Averages</h2>
          <p className="text-sm text-slate-500 mb-3">
            Weakest: <strong className="text-slate-700">
              {components.length ? components.reduce((a, b) => (a.value < b.value ? a : b)).component : "—"}
            </strong>
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={components}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="component" tick={{ fontSize: 11, fill: "#64748b" }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#cbd5e1" }} />
              <Radar dataKey="value" stroke="#0f172a" fill="#0f172a" fillOpacity={0.15} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Branch Comparison</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="pb-2 font-medium">Branch</th>
              <th className="pb-2 font-medium">Students</th>
              <th className="pb-2 font-medium">Avg PRS</th>
              <th className="pb-2 font-medium">Avg CGPA</th>
              <th className="pb-2 font-medium">Placement Ready</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.branch} className="border-b border-slate-100">
                <td className="py-2.5 font-medium text-slate-800">{b.branch}</td>
                <td className="py-2.5 text-slate-600">{b.students}</td>
                <td className="py-2.5 text-slate-600">{b.avgPRS}</td>
                <td className="py-2.5 text-slate-600">{b.avgCGPA}</td>
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-900 rounded-full" style={{ width: `${b.readyPercent}%` }} />
                    </div>
                    <span className="text-slate-600">{b.readyPercent}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="font-semibold text-slate-900">Cohort Skill Gaps</h2>
            <p className="text-sm text-slate-500">Most common gaps across student career targets</p>
          </div>
          {!gaps && (
            <button onClick={loadGaps} disabled={loadingGaps}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50">
              {loadingGaps ? "Analysing…" : "Run analysis"}
            </button>
          )}
        </div>

        {gaps?.available === false ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-sm text-amber-900">{gaps.message}</p>
          </div>
        ) : gaps ? (
          <>
            <p className="text-sm text-slate-500 mb-4">{gaps.studentsAnalysed} students analysed</p>
            <div className="space-y-2">
              {gaps.gaps.map((g) => (
                <div key={g.skill}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-700">{g.skill}</span>
                    <span className="text-slate-400">{g.studentsAffected} students · {g.percentAffected}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-900 rounded-full" style={{ width: `${g.percentAffected}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">
            Analysis calls the ML service for each student — click to run.
          </p>
        )}
      </div>
    </div>
  );
}