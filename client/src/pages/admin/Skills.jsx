import { useEffect, useState } from "react";
import api from "../../api/axios";
import { confirmAction } from "../../components/ui/confirm";

export default function Skills() {
  const [skills, setSkills] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ name: "", category: "", aliases: "" });

  const load = () => {
    api.get(`/admin/skills${category ? `?category=${category}` : ""}`)
      .then((r) => { setSkills(r.data.skills); setCategories(r.data.categories); });
  };

  useEffect(load, [category]);

  const create = async () => {
    setMsg("");
    try {
      await api.post("/admin/skills", {
        name: form.name,
        category: form.category,
        aliases: form.aliases.split(",").map((a) => a.trim()).filter(Boolean),
      });
      setForm({ name: "", category: "", aliases: "" });
      setMsg("Skill added");
      load();
    } catch (e) {
      setMsg(e.response?.data?.message || "Failed to add skill");
    }
  };

  const remove = async (id) => {
    const skill = skills.find((s) => s._id === id);
    if (!(await confirmAction(`Delete the skill "${skill?.name ?? "this skill"}"? Students who list it keep it on their profile, but it leaves the taxonomy.`))) return;
    setMsg("");
    try {
      await api.delete(`/admin/skills/${id}`);
      setMsg("Skill deleted");
      load();
    } catch (e) {
      setMsg(e.response?.data?.message || "Failed to delete");
    }
  };

  const shown = skills.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  const input = "px-3 py-1.5 text-sm rounded-lg border border-slate-300";

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Add Skill</h2>
        <p className="text-sm text-slate-500 mb-4">
          Aliases must be unique across the entire taxonomy. Duplicates are rejected.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Skill name" className={input} />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
            className={`${input} min-w-0 bg-white`}>
            <option value="">Category…</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })}
            placeholder="Aliases (comma separated)" className={input} />
          <button onClick={create}
            className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">
            Add skill
          </button>
        </div>
        {msg && <p role="status" className="feedback-in text-sm text-slate-600 mt-3">{msg}</p>}
      </div>

      <div className="flex flex-wrap gap-3">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search skills"
          placeholder="Search skills…" className={`min-w-0 basis-full sm:basis-auto flex-1 bg-white ${input}`} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category"
          className={`${input} min-w-0 max-w-full bg-white`}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-sm text-slate-500 mb-4">{shown.length} skills</p>
        <div className="space-y-1.5">
          {shown.map((s) => (
            <div key={s._id} className="flex justify-between items-center px-4 py-2.5 rounded-lg border border-slate-100">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="text-slate-800">{s.name}</span>
                  <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-500">{s.category}</span>
                </div>
                {s.aliases?.length > 0 && (
                  <p className="text-xs text-slate-400 mt-0.5">{s.aliases.join(" · ")}</p>
                )}
              </div>
              <button onClick={() => remove(s._id)}
                className="text-xs text-slate-400 hover:text-red-600 underline">
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}