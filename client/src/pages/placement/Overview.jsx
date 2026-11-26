import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import OverallStatistics from "../../components/drive/OverallStatistics";
import PolicySetting from "../../components/drive/PolicySetting";

/**
 * Placement cell overview: placement statistics for the chosen batch, branch
 * and company, and the college's participation policy. Every number comes
 * from GET /placement/statistics, which counts across all drives.
 */
export default function Overview() {
  const [filters, setFilters] = useState({ batches: [], branches: [] });
  const [companies, setCompanies] = useState([]);
  const [batch, setBatch] = useState("");
  const [branch, setBranch] = useState("");
  const [companyId, setCompanyId] = useState("");

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
    api
      .get("/placement/companies?limit=200")
      .then((r) => setCompanies(r.data.companies))
      .catch(() => {});
  }, []);

  const select = "min-w-0 max-w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-2xl text-sm text-slate-600">
          Placement results, offers, branch and company performance, and the drives running now
          {batch ? ` for the ${batch} batch` : ""}.
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
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
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${select} sm:max-w-64`} aria-label="Company">
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
          <Link
            to="/placement-officer/drives"
            className="px-3 py-1.5 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800"
          >
            Manage drives
          </Link>
        </div>
      </div>

      <OverallStatistics batch={batch} branch={branch} companyId={companyId} />
      <PolicySetting />
    </div>
  );
}
