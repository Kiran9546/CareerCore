import { useEffect, useState } from "react";
import api from "../../api/axios";

const LEVEL_STYLE = {
  "Not Ready": "bg-red-100 text-red-700",
  "Developing": "bg-amber-100 text-amber-700",
  "Placement Ready": "bg-green-100 text-green-700",
  "Highly Ready": "bg-emerald-100 text-emerald-700",
};

export default function Students() {
  const [filters, setFilters] = useState({ batches: [], branches: [] });
  const [batch, setBatch] = useState("");
  const [branch, setBranch] = useState("");
  const [level, setLevel] = useState("");
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");

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
    if (level) q.set("level", level);
    api.get(`/faculty/students${q.toString() ? `?${q}` : ""}`)
      .then((r) => setStudents(r.data.students))
      .catch(() => setStudents([]));
  }, [batch, branch, level]);

  const shown = students.filter((s) =>
    !search ||
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.usn?.toLowerCase().includes(search.toLowerCase())
  );

  const select = "px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white";

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or USN…"
          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300" />
        <select value={batch} onChange={(e) => setBatch(e.target.value)} className={select}>
          <option value="">All batches</option>
          {filters.batches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={branch} onChange={(e) => setBranch(e.target.value)} className={select}>
          <option value="">All branches</option>
          {filters.branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className={select}>
          <option value="">All levels</option>
          {Object.keys(LEVEL_STYLE).map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-sm text-slate-500 mb-4">{shown.length} students</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="pb-2 font-medium">Student</th>
              <th className="pb-2 font-medium">Branch</th>
              <th className="pb-2 font-medium">CGPA</th>
              <th className="pb-2 font-medium">Backlogs</th>
              <th className="pb-2 font-medium">Skills</th>
              <th className="pb-2 font-medium">Target</th>
              <th className="pb-2 font-medium">PRS</th>
              <th className="pb-2 font-medium">Level</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s._id} className="border-b border-slate-100">
                <td className="py-2.5">
                  <p className="text-slate-800">{s.name}</p>
                  <p className="text-xs text-slate-400">{s.usn}</p>
                </td>
                <td className="py-2.5 text-slate-600">{s.branch}</td>
                <td className="py-2.5 text-slate-600">{s.cgpa}</td>
                <td className="py-2.5 text-slate-600">{s.backlogs}</td>
                <td className="py-2.5 text-slate-600">{s.skillCount}</td>
                <td className="py-2.5 text-slate-500 text-xs">{s.careerInterest || "—"}</td>
                <td className="py-2.5 font-semibold text-slate-900">{s.prs}</td>
                <td className="py-2.5">
                  <span className={`px-2 py-0.5 rounded text-xs ${LEVEL_STYLE[s.readinessLevel] || ""}`}>
                    {s.readinessLevel}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}