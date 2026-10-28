import { useEffect, useState } from "react";
import api from "../../api/axios";
import { ui } from "../../utils/placement";

/**
 * Pick and order the interview rounds of a drive from the predefined list,
 * optionally starting from a saved template. Rounds that have already
 * started (`locked`) keep their place and cannot be removed.
 *
 * value: [{ _id?, type, locked? }] in order
 */
export default function RoundEditor({ value, onChange, disabled }) {
  const [types, setTypes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");

  useEffect(() => {
    api.get("/placement/round-types").then((r) => setTypes(r.data.roundTypes)).catch(() => {});
    api.get("/placement/interview-templates").then((r) => setTemplates(r.data.templates)).catch(() => {});
  }, []);

  const label = (code) => types.find((t) => t.code === code)?.label || code;
  const selected = new Set(value.map((r) => r.type));
  const lockedCount = value.filter((r) => r.locked).length;

  const toggle = (code) => {
    if (selected.has(code)) onChange(value.filter((r) => r.type !== code || r.locked));
    else onChange([...value, { type: code }]);
  };

  const move = (i, dir) => {
    const j = i + dir;
    if (j < lockedCount || j >= value.length || i < lockedCount) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const applyTemplate = (id) => {
    setTemplateId(id);
    const t = templates.find((x) => x._id === id);
    if (!t) return;
    const locked = value.filter((r) => r.locked);
    const keep = new Set(locked.map((r) => r.type));
    onChange([...locked, ...t.rounds.filter((c) => !keep.has(c)).map((c) => value.find((r) => r.type === c) || { type: c })]);
  };

  return (
    <div className="space-y-4">
      {templates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-slate-600" htmlFor="tpl">Start from template</label>
          <select id="tpl" className={ui.select} value={templateId} disabled={disabled} onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">— choose —</option>
            {templates.map((t) => (
              <option key={t._id} value={t._id}>{t.name}: {t.rounds.map(label).join(" → ")}</option>
            ))}
          </select>
        </div>
      )}

      <fieldset>
        <legend className={ui.label}>Rounds</legend>
        <div className="flex flex-wrap gap-2">
          {types.map((t) => {
            const on = selected.has(t.code);
            const locked = value.find((r) => r.type === t.code)?.locked;
            return (
              <label key={t.code}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"} ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                <input type="checkbox" className="sr-only" checked={on} disabled={disabled || locked} onChange={() => toggle(t.code)} />
                {t.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      {value.length > 0 && (
        <div>
          <p className={ui.label}>Order</p>
          <ol className="space-y-1.5">
            {value.map((r, i) => (
              <li key={r.type} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span className="w-6 text-slate-400">{i + 1}.</span>
                <span className="flex-1 text-slate-800">{label(r.type)}</span>
                {r.locked ? (
                  <span className="text-xs text-slate-400">Started — fixed</span>
                ) : (
                  <span className="flex gap-1">
                    <button type="button" className={ui.secondary} aria-label={`Move ${label(r.type)} up`} disabled={disabled || i <= lockedCount} onClick={() => move(i, -1)}>↑</button>
                    <button type="button" className={ui.secondary} aria-label={`Move ${label(r.type)} down`} disabled={disabled || i === value.length - 1} onClick={() => move(i, 1)}>↓</button>
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
