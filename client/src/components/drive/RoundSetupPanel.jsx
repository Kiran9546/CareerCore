import { useState } from "react";
import api from "../../api/axios";
import RoundEditor from "./RoundEditor";
import { ROUND_STATUS_LABEL, ROUND_STATUS_STYLE, ROUND_TYPE_LABEL as LABEL, toDateInput, ui } from "../../utils/placement";

const isLocked = (r) => r.status === "finalized" || Boolean(r.participantsSeededAt);

/** Schedule form for one round. */
function ScheduleForm({ drive, round, onSaved, onError }) {
  const s = round.schedule || {};
  const [v, setV] = useState({
    date: toDateInput(s.date),
    startTime: s.startTime || "",
    endTime: s.endTime || "",
    mode: s.mode || "offline",
    venue: s.venue || "",
    meetingLink: s.meetingLink || "",
    instructions: s.instructions || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, x) => setV((p) => ({ ...p, [k]: x }));
  const finalized = round.status === "finalized";

  const save = async () => {
    if (s.date && round.participantsSeededAt && !window.confirm("Students are already in this round. Reschedule and notify them?")) return;
    setBusy(true);
    try {
      await api.patch(`/placement/drives/${drive._id}/rounds/${round._id}/schedule`, v);
      onSaved(`${LABEL[round.type]} ${s.date ? "rescheduled" : "scheduled"}`);
    } catch (e) {
      onError(e, "Could not save the schedule");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="font-medium text-slate-800">{round.order}. {LABEL[round.type]}</p>
        <span className={`${ui.badge} ${ROUND_STATUS_STYLE[round.status]}`}>{ROUND_STATUS_LABEL[round.status]}</span>
      </div>
      <fieldset disabled={finalized || busy} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className={ui.label}>Date *</label>
          <input type="date" className={ui.input} value={v.date} onChange={(e) => set("date", e.target.value)} />
        </div>
        <div>
          <label className={ui.label}>Start time *</label>
          <input type="time" className={ui.input} value={v.startTime} onChange={(e) => set("startTime", e.target.value)} />
        </div>
        <div>
          <label className={ui.label}>End time</label>
          <input type="time" className={ui.input} value={v.endTime} onChange={(e) => set("endTime", e.target.value)} />
        </div>
        <div>
          <label className={ui.label}>Mode</label>
          <select className={ui.input} value={v.mode} onChange={(e) => set("mode", e.target.value)}>
            <option value="offline">Offline</option>
            <option value="online">Online</option>
          </select>
        </div>
        {v.mode === "offline" ? (
          <div className="sm:col-span-2">
            <label className={ui.label}>Venue *</label>
            <input className={ui.input} value={v.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Placement Cell Lab" />
          </div>
        ) : (
          <div className="sm:col-span-2">
            <label className={ui.label}>Meeting link * (shown only to students in this round)</label>
            <input className={ui.input} value={v.meetingLink} onChange={(e) => set("meetingLink", e.target.value)} placeholder="https://…" />
          </div>
        )}
        <div className="sm:col-span-2">
          <label className={ui.label}>Instructions</label>
          <input className={ui.input} value={v.instructions} onChange={(e) => set("instructions", e.target.value)} />
        </div>
      </fieldset>
      {!finalized && (
        <button className={`${ui.primary} mt-3`} disabled={busy} onClick={save}>{s.date ? "Reschedule" : "Save schedule"}</button>
      )}
    </div>
  );
}

/**
 * Configure the drive's rounds from the predefined list, then schedule each.
 * Rounds that have started stay fixed; later rounds can still change.
 */
export default function RoundSetupPanel({ drive, onSaved, onError }) {
  const ordered = [...(drive.rounds || [])].sort((a, b) => a.order - b.order);
  const [value, setValue] = useState(ordered.map((r) => ({ _id: r._id, type: r.type, locked: isLocked(r) })));
  const [busy, setBusy] = useState(false);
  const closed = ["completed", "cancelled"].includes(drive.status);

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/placement/drives/${drive._id}/rounds`, { rounds: value.map(({ _id, type }) => ({ _id, type })) });
      onSaved("Interview process saved");
    } catch (e) {
      onError(e, "Could not save the interview process");
    } finally {
      setBusy(false);
    }
  };

  const saveTemplate = async () => {
    const name = window.prompt("Save this process as a reusable template. Template name:");
    if (!name) return;
    try {
      await api.post("/placement/interview-templates", { name, rounds: value.map((r) => r.type) });
      onSaved(`Template "${name}" saved`);
    } catch (e) {
      onError(e, "Could not save the template");
    }
  };

  return (
    <div className="space-y-5">
      <div className={ui.card}>
        <h3 className="font-semibold text-slate-900 mb-3">Interview process</h3>
        <RoundEditor value={value} onChange={setValue} disabled={closed} />
        {!closed && (
          <div className="flex gap-2 mt-4">
            <button className={ui.primary} disabled={busy || !value.length} onClick={save}>Save interview process</button>
            <button className={ui.secondary} disabled={!value.length} onClick={saveTemplate}>Save as template</button>
          </div>
        )}
      </div>

      {ordered.length > 0 && (
        <div className={`${ui.card} space-y-3`}>
          <h3 className="font-semibold text-slate-900">Round schedule</h3>
          {ordered.map((r) => (
            <ScheduleForm key={`${r._id}:${r.schedule?.date || ""}:${r.status}`} drive={drive} round={r} onSaved={onSaved} onError={onError} />
          ))}
        </div>
      )}
    </div>
  );
}
