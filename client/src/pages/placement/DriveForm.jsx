import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../../api/axios";
import CompanyPicker from "../../components/drive/CompanyPicker";
import EligibilityFields from "../../components/drive/EligibilityFields";
import RoundEditor from "../../components/drive/RoundEditor";
import Alerts from "../../components/drive/Alerts";
import { errorMessage, toDateInput, toLocalInput, ui } from "../../utils/placement";

const EMPTY = {
  company: null,
  role: "",
  driveDate: "",
  registrationDeadline: "",
  ctc: "",
  location: "",
  description: "",
};

/**
 * Create a placement drive in the recruitment workflow, or edit the details
 * of one. A new drive is saved as a Draft and its eligibility is calculated
 * immediately; nobody is notified until the officer publishes it from the
 * drive dashboard. Eligibility and rounds of an existing drive are edited on
 * the dashboard, where their effect on students is visible.
 */
export default function DriveForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [eligibility, setEligibility] = useState({ minCgpa: "", maxBacklogs: "0", branches: [], batches: [] });
  const [rounds, setRounds] = useState([]);
  const [status, setStatus] = useState("draft");
  const [loaded, setLoaded] = useState(!editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) return;
    api
      .get(`/placement/drives/${id}`)
      .then((r) => {
        const d = r.data.drive;
        setForm({
          company: d.companyId ? { _id: d.companyId, name: d.companyName } : null,
          role: d.role,
          driveDate: toDateInput(d.driveDate),
          registrationDeadline: toLocalInput(d.registrationDeadline),
          ctc: d.ctc ?? "",
          location: d.location || "",
          description: d.description || "",
        });
        setStatus(d.status);
        setLoaded(true);
      })
      .catch((e) => setError(errorMessage(e, "Could not load the drive")));
  }, [editing, id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.company) return setError("Select a company, or add it as a new company");
    if (!form.role.trim()) return setError("Job role is required");
    if (!form.driveDate) return setError("Drive date is required");
    if (!editing && !eligibility.branches.length) return setError("No branch selected — choose at least one eligible branch");

    const payload = {
      companyId: form.company._id,
      role: form.role.trim(),
      driveDate: form.driveDate,
      registrationDeadline: form.registrationDeadline ? new Date(form.registrationDeadline).toISOString() : undefined,
      ctc: form.ctc === "" ? undefined : Number(form.ctc),
      location: form.location.trim(),
      description: form.description.trim(),
    };

    setBusy(true);
    try {
      if (editing) {
        await api.put(`/placement/drives/${id}`, payload);
        navigate(`/placement_officer/drives/${id}`);
      } else {
        const r = await api.post("/placement/drives", {
          ...payload,
          workflow: "managed",
          minCgpa: eligibility.minCgpa === "" ? 0 : Number(eligibility.minCgpa),
          maxBacklogs: eligibility.maxBacklogs === "" ? 0 : Number(eligibility.maxBacklogs),
          branches: eligibility.branches,
          batches: eligibility.batches,
          rounds: rounds.map((x) => x.type),
        });
        navigate(`/placement_officer/drives/${r.data.drive._id}`, {
          state: { notice: `Drive created as a draft — ${r.data.eligibility.eligible} of ${r.data.eligibility.total} students are eligible.` },
        });
      }
    } catch (err) {
      setError(errorMessage(err, "Could not save the drive"));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return error ? <Alerts error={error} /> : <p className="text-slate-400">Loading…</p>;
  const started = ["in_progress", "completed", "cancelled"].includes(status);

  return (
    <form onSubmit={submit} className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">{editing ? "Edit drive details" : "Create placement drive"}</h2>
        <Link to={editing ? `/placement_officer/drives/${id}` : "/placement_officer/drives"} className="text-sm text-slate-500 hover:text-slate-700">
          Cancel
        </Link>
      </div>
      <Alerts error={error} />

      <section className={ui.card}>
        <h3 className="font-semibold text-slate-900 mb-3">Company</h3>
        <CompanyPicker value={form.company} onChange={(c) => set("company", c)} disabled={editing && status !== "draft"} />
        {editing && status !== "draft" && <p className="text-xs text-slate-400 mt-2">The company is fixed once a drive is published.</p>}
      </section>

      <section className={ui.card}>
        <h3 className="font-semibold text-slate-900 mb-3">Drive details</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className={ui.label} htmlFor="role">Job role *</label>
            <input id="role" className={ui.input} value={form.role} disabled={started} onChange={(e) => set("role", e.target.value)} />
          </div>
          <div>
            <label className={ui.label} htmlFor="driveDate">Drive date *</label>
            <input id="driveDate" type="date" className={ui.input} value={form.driveDate} disabled={started} onChange={(e) => set("driveDate", e.target.value)} />
          </div>
          <div>
            <label className={ui.label} htmlFor="deadline">Registration deadline</label>
            <input id="deadline" type="datetime-local" className={ui.input} value={form.registrationDeadline} disabled={started} onChange={(e) => set("registrationDeadline", e.target.value)} />
          </div>
          <div>
            <label className={ui.label} htmlFor="ctc">CTC (LPA)</label>
            <input id="ctc" type="number" step="0.1" min="0" className={ui.input} value={form.ctc} onChange={(e) => set("ctc", e.target.value)} />
          </div>
          <div>
            <label className={ui.label} htmlFor="location">Job location</label>
            <input id="location" className={ui.input} value={form.location} onChange={(e) => set("location", e.target.value)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={ui.label} htmlFor="description">Description</label>
            <textarea id="description" rows={3} className={ui.input} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
        </div>
      </section>

      {!editing && (
        <>
          <section className={ui.card}>
            <h3 className="font-semibold text-slate-900 mb-3">Eligibility</h3>
            <EligibilityFields value={eligibility} onChange={setEligibility} />
          </section>
          <section className={ui.card}>
            <h3 className="font-semibold text-slate-900 mb-1">Interview process</h3>
            <p className="text-xs text-slate-400 mb-3">Optional now — it can be configured later, before the drive starts.</p>
            <RoundEditor value={rounds} onChange={setRounds} />
          </section>
        </>
      )}

      <div className="flex gap-2">
        <button type="submit" className={ui.primary} disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Create draft & calculate eligibility"}
        </button>
      </div>
    </form>
  );
}
