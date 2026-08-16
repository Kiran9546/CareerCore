import { useEffect, useState } from "react";
import api from "../../api/axios";

const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900";
const labelCls = "block text-sm font-medium text-slate-700 mb-1";

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [paths, setPaths] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Existing profile
  const [form, setForm] = useState(null);
  const [projects, setProjects] = useState([]);
  const [certs, setCerts] = useState([]);
  const [newProject, setNewProject] = useState({ title: "", description: "", techStack: "", githubUrl: "" });
  const [newCert, setNewCert] = useState({ name: "", issuer: "", issueDate: "" });

  // New profile
  const [createForm, setCreateForm] = useState({
    usn: "", batch: "", branch: "", cgpa: "", backlogs: 0, phone: "",
  });
  const [createError, setCreateError] = useState("");

  const loadProfile = async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        api.get("/student/profile"),
        api.get("/student/career-paths"),
      ]);

      const s = p.data.student;
      setForm({
        usn: s.usn, batch: s.batch, branch: s.branch,
        cgpa: s.cgpa, backlogs: s.backlogs, phone: s.phone || "",
        githubUsername: s.githubUsername || "",
        careerInterest: s.careerInterest?._id || "",
      });
      setProjects(s.projects || []);
      setCerts(s.certifications || []);
      setPaths(c.data.careerPaths);
      setHasProfile(true);
    } catch (err) {
      if (err.response?.status === 404) {
        // No student document yet — show the create form
        setHasProfile(false);
        try {
          const c = await api.get("/student/career-paths");
          setPaths(c.data.careerPaths);
        } catch {
          setPaths([]);
        }
      } else {
        setMsg(err.response?.data?.message || "Could not load profile");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
  const timer = setTimeout(() => {
    loadProfile();
  }, 0);

  return () => clearTimeout(timer);
}, []);

  const createProfile = async () => {
    setCreateError("");

    if (!createForm.usn.trim()) return setCreateError("USN is required");
    if (!createForm.batch.trim()) return setCreateError("Batch is required");
    if (!createForm.branch.trim()) return setCreateError("Branch is required");

    const cgpa = Number(createForm.cgpa);
    if (!createForm.cgpa || Number.isNaN(cgpa)) return setCreateError("CGPA is required");
    if (cgpa < 0 || cgpa > 10) return setCreateError("CGPA must be between 0 and 10");

    setBusy(true);
    try {
      await api.post("/student/profile", {
        usn: createForm.usn.trim().toUpperCase(),
        batch: createForm.batch.trim(),
        branch: createForm.branch.trim().toUpperCase(),
        cgpa,
        backlogs: Number(createForm.backlogs) || 0,
        phone: createForm.phone.trim(),
      });
      await loadProfile();
    } catch (err) {
      setCreateError(err.response?.data?.message || "Could not create profile");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await api.put("/student/profile", form);
      setMsg("Saved");
      setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      setMsg(e.response?.data?.message || "Save failed");
    } finally { setBusy(false); }
  };

  const addProject = async () => {
    if (!newProject.title) return;
    const payload = {
      ...newProject,
      techStack: newProject.techStack.split(",").map((t) => t.trim()).filter(Boolean),
    };
    const res = await api.post("/student/projects", payload);
    setProjects(res.data.projects);
    setNewProject({ title: "", description: "", techStack: "", githubUrl: "" });
  };

  const removeProject = async (id) => {
    const res = await api.delete(`/student/projects/${id}`);
    setProjects(res.data.projects);
  };

  const addCert = async () => {
    if (!newCert.name || !newCert.issuer) return;
    const res = await api.post("/student/certifications", newCert);
    setCerts(res.data.certifications);
    setNewCert({ name: "", issuer: "", issueDate: "" });
  };

  const removeCert = async (id) => {
    const res = await api.delete(`/student/certifications/${id}`);
    setCerts(res.data.certifications);
  };

  // ─── Loading ───
  if (loading) return <p className="text-slate-400">Loading…</p>;

  // ─── Error other than 404 ───
  if (msg && !hasProfile && !paths.length) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <p className="text-red-800">{msg}</p>
      </div>
    );
  }

  // ─── No profile yet — show create form ───
  if (!hasProfile) {
    return (
      <div className="max-w-2xl">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-1">Create your profile</h2>
          <p className="text-sm text-slate-500 mb-5">
            These details are needed before your Placement Readiness Score can be calculated.
            You can add skills, projects and certifications afterwards.
          </p>

          {createError && (
            <div className="mb-4 px-3 py-2 rounded bg-red-50 border border-red-200 text-sm text-red-700">
              {createError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>USN</label>
              <input value={createForm.usn}
                onChange={(e) => setCreateForm({ ...createForm, usn: e.target.value })}
                className={inputCls} placeholder="4MT23IS039" />
            </div>
            <div>
              <label className={labelCls}>Batch</label>
              <input value={createForm.batch}
                onChange={(e) => setCreateForm({ ...createForm, batch: e.target.value })}
                className={inputCls} placeholder="2026" />
            </div>
            <div>
              <label className={labelCls}>Branch</label>
              <input value={createForm.branch}
                onChange={(e) => setCreateForm({ ...createForm, branch: e.target.value })}
                className={inputCls} placeholder="ISE" />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                className={inputCls} placeholder="Optional" />
            </div>
            <div>
              <label className={labelCls}>CGPA</label>
              <input type="number" step="0.01" min="0" max="10" value={createForm.cgpa}
                onChange={(e) => setCreateForm({ ...createForm, cgpa: e.target.value })}
                className={inputCls} placeholder="8.40" />
            </div>
            <div>
              <label className={labelCls}>Active backlogs</label>
              <input type="number" min="0" value={createForm.backlogs}
                onChange={(e) => setCreateForm({ ...createForm, backlogs: e.target.value })}
                className={inputCls} />
            </div>
          </div>

          <button onClick={createProfile} disabled={busy}
            className="mt-5 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
            {busy ? "Creating…" : "Create profile"}
          </button>
        </div>
      </div>
    );
  }

  // ─── Existing profile ───
  return (
    <div className="space-y-6">

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Academic Details</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>USN</label>
            <input value={form.usn} disabled className={`${inputCls} bg-slate-50 text-slate-500`} />
          </div>
          <div>
            <label className={labelCls}>Batch</label>
            <input value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Branch</label>
            <input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>CGPA</label>
            <input type="number" step="0.01" min="0" max="10" value={form.cgpa}
              onChange={(e) => setForm({ ...form, cgpa: Number(e.target.value) })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Active Backlogs</label>
            <input type="number" min="0" value={form.backlogs}
              onChange={(e) => setForm({ ...form, backlogs: Number(e.target.value) })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>GitHub Username</label>
            <input value={form.githubUsername} onChange={(e) => setForm({ ...form, githubUsername: e.target.value })} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Career Interest</label>
            <select value={form.careerInterest}
              onChange={(e) => setForm({ ...form, careerInterest: e.target.value })} className={inputCls}>
              <option value="">Select a career path…</option>
              {paths.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button onClick={save} disabled={busy}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
            {busy ? "Saving…" : "Save changes"}
          </button>
          {msg && <span className="text-sm text-slate-500">{msg}</span>}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Projects</h2>
        <p className="text-sm text-slate-500 mb-4">
          Tech stack matters — relevance to your target career path is 40% of the project score.
        </p>

        <div className="space-y-2 mb-5">
          {projects.map((p) => (
            <div key={p._id} className="flex justify-between items-start px-4 py-3 rounded-lg border border-slate-200">
              <div>
                <p className="font-medium text-slate-800">{p.title}</p>
                <p className="text-sm text-slate-500">{p.techStack?.join(" · ")}</p>
              </div>
              <button onClick={() => removeProject(p._id)}
                className="text-sm text-slate-400 hover:text-red-600">Remove</button>
            </div>
          ))}
          {!projects.length && <p className="text-sm text-slate-400">No projects added yet.</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input placeholder="Project title" value={newProject.title}
            onChange={(e) => setNewProject({ ...newProject, title: e.target.value })} className={inputCls} />
          <input placeholder="Tech stack (comma separated)" value={newProject.techStack}
            onChange={(e) => setNewProject({ ...newProject, techStack: e.target.value })} className={inputCls} />
          <input placeholder="Description" value={newProject.description}
            onChange={(e) => setNewProject({ ...newProject, description: e.target.value })} className={inputCls} />
          <input placeholder="GitHub URL" value={newProject.githubUrl}
            onChange={(e) => setNewProject({ ...newProject, githubUrl: e.target.value })} className={inputCls} />
        </div>
        <button onClick={addProject}
          className="mt-3 px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">
          Add project
        </button>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Certifications</h2>
        <p className="text-sm text-slate-500 mb-4">Counted up to 4 — beyond that they add nothing to your score.</p>

        <div className="space-y-2 mb-5">
          {certs.map((c) => (
            <div key={c._id} className="flex justify-between items-start px-4 py-3 rounded-lg border border-slate-200">
              <div>
                <p className="font-medium text-slate-800">{c.name}</p>
                <p className="text-sm text-slate-500">{c.issuer}</p>
              </div>
              <button onClick={() => removeCert(c._id)}
                className="text-sm text-slate-400 hover:text-red-600">Remove</button>
            </div>
          ))}
          {!certs.length && <p className="text-sm text-slate-400">No certifications added yet.</p>}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <input placeholder="Certification name" value={newCert.name}
            onChange={(e) => setNewCert({ ...newCert, name: e.target.value })} className={inputCls} />
          <input placeholder="Issuer" value={newCert.issuer}
            onChange={(e) => setNewCert({ ...newCert, issuer: e.target.value })} className={inputCls} />
          <input type="date" value={newCert.issueDate}
            onChange={(e) => setNewCert({ ...newCert, issueDate: e.target.value })} className={inputCls} />
        </div>
        <button onClick={addCert}
          className="mt-3 px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">
          Add certification
        </button>
      </section>
    </div>
  );
}