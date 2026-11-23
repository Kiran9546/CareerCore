import { useEffect, useRef, useState } from "react";
import api from "../../api/axios";
import { errorMessage, ui } from "../../utils/placement";
import usePresence from "../../motion/usePresence";

/**
 * Searchable company selection with "+ Add new company".
 *
 * The server refuses a company whose normalised name already exists and
 * says which one it is, so an officer typing "ABC Technologies Pvt Ltd" is
 * pointed back to the existing ABC Technologies instead of creating a twin.
 */
export default function CompanyPicker({ value, onChange, disabled }) {
  const [query, setQuery] = useState(value?.name || "");
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const list = usePresence(open && !disabled, 140);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", industry: "", location: "", website: "" });
  const [error, setError] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .get(`/placement/companies?q=${encodeURIComponent(query)}&limit=20`)
        .then((r) => setOptions(r.data.companies))
        .catch(() => setOptions([]));
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pick = (c) => {
    onChange(c);
    setQuery(c.name);
    setOpen(false);
  };

  const create = async () => {
    setError("");
    try {
      const r = await api.post("/placement/companies", draft);
      pick(r.data.company);
      setAdding(false);
      setDraft({ name: "", industry: "", location: "", website: "" });
    } catch (e) {
      setError(errorMessage(e, "Could not add the company"));
    }
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex gap-2">
        <input
          className={ui.input}
          placeholder="Search companies…"
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value && e.target.value !== value.name) onChange(null);
          }}
          aria-label="Company"
        />
        {!disabled && (
          <button type="button" className={`${ui.secondary} whitespace-nowrap`} onClick={() => { setAdding((a) => !a); setDraft((d) => ({ ...d, name: query })); }}>
            + Add new company
          </button>
        )}
      </div>

      {list.render && (
        <div data-closing={list.closing ? "" : undefined} inert={list.closing} className="dropdown-in-start absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-(--cc-shadow-raised)">
          {options.map((c) => (
            <button
              key={c._id}
              type="button"
              onClick={() => pick(c)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${value?._id === c._id ? "bg-slate-50 font-medium" : ""}`}
            >
              {c.name}
              <span className="text-xs text-slate-400 ml-2">
                {[c.industry, c.location].filter(Boolean).join(" · ")}
                {c.driveCount ? ` · ${c.driveCount} drive${c.driveCount > 1 ? "s" : ""}` : ""}
              </span>
            </button>
          ))}
          {!options.length && <p className="px-3 py-3 text-sm text-slate-400">No matching company. Add it as a new company.</p>}
        </div>
      )}

      {adding && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="text-sm font-medium text-slate-800">New company</p>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            <input className={ui.input} placeholder="Company name *" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <input className={ui.input} placeholder="Industry" value={draft.industry} onChange={(e) => setDraft({ ...draft, industry: e.target.value })} />
            <input className={ui.input} placeholder="Location" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
            <input className={ui.input} placeholder="Website" value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button type="button" className={ui.primary} onClick={create} disabled={!draft.name.trim()}>Add company</button>
            <button type="button" className={ui.secondary} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
