import { useEffect, useState } from "react";
import api from "../../api/axios";

export default function Company() {
  const [form, setForm] = useState({
    name: "",
    industry: "",
    website: "",
    location: "",
    description: "",
  });
  const [exists, setExists] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/recruiter/company")
      .then((res) => {
        setForm(res.data.company);
        setExists(true);
      })
      .catch(() => setExists(false))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setMsg("");
    try {
      const res = exists
        ? await api.put("/recruiter/company", form)
        : await api.post("/recruiter/company", form);
      setForm(res.data.company);
      setExists(true);
      setMsg("Saved");
    } catch (e) {
      setMsg(e.response?.data?.message || "Save failed");
    }
  };

  if (loading) return <p className="text-slate-400">Loading…</p>;

  const input =
    "w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900";
  const label = "block text-sm font-medium text-slate-700 mb-1";

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-2xl">
      <h2 className="font-semibold text-slate-900 mb-1">Company Profile</h2>
      <p className="text-sm text-slate-500 mb-5">
        {exists
          ? "Update your company details."
          : "Create your company profile before posting jobs."}
      </p>

      <div className="space-y-4">
        <div>
          <label className={label}>Company name</label>
          <input
            value={form.name || ""}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={input}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Industry</label>
            <input
              value={form.industry || ""}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className={input}
            />
          </div>
          <div>
            <label className={label}>Location</label>
            <input
              value={form.location || ""}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className={input}
            />
          </div>
        </div>
        <div>
          <label className={label}>Website</label>
          <input
            value={form.website || ""}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            className={input}
          />
        </div>
        <div>
          <label className={label}>Description</label>
          <textarea
            rows={4}
            value={form.description || ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className={input}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-5">
        <button
          onClick={save}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
        >
          {exists ? "Save changes" : "Create profile"}
        </button>
        {msg && <span className="text-sm text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}
