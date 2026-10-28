import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import OverallStatistics from "../../components/drive/OverallStatistics";
import PolicySetting from "../../components/drive/PolicySetting";

/**
 * Placement cell overview: placement statistics for the chosen batch and
 * branch, and the college's participation policy. Every number comes from
 * GET /placement/statistics, which counts across all drives.
 */
export default function Overview() {
  const [filters, setFilters] = useState({ batches: [], branches: [] });
  const [batch, setBatch] = useState("");
  const [branch, setBranch] = useState("");

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

  const select = "px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3">
          <select value={batch} onChange={(e) => setBatch(e.target.value)} className={select} aria-label="Batch">
            <option value="">All batches</option>
            {filters.batches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select value={branch} onChange={(e) => setBranch(e.target.value)} className={select} aria-label="Branch">
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

      <OverallStatistics batch={batch} branch={branch} />
      <PolicySetting />
    </div>
  );
}
