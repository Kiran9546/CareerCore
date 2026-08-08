import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";

export default function PostJob() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    description: "",
    location: "",
    ctc: "",
    minCgpa: 6,
    maxBacklogs: 0,
    openings: 1,
    deadline: "",
  });
  const [skills, setSkills] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const search = async (q) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const res = await api.get(
      `/student/skills/search?q=${encodeURIComponent(q)}`,
    );
    setResults(res.data.results);
  };

  const addSkill = (s) => {
    if (!skills.some((x) => x.name === s.name)) {
      setSkills([...skills, { name: s.name, isMandatory: false }]);
    }
    setQuery("");
    setResults([]);
  };

  const toggleMandatory = (name) =>
    setSkills(
      skills.map((s) =>
        s.name === name ? { ...s, isMandatory: !s.isMandatory } : s,
      ),
    );

  const removeSkill = (name) =>
    setSkills(skills.filter((s) => s.name !== name));

  const submit = async () => {
    if (!form.title) {
      setMsg("Job title is required");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await api.post("/recruiter/jobs", {
        ...form,
        ctc: form.ctc ? Number(form.ctc) : undefined,
        minCgpa: Number(form.minCgpa),
        maxBacklogs: Number(form.maxBacklogs),
        openings: Number(form.openings),
        deadline: form.deadline || undefined,
        requiredSkills: skills,
      });
      navigate("/recruiter");
    } catch (e) {
      setMsg(e.response?.data?.message || "Failed to post job");
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900";
  const label = "block text-sm font-medium text-slate-700 mb-1";

  return (
    <div className="space-y-6 max-w-3xl">
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-5">Job Details</h2>
        <div className="space-y-4">
          <div>
            <label className={label}>Job title</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={input}
              placeholder="Frontend Developer"
            />
          </div>
          <div>
            <label className={label}>Description</label>
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              className={input}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={label}>Location</label>
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className={input}
              />
            </div>
            <div>
              <label className={label}>CTC (₹/year)</label>
              <input
                type="number"
                value={form.ctc}
                onChange={(e) => setForm({ ...form, ctc: e.target.value })}
                className={input}
                placeholder="700000"
              />
            </div>
            <div>
              <label className={label}>Openings</label>
              <input
                type="number"
                min="1"
                value={form.openings}
                onChange={(e) => setForm({ ...form, openings: e.target.value })}
                className={input}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-1">
          Eligibility Criteria
        </h2>
        <p className="text-sm text-slate-500 mb-5">
          Students who fail these score 0% and won't appear in your candidate
          list.
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={label}>Minimum CGPA</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="10"
              value={form.minCgpa}
              onChange={(e) => setForm({ ...form, minCgpa: e.target.value })}
              className={input}
            />
          </div>
          <div>
            <label className={label}>Max backlogs</label>
            <input
              type="number"
              min="0"
              value={form.maxBacklogs}
              onChange={(e) =>
                setForm({ ...form, maxBacklogs: e.target.value })
              }
              className={input}
            />
          </div>
          <div>
            <label className={label}>Deadline</label>
            <input
              type="date"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              className={input}
            />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Required Skills</h2>
        <p className="text-sm text-slate-500 mb-5">
          Mandatory skills count double when scoring candidates.
        </p>

        <div className="relative mb-5">
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Search skills…"
            className={input}
          />
          {results.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r._id}
                  onClick={() => addSkill(r)}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 flex justify-between"
                >
                  <span className="text-slate-800">{r.name}</span>
                  <span className="text-xs text-slate-400">{r.category}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {skills.map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-slate-200"
            >
              <span className="text-slate-800">{s.name}</span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={s.isMandatory}
                    onChange={() => toggleMandatory(s.name)}
                  />
                  Mandatory
                </label>
                <button
                  onClick={() => removeSkill(s.name)}
                  className="text-sm text-slate-400 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          {!skills.length && (
            <p className="text-sm text-slate-400">No skills added yet.</p>
          )}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Posting…" : "Post job"}
        </button>
        {msg && <span className="text-sm text-red-600">{msg}</span>}
      </div>
    </div>
  );
}
