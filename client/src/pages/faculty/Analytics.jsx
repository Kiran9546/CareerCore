import { useEffect, useState } from "react";
import api from "../../api/axios";
import { chartTooltip, useChartColors } from "../../theme/theme";
import {
  BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import { PageSkeleton } from "../../components/ui/Skeleton";
import ErrorState from "../../components/ui/ErrorState";
import TiltCard from "../../motion/TiltCard";
import AnimatedNumber from "../../motion/AnimatedNumber";
import { useReducedMotion } from "../../motion/motion";

export default function Analytics() {
  const chart = useChartColors();
  const reduce = useReducedMotion();
  const anim = { isAnimationActive: !reduce, animationDuration: 800, animationEasing: "ease-out" };
  const [filters, setFilters] = useState({ batches: [], branches: [] });
  const [batch, setBatch] = useState("");
  const [branch, setBranch] = useState("");
  const [overview, setOverview] = useState(null);
  const [branches, setBranches] = useState([]);
  const [components, setComponents] = useState([]);
  const [gaps, setGaps] = useState(null);
  const [loadingGaps, setLoadingGaps] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

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
  }, [batch, branch, attempt]);

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
      <ErrorState
        message={error}
        onRetry={() => {
          setError("");
          setAttempt((a) => a + 1);
        }}
      />
    );
  if (!overview) return <PageSkeleton label="Loading analytics" />;

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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          ["Students", s.totalStudents],
          ["Avg PRS", s.avgPRS],
          ["Avg CGPA", s.avgCGPA],
          ["Placement Ready", s.placementReadyPercent, "%"],
          ["Total Backlogs", s.totalBacklogs],
        ].map(([label, value, suffix], i) => (
          <TiltCard key={label} className="rise-in bg-white rounded-xl border border-slate-200 p-4" style={{ "--i": i }}>
            <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1"><AnimatedNumber value={value} suffix={suffix} /></p>
          </TiltCard>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Readiness Distribution</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={overview.distribution}>
              <XAxis dataKey="level" tick={{ fontSize: 11, fill: chart.axis }} />
              <YAxis tick={{ fontSize: 11, fill: chart.axisMuted }} />
              <Tooltip {...chartTooltip(chart)} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} {...anim}>
                {overview.distribution.map((d) => <Cell key={d.level} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-1">Cohort Component Averages</h2>
          <p className="text-sm text-slate-500 mb-3">
            Weakest: <strong className="text-slate-700">
              {components.length ? components.reduce((a, b) => (a.value < b.value ? a : b)).component : "–"}
            </strong>
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={components}>
              <PolarGrid stroke={chart.grid} />
              <PolarAngleAxis dataKey="component" tick={{ fontSize: 11, fill: chart.axis }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: chart.gridMuted }} />
              <Tooltip {...chartTooltip(chart)} />
              <Radar name="Average" dataKey="value" stroke={chart.ink} fill={chart.ink} fillOpacity={0.15} {...anim} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Branch Comparison</h2>
        <div className="overflow-x-auto">
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
            {branches.map((b, i) => (
              <tr key={b.branch} className="border-b border-slate-100">
                <td className="py-2.5 font-medium text-slate-800">{b.branch}</td>
                <td className="py-2.5 text-slate-600">{b.students}</td>
                <td className="py-2.5 text-slate-600">{b.avgPRS}</td>
                <td className="py-2.5 text-slate-600">{b.avgCGPA}</td>
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="bar-grow h-full bg-slate-900 rounded-full" style={{ width: `${b.readyPercent}%`, "--i": i }} />
                    </div>
                    <span className="text-slate-600">{b.readyPercent}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
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
              {gaps.gaps.map((g, i) => (
                <div key={g.skill}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-700">{g.skill}</span>
                    <span className="text-slate-400">{g.studentsAffected} students · {g.percentAffected}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="bar-grow h-full bg-slate-900 rounded-full" style={{ width: `${g.percentAffected}%`, "--i": i }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">
            Analysis calls the ML service for each student. Click to run.
          </p>
        )}
      </div>
    </div>
  );
}