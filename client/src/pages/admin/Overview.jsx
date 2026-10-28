import { useEffect, useState } from "react";
import api from "../../api/axios";
import { DRIVE_STATUS_LABEL } from "../../utils/placement";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const ROLE_COLORS = {
  student: "#0f172a", faculty: "#10b981", placement_officer: "#3b82f6", admin: "#f59e0b",
};

export default function Overview() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/admin/stats")
      .then((r) => setStats(r.data))
      .catch((e) => setError(e.response?.data?.message || "Could not load stats"));
  }, []);

  if (error)
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <p className="text-slate-500">{error}</p>
      </div>
    );
  if (!stats) return <p className="text-slate-400">Loading…</p>;

  const c = stats.counts;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[
          ["Users", c.users], ["Students", c.students],
          ["Companies", c.companies], ["Drives", c.drives],
          ["Skills", c.skills], ["Career Paths", c.careerPaths],
          ["Questions", c.questions],
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
          <h2 className="font-semibold text-slate-900 mb-4">Drives by Status</h2>
          {stats.drivesByStatus.length ? (
            <div className="space-y-3 pt-2">
              {stats.drivesByStatus.map((s) => (
                <div key={s.status} className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">{DRIVE_STATUS_LABEL[s.status] ?? s.status}</span>
                  <span className="font-semibold text-slate-900">{s.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No drives yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}