import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import { DRIVE_STATUS_LABEL, DRIVE_STATUS_STYLE, formatDate, showMetric, ui } from "../../utils/placement";
import { Skeleton, SkeletonRows } from "../ui/Skeleton";
import TiltCard from "../../motion/TiltCard";
import AnimatedNumber from "../../motion/AnimatedNumber";
import RecruitmentPipeline from "./RecruitmentPipeline";
import ErrorState from "../ui/ErrorState";

/** The statistics layout in grey, so nothing jumps when the numbers arrive. */
function StatisticsSkeleton() {
  return (
    <div role="status" aria-label="Loading placement statistics" className="space-y-5">
      <Skeleton className="h-4 w-48" />
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
            <Skeleton className="h-7 w-12" />
            <Skeleton className="mt-2 h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
            <Skeleton className="h-4 w-36" />
            <SkeletonRows rows={4} className="mt-5" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Placement statistics across every drive — recorded and recruitment
 * workflow alike — for the batch/branch chosen on the Overview page, with an
 * optional company filter. Placed students are counted once however many
 * offers they hold; the server returns its definitions and they are shown.
 */
export default function OverallStatistics({ batch, branch }) {
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    api.get("/placement/companies?limit=200").then((r) => setCompanies(r.data.companies)).catch(() => {});
  }, []);

  useEffect(() => {
    const q = new URLSearchParams();
    if (batch) q.set("batch", batch);
    if (branch) q.set("branch", branch);
    if (companyId) q.set("companyId", companyId);
    api
      .get(`/placement/statistics?${q}`)
      .then((r) => {
        setData(r.data);
        setError("");
      })
      .catch((e) => setError(e.response?.data?.message || "Could not load placement statistics"));
  }, [batch, branch, companyId, attempt]);

  if (error)
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setError("");
          setAttempt((a) => a + 1);
        }}
      />
    );
  if (!data) return <StatisticsSkeleton />;
  const t = data.totals;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Placement statistics{batch ? ` (batch ${batch})` : ""}</h3>
          <p className="text-xs text-slate-500">{data.definitions.population}</p>
        </div>
        <select className={ui.select} value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Company">
          <option value="">All companies</option>
          {companies.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          ["Total students", t.totalStudents],
          ["Students placed", t.placedStudents],
          ["Placement %", t.placementPercentage, "%"],
          ["Companies visited", t.companiesVisited],
          ["Active drives", t.activeDrives],
          ["In recruitment now", t.studentsInRecruitment],
          ["Final selections", t.finalSelections],
        ].map(([label, value, suffix], i) => (
          <TiltCard key={label} className="rise-in bg-white rounded-xl border border-slate-200 p-4" style={{ "--i": i }}>
            <p className="text-2xl font-bold text-slate-900">
              <AnimatedNumber value={value} suffix={value === null || value === undefined ? "" : suffix} />
            </p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </TiltCard>
        ))}
      </div>

      <RecruitmentPipeline totals={t} definitions={data.definitions} />

      <div className="grid lg:grid-cols-3 gap-5">
        <div className={ui.card}>
          <h4 className="font-semibold text-slate-900 mb-3">Branch-wise placement</h4>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500 border-b border-slate-200"><th className="pb-2 font-medium">Branch</th><th className="pb-2 font-medium text-right">Students</th><th className="pb-2 font-medium text-right">Placed</th><th className="pb-2 font-medium text-right">%</th></tr></thead>
            <tbody>
              {data.branchWise.map((b) => (
                <tr key={b.branch} className="border-b border-slate-100">
                  <td className="py-2">{b.branch}</td><td className="py-2 text-right">{b.total}</td><td className="py-2 text-right">{b.placed}</td><td className="py-2 text-right">{showMetric(b.percentage, "%")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        <div className={ui.card}>
          <h4 className="font-semibold text-slate-900 mb-3">Company-wise selections</h4>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500 border-b border-slate-200"><th className="pb-2 font-medium">Company</th><th className="pb-2 font-medium text-right">Drives</th><th className="pb-2 font-medium text-right">Selected</th><th className="pb-2 font-medium text-right">Top CTC</th></tr></thead>
            <tbody>
              {data.companyWise.map((c) => (
                <tr key={`${c.companyId || c.company}`} className="border-b border-slate-100">
                  <td className="py-2">{c.company}</td><td className="py-2 text-right">{c.drives}</td><td className="py-2 text-right font-medium">{c.selections}</td><td className="py-2 text-right">{c.highestCtc ? `₹${c.highestCtc}` : "–"}</td>
                </tr>
              ))}
              {!data.companyWise.length && <tr><td colSpan={4} className="py-4 text-center text-slate-400">No drives yet.</td></tr>}
            </tbody>
          </table>
          </div>
        </div>

        <div className={`${ui.card} space-y-4`}>
          <div>
            <h4 className="font-semibold text-slate-900 mb-2">Offers</h4>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-500">Total offers</dt><dd className="text-right">{data.offers.total}</dd>
              <dt className="text-slate-500">Accepted</dt><dd className="text-right">{data.offers.accepted}</dd>
              <dt className="text-slate-500">Average CTC</dt><dd className="text-right">{showMetric(data.offers.averageCtc, " LPA")}</dd>
              <dt className="text-slate-500">Median CTC</dt><dd className="text-right">{showMetric(data.offers.medianCtc, " LPA")}</dd>
              <dt className="text-slate-500">Highest CTC</dt><dd className="text-right">{showMetric(data.offers.highestCtc, " LPA")}</dd>
            </dl>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 mb-2">Active drives</h4>
            <ul className="space-y-1.5">
              {data.activeDrives.map((d) => (
                <li key={d._id} className="text-sm flex justify-between gap-2">
                  <Link to={`/placement-officer/drives/${d._id}`} className="text-slate-800 hover:underline">{d.companyName} · {d.role}</Link>
                  <span className={`${ui.badge} ${DRIVE_STATUS_STYLE[d.status] ?? ""}`}>{DRIVE_STATUS_LABEL[d.status]}</span>
                </li>
              ))}
              {!data.activeDrives.length && <li className="text-sm text-slate-400">None right now.</li>}
            </ul>
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-400">{data.definitions.placed}. {data.definitions.inRecruitment}. Updated {formatDate(new Date())}.</p>
    </div>
  );
}
