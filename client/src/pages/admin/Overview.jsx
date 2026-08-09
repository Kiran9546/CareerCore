import { useEffect, useState } from "react";
import api from "../../api/axios";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const ROLE_COLORS = {
  student: "#0f172a", recruiter: "#3b82f6", faculty: "#10b981", admin: "#f59e0b",
};

export default function Overview() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/admin/stats").then((r) => setStats(r.data));
  }, []);

  if (!stats) return <p className="text-slate-400">Loading…</p>;

  const c = stats.counts;

  return (
    <div className="space-y-6">
      {stats.pendingRecruiters > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
          <p className="text-sm text-amber-900">
            {stats.pendingRecruiters} recruiter account{stats.pendingRecruiters > 1 ? "s" : ""} awaiting verification
          </p>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        {[
          ["Users", c.users], ["Students", c.students],
          ["Companies", c.companies], ["Jobs", c.jobs],
          ["Applications", c.applications], ["Skills", c.skills],
          ["Career Paths", c.careerPaths], ["Questions", c.questions],
        ].map(([label, value]) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Users by Role</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.usersByRole}>
              <XAxis dataKey="role" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {stats.usersByRole.map((r) => (
                  <Cell key={r.role} fill={ROLE_COLORS[r.role] || "#94a3b8"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Applications by Status</h2>
          {stats.applicationsByStatus.length ? (
            <div className="space-y-3 pt-2">
              {stats.applicationsByStatus.map((s) => (
                <div key={s.status} className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 capitalize">{s.status.replace("_", " ")}</span>
                  <span className="font-semibold text-slate-900">{s.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No applications yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}