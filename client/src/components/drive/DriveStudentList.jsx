import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import Pager from "./Pager";
import { formatDate, ui } from "../../utils/placement";
import { SkeletonRows } from "../ui/Skeleton";

const VIEWS = [
  ["all", "All students"],
  ["eligible", "Eligible"],
  ["ineligible", "Not eligible"],
  ["missing", "Missing academic data"],
  ["notified", "Notified"],
  ["viewed", "Viewed the drive"],
  ["registered", "Registered"],
  ["not_registered", "Eligible, not registered"],
  ["withdrawn", "Withdrawn"],
  ["flagged", "Registered, no longer eligible"],
];

const REG_LABEL = { registered: "Registered", withdrawn: "Withdrawn" };

/**
 * Paginated, server-filtered student list for one drive — the list every
 * statistic on the dashboard opens. Filters live in the URL so a clicked
 * statistic is a link that can be shared or reloaded.
 */
export default function DriveStudentList({ drive, params, setParams, onChanged, onError, onNotice }) {
  const view = params.get("view") || "eligible";
  const [q, setQ] = useState(params.get("q") || "");
  const [branch, setBranch] = useState(params.get("branch") || "");
  const [minCgpa, setMinCgpa] = useState("");
  const [maxBacklogs, setMaxBacklogs] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [data, setData] = useState(null);
  const [departments, setDepartments] = useState([]);

  // The server's department list, so this filter cannot drift from it.
  useEffect(() => {
    api.get("/auth/departments").then((r) => setDepartments(r.data.departments.map((d) => d.code))).catch(() => {});
  }, []);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ view, page, limit });
    if (q) qs.set("q", q);
    if (branch) qs.set("branch", branch);
    if (minCgpa !== "") qs.set("minCgpa", minCgpa);
    if (maxBacklogs !== "") qs.set("maxBacklogs", maxBacklogs);
    api
      .get(`/placement/drives/${drive._id}/students?${qs}`)
      .then((r) => setData(r.data))
      .catch((e) => onError(e, "Could not load students"));
  }, [drive._id, view, page, limit, q, branch, minCgpa, maxBacklogs, onError]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const setView = (v) => {
    setPage(1);
    setParams({ tab: "students", view: v });
  };

  const override = async (s) => {
    const reason = window.prompt(`Allow ${s.name} into round 1 although they no longer meet the criteria? Enter the reason (audited):`);
    if (!reason) return;
    try {
      await api.patch(`/placement/participations/${s.registration.participationId}/eligibility-override`, { reason });
      onNotice(`Override recorded for ${s.name}`);
      load();
      onChanged();
    } catch (e) {
      onError(e, "Could not record the override");
    }
  };

  return (
    <div className={ui.card}>
      <div className="flex flex-wrap gap-2 items-end mb-4">
        <div>
          <label className={ui.label} htmlFor="view">List</label>
          <select id="view" className={ui.select} value={view} onChange={(e) => setView(e.target.value)}>
            {VIEWS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            <option value="selected">Final selected</option>
          </select>
        </div>
        <div>
          <label className={ui.label} htmlFor="q">Name or USN</label>
          <input id="q" className={ui.select} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search…" />
        </div>
        <div>
          <label className={ui.label} htmlFor="branch">Branch</label>
          <select id="branch" className={ui.select} value={branch} onChange={(e) => { setBranch(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {departments.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className={ui.label} htmlFor="mincg">CGPA ≥</label>
          <input id="mincg" type="number" step="0.1" className={`${ui.select} w-20`} value={minCgpa} onChange={(e) => { setMinCgpa(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className={ui.label} htmlFor="maxbl">Backlogs ≤</label>
          <input id="maxbl" type="number" min="0" className={`${ui.select} w-20`} value={maxBacklogs} onChange={(e) => { setMaxBacklogs(e.target.value); setPage(1); }} />
        </div>
      </div>

      {!data ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-2 font-medium">Student</th>
                  <th className="pb-2 font-medium">USN</th>
                  <th className="pb-2 font-medium">Branch</th>
                  <th className="pb-2 font-medium">CGPA</th>
                  <th className="pb-2 font-medium">Backlogs</th>
                  <th className="pb-2 font-medium">{view === "selected" ? "Offer" : "Eligibility"}</th>
                  <th className="pb-2 font-medium">{view === "selected" ? "Offer status" : "Registration"}</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.studentId} className="border-b border-slate-100 align-top">
                    <td className="py-2.5">
                      <Link to={`/placement-officer/students/${s.studentId}`} className="text-slate-800 hover:underline">{s.name || "–"}</Link>
                    </td>
                    <td className="py-2.5 text-slate-600">{s.usn}</td>
                    <td className="py-2.5 text-slate-600">{s.branch}</td>
                    <td className="py-2.5 text-slate-600">{s.cgpa ?? "–"}</td>
                    <td className="py-2.5 text-slate-600">{s.backlogs ?? "–"}</td>
                    {view === "selected" ? (
                      <>
                        <td className="py-2.5 text-slate-600">{s.offer?.ctc ? `₹${s.offer.ctc} LPA` : "–"}{s.offer?.location ? ` · ${s.offer.location}` : ""}</td>
                        <td className="py-2.5 text-slate-600">{s.offer?.status || "pending"}</td>
                        <td />
                      </>
                    ) : (
                      <>
                        <td className="py-2.5">
                          {s.eligible ? (
                            <span className={`${ui.badge} bg-green-100 text-green-700`}>Eligible</span>
                          ) : (
                            <>
                              <span className={`${ui.badge} bg-red-100 text-red-700`}>Not eligible</span>
                              <p className="text-xs text-slate-500 mt-1">{s.reasons?.join("; ")}</p>
                            </>
                          )}
                          {s.notifiedAt && <p className="text-[11px] text-slate-400 mt-1">Notified {formatDate(s.notifiedAt)}{s.viewedAt ? " · viewed" : ""}</p>}
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {s.registration ? REG_LABEL[s.registration.status] : "Not registered"}
                          {s.registration?.flaggedIneligible && (
                            <p className="text-[11px] text-amber-700">{s.registration.overridden ? "No longer eligible (override recorded)" : "No longer eligible"}</p>
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          {s.registration?.flaggedIneligible && !s.registration.overridden && ["open", "registration_closed"].includes(drive.status) && (
                            <button className="text-xs underline text-slate-600" onClick={() => override(s)}>Override</button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {!data.students.length && (
                  <tr><td colSpan={8} className="py-6 text-center text-slate-400">No students in this list.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pager page={page} limit={limit} total={data.total} onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
        </>
      )}
    </div>
  );
}
