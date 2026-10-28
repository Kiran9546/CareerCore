import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import { STAGES, STAGE_LABEL, DRIVE_STATUS_STYLE, DRIVE_STATUS_LABEL, ROUND_SHORT_LABEL as ROUND_LABEL, formatDate } from "../../utils/placement";
import CloneDriveDialog from "../../components/drive/CloneDriveDialog";

/** Statuses of a drive recorded after the fact (the original form below). */
const DRIVE_STATUSES = ["planned", "ongoing", "completed", "cancelled"];

/** Every status either kind of drive can be in, for the list filter. */
const FILTER_STATUSES = ["draft", "open", "registration_closed", "in_progress", "planned", "ongoing", "completed", "cancelled"];


const EMPTY = {
  companyName: "",
  role: "",
  driveDate: "",
  location: "",
  ctc: "",
  description: "",
  minCgpa: "",
  maxBacklogs: "0",
  branches: "",
  batches: "",
  stages: [...STAGES],
  status: "planned",
};

/**
 * Drive list and management for the placement cell.
 *
 * "Create placement drive" runs the recruitment workflow (company list,
 * calculated eligibility, notifications, self-registration and per-round
 * results). "Record past drive" keeps the original form, for entering a drive
 * whose results arrived after the fact.
 *
 * The stage checkboxes matter more than they look: a drive that does not
 * run a technical round is recorded as such, so a student's profile can
 * distinguish "this company had no technical round" from "this student
 * never got that far".
 */
export default function Drives() {
  const [drives, setDrives] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [cloning, setCloning] = useState(null);

  const load = () => {
    api
      .get(`/placement/drives${statusFilter ? `?status=${statusFilter}` : ""}`)
      .then((r) => setDrives(r.data.drives))
      .catch((e) => setError(e.response?.data?.message || "Could not load drives"));
  };

  useEffect(load, [statusFilter]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleStage = (stage) =>
    setForm((f) => ({
      ...f,
      stages: f.stages.includes(stage)
        ? f.stages.filter((s) => s !== stage)
        : STAGES.filter((s) => [...f.stages, stage].includes(s)),
    }));

  const startEdit = (d) => {
    setEditingId(d._id);
    setForm({
      companyName: d.companyName,
      role: d.role,
      driveDate: d.driveDate ? new Date(d.driveDate).toISOString().slice(0, 10) : "",
      location: d.location || "",
      ctc: d.ctc ?? "",
      description: d.description || "",
      minCgpa: d.eligibility?.minCgpa ?? "",
      maxBacklogs: String(d.eligibility?.maxBacklogs ?? 0),
      branches: (d.eligibility?.branches || []).join(", "),
      batches: (d.eligibility?.batches || []).join(", "),
      stages: d.stages?.length ? d.stages : [...STAGES],
      status: d.status,
    });
    setShowForm(true);
    setError("");
    setNotice("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY);
    setShowForm(false);
    setError("");
  };

  const csv = (s) =>
    s.split(",").map((x) => x.trim()).filter(Boolean);

  const submit = async () => {
    setError("");
    setNotice("");

    if (!form.companyName.trim()) return setError("Company name is required");
    if (!form.role.trim()) return setError("Role is required");
    if (!form.driveDate) return setError("Drive date is required");
    if (!form.stages.length) return setError("Select at least one stage");

    const payload = {
      companyName: form.companyName.trim(),
      role: form.role.trim(),
      driveDate: form.driveDate,
      location: form.location.trim(),
      ctc: form.ctc === "" ? undefined : Number(form.ctc),
      description: form.description.trim(),
      minCgpa: form.minCgpa === "" ? 0 : Number(form.minCgpa),
      maxBacklogs: form.maxBacklogs === "" ? 0 : Number(form.maxBacklogs),
      branches: csv(form.branches),
      batches: csv(form.batches),
      stages: form.stages,
      status: form.status,
    };

    setBusy(true);
    try {
      if (editingId) {
        await api.put(`/placement/drives/${editingId}`, payload);
        setNotice("Drive updated");
      } else {
        await api.post("/placement/drives", payload);
        setNotice("Drive created");
      }
      cancelEdit();
      load();
    } catch (e) {
      setError(e.response?.data?.message || "Could not save the drive");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d) => {
    setError("");
    setNotice("");
    try {
      await api.delete(`/placement/drives/${d._id}`);
      setNotice("Drive deleted");
      load();
    } catch (e) {
      // The API refuses to delete a drive that already holds results, and
      // explains why. Surfacing that message verbatim is more useful than a
      // generic failure.
      setError(e.response?.data?.message || "Could not delete the drive");
    }
  };

  const input =
    "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900";
  const label = "block text-xs font-medium text-slate-600 mb-1";
  const select = "px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 items-center">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={select}
          >
            <option value="">All statuses</option>
            {FILTER_STATUSES.map((s) => (
              <option key={s} value={s}>{DRIVE_STATUS_LABEL[s]}</option>
            ))}
          </select>
          <span className="text-sm text-slate-500">{drives.length} drives</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => (showForm ? cancelEdit() : setShowForm(true))}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
          >
            {showForm ? "Cancel" : "Record past drive"}
          </button>
          <Link
            to="/placement_officer/drives/new"
            className="px-3 py-1.5 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800"
          >
            + Create placement drive
          </Link>
        </div>
      </div>
      {cloning && <CloneDriveDialog drive={cloning} onClose={() => setCloning(null)} />}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {notice && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
          <p className="text-sm text-green-700">{notice}</p>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-4">
            {editingId ? "Edit recorded drive" : "Record a past drive"}
          </h3>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={label}>Company *</label>
              <input
                className={input}
                value={form.companyName}
                onChange={(e) => set("companyName", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Role *</label>
              <input
                className={input}
                value={form.role}
                onChange={(e) => set("role", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Drive date *</label>
              <input
                type="date"
                className={input}
                value={form.driveDate}
                onChange={(e) => set("driveDate", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Location</label>
              <input
                className={input}
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>CTC (LPA)</label>
              <input
                type="number"
                step="0.1"
                className={input}
                value={form.ctc}
                onChange={(e) => set("ctc", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Status</label>
              <select
                className={input}
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                {DRIVE_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Minimum CGPA</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="10"
                className={input}
                value={form.minCgpa}
                onChange={(e) => set("minCgpa", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Maximum backlogs</label>
              <input
                type="number"
                min="0"
                className={input}
                value={form.maxBacklogs}
                onChange={(e) => set("maxBacklogs", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Eligible branches</label>
              <input
                className={input}
                placeholder="ISE, CSE — blank means all"
                value={form.branches}
                onChange={(e) => set("branches", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Eligible batches</label>
              <input
                className={input}
                placeholder="2026 — blank means all"
                value={form.batches}
                onChange={(e) => set("batches", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Description</label>
              <input
                className={input}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4">
            <label className={label}>Stages this drive runs</label>
            <div className="flex flex-wrap gap-2">
              {STAGES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStage(s)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    form.stages.includes(s)
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {STAGE_LABEL[s]}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Unselected stages are recorded as not run by this company, which
              keeps them out of the student's attempt counts.
            </p>
          </div>

          <div className="flex gap-2 mt-5">
            <button
              onClick={submit}
              disabled={busy}
              className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? "Saving…" : editingId ? "Save changes" : "Create drive"}
            </button>
            <button
              onClick={cancelEdit}
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="pb-2 font-medium">Company</th>
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Eligibility</th>
              <th className="pb-2 font-medium">Rounds</th>
              <th className="pb-2 font-medium">Participants</th>
              <th className="pb-2 font-medium">Offers</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {drives.map((d) => (
              <tr key={d._id} className="border-b border-slate-100">
                <td className="py-2.5">
                  <Link
                    to={`/placement_officer/drives/${d._id}`}
                    className="text-slate-800 hover:underline"
                  >
                    {d.companyName}
                  </Link>
                  {d.ctc ? (
                    <p className="text-xs text-slate-400">₹{d.ctc} LPA</p>
                  ) : null}
                </td>
                <td className="py-2.5 text-slate-600">{d.role}</td>
                <td className="py-2.5 text-slate-500 text-xs">{formatDate(d.driveDate)}</td>
                <td className="py-2.5 text-xs text-slate-500">
                  CGPA ≥ {d.eligibility?.minCgpa ?? 0} · backlogs ≤{" "}
                  {d.eligibility?.maxBacklogs ?? 0}
                  <br />
                  {d.eligibility?.branches?.length
                    ? d.eligibility.branches.join(", ")
                    : "All branches"}
                </td>
                <td className="py-2.5 text-xs text-slate-500">
                  {d.workflow === "managed"
                    ? [...(d.rounds || [])].sort((a, b) => a.order - b.order).map((r) => ROUND_LABEL[r.type]).join(" → ") || "Not configured"
                    : (d.stages || []).map((s) => STAGE_LABEL[s]).join(" → ")}
                </td>
                <td className="py-2.5 text-slate-600">
                  {d.participantCount}
                  {d.workflow === "managed" && (
                    <p className="text-xs text-slate-400">of {d.eligibleCount} eligible</p>
                  )}
                </td>
                <td className="py-2.5 font-medium text-slate-900">{d.offerCount}</td>
                <td className="py-2.5">
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${DRIVE_STATUS_STYLE[d.status] ?? ""}`}
                  >
                    {DRIVE_STATUS_LABEL[d.status] ?? d.status}
                  </span>
                </td>
                <td className="py-2.5 text-right whitespace-nowrap">
                  {d.workflow === "managed" ? (
                    <Link
                      to={`/placement_officer/drives/${d._id}`}
                      className="text-xs text-slate-600 hover:text-slate-900 underline mr-3"
                    >
                      Dashboard
                    </Link>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(d)}
                        className="text-xs text-slate-600 hover:text-slate-900 underline mr-3"
                      >
                        Edit
                      </button>
                      <Link
                        to={`/placement_officer/drives/${d._id}`}
                        className="text-xs text-slate-600 hover:text-slate-900 underline mr-3"
                      >
                        Results
                      </Link>
                    </>
                  )}
                  <button
                    onClick={() => setCloning(d)}
                    className="text-xs text-slate-600 hover:text-slate-900 underline mr-3"
                  >
                    Clone
                  </button>
                  {d.participantCount === 0 && (d.workflow !== "managed" || d.status === "draft") && (
                    <button
                      onClick={() => remove(d)}
                      className="text-xs text-red-600 hover:text-red-800 underline"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!drives.length && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-slate-400">
                  No drives yet. Create one to start recording results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
