import { useEffect, useState } from "react";
import api from "../../api/axios";
import { chartTooltip, useChartColors } from "../../theme/theme";
import { DRIVE_STATUS_LABEL } from "../../utils/placement";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { PageSkeleton } from "../../components/ui/Skeleton";
import ErrorState from "../../components/ui/ErrorState";
import TiltCard from "../../motion/TiltCard";
import AnimatedNumber from "../../motion/AnimatedNumber";
import { useReducedMotion } from "../../motion/motion";

const ROLE_COLORS = {
  student: "#0f172a", faculty: "#10b981", placement_officer: "#3b82f6", admin: "#f59e0b",
};

export default function Overview() {
  const chart = useChartColors();
  const reduce = useReducedMotion();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    api
      .get("/admin/stats")
      .then((r) => {
        setStats(r.data);
        setError("");
      })
      .catch((e) => setError(e.response?.data?.message || "Could not load stats"));
  }, [attempt]);

  if (error && !stats)
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setError("");
          setAttempt((a) => a + 1);
        }}
      />
    );
  if (!stats) return <PageSkeleton label="Loading statistics" />;

  const c = stats.counts;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ["Users", c.users], ["Students", c.students],
          ["Companies", c.companies], ["Drives", c.drives],
          ["Skills", c.skills], ["Career Paths", c.careerPaths],
          ["Questions", c.questions],
        ].map(([label, value], i) => (
          <TiltCard key={label} className="rise-in bg-white rounded-xl border border-slate-200 p-4" style={{ "--i": i }}>
            <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1"><AnimatedNumber value={value} /></p>
          </TiltCard>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Users by Role</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.usersByRole}>
              <XAxis dataKey="role" tick={{ fontSize: 11, fill: chart.axis }} />
              <YAxis tick={{ fontSize: 11, fill: chart.axisMuted }} />
              <Tooltip {...chartTooltip(chart)} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={!reduce} animationDuration={800} animationEasing="ease-out">
                {stats.usersByRole.map((r) => (
                  <Cell key={r.role} fill={r.role === "student" ? chart.ink : ROLE_COLORS[r.role] || "#94a3b8"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Drives by Status</h2>
          {stats.drivesByStatus.length ? (
            <div className="space-y-3 pt-2">
              {stats.drivesByStatus.map((s, i) => {
                // Share of all drives, from the same counts.
                const total = stats.drivesByStatus.reduce((a, b) => a + b.count, 0) || 1;
                return (
                  <div key={s.status}>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">{DRIVE_STATUS_LABEL[s.status] ?? s.status}</span>
                      <span className="font-semibold text-slate-900"><AnimatedNumber value={s.count} /></span>
                    </div>
                    <div className="mt-1.5 h-1 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
                      <div className="bar-grow h-full rounded-full bg-slate-900" style={{ width: `${(s.count / total) * 100}%`, "--i": i }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No drives yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}