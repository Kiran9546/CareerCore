import { useEffect, useState } from "react";
import api from "../../api/axios";
import { graduationYears, ui } from "../../utils/placement";

/**
 * Eligibility criteria inputs. Branches come from the server's department
 * list and graduation years are a fixed range — both are ticked, never typed.
 *
 * value: { minCgpa, maxBacklogs, branches: [], batches: [] }
 */
export default function EligibilityFields({ value, onChange, disabled }) {
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    api
      .get("/auth/departments")
      .then((r) => setDepartments(r.data.departments))
      .catch(() => setDepartments([]));
  }, []);

  const set = (k, v) => onChange({ ...value, [k]: v });
  const toggle = (k, item) =>
    set(k, value[k].includes(item) ? value[k].filter((x) => x !== item) : [...value[k], item]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
        <div>
          <label className={ui.label} htmlFor="minCgpa">Minimum CGPA</label>
          <input id="minCgpa" type="number" step="0.01" min="0" max="10" className={ui.input} disabled={disabled}
            value={value.minCgpa} onChange={(e) => set("minCgpa", e.target.value)} />
        </div>
        <div>
          <label className={ui.label} htmlFor="maxBacklogs">Maximum backlogs</label>
          <input id="maxBacklogs" type="number" min="0" step="1" className={ui.input} disabled={disabled}
            value={value.maxBacklogs} onChange={(e) => set("maxBacklogs", e.target.value)} />
        </div>
      </div>

      <fieldset>
        <legend className={ui.label}>Eligible branches *</legend>
        <div className="flex flex-wrap gap-2">
          {departments.map((d) => (
            <label key={d.code} title={d.label}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border cursor-pointer ${value.branches.includes(d.code) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
              <input type="checkbox" className="sr-only" disabled={disabled}
                checked={value.branches.includes(d.code)} onChange={() => toggle("branches", d.code)} />
              {d.code}
            </label>
          ))}
          {!disabled && departments.length > 0 && (
            <button type="button" className="text-xs text-slate-500 underline ml-1"
              onClick={() => set("branches", value.branches.length === departments.length ? [] : departments.map((d) => d.code))}>
              {value.branches.length === departments.length ? "Clear all" : "Select all"}
            </button>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend className={ui.label}>Graduation year (none ticked = any)</legend>
        <div className="flex flex-wrap gap-2">
          {graduationYears().map((y) => (
            <label key={y}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border cursor-pointer ${value.batches.includes(y) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
              <input type="checkbox" className="sr-only" disabled={disabled}
                checked={value.batches.includes(y)} onChange={() => toggle("batches", y)} />
              {y}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-slate-400">
        Evaluated against each student&apos;s official academic record (CGPA, backlogs, branch, graduation year).
      </p>
    </div>
  );
}
