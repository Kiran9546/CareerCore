import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import { DRIVE_STATUS_LABEL, DRIVE_STATUS_STYLE, formatDate, formatDateTime, ui } from "../../utils/placement";
import { Skeleton, SkeletonRows } from "../ui/Skeleton";
import AnimatedNumber from "../../motion/AnimatedNumber";
import ErrorState from "../ui/ErrorState";

// ─── Formatting (presentation only; every value comes from the API) ───

/** "8.6%" — always one decimal, "–" when there is no population to divide by. */
const formatPercent = (v) => (typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(1)}%` : "–");
/** "₹8.5 LPA" — CTC is recorded in lakhs per annum. */
const formatLpa = (v) =>
  typeof v === "number" && Number.isFinite(v)
    ? `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })} LPA`
    : "–";
/** The same figure for a headline card: the unit smaller, never wrapping. */
const LpaValue = ({ v }) =>
  typeof v === "number" && Number.isFinite(v) ? (
    <span className="whitespace-nowrap">
      ₹{v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}{" "}
      <span className="text-sm font-medium text-slate-500">LPA</span>
    </span>
  ) : (
    "–"
  );

const COMPANY_ROWS = 8;
const DRIVE_ROWS = 8;

/** Open drives first (soonest deadline first), then the later stages. */
const STATUS_ORDER = { open: 0, planned: 1, registration_closed: 2, in_progress: 3, ongoing: 4 };
const sortActiveDrives = (drives) =>
  [...drives].sort((a, b) => {
    const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (s) return s;
    const da = new Date(a.registrationDeadline || a.driveDate || 8.64e15).getTime();
    const db = new Date(b.registrationDeadline || b.driveDate || 8.64e15).getTime();
    return da - db || String(a.companyName).localeCompare(String(b.companyName));
  });

// ─── Building blocks ─────────────────────────────────────────────────

// Phones: tighter padding and headers may wrap, so no column is pushed out of view.
const th = "px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-4 sm:whitespace-nowrap";
const td = "px-3 py-3 align-middle sm:px-4";
const num = "text-right tabular-nums whitespace-nowrap";

function Section({ id, title, description, action, children }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={id} className="text-base font-semibold text-slate-900">{title}</h2>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, note, children, i = 0 }) {
  return (
    <div className="rise-in flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white px-4 py-3.5" style={{ "--i": i }}>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{value}</p>
      {children}
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

/** A thin bar for a percentage; the exact figure is always shown beside it. */
function PercentBar({ value, className = "" }) {
  const w = typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-slate-100 ${className}`} aria-hidden="true">
      <div className="bar-grow h-full rounded-full bg-emerald-600" style={{ width: `${w}%` }} />
    </div>
  );
}

function TableCard({ children }) {
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="overflow-x-auto">{children}</div></div>;
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${DRIVE_STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600"}`}>
      {DRIVE_STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** The statistics layout in grey, so nothing jumps when the numbers arrive. */
function StatisticsSkeleton() {
  const cards = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white px-4 py-3.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-2 h-7 w-16" />
        </div>
      ))}
    </div>
  );
  return (
    <div role="status" aria-label="Loading placement statistics" className="space-y-8">
      {cards}
      {cards}
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
          <Skeleton className="h-4 w-40" />
          <SkeletonRows rows={4} className="mt-5" />
        </div>
      ))}
    </div>
  );
}

/**
 * Placement statistics across every drive — recorded and recruitment
 * workflow alike — for the batch, branch and company chosen on the Overview
 * page. Placed students are counted once however many offers they hold; the
 * server returns its definitions and they are shown. Every figure here is
 * exactly what GET /placement/statistics returned: this component only lays
 * it out and formats it.
 */
export default function OverallStatistics({ batch, branch, companyId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [allCompanies, setAllCompanies] = useState(false);

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
  const o = data.offers;
  const companies = data.companyWise;
  const shownCompanies = allCompanies ? companies : companies.slice(0, COMPANY_ROWS);
  const drives = sortActiveDrives(data.activeDrives);
  const shownDrives = drives.slice(0, DRIVE_ROWS);
  const pctText = formatPercent(t.placementPercentage);

  return (
    <div className="space-y-8">
      {/* ── Placement performance ── */}
      <Section id="stats-performance" title="Placement performance" description={data.definitions.population}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <StatCard i={0} label="Total students" value={<AnimatedNumber value={t.totalStudents} />} />
          <StatCard i={1} label="Students placed" value={<AnimatedNumber value={t.placedStudents} />} note="With at least one final selection" />
          <StatCard
            i={2}
            label="Placement rate"
            value={pctText === "–" ? "–" : <AnimatedNumber value={t.placementPercentage.toFixed(1)} suffix="%" />}
          >
            <PercentBar value={t.placementPercentage} className="mt-2" />
          </StatCard>
          <StatCard i={3} label="Companies visited" value={<AnimatedNumber value={t.companiesVisited} />} note={`${t.totalDrives} ${t.totalDrives === 1 ? "drive" : "drives"} published`} />
          <StatCard
            i={4}
            label="Active drives"
            value={<AnimatedNumber value={t.activeDrives} />}
            note={`${t.studentsInRecruitment} ${t.studentsInRecruitment === 1 ? "student" : "students"} in recruitment now`}
          />
        </div>
      </Section>

      {/* ── Offers ── */}
      <Section id="stats-offers" title="Offers and compensation" description="Final selections across all drives. CTC is in lakhs per annum, over offers with a recorded CTC.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <StatCard i={5} label="Total offers" value={<AnimatedNumber value={o.total} />} note="A student may hold more than one" />
          <StatCard i={6} label="Accepted offers" value={<AnimatedNumber value={o.accepted} />} note={`of ${o.total} ${o.total === 1 ? "offer" : "offers"}`} />
          <StatCard i={7} label="Average CTC" value={<LpaValue v={o.averageCtc} />} />
          <StatCard i={8} label="Median CTC" value={<LpaValue v={o.medianCtc} />} />
          <StatCard i={9} label="Highest CTC" value={<LpaValue v={o.highestCtc} />} />
        </div>
      </Section>

      {/* ── Branch-wise ── */}
      <Section id="stats-branches" title="Branch-wise placement" description="Placed students as a share of each branch's students.">
        <TableCard>
          <table className="w-full text-sm">
            <caption className="sr-only">Placement by branch</caption>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th scope="col" className={`${th} text-left`}>Branch</th>
                <th scope="col" className={`${th} text-right`}>Students</th>
                <th scope="col" className={`${th} text-right`}>Placed</th>
                <th scope="col" className={`${th} text-left w-1/2`}>Placement rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.branchWise.map((b) => (
                <tr key={b.branch} className="hover:bg-slate-50">
                  <th scope="row" className={`${td} text-left font-medium text-slate-900 whitespace-nowrap`}>{b.branch}</th>
                  <td className={`${td} ${num} text-slate-700`}>{b.total}</td>
                  <td className={`${td} ${num} text-slate-700`}>{b.placed}</td>
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      {/* The bar needs room; on phones the exact figure alone is clearer. */}
                      <PercentBar value={b.percentage} className="hidden min-w-16 flex-1 sm:block" />
                      <span className="shrink-0 text-right font-medium text-slate-900 tabular-nums sm:w-14">{formatPercent(b.percentage)}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {!data.branchWise.length && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No students match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </TableCard>
      </Section>

      {/* ── Company-wise ── */}
      <Section id="stats-companies" title="Company-wise selections" description="Every company with a published drive, by students selected.">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {/* Phones: one row per company instead of four squeezed columns. */}
          <ul className="divide-y divide-slate-100 sm:hidden">
            {shownCompanies.map((c) => (
              <li key={`${c.companyId || c.company}`} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium text-slate-900 wrap-break-word">{c.company}</p>
                  <p className="shrink-0 text-right">
                    <span className="font-semibold text-slate-900 tabular-nums">{c.selections}</span>
                    <span className="text-xs text-slate-500"> selected</span>
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {c.drives} {c.drives === 1 ? "drive" : "drives"} · Highest CTC {formatLpa(c.highestCtc)}
                </p>
              </li>
            ))}
            {!companies.length && <li className="px-4 py-8 text-center text-sm text-slate-500">No published drives yet.</li>}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <caption className="sr-only">Selections by company</caption>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th scope="col" className={`${th} text-left w-full`}>Company</th>
                <th scope="col" className={`${th} text-right`}>Drives</th>
                <th scope="col" className={`${th} text-right`}>Students selected</th>
                <th scope="col" className={`${th} text-right`}>Highest CTC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shownCompanies.map((c) => (
                <tr key={`${c.companyId || c.company}`} className="hover:bg-slate-50">
                  <th scope="row" className={`${td} text-left font-medium text-slate-900`}>{c.company}</th>
                  <td className={`${td} ${num} text-slate-700`}>{c.drives}</td>
                  <td className={`${td} ${num} font-semibold text-slate-900`}>{c.selections}</td>
                  <td className={`${td} ${num} text-slate-700`}>{formatLpa(c.highestCtc)}</td>
                </tr>
              ))}
              {!companies.length && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No published drives yet.</td></tr>
              )}
            </tbody>
          </table>
          </div>
          {companies.length > COMPANY_ROWS && (
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-2.5 text-sm">
              <span className="text-slate-500">
                Showing {shownCompanies.length} of {companies.length} companies
              </span>
              <button type="button" className="font-medium text-slate-900 hover:underline" onClick={() => setAllCompanies((v) => !v)} aria-expanded={allCompanies}>
                {allCompanies ? "Show fewer" : `Show all ${companies.length}`}
              </button>
            </div>
          )}
        </div>
      </Section>

      {/* ── Active drives ── */}
      <Section
        id="stats-drives"
        title="Active placement drives"
        description="Drives open for registration or in progress."
        action={<Link to="/placement-officer/drives" className="text-sm font-medium text-slate-900 hover:underline">View all drives</Link>}
      >
        {drives.length ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {/* Wide screens: a table. Below 1280px (a laptop with the sidebar
                open is ~700px of content) six columns would wrap names
                word by word, so the list below is used instead. */}
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Active placement drives</caption>
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th scope="col" className={`${th} text-left`}>Company</th>
                    <th scope="col" className={`${th} text-left`}>Role</th>
                    <th scope="col" className={`${th} text-right`}>CTC</th>
                    <th scope="col" className={`${th} text-left`}>Status</th>
                    <th scope="col" className={`${th} text-left`}>Registration deadline</th>
                    <th scope="col" className={th}><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shownDrives.map((d) => (
                    <tr key={d._id} className="hover:bg-slate-50">
                      <th scope="row" className={`${td} text-left font-medium text-slate-900`}>{d.companyName}</th>
                      <td className={`${td} text-slate-700`}>{d.role}</td>
                      <td className={`${td} ${num} text-slate-700`}>{formatLpa(d.ctc)}</td>
                      <td className={td}><StatusBadge status={d.status} /></td>
                      <td className={`${td} whitespace-nowrap text-slate-700`}>{d.registrationDeadline ? formatDateTime(d.registrationDeadline) : "–"}</td>
                      <td className={`${td} text-right`}>
                        <Link to={`/placement-officer/drives/${d._id}`} className="whitespace-nowrap font-medium text-slate-900 hover:underline" aria-label={`View ${d.companyName} ${d.role} drive`}>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phones, tablets and laptops: one row per drive. Company and
                role get the full width; CTC, deadline and status sit beside
                them when there is room, below them when there is not. */}
            <ul className="divide-y divide-slate-100 xl:hidden">
              {shownDrives.map((d) => (
                <li key={d._id}>
                  <Link
                    to={`/placement-officer/drives/${d._id}`}
                    className="flex flex-col gap-2 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 wrap-break-word">{d.companyName}</p>
                      <p className="text-sm text-slate-600 wrap-break-word">{d.role}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:shrink-0 sm:flex-col sm:items-end">
                      <StatusBadge status={d.status} />
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        {formatLpa(d.ctc)}
                        {d.registrationDeadline
                          ? ` · Register by ${formatDateTime(d.registrationDeadline)}`
                          : d.driveDate
                            ? ` · Drive ${formatDate(d.driveDate)}`
                            : ""}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {drives.length > DRIVE_ROWS && (
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-2.5 text-sm">
                <span className="text-slate-500">Showing {DRIVE_ROWS} of {drives.length} active drives</span>
                <Link to="/placement-officer/drives" className="font-medium text-slate-900 hover:underline">View all</Link>
              </div>
            )}
          </div>
        ) : (
          <div className={`${ui.card} text-center text-sm text-slate-500`}>No active drives right now.</div>
        )}
      </Section>

      <p className="text-xs text-slate-500">
        {data.definitions.placed}. {data.definitions.inRecruitment}. Updated {formatDate(new Date())}.
      </p>
    </div>
  );
}
