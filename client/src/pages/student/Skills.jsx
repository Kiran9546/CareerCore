import { useEffect, useState } from "react";
import api from "../../api/axios";

export default function Skills() {
  const [skills, setSkills] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [msg, setMsg] = useState("");
  const [unresolved, setUnresolved] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get("/student/profile")
      .then((res) => setSkills(res.data.student?.skills || []))
      .catch((e) =>
        // 404 = profile not created yet. Reading res.data.student.skills off a
        // rejected request left this page silently broken.
        setMsg(e.response?.data?.message || "Could not load your skills"),
      );
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const t = setTimeout(() => {
      api
        .get(`/student/skills/search?q=${encodeURIComponent(query)}`)
        .then((res) => setResults(res.data.results))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Clearing here rather than inside the effect keeps the effect body free of
  // synchronous setState, which React flags as a cascading render.
  const onQueryChange = (v) => {
    setQuery(v);
    if (v.trim().length < 2) setResults([]);
  };

  const add = (skill) => {
    if (skills.some((s) => s.name === skill.name)) {
      setQuery("");
      setResults([]);
      return;
    }
    setSkills([
      ...skills,
      { skillId: skill._id, name: skill.name, proficiency: 3 },
    ]);
    setQuery("");
    setResults([]);
  };

  const setProficiency = (name, level) => {
    setSkills(
      skills.map((s) => (s.name === name ? { ...s, proficiency: level } : s)),
    );
  };

  const remove = (name) => setSkills(skills.filter((s) => s.name !== name));

  const save = async () => {
    setBusy(true);
    setMsg("");
    setUnresolved([]);
    try {
      const res = await api.put("/student/skills", {
        skills: skills.map((s) => ({
          name: s.name,
          proficiency: s.proficiency,
        })),
      });
      setSkills(res.data.skills);
      setUnresolved(res.data.unresolved || []);
      setMsg(res.data.message);
    } catch (e) {
      setMsg(e.response?.data?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900";

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Your Skills</h2>
        <p className="text-sm text-slate-500 mb-5">
          Skills carry the highest PRS weight (30%). Proficiency is 1–5.
        </p>

        <div className="relative mb-6">
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search skills — try 'reactjs' or 'mongo db'"
            className={input}
          />
          {results.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r._id}
                  onClick={() => add(r)}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 flex justify-between items-center"
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
              className="flex items-center gap-4 px-4 py-3 rounded-lg border border-slate-200"
            >
              <span className="flex-1 text-slate-800">{s.name}</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setProficiency(s.name, n)}
                    className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                      n <= s.proficiency
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button
                onClick={() => remove(s.name)}
                className="text-sm text-slate-400 hover:text-red-600"
              >
                Remove
              </button>
            </div>
          ))}
          {!skills.length && (
            <p className="text-sm text-slate-400">No skills added yet.</p>
          )}
        </div>

        {unresolved.length > 0 && (
          <div className="mt-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-sm text-amber-900">
              Not recognised: {unresolved.join(", ")}
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={save}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save skills"}
          </button>
          {msg && <span className="text-sm text-slate-500">{msg}</span>}
        </div>
      </section>
    </div>
  );
}
