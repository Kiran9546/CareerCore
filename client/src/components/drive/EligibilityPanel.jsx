import { useState } from "react";
import api from "../../api/axios";
import EligibilityFields from "./EligibilityFields";
import { formatDateTime, ui } from "../../utils/placement";
import { confirmAction } from "../ui/confirm";

/**
 * Change a drive's criteria and recalculate. Saving bumps the criteria
 * version and recalculates at once; registrations and round results are
 * never touched — a registered student who stops qualifying is flagged.
 */
export default function EligibilityPanel({ drive, onSaved, onError }) {
  const e = drive.eligibility || {};
  const [value, setValue] = useState({
    minCgpa: String(e.minCgpa ?? ""),
    maxBacklogs: String(e.maxBacklogs ?? 0),
    branches: e.branches || [],
    batches: e.batches || [],
  });
  const [busy, setBusy] = useState(false);
  const locked = !["draft", "open", "registration_closed"].includes(drive.status);

  const summary = (r) =>
    `Eligibility calculated: ${r.eligible} eligible, ${r.ineligible} not eligible` +
    (r.missingData ? ` (${r.missingData} with missing academic data)` : "") +
    (r.newlyFlagged ? `. ${r.newlyFlagged} registered student(s) flagged as no longer eligible` : "") +
    (r.notified ? `. ${r.notified} newly eligible student(s) notified` : "") + ".";

  const save = async () => {
    if (!value.branches.length) return onError({ response: { data: { message: "No branch selected. Choose at least one eligible branch." } } });
    if (drive.status !== "draft" && !(await confirmAction("Change the criteria of a published drive? Eligibility will be recalculated; newly eligible students are notified and existing registrations are kept."))) return;
    setBusy(true);
    try {
      const r = await api.put(`/placement/drives/${drive._id}/eligibility`, {
        minCgpa: value.minCgpa === "" ? 0 : Number(value.minCgpa),
        maxBacklogs: value.maxBacklogs === "" ? 0 : Number(value.maxBacklogs),
        branches: value.branches,
        batches: value.batches,
      });
      onSaved(summary(r.data.eligibility));
    } catch (err) {
      onError(err, "Could not save the criteria");
    } finally {
      setBusy(false);
    }
  };

  const recalculate = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/placement/drives/${drive._id}/eligibility/calculate`);
      onSaved(summary(r.data.eligibility));
    } catch (err) {
      onError(err, "Could not recalculate eligibility");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${ui.card} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">Eligibility criteria</h3>
        <span className="text-xs text-slate-400">Last calculated {formatDateTime(e.calculatedAt)}</span>
      </div>
      {locked && <p className="text-sm text-slate-500">Eligibility is locked once the drive is in progress.</p>}
      <EligibilityFields value={value} onChange={setValue} disabled={locked} />
      {!locked && (
        <div className="flex gap-2">
          <button className={ui.primary} disabled={busy} onClick={save}>{busy ? "Working…" : "Save criteria & recalculate"}</button>
          <button className={ui.secondary} disabled={busy} onClick={recalculate}>Recalculate with latest academic records</button>
        </div>
      )}
    </div>
  );
}
