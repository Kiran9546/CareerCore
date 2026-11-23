import { useCallback, useEffect, useState } from "react";
import api from "../../api/axios";
import Pager from "./Pager";
import {
  ATTENDANCE_LABEL,
  ATTENDANCE_STYLE,
  FINAL_RESULT_LABEL,
  RESULT_LABEL,
  RESULT_STYLE,
  ROUND_STATUS_LABEL,
  ROUND_STATUS_STYLE,
  formatDate,
  ui,
} from "../../utils/placement";
import { confirmAction } from "../ui/confirm";

/**
 * Attendance, results and finalization for one round.
 *
 * Students are picked with checkboxes — never typed — and every bulk action
 * applies either to the ticked rows or, with "Select all matching", to every
 * student matching the current filters across all pages (resolved on the
 * server from the same filters). Attendance and result are separate
 * columns: a result can only be recorded for a student marked Appeared.
 */
export default function RoundManager({ drive, rounds, params, setParams, isAdmin, onChanged, onError, onNotice }) {
  const started = rounds.filter((r) => r.started);
  const roundId = params.get("round") || started[started.length - 1]?._id || rounds[0]?._id;
  const attendance = params.get("attendance") || "";
  const result = params.get("result") || "";
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [busy, setBusy] = useState(false);

  const setFilter = (k, v) => {
    const next = Object.fromEntries(params.entries());
    if (v) next[k] = v;
    else delete next[k];
    setParams({ ...next, tab: "rounds" });
    setPage(1);
    setSelected(new Set());
    setAllMatching(false);
  };

  const filterQuery = useCallback(() => {
    const f = {};
    if (q) f.q = q;
    if (branch) f.branch = branch;
    if (attendance) f.attendance = attendance;
    if (result) f.result = result;
    return f;
  }, [q, branch, attendance, result]);

  const load = useCallback(() => {
    if (!roundId) return;
    const qs = new URLSearchParams({ ...filterQuery(), page, limit });
    api
      .get(`/placement/drives/${drive._id}/rounds/${roundId}/participants?${qs}`)
      .then((r) => setData(r.data))
      .catch((e) => onError(e, "Could not load participants"));
  }, [drive._id, roundId, page, limit, filterQuery, onError]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  if (!rounds.length) return <div className={ui.card}><p className="text-sm text-slate-400">Configure the interview process first.</p></div>;

  const round = data?.round;
  const finalized = round?.status === "finalized";
  const canWrite = drive.status === "in_progress" && round && !finalized && Boolean(round.participantsSeededAt);
  const resultLabel = round?.isLast ? FINAL_RESULT_LABEL : RESULT_LABEL;
  const rows = data?.participants || [];
  const visibleIds = rows.map((r) => String(r.studentId));
  const count = allMatching ? data?.total || 0 : selected.size;

  const toggle = (id) => {
    setAllMatching(false);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const selectVisible = () => { setAllMatching(false); setSelected(new Set(visibleIds)); };
  const deselect = () => { setAllMatching(false); setSelected(new Set()); };

  const bulk = async (kind, value, label) => {
    if (!count) return onError({ response: { data: { message: "Select at least one student" } } });
    if (allMatching && !(await confirmAction(`Mark all ${count} matching students as ${label}?`))) return;
    setBusy(true);
    try {
      const body = allMatching
        ? { all: true, filter: filterQuery(), [kind]: value }
        : { studentIds: [...selected], [kind]: value };
      const r = await api.post(`/placement/drives/${drive._id}/rounds/${roundId}/${kind === "attendance" ? "attendance" : "results"}`, body);
      onNotice(`${r.data.updated} student(s) marked ${label}${r.data.unchanged ? ` (${r.data.unchanged} already were)` : ""}.`);
      deselect();
      load();
      onChanged();
    } catch (e) {
      onError(e, "Could not update the selected students");
    } finally {
      setBusy(false);
    }
  };

  const finalize = async () => {
    const c = data.counts;
    const msg = round.isLast
      ? `Finalize ${round.name}? ${c.passed} student(s) will be recorded as finally selected. Results become read-only.`
      : `Finalize ${round.name}? ${c.passed} student(s) who passed will move to the next round automatically. Results become read-only.`;
    if (!(await confirmAction(msg))) return;
    setBusy(true);
    try {
      const r = await api.post(`/placement/drives/${drive._id}/rounds/${roundId}/finalize`);
      onNotice(
        r.data.nextRound
          ? `${round.name} finalized. ${r.data.progressed} student(s) moved to ${r.data.nextRound.name}.`
          : `${round.name} finalized. ${r.data.selected} student(s) finally selected.`,
      );
      onChanged();
      if (r.data.nextRound) setParams({ tab: "rounds", round: r.data.nextRound._id });
      else load();
    } catch (e) {
      onError(e, "Could not finalize the round");
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    const reason = window.prompt(`Reopen ${round.name}? Results become editable again and the next round's automatic entries are withdrawn. Reason (required, audited):`);
    if (!reason) return;
    setBusy(true);
    try {
      await api.post(`/placement/drives/${drive._id}/rounds/${roundId}/reopen`, { reason });
      onNotice(`${round.name} reopened.`);
      onChanged();
      load();
    } catch (e) {
      onError(e, "Could not reopen the round");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {rounds.map((r, i) => (
          <button key={r._id} onClick={() => { setParams({ tab: "rounds", round: r._id }); setPage(1); deselect(); }}
            className={`px-3 py-1.5 text-sm rounded-lg border ${String(r._id) === String(roundId) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
            {i + 1}. {r.name}
            {r.counts && <span className="ml-2 text-xs opacity-75">{r.counts.participants}</span>}
          </button>
        ))}
      </div>

      {round && (
        <div className={ui.card}>
          <div className="flex flex-wrap justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold text-slate-900">{round.name}{round.isLast ? " (final round)" : ""}</h3>
              <p className="text-xs text-slate-500">
                {round.schedule?.date ? `${formatDate(round.schedule.date)} ${round.schedule.startTime || ""}${round.schedule.endTime ? `–${round.schedule.endTime}` : ""} · ${round.schedule.mode === "online" ? "Online" : round.schedule.venue || ""}` : "Not scheduled"}
              </p>
              <span className={`${ui.badge} ${ROUND_STATUS_STYLE[round.status]} inline-block mt-1`}>{ROUND_STATUS_LABEL[round.status]}</span>
            </div>
            {data && (
              <div className="flex flex-wrap gap-4 text-sm">
                {[["Participants", data.counts.participants], ["Appeared", data.counts.appeared], ["Absent", data.counts.absent], ["Not marked", data.counts.unmarked], [round.isLast ? "Selected" : "Passed", data.counts.passed], [round.isLast ? "Not selected" : "Failed", data.counts.failed], ["Result pending", data.counts.pending]].map(([l, n]) => (
                  <div key={l}><p className="text-xs text-slate-500">{l}</p><p className="font-semibold text-slate-900">{n}</p></div>
                ))}
              </div>
            )}
          </div>

          {!round.participantsSeededAt && (
            <p className="text-sm text-slate-500 mb-3">
              {drive.status === "in_progress" ? "This round starts when the previous round is finalized." : "Participants enter round 1 when the drive is started."}
            </p>
          )}

          <div className="flex flex-wrap gap-2 items-end mb-3">
            <input className={ui.select} placeholder="Search name or USN…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); deselect(); }} aria-label="Search" />
            <select className={ui.select} value={branch} onChange={(e) => { setBranch(e.target.value); setPage(1); deselect(); }} aria-label="Branch">
              <option value="">All branches</option>
              {(drive.eligibility?.branches || []).map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <select className={ui.select} value={attendance} onChange={(e) => setFilter("attendance", e.target.value)} aria-label="Attendance">
              <option value="">Any attendance</option>
              {Object.entries(ATTENDANCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className={ui.select} value={result} onChange={(e) => setFilter("result", e.target.value)} aria-label="Result">
              <option value="">Any result</option>
              {Object.entries(resultLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>

          {canWrite && (
            <div className="flex flex-wrap items-center gap-2 mb-3 rounded-lg bg-slate-50 border border-slate-200 p-2">
              <button className={ui.secondary} onClick={selectVisible}>Select visible</button>
              <button className={ui.secondary} onClick={() => { setAllMatching(true); setSelected(new Set()); }}>Select all matching ({data?.total ?? 0})</button>
              <button className={ui.secondary} onClick={deselect}>Deselect all</button>
              <span className="text-sm text-slate-500 mx-2">{count} selected</span>
              <button className={ui.primary} disabled={busy || !count} onClick={() => bulk("attendance", "appeared", "Appeared")}>Mark Appeared</button>
              <button className={ui.secondary} disabled={busy || !count} onClick={() => bulk("attendance", "absent", "Absent")}>Mark Absent</button>
              <button className={ui.primary} disabled={busy || !count} onClick={() => bulk("result", "passed", resultLabel.passed)}>Mark {resultLabel.passed}</button>
              <button className={ui.secondary} disabled={busy || !count} onClick={() => bulk("result", "failed", resultLabel.failed)}>Mark {resultLabel.failed}</button>
              <button className={ui.secondary} disabled={busy || !count} onClick={() => bulk("result", "pending", "Pending")}>Clear result</button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  {canWrite && (
                    <th className="pb-2 w-8">
                      <input type="checkbox" aria-label="Select visible"
                        checked={allMatching || (visibleIds.length > 0 && visibleIds.every((id) => selected.has(id)))}
                        onChange={(e) => (e.target.checked ? selectVisible() : deselect())} />
                    </th>
                  )}
                  <th className="pb-2 font-medium">Student</th>
                  <th className="pb-2 font-medium">USN</th>
                  <th className="pb-2 font-medium">Branch</th>
                  <th className="pb-2 font-medium">CGPA</th>
                  <th className="pb-2 font-medium">Attendance</th>
                  <th className="pb-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const id = String(r.studentId);
                  return (
                    <tr key={r._id} className="border-b border-slate-100">
                      {canWrite && (
                        <td className="py-2"><input type="checkbox" aria-label={`Select ${r.student?.name}`} checked={allMatching || selected.has(id)} onChange={() => toggle(id)} /></td>
                      )}
                      <td className="py-2 text-slate-800">{r.student?.name}</td>
                      <td className="py-2 text-slate-600">{r.student?.usn}</td>
                      <td className="py-2 text-slate-600">{r.student?.branch}</td>
                      <td className="py-2 text-slate-600">{r.student?.cgpa}</td>
                      <td className="py-2"><span className={`${ui.badge} ${ATTENDANCE_STYLE[r.attendance]}`}>{ATTENDANCE_LABEL[r.attendance]}</span></td>
                      <td className="py-2">{r.attendance === "appeared" ? <span className={`${ui.badge} ${RESULT_STYLE[r.result]}`}>{resultLabel[r.result]}</span> : <span className="text-slate-300">–</span>}</td>
                    </tr>
                  );
                })}
                {data && !rows.length && (
                  <tr><td colSpan={7} className="py-6 text-center text-slate-400">No participants match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {data && <Pager page={page} limit={limit} total={data.total} onPage={(p) => { setPage(p); deselect(); }} onLimit={(n) => { setLimit(n); setPage(1); deselect(); }} />}

          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
            {canWrite && (
              <button className={ui.primary} disabled={busy} onClick={finalize}>Finalize round</button>
            )}
            {finalized && drive.status === "in_progress" && isAdmin && (
              <button className={ui.danger} disabled={busy} onClick={reopen}>Reopen round</button>
            )}
            {finalized && !isAdmin && <p className="text-xs text-slate-400">Finalized results are read-only. Only an administrator can reopen a round.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
