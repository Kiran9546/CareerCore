import { useEffect, useState } from "react";
import { toast } from "../../components/ui/toast";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { confirmAction } from "../../components/ui/confirm";
import NotificationPreferences from "../../components/NotificationPreferences";

const savedAt = (d) =>
  d ? new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
import api from "../../api/axios";

const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900";
const labelCls = "block text-sm font-medium text-slate-700 mb-1";

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [paths, setPaths] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // Which add/remove action is running, so a double click sends one request.
  const [pending, setPending] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

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
      setUpdatedAt(s.updatedAt);
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
    if (busy) return;
    setMsg("");
    const cgpa = Number(form.cgpa);
    if (form.cgpa === "" || Number.isNaN(cgpa) || cgpa < 0 || cgpa > 10) return setMsg("CGPA must be a number from 0 to 10.");
    const backlogs = Number(form.backlogs);
    if (!Number.isInteger(backlogs) || backlogs < 0) return setMsg("Backlogs must be a whole number of 0 or more.");
    if (form.phone && !/^[+\d][\d\s-]{6,19}$/.test(form.phone.trim())) return setMsg("Enter the phone number using digits, spaces or dashes.");

    setBusy(true);
    try {
      const r = await api.put("/student/profile", form);
      setUpdatedAt(r.data.student?.updatedAt || new Date().toISOString());
      toast("Profile saved");
    } catch (e) {
      setMsg(e.response?.data?.message || "Save failed");
    } finally { setBusy(false); }
  };

  /** Runs one add/remove request at a time and reports failures. */
  const run = async (key, fn, failure) => {
    if (pending) return;
    setPending(key);
    try {
      await fn();
    } catch (e) {
      toast(e.response?.data?.message || failure, { tone: "error" });
    } finally {
      setPending("");
    }
  };

  const addProject = () => {
    if (!newProject.title.trim()) return toast("Give the project a title first.", { tone: "error" });
    return run("addProject", async () => {
      const payload = {
        ...newProject,
        techStack: newProject.techStack.split(",").map((t) => t.trim()).filter(Boolean),
      };
      const res = await api.post("/student/projects", payload);
      setProjects(res.data.projects);
      setNewProject({ title: "", description: "", techStack: "", githubUrl: "" });
      toast("Project added");
    }, "The project could not be added.");
  };

  const removeProject = async (id) =>
    (await confirmAction("Remove this project from your profile?")) &&
    run(`rmProject:${id}`, async () => {
      const res = await api.delete(`/student/projects/${id}`);
      setProjects(res.data.projects);
      toast("Project removed");
    }, "The project could not be removed.");

  const addCert = () => {
    if (!newCert.name.trim() || !newCert.issuer.trim()) return toast("Enter the certification name and issuer.", { tone: "error" });
    return run("addCert", async () => {
      const res = await api.post("/student/certifications", newCert);
      setCerts(res.data.certifications);
      setNewCert({ name: "", issuer: "", issueDate: "" });
      toast("Certification added");
    }, "The certification could not be added.");
  };

  const removeCert = async (id) =>
    (await confirmAction("Remove this certification from your profile?")) &&
    run(`rmCert:${id}`, async () => {
      const res = await api.delete(`/student/certifications/${id}`);
      setCerts(res.data.certifications);
      toast("Certification removed");
    }, "The certification could not be removed.");

  // ─── Loading ───
  if (loading) return <PageSkeleton label="Loading profile" />;

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="cp-usn">USN</label>
              <input id="cp-usn" value={createForm.usn}
                onChange={(e) => setCreateForm({ ...createForm, usn: e.target.value })}
                className={inputCls} placeholder="4MT23IS039" />
            </div>
            <div>
              <label className={labelCls} htmlFor="cp-batch">Batch</label>
              <input id="cp-batch" value={createForm.batch}
                onChange={(e) => setCreateForm({ ...createForm, batch: e.target.value })}
                className={inputCls} placeholder="2026" />
            </div>
            <div>
              <label className={labelCls} htmlFor="cp-branch">Branch</label>
              <input id="cp-branch" value={createForm.branch}
                onChange={(e) => setCreateForm({ ...createForm, branch: e.target.value })}
                className={inputCls} placeholder="ISE" />
            </div>
            <div>
              <label className={labelCls} htmlFor="cp-phone">Phone</label>
              <input id="cp-phone" value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                className={inputCls} placeholder="Optional" />
            </div>
            <div>
              <label className={labelCls} htmlFor="cp-cgpa">CGPA</label>
              <input id="cp-cgpa" type="number" step="0.01" min="0" max="10" value={createForm.cgpa}
                onChange={(e) => setCreateForm({ ...createForm, cgpa: e.target.value })}
                className={inputCls} placeholder="8.40" />
            </div>
            <div>
              <label className={labelCls} htmlFor="cp-backlogs">Active backlogs</label>
              <input id="cp-backlogs" type="number" min="0" value={createForm.backlogs}
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls} htmlFor="pf-usn">USN</label>
            <input id="pf-usn" value={form.usn} disabled className={`${inputCls} bg-slate-50 text-slate-500`} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pf-batch">Batch</label>
            <input id="pf-batch" value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pf-branch">Branch</label>
            <input id="pf-branch" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pf-cgpa">CGPA</label>
            <input id="pf-cgpa" type="number" step="0.01" min="0" max="10" value={form.cgpa}
              onChange={(e) => setForm({ ...form, cgpa: Number(e.target.value) })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pf-backlogs">Active Backlogs</label>
            <input id="pf-backlogs" type="number" min="0" value={form.backlogs}
              onChange={(e) => setForm({ ...form, backlogs: Number(e.target.value) })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pf-phone">Phone</label>
            <input id="pf-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pf-github">GitHub Username</label>
            <input id="pf-github" value={form.githubUsername} onChange={(e) => setForm({ ...form, githubUsername: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="pf-career">Career Interest</label>
            <select id="pf-career" value={form.careerInterest}
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
          {msg && <span role="alert" className="text-sm text-red-700">{msg}</span>}
          {!msg && updatedAt && (
            <span className="text-xs text-slate-400">
              Last saved <time dateTime={updatedAt}>{savedAt(updatedAt)}</time>
            </span>
          )}
        </div>
      </section>

      <NotificationPreferences />

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Projects</h2>
        <p className="text-sm text-slate-500 mb-4">
          Tech stack matters: relevance to your target career path is 40% of the project score.
        </p>

        <div className="space-y-2 mb-5">
          {projects.map((p) => (
            <div key={p._id} className="flex justify-between items-start px-4 py-3 rounded-lg border border-slate-200">
              <div>
                <p className="font-medium text-slate-800">{p.title}</p>
                <p className="text-sm text-slate-500">{p.techStack?.join(" · ")}</p>
              </div>
              <button onClick={() => removeProject(p._id)} disabled={!!pending}
                className="text-sm text-slate-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed">Remove</button>
            </div>
          ))}
          {!projects.length && <p className="text-sm text-slate-400">No projects added yet.</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input placeholder="Project title" value={newProject.title}
            onChange={(e) => setNewProject({ ...newProject, title: e.target.value })} className={inputCls} />
          <input placeholder="Tech stack (comma separated)" value={newProject.techStack}
            onChange={(e) => setNewProject({ ...newProject, techStack: e.target.value })} className={inputCls} />
          <input placeholder="Description" value={newProject.description}
            onChange={(e) => setNewProject({ ...newProject, description: e.target.value })} className={inputCls} />
          <input placeholder="GitHub URL" value={newProject.githubUrl}
            onChange={(e) => setNewProject({ ...newProject, githubUrl: e.target.value })} className={inputCls} />
        </div>
        <button onClick={addProject} disabled={!!pending}
          className="mt-3 px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
          Add project
        </button>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Certifications</h2>
        <p className="text-sm text-slate-500 mb-4">Counted up to 4. Beyond that they add nothing to your score.</p>

        <div className="space-y-2 mb-5">
          {certs.map((c) => (
            <div key={c._id} className="flex justify-between items-start px-4 py-3 rounded-lg border border-slate-200">
              <div>
                <p className="font-medium text-slate-800">{c.name}</p>
                <p className="text-sm text-slate-500">{c.issuer}</p>
              </div>
              <button onClick={() => removeCert(c._id)} disabled={!!pending}
                className="text-sm text-slate-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed">Remove</button>
            </div>
          ))}
          {!certs.length && <p className="text-sm text-slate-400">No certifications added yet.</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input placeholder="Certification name" value={newCert.name}
            onChange={(e) => setNewCert({ ...newCert, name: e.target.value })} className={inputCls} />
          <input placeholder="Issuer" value={newCert.issuer}
            onChange={(e) => setNewCert({ ...newCert, issuer: e.target.value })} className={inputCls} />
          <input type="date" value={newCert.issueDate}
            onChange={(e) => setNewCert({ ...newCert, issueDate: e.target.value })} className={inputCls} />
        </div>
        <button onClick={addCert} disabled={!!pending}
          className="mt-3 px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
          Add certification
        </button>
      </section>
    </div>
  );
}