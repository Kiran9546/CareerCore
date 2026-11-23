import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import { errorMessage, ui } from "../../utils/placement";

/**
 * Clone a drive's configuration (role, criteria, interview process) into a
 * new draft. Registrations, results, selections and notifications are never
 * copied; only the new dates are asked for.
 */
export default function CloneDriveDialog({ drive, onClose }) {
  const navigate = useNavigate();
  const [driveDate, setDriveDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [role, setRole] = useState(drive.role);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (!driveDate) return setError("Choose the new drive date");
    setBusy(true);
    try {
      const r = await api.post(`/placement/drives/${drive._id}/clone`, {
        driveDate,
        registrationDeadline: deadline ? new Date(deadline).toISOString() : undefined,
        role,
      });
      onClose();
      navigate(`/placement-officer/drives/${r.data.drive._id}`, {
        state: { notice: "Drive cloned as a new draft. Review the configuration before publishing." },
      });
    } catch (e) {
      setError(errorMessage(e, "Could not clone the drive"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop fixed inset-0 z-40 bg-slate-900/30 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="modal-panel bg-white rounded-xl border border-slate-200 p-5 w-full max-w-md space-y-4 shadow-(--cc-shadow-float)">
        <div>
          <h3 className="font-semibold text-slate-900">Clone drive</h3>
          <p className="text-sm text-slate-500">
            Copies the role, eligibility criteria and interview process of {drive.companyName} into a new draft.
            Registrations, results and selections are not copied.
          </p>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div>
          <label className={ui.label} htmlFor="clone-role">Job role</label>
          <input id="clone-role" className={ui.input} value={role} onChange={(e) => setRole(e.target.value)} />
        </div>
        <div>
          <label className={ui.label} htmlFor="clone-date">New drive date *</label>
          <input id="clone-date" type="date" className={ui.input} value={driveDate} onChange={(e) => setDriveDate(e.target.value)} />
        </div>
        <div>
          <label className={ui.label} htmlFor="clone-deadline">Registration deadline</label>
          <input id="clone-deadline" type="datetime-local" className={ui.input} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <button className={ui.secondary} onClick={onClose}>Cancel</button>
          <button className={ui.primary} disabled={busy} onClick={submit}>{busy ? "Cloning…" : "Clone as draft"}</button>
        </div>
      </div>
    </div>
  );
}
