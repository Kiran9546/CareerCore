import { useEffect, useRef, useState } from "react";
import api from "../../api/axios";
import { formatDate } from "../../utils/placement";

/**
 * Job postings by the placement cell.
 *
 * The officer's real workflow is: a company emails a JD, and the officer
 * needs students to know about it within minutes. So the form is built to
 * be finishable in two fields — company and title — with everything else
 * optional. The JD can simply be attached; typing the company blurb,
 * requirements and CTC by hand is offered for when no document arrived, not
 * demanded on top of the upload.
 *
 * Posting notifies every eligible student, not only close skill matches.
 */

const LEVEL_LABEL = {
  mass: "Mass recruiter",
  mid: "Mid tier",
  dream: "Dream",
  super_dream: "Super dream",
};

const LEVEL_STYLE = {
  mass: "bg-slate-100 text-slate-700",
  mid: "bg-blue-100 text-blue-700",
  dream: "bg-violet-100 text-violet-700",
  super_dream: "bg-amber-100 text-amber-800",
};

const EMPTY = {
  companyName: "",
  title: "",
  role: "",
  location: "",
  ctc: "",
  companyLevel: "",
  companyAbout: "",
  requirements: "",
  description: "",
  minCgpa: "",
  maxBacklogs: "0",
  eligibleBranches: "",
  eligibleBatches: "",
  deadline: "",
  openings: "1",
};

/** Job.ctc is stored in rupees; officers read and type LPA. */
const toLpa = (rupees) =>
  rupees === undefined || rupees === null ? "" : (rupees / 100000).toFixed(1);

const humanSize = (bytes) => {
  if (!bytes) return "";
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
};

export default function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [levels, setLevels] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [files, setFiles] = useState([]);
  const [skills, setSkills] = useState([]);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [applicants, setApplicants] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  const load = () => {
    api
      .get("/placement/jobs")
      .then((r) => {
        setJobs(r.data.jobs);
        setLevels(r.data.companyLevels || []);
      })
      .catch((e) => setError(e.response?.data?.message || "Could not load postings"));
  };

  useEffect(load, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const searchSkills = async (q) => {
    setQuery(q);
    if (q.trim().length < 2) return setMatches([]);
    try {
      const r = await api.get(`/student/skills/search?q=${encodeURIComponent(q)}`);
      setMatches(r.data.results);
    } catch {
      setMatches([]);
    }
  };

  const addSkill = (s) => {
    if (!skills.some((x) => x.name === s.name)) {
      setSkills([...skills, { name: s.name, isMandatory: false }]);
    }
    setQuery("");
    setMatches([]);
  };

  const reset = () => {
    setForm(EMPTY);
    setFiles([]);
    setSkills([]);
    setEditingId(null);
    setShowForm(false);
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const startEdit = (j) => {
    setEditingId(j._id);
    setForm({
      companyName: j.companyName || j.company || "",
      title: j.title || "",
      role: j.role || "",
      location: j.location || "",
      ctc: j.ctc === undefined || j.ctc === null ? "" : toLpa(j.ctc),
      companyLevel: j.companyLevel || "",
      companyAbout: j.companyAbout || "",
      requirements: j.requirements || "",
      description: j.description || "",
      minCgpa: j.minCgpa ?? "",
      maxBacklogs: String(j.maxBacklogs ?? 0),
      eligibleBranches: (j.eligibleBranches || []).join(", "),
      eligibleBatches: (j.eligibleBatches || []).join(", "),
      deadline: j.deadline ? new Date(j.deadline).toISOString().slice(0, 10) : "",
      openings: String(j.openings ?? 1),
    });
    setSkills(
      (j.requiredSkills || []).map((s) => ({
        name: s.name,
        isMandatory: s.isMandatory,
      })),
    );
    setFiles([]);
    setShowForm(true);
    setNotice("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    setError("");
    setNotice("");
    if (!form.companyName.trim()) return setError("Company name is required");
    if (!form.title.trim()) return setError("Job title is required");

    // multipart/form-data so the JD travels with the details in one request.
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) {
      if (v !== "" && v !== null && v !== undefined) fd.append(k, v);
    }
    fd.append("requiredSkills", JSON.stringify(skills));
    for (const f of files) fd.append("documents", f);

    setBusy(true);
    try {
      // Let the browser set the multipart boundary; the axios instance's
      // default JSON content-type would otherwise make the body unparseable.
      const cfg = { headers: { "Content-Type": "multipart/form-data" } };
      const res = editingId
        ? await api.put(`/placement/jobs/${editingId}`, fd, cfg)
        : await api.post("/placement/jobs", fd, cfg);
      setNotice(res.data.message || "Posting saved");
      reset();
      load();
    } catch (e) {
      setError(e.response?.data?.message || "Could not save the posting");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (j) => {
    setError("");
    try {
      await api.patch(`/placement/jobs/${j._id}/toggle`);
      load();
    } catch (e) {
      setError(e.response?.data?.message || "Could not update the posting");
    }
  };

  const remove = async (j) => {
    setError("");
    setNotice("");
    try {
      await api.delete(`/placement/jobs/${j._id}`);
      setNotice("Posting deleted");
      load();
    } catch (e) {
      setError(e.response?.data?.message || "Could not delete the posting");
    }
  };

  const dropAttachment = async (j, a) => {
    setError("");
    try {
      await api.delete(`/placement/jobs/${j._id}/attachments/${a._id}`);
      load();
    } catch (e) {
      setError(e.response?.data?.message || "Could not remove the file");
    }
  };

  const openApplicants = async (j) => {
    if (expanded === j._id) return setExpanded(null);
    setExpanded(j._id);
    if (applicants[j._id]) return;
    try {
      const r = await api.get(`/placement/jobs/${j._id}/applicants`);
      setApplicants((m) => ({ ...m, [j._id]: r.data.applicants }));
    } catch {
      setApplicants((m) => ({ ...m, [j._id]: [] }));
    }
  };

  const input =
    "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900";
  const label = "block text-xs font-medium text-slate-600 mb-1";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Job postings</h2>
          <p className="text-sm text-slate-500">
            Posting notifies every eligible student straight away.
          </p>
        </div>
        <button
          onClick={() => (showForm ? reset() : setShowForm(true))}
          className="px-3 py-1.5 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800"
        >
          {showForm ? "Cancel" : "Post a job"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {notice && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
          <p className="text-sm text-green-700">{notice}</p>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
          <h3 className="font-semibold text-slate-900">
            {editingId ? "Edit posting" : "New posting"}
          </h3>

          {/* ── The two fields that are actually required ───────── */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Company *</label>
              <input
                className={input}
                placeholder="e.g. Infosys"
                value={form.companyName}
                onChange={(e) => set("companyName", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Job title *</label>
              <input
                className={input}
                placeholder="e.g. Systems Engineer"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>
          </div>

          {/* ── Attach whatever the company sent ────────────────── */}
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
            <label className={label}>Job description &amp; company material</label>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt"
              onChange={(e) => setFiles([...e.target.files])}
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-slate-900 file:text-white hover:file:bg-slate-800"
            />
            <p className="text-xs text-slate-500 mt-2">
              Attach the JD exactly as the company sent it — PDF, Word, Excel,
              image or text, up to 5 files. Students can open these from the job
              listing. Everything below is optional; fill in what the document
              does not already say.
            </p>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f) => (
                  <li key={f.name} className="text-xs text-slate-600">
                    {f.name} <span className="text-slate-400">· {humanSize(f.size)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Everything else, typed by hand ──────────────────── */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={label}>Role</label>
              <input className={input} value={form.role} onChange={(e) => set("role", e.target.value)} />
            </div>
            <div>
              <label className={label}>Location</label>
              <input className={input} value={form.location} onChange={(e) => set("location", e.target.value)} />
            </div>
            <div>
              <label className={label}>CTC / LPA</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className={input}
                placeholder="e.g. 7.5"
                value={form.ctc}
                onChange={(e) => set("ctc", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Company level</label>
              <select
                className={input}
                value={form.companyLevel}
                onChange={(e) => set("companyLevel", e.target.value)}
              >
                <option value="">Not specified</option>
                {levels.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label} — {l.hint}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Openings</label>
              <input
                type="number"
                min="1"
                className={input}
                value={form.openings}
                onChange={(e) => set("openings", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Application deadline</label>
              <input
                type="date"
                className={input}
                value={form.deadline}
                onChange={(e) => set("deadline", e.target.value)}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>About the company</label>
              <textarea
                rows={4}
                className={input}
                placeholder="What the company does, where they hire for, anything students should know before applying."
                value={form.companyAbout}
                onChange={(e) => set("companyAbout", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Requirements</label>
              <textarea
                rows={4}
                className={input}
                placeholder="Bond period, service agreement, shift timings, anything the skill list below cannot express."
                value={form.requirements}
                onChange={(e) => set("requirements", e.target.value)}
              />
            </div>
          </div>

          {/* ── Eligibility ─────────────────────────────────────── */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className={label}>Minimum CGPA</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="10"
                className={input}
                value={form.minCgpa}
                onChange={(e) => set("minCgpa", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Maximum backlogs</label>
              <input
                type="number"
                min="0"
                className={input}
                value={form.maxBacklogs}
                onChange={(e) => set("maxBacklogs", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Eligible branches</label>
              <input
                className={input}
                placeholder="ISE, CSE — blank means all"
                value={form.eligibleBranches}
                onChange={(e) => set("eligibleBranches", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Eligible batches</label>
              <input
                className={input}
                placeholder="2026 — blank means all"
                value={form.eligibleBatches}
                onChange={(e) => set("eligibleBatches", e.target.value)}
              />
            </div>
          </div>

          {/* ── Skills ──────────────────────────────────────────── */}
          <div>
            <label className={label}>Required skills</label>
            <input
              className={input}
              placeholder="Type to search the skill list…"
              value={query}
              onChange={(e) => searchSkills(e.target.value)}
            />
            {matches.length > 0 && (
              <div className="mt-1 border border-slate-200 rounded-lg bg-white max-h-40 overflow-y-auto">
                {matches.map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    onClick={() => addSkill(m)}
                    className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50"
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {skills.map((s) => (
                  <span
                    key={s.name}
                    className={`px-2 py-1 rounded text-xs flex items-center gap-2 ${
                      s.isMandatory
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {s.name}
                    <button
                      type="button"
                      title="Toggle mandatory"
                      onClick={() =>
                        setSkills(
                          skills.map((x) =>
                            x.name === s.name
                              ? { ...x, isMandatory: !x.isMandatory }
                              : x,
                          ),
                        )
                      }
                      className="underline"
                    >
                      {s.isMandatory ? "required" : "optional"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSkills(skills.filter((x) => x.name !== s.name))}
                      aria-label={`Remove ${s.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={busy}
              className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? "Saving…" : editingId ? "Save changes" : "Post & notify students"}
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Postings ─────────────────────────────────────────── */}
      <div className="space-y-3">
        {jobs.map((j) => (
          <div key={j._id} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex flex-wrap justify-between items-start gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-slate-900">{j.title}</h3>
                  {j.companyLevel && (
                    <span className={`px-2 py-0.5 rounded text-xs ${LEVEL_STYLE[j.companyLevel]}`}>
                      {LEVEL_LABEL[j.companyLevel]}
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${
                      j.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {j.isActive ? "Open" : "Closed"}
                  </span>
                  {j.source === "recruiter" && (
                    <span
                      className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700"
                      title="Posted by a recruiter through their own account"
                    >
                      Recruiter posting
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600 mt-0.5">
                  {j.company}
                  {j.location ? ` · ${j.location}` : ""}
                  {j.ctc ? ` · ₹${toLpa(j.ctc)} LPA` : ""}
                  {j.openings ? ` · ${j.openings} opening${j.openings > 1 ? "s" : ""}` : ""}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  CGPA ≥ {j.minCgpa ?? 0} · backlogs ≤ {j.maxBacklogs ?? 0} ·{" "}
                  {j.eligibleBranches?.length ? j.eligibleBranches.join(", ") : "all branches"}
                  {j.deadline ? ` · closes ${formatDate(j.deadline)}` : ""}
                </p>
              </div>
              <div className="text-right shrink-0">
                <button
                  onClick={() => openApplicants(j)}
                  className="text-sm text-slate-700 underline"
                >
                  {j.applicantCount} applicant{j.applicantCount === 1 ? "" : "s"}
                </button>
              </div>
            </div>

            {(j.companyAbout || j.requirements) && (
              <div className="grid sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
                {j.companyAbout && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                      About
                    </p>
                    <p className="text-sm text-slate-600 whitespace-pre-line">{j.companyAbout}</p>
                  </div>
                )}
                {j.requirements && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                      Requirements
                    </p>
                    <p className="text-sm text-slate-600 whitespace-pre-line">{j.requirements}</p>
                  </div>
                )}
              </div>
            )}

            {j.attachments?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                  Documents
                </p>
                <ul className="flex flex-wrap gap-2">
                  {j.attachments.map((a) => (
                    <li
                      key={a._id}
                      className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200"
                    >
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-slate-700 hover:underline"
                      >
                        {a.originalName}
                      </a>
                      <span className="text-xs text-slate-400">{humanSize(a.sizeBytes)}</span>
                      {j.source === "placement_cell" && (
                        <button
                          onClick={() => dropAttachment(j, a)}
                          className="text-xs text-red-600 hover:text-red-800"
                          aria-label={`Remove ${a.originalName}`}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {expanded === j._id && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                {!applicants[j._id] ? (
                  <p className="text-sm text-slate-400">Loading applicants…</p>
                ) : applicants[j._id].length === 0 ? (
                  <p className="text-sm text-slate-400">No applications yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="pb-2 font-medium">Student</th>
                        <th className="pb-2 font-medium">Branch</th>
                        <th className="pb-2 font-medium">CGPA</th>
                        <th className="pb-2 font-medium">Match</th>
                        <th className="pb-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applicants[j._id].map((a) => (
                        <tr key={a._id} className="border-b border-slate-100 last:border-0">
                          <td className="py-2">
                            <p className="text-slate-800">{a.student.name}</p>
                            <p className="text-xs text-slate-400">{a.student.usn}</p>
                          </td>
                          <td className="py-2 text-slate-600">{a.student.branch}</td>
                          <td className="py-2 text-slate-600">{a.student.cgpa}</td>
                          <td className="py-2 text-slate-600">{a.matchPercent}%</td>
                          <td className="py-2 text-slate-600 capitalize">
                            {a.status.replace("_", " ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {j.source === "placement_cell" && (
              <div className="flex gap-3 mt-4 pt-4 border-t border-slate-100">
                <button onClick={() => startEdit(j)} className="text-xs text-slate-600 underline">
                  Edit
                </button>
                <button onClick={() => toggle(j)} className="text-xs text-slate-600 underline">
                  {j.isActive ? "Close applications" : "Reopen"}
                </button>
                {j.applicantCount === 0 && (
                  <button onClick={() => remove(j)} className="text-xs text-red-600 underline">
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {!jobs.length && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-slate-500">
              No postings yet. Post one and every eligible student is notified.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
