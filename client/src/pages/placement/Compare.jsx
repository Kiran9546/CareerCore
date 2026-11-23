import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import {
  PLACEMENT_STATUS_LABEL,
  PLACEMENT_STATUS_STYLE,
  STAGE_LABEL,
  showMetric,
} from "../../utils/placement";
import { CardSkeleton } from "../../components/ui/Skeleton";

/**
 * Side-by-side placement comparison.
 *
 * This is the view the whole module exists for: two students whose academic
 * profile and PRS sit within a point or two of each other, whose actual
 * drive outcomes are nothing alike. The profile columns are shown directly
 * above the outcome columns so the divergence is visible without scrolling.
 *
 * Stage rows the backend marks as not comparable (because at least one
 * student has too few recorded attempts) are rendered with that caveat
 * rather than silently compared.
 */
export default function Compare() {
  const [params, setParams] = useSearchParams();
  const [roster, setRoster] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const ids = useMemo(
    () => (params.get("ids") || "").split(",").filter(Boolean),
    [params],
  );

  const ready = ids.length >= 2;
  // "Loading" is the state of having asked for a comparison and not yet
  // received one, rather than a separate flag set from the effect body.
  const loading = ready && !data && !error;

  useEffect(() => {
    api
      .get("/placement/students")
      .then((r) => setRoster(r.data.students))
      .catch(() => setRoster([]));
  }, []);

  useEffect(() => {
    // Nothing to fetch below two students. Rendering is guarded on
    // `ids.length` instead of clearing state here, which would mean calling
    // setState synchronously from the effect body.
    if (ids.length < 2) return;
    api
      .get(`/placement/compare?ids=${ids.join(",")}`)
      .then((r) => {
        setData(r.data);
        setError("");
      })
      .catch((e) => {
        setData(null);
        setError(e.response?.data?.message || "Could not build the comparison");
      });
  }, [ids]);

  const toggle = (id) => {
    const next = ids.includes(id)
      ? ids.filter((x) => x !== id)
      : [...ids, id].slice(0, 4); // four columns is all that stays readable
    setParams(next.length ? { ids: next.join(",") } : {});
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Student comparison</h2>
        <p className="text-sm text-slate-500">
          Pick two to four students. Similar profiles with different outcomes are
          where the drive records earn their keep.
        </p>
      </div>

      {/* ── Picker ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-xs text-slate-500 mb-3">
          {ids.length} selected {ids.length >= 2 ? "" : "· select at least two"}
        </p>
        <div className="max-h-64 overflow-y-auto">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="sticky top-0 z-10 bg-white pb-2 font-medium w-8"></th>
                <th className="sticky top-0 z-10 bg-white pb-2 font-medium">Student</th>
                <th className="sticky top-0 z-10 bg-white pb-2 font-medium">Branch</th>
                <th className="sticky top-0 z-10 bg-white pb-2 font-medium">CGPA</th>
                <th className="sticky top-0 z-10 bg-white pb-2 font-medium">PRS</th>
                <th className="sticky top-0 z-10 bg-white pb-2 font-medium">Drives</th>
                <th className="sticky top-0 z-10 bg-white pb-2 font-medium">Offers</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => (
                <tr
                  key={s._id}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => toggle(s._id)}
                >
                  <td className="py-2">
                    <input
                      type="checkbox"
                      readOnly
                      checked={ids.includes(s._id)}
                      className="pointer-events-none"
                    />
                  </td>
                  <td className="py-2">
                    <p className="text-slate-800">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.usn}</p>
                  </td>
                  <td className="py-2 text-slate-600">{s.branch}</td>
                  <td className="py-2 text-slate-600">{s.cgpa}</td>
                  <td className="py-2 font-semibold text-slate-900">{s.prs}</td>
                  <td className="py-2 text-slate-600">{s.drives}</td>
                  <td className="py-2 text-slate-600">{s.offers}</td>
                </tr>
              ))}
              {!roster.length && (
                <tr>
                  <td colSpan={7} className="py-4 text-slate-400 text-sm">
                    No students available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {ready && error && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
          <p className="text-slate-500">{error}</p>
        </div>
      )}
      {ready && loading && <CardSkeleton rows={6} />}

      {ready && data && (
        <>
          {/* ── Profile vs outcome ──────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 overflow-x-auto">
            <h3 className="font-semibold text-slate-900 mb-4">
              Profile against outcome
            </h3>
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-2 font-medium w-44"></th>
                  {data.profiles.map((p) => (
                    <th key={p.studentId} className="pb-2 font-medium">
                      <Link
                        to={`/placement-officer/students/${p.studentId}`}
                        className="text-slate-800 hover:underline"
                      >
                        {p.student?.name}
                      </Link>
                      <span className="block text-xs font-normal text-slate-400">
                        {p.student?.usn}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["CGPA", (p) => p.student?.cgpa],
                  ["Backlogs", (p) => p.student?.backlogs],
                  ["PRS", (p) => p.student?.prs],
                  ["Readiness", (p) => p.student?.readinessLevel],
                  ["Skills", (p) => p.student?.skills?.length ?? 0],
                  ["Projects", (p) => p.student?.projects?.length ?? 0],
                  ["Certifications", (p) => p.student?.certifications?.length ?? 0],
                ].map(([label, get]) => (
                  <tr key={label} className="border-b border-slate-100">
                    <td className="py-2 text-slate-500">{label}</td>
                    {data.profiles.map((p) => (
                      <td key={p.studentId} className="py-2 text-slate-800">
                        {get(p) ?? "–"}
                      </td>
                    ))}
                  </tr>
                ))}

                <tr className="border-b-2 border-slate-300">
                  <td className="pt-4 pb-2 text-xs uppercase tracking-wide text-slate-400">
                    Actual outcomes
                  </td>
                  {data.profiles.map((p) => (
                    <td key={p.studentId} className="pt-4 pb-2" />
                  ))}
                </tr>

                {[
                  ["Drives attended", (p) => p.metrics.drivesAttended],
                  [
                    "Aptitude cleared",
                    (p) => `${p.metrics.aptitude.passed} / ${p.metrics.aptitude.attempts}`,
                  ],
                  [
                    "Technical cleared",
                    (p) => `${p.metrics.technical.passed} / ${p.metrics.technical.attempts}`,
                  ],
                  ["Interviews reached", (p) => p.metrics.interview.reached],
                  ["Offers", (p) => p.metrics.offers],
                  ["Success rate", (p) => showMetric(p.metrics.successRate, "%")],
                ].map(([label, get]) => (
                  <tr key={label} className="border-b border-slate-100">
                    <td className="py-2 text-slate-500">{label}</td>
                    {data.profiles.map((p) => (
                      <td key={p.studentId} className="py-2 font-medium text-slate-900">
                        {get(p)}
                      </td>
                    ))}
                  </tr>
                ))}

                <tr>
                  <td className="py-2 text-slate-500">Status</td>
                  {data.profiles.map((p) => (
                    <td key={p.studentId} className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          PLACEMENT_STATUS_STYLE[p.placementStatus] ?? ""
                        }`}
                      >
                        {PLACEMENT_STATUS_LABEL[p.placementStatus] ?? p.placementStatus}
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            </div>
          </div>

          {/* ── Stage-by-stage, with comparability caveats ──── */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-1">Stage comparison</h3>
            <p className="text-xs text-slate-500 mb-4">
              A stage is only compared when every student has enough recorded
              attempts at it to make the comparison mean something.
            </p>
            <div className="space-y-4">
              {data.comparison.points.map((pt) => (
                <div key={pt.stage}>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-medium text-slate-800">
                      {STAGE_LABEL[pt.stage]}
                    </p>
                    {!pt.comparable && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700">
                        Not comparable
                      </span>
                    )}
                  </div>
                  {pt.note && <p className="text-xs text-slate-400 mb-2">{pt.note}</p>}
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${pt.rows.length}, minmax(0,1fr))` }}>
                    {pt.rows.map((r) => (
                      <div key={r.studentId} className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-xs text-slate-500 truncate">{r.name}</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {r.passed} / {r.attempts}
                          <span className="ml-1 text-xs font-normal text-slate-500">
                            {showMetric(r.passPercent, "%")}
                          </span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Each student's own derived read ─────────────── */}
          <div className="grid md:grid-cols-2 gap-5">
            {data.profiles.map((p) => (
              <div key={p.studentId} className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-900">{p.student?.name}</h3>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                  {p.insights.summary}
                </p>
                {p.insights.weakAreas.map((w) => (
                  <p key={w.code} className="text-xs text-red-700 mt-2">
                    ▲ {w.title}
                  </p>
                ))}
                {p.insights.strengths.map((s) => (
                  <p key={s.code} className="text-xs text-green-700 mt-2">
                    ● {s.title}
                  </p>
                ))}
                <Link
                  to={`/placement-officer/students/${p.studentId}`}
                  className="inline-block mt-4 text-xs text-slate-600 underline"
                >
                  Full placement profile
                </Link>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
