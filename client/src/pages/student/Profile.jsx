import { useEffect, useState } from "react";
import api from "../../api/axios";

export default function Profile() {
  const [form, setForm] = useState(null);
  const [paths, setPaths] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState([]);
  const [certs, setCerts] = useState([]);

  const [newProject, setNewProject] = useState({
    title: "",
    description: "",
    techStack: "",
    githubUrl: "",
  });
  const [newCert, setNewCert] = useState({
    name: "",
    issuer: "",
    issueDate: "",
  });

  useEffect(() => {
    Promise.all([
      api.get("/student/profile"),
      api.get("/student/career-paths"),
    ]).then(([p, c]) => {
      const s = p.data.student;
      setForm({
        usn: s.usn,
        batch: s.batch,
        branch: s.branch,
        cgpa: s.cgpa,
        backlogs: s.backlogs,
        phone: s.phone || "",
        githubUsername: s.githubUsername || "",
        careerInterest: s.careerInterest?._id || "",
      });
      setProjects(s.projects || []);
      setCerts(s.certifications || []);
      setPaths(c.data.careerPaths);
    });
  }, []);

  const save = async () => {
    setBusy(true);
    setMsg("");
    try {
      await api.put("/student/profile", form);
      setMsg("Saved");
    } catch (e) {
      setMsg(e.response?.data?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const addProject = async () => {
    if (!newProject.title) return;
    const payload = {
      ...newProject,
      techStack: newProject.techStack
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
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

  if (!form) return <p className="text-slate-400">Loading…</p>;

  const input =
    "w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900";
  const label = "block text-sm font-medium text-slate-700 mb-1";

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Academic Details</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={label}>USN</label>
            <input
              value={form.usn}
              disabled
              className={`${input} bg-slate-50 text-slate-500`}
            />
          </div>
          <div>
            <label className={label}>Batch</label>
            <input
              value={form.batch}
              onChange={(e) => setForm({ ...form, batch: e.target.value })}
              className={input}
            />
          </div>
          <div>
            <label className={label}>Branch</label>
            <input
              value={form.branch}
              onChange={(e) => setForm({ ...form, branch: e.target.value })}
              className={input}
            />
          </div>
          <div>
            <label className={label}>CGPA</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="10"
              value={form.cgpa}
              onChange={(e) =>
                setForm({ ...form, cgpa: Number(e.target.value) })
              }
              className={input}
            />
          </div>
          <div>
            <label className={label}>Active Backlogs</label>
            <input
              type="number"
              min="0"
              value={form.backlogs}
              onChange={(e) =>
                setForm({ ...form, backlogs: Number(e.target.value) })
              }
              className={input}
            />
          </div>
          <div>
            <label className={label}>Phone</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={input}
            />
          </div>
          <div>
            <label className={label}>GitHub Username</label>
            <input
              value={form.githubUsername}
              onChange={(e) =>
                setForm({ ...form, githubUsername: e.target.value })
              }
              className={input}
            />
          </div>
          <div className="col-span-2">
            <label className={label}>Career Interest</label>
            <select
              value={form.careerInterest}
              onChange={(e) =>
                setForm({ ...form, careerInterest: e.target.value })
              }
              className={input}
            >
              <option value="">Select a career path…</option>
              {paths.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={save}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
          {msg && <span className="text-sm text-slate-500">{msg}</span>}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Projects</h2>
        <p className="text-sm text-slate-500 mb-4">
          Tech stack matters — relevance to your target career path is 40% of
          the project score.
        </p>

        <div className="space-y-2 mb-5">
          {projects.map((p) => (
            <div
              key={p._id}
              className="flex justify-between items-start px-4 py-3 rounded-lg border border-slate-200"
            >
              <div>
                <p className="font-medium text-slate-800">{p.title}</p>
                <p className="text-sm text-slate-500">
                  {p.techStack?.join(" · ")}
                </p>
              </div>
              <button
                onClick={() => removeProject(p._id)}
                className="text-sm text-slate-400 hover:text-red-600"
              >
                Remove
              </button>
            </div>
          ))}
          {!projects.length && (
            <p className="text-sm text-slate-400">No projects added yet.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Project title"
            value={newProject.title}
            onChange={(e) =>
              setNewProject({ ...newProject, title: e.target.value })
            }
            className={input}
          />
          <input
            placeholder="Tech stack (comma separated)"
            value={newProject.techStack}
            onChange={(e) =>
              setNewProject({ ...newProject, techStack: e.target.value })
            }
            className={input}
          />
          <input
            placeholder="Description"
            value={newProject.description}
            onChange={(e) =>
              setNewProject({ ...newProject, description: e.target.value })
            }
            className={input}
          />
          <input
            placeholder="GitHub URL"
            value={newProject.githubUrl}
            onChange={(e) =>
              setNewProject({ ...newProject, githubUrl: e.target.value })
            }
            className={input}
          />
        </div>
        <button
          onClick={addProject}
          className="mt-3 px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
        >
          Add project
        </button>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Certifications</h2>
        <p className="text-sm text-slate-500 mb-4">
          Counted up to 4 — beyond that they add nothing to your score.
        </p>

        <div className="space-y-2 mb-5">
          {certs.map((c) => (
            <div
              key={c._id}
              className="flex justify-between items-start px-4 py-3 rounded-lg border border-slate-200"
            >
              <div>
                <p className="font-medium text-slate-800">{c.name}</p>
                <p className="text-sm text-slate-500">{c.issuer}</p>
              </div>
              <button
                onClick={() => removeCert(c._id)}
                className="text-sm text-slate-400 hover:text-red-600"
              >
                Remove
              </button>
            </div>
          ))}
          {!certs.length && (
            <p className="text-sm text-slate-400">
              No certifications added yet.
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <input
            placeholder="Certification name"
            value={newCert.name}
            onChange={(e) => setNewCert({ ...newCert, name: e.target.value })}
            className={input}
          />
          <input
            placeholder="Issuer"
            value={newCert.issuer}
            onChange={(e) => setNewCert({ ...newCert, issuer: e.target.value })}
            className={input}
          />
          <input
            type="date"
            value={newCert.issueDate}
            onChange={(e) =>
              setNewCert({ ...newCert, issueDate: e.target.value })
            }
            className={input}
          />
        </div>
        <button
          onClick={addCert}
          className="mt-3 px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
        >
          Add certification
        </button>
      </section>
    </div>
  );
}
