import { useEffect, useState, useRef } from "react";
import api from "../../api/axios";
import html2pdf from "html2pdf.js";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900";
const labelCls = "block text-sm font-medium text-slate-700 mb-1.5";

const sectionHeading = {
  fontSize: "13pt",
  fontWeight: "bold",
  color: "#2e5c8a",
  margin: "0 0 6px",
  letterSpacing: "0.3px",
};

const rowBetween = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
};
const contactLine = { margin: "1px 0", whiteSpace: "nowrap" };
const linkStyle = { color: "#1155cc", textDecoration: "underline" };

function Field({ label, hint, children }) {
  return (
    <div className="mb-5">
      <label className={labelCls}>{label}</label>
      {hint && <p className="text-xs text-slate-400 mb-1.5 -mt-1">{hint}</p>}
      {children}
    </div>
  );
}

function Card({ title, subtitle, children, action }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-6 mb-4">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {subtitle && (
            <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ListEditor({ items, onChange, placeholder }) {
  return (
    <div className="space-y-2">
      {items.map((v, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={v}
            placeholder={placeholder}
            className={inputCls}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <button
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="px-3 text-slate-400 hover:text-red-600 text-sm"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...items, ""])}
        className="text-sm text-slate-500 hover:text-slate-900 underline"
      >
        + Add
      </button>
    </div>
  );
}

export default function Resume() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const previewRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    api
      .get("/student/resume")
      .then((r) => {
        setData(r.data);
        setForm(r.data.resume);
      })
      .catch((e) =>
        setMsg(e.response?.data?.message || "Could not load resume"),
      );
  }, []);

  const set = (path, value) => {
    setForm((prev) => {
      const next = structuredClone(prev);
      const keys = path.split(".");
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) {
        if (obj[keys[i]] === undefined || obj[keys[i]] === null)
          obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const r = await api.put("/student/resume", form);
      setForm(r.data.resume);
      setMsg("Saved");
      setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      setMsg(e.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const reset = async (section) => {
    const r = await api.post(`/student/resume/reset/${section}`);
    setForm(r.data.resume);
    setMsg(`${section} reset from profile`);
    setTimeout(() => setMsg(""), 2000);
  };

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoError("");

    const allowed = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowed.includes(file.type)) {
      setPhotoError("Only JPG, JPEG or PNG files are allowed");
      e.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("Photo must be under 2 MB");
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);

      const res = await api.post("/student/resume/photo", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      set("photoUrl", res.data.photoUrl);
    } catch (err) {
      setPhotoError(err.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removePhoto = async () => {
    setPhotoError("");
    try {
      await api.delete("/student/resume/photo");
      set("photoUrl", "");
    } catch (err) {
      setPhotoError(err.response?.data?.message || "Could not remove photo");
    }
  };

  const download = () => {
    const el = previewRef.current;
    const prevWidth = el.style.width;
    el.style.width = "186mm";

    html2pdf()
      .set({
        margin: [10, 12, 10, 12],
        filename: `${data.profile.usn}_${data.profile.name.replace(/\s+/g, "_").toUpperCase()}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, windowWidth: 794, width: 794 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(el)
      .save()
      .then(() => {
        el.style.width = prevWidth;
      });
  };

  if (msg && !form) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-900">
        {msg}
      </div>
    );
  }
  if (!form) return <p className="text-slate-400">Loading…</p>;

  const p = data.profile;
  const ed = form.education || {};

  return (
    <div className="grid grid-cols-2 gap-6 items-start">
      {/* ─────────────── FORM ─────────────── */}
      <div className="max-h-[calc(100vh-12rem)] overflow-y-auto pr-2">
        <div className="sticky top-0 bg-slate-50 pb-3 z-10 flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={download}
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-white"
          >
            Download PDF
          </button>
          {msg && (
            <span className="text-sm text-slate-500 self-center">{msg}</span>
          )}
        </div>

        <Card title="Contact" subtitle="Appears in the header of your resume">
          <Field label="Photo" hint="Optional — JPG or PNG, under 2 MB">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              onChange={handlePhotoSelect}
              style={{ display: "none" }}
            />

            {form.photoUrl ? (
              <div className="flex items-center gap-4">
                <img
                  src={form.photoUrl}
                  alt="Resume photo"
                  className="w-20 h-24 object-cover rounded border border-slate-300"
                />
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {uploading ? "Uploading…" : "Replace photo"}
                  </button>
                  <button
                    onClick={removePhoto}
                    disabled={uploading}
                    className="px-3 py-1.5 text-sm rounded-lg text-slate-500 hover:text-red-600 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full px-4 py-6 rounded-lg border-2 border-dashed border-slate-300 text-sm text-slate-500 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Click to upload your photo"}
              </button>
            )}

            {photoError && <p className="text-xs text-red-600 mt-2">{photoError}</p>}
          </Field>
          <Field label="Phone">
            <input
              value={form.phone || ""}
              onChange={(e) => set("phone", e.target.value)}
              className={inputCls}
              placeholder="+91-9876543210"
            />
          </Field>
          <Field label="LinkedIn">
            <input
              value={form.linkedinUrl || ""}
              onChange={(e) => set("linkedinUrl", e.target.value)}
              className={inputCls}
              placeholder="https://linkedin.com/in/…"
            />
          </Field>
          <Field label="GitHub">
            <input
              value={form.githubUrl || ""}
              onChange={(e) => set("githubUrl", e.target.value)}
              className={inputCls}
              placeholder="https://github.com/…"
            />
          </Field>
          <Field label="Address">
            <input
              value={form.address || ""}
              onChange={(e) => set("address", e.target.value)}
              className={inputCls}
              placeholder="House, Street, City, District, PIN"
            />
          </Field>
        </Card>

        <Card
          title="Summary"
          subtitle="3–4 lines on who you are and what you're good at"
        >
          <textarea
            rows={5}
            value={form.summary || ""}
            onChange={(e) => set("summary", e.target.value)}
            className={inputCls}
            placeholder="Third-year Information Science student with strong interest in…"
          />
        </Card>

        <Card title="Education">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
            Degree
          </p>
          <Field label="Course">
            <input
              value={ed.degree?.course || ""}
              onChange={(e) => set("education.degree.course", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Institution">
            <input
              value={ed.degree?.institution || ""}
              onChange={(e) =>
                set("education.degree.institution", e.target.value)
              }
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Years">
              <input
                value={ed.degree?.yearRange || ""}
                onChange={(e) =>
                  set("education.degree.yearRange", e.target.value)
                }
                className={inputCls}
                placeholder="2023-Present"
              />
            </Field>
            <Field label="CGPA" hint="From your profile">
              <input
                value={ed.degree?.cgpa ?? ""}
                disabled
                className={`${inputCls} bg-slate-50 text-slate-500`}
              />
            </Field>
          </div>

          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3 mt-2">
            Class XII
          </p>
          <Field label="Institution">
            <input
              value={ed.twelfth?.institution || ""}
              onChange={(e) =>
                set("education.twelfth.institution", e.target.value)
              }
              className={inputCls}
              placeholder="Vidyodaya PU College, Udupi."
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Years">
              <input
                value={ed.twelfth?.yearRange || ""}
                onChange={(e) =>
                  set("education.twelfth.yearRange", e.target.value)
                }
                className={inputCls}
                placeholder="2022-2023"
              />
            </Field>
            <Field label="Percentage">
              <input
                type="number"
                step="0.01"
                value={ed.twelfth?.percentage ?? ""}
                onChange={(e) =>
                  set("education.twelfth.percentage", Number(e.target.value))
                }
                className={inputCls}
              />
            </Field>
          </div>

          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3 mt-2">
            Class X
          </p>
          <Field label="Institution">
            <input
              value={ed.tenth?.institution || ""}
              onChange={(e) =>
                set("education.tenth.institution", e.target.value)
              }
              className={inputCls}
              placeholder="School name, City."
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Years">
              <input
                value={ed.tenth?.yearRange || ""}
                onChange={(e) =>
                  set("education.tenth.yearRange", e.target.value)
                }
                className={inputCls}
                placeholder="2020-2021"
              />
            </Field>
            <Field label="Percentage">
              <input
                type="number"
                step="0.01"
                value={ed.tenth?.percentage ?? ""}
                onChange={(e) =>
                  set("education.tenth.percentage", Number(e.target.value))
                }
                className={inputCls}
              />
            </Field>
          </div>
        </Card>

        <Card
          title="Technical Skills"
          subtitle={
            form.skillsManuallyEdited
              ? "Manually edited"
              : "Auto-filled from your profile skills"
          }
          action={
            form.skillsManuallyEdited && (
              <button
                onClick={() => reset("skills")}
                className="text-xs text-slate-500 hover:text-slate-900 underline"
              >
                Reset from profile
              </button>
            )
          }
        >
          {["languages", "interface", "database", "tools"].map((k) => (
            <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
              <input
                value={form.technicalSkills?.[k] || ""}
                onChange={(e) => set(`technicalSkills.${k}`, e.target.value)}
                className={inputCls}
                placeholder="Comma separated"
              />
            </Field>
          ))}
        </Card>

        <Card
          title="Projects"
          subtitle={
            form.projectsManuallyEdited
              ? "Manually edited"
              : "Auto-filled from your profile projects"
          }
          action={
            form.projectsManuallyEdited && (
              <button
                onClick={() => reset("projects")}
                className="text-xs text-slate-500 hover:text-slate-900 underline"
              >
                Reset from profile
              </button>
            )
          }
        >
          {(form.projects || []).map((pr, i) => (
            <div
              key={i}
              className="mb-5 pb-5 border-b border-slate-100 last:border-0 last:pb-0"
            >
              <div className="flex gap-2 mb-3">
                <input
                  value={pr.title || ""}
                  placeholder="Project title"
                  className={inputCls}
                  onChange={(e) => {
                    const next = [...form.projects];
                    next[i] = { ...pr, title: e.target.value };
                    set("projects", next);
                  }}
                />
                <button
                  onClick={() =>
                    set(
                      "projects",
                      form.projects.filter((_, j) => j !== i),
                    )
                  }
                  className="px-3 text-slate-400 hover:text-red-600 text-sm"
                >
                  ×
                </button>
              </div>
              <input
                value={pr.subtitle || ""}
                placeholder="Subtitle — e.g. Ongoing, Final Year Project"
                className={`${inputCls} mb-3`}
                onChange={(e) => {
                  const next = [...form.projects];
                  next[i] = { ...pr, subtitle: e.target.value };
                  set("projects", next);
                }}
              />
              <p className="text-xs text-slate-500 mb-2">Bullet points</p>
              <ListEditor
                items={pr.bullets || []}
                placeholder="What you built or achieved"
                onChange={(bullets) => {
                  const next = [...form.projects];
                  next[i] = { ...pr, bullets };
                  set("projects", next);
                }}
              />
            </div>
          ))}
          <button
            onClick={() =>
              set("projects", [
                ...(form.projects || []),
                { title: "", subtitle: "", bullets: [""] },
              ])
            }
            className="text-sm text-slate-500 hover:text-slate-900 underline mt-2"
          >
            + Add project
          </button>
        </Card>

        <Card title="Internships" subtitle="Optional">
          {(form.internships || []).map((it, i) => (
            <div
              key={i}
              className="mb-5 pb-5 border-b border-slate-100 last:border-0 last:pb-0"
            >
              <div className="flex gap-2 mb-3">
                <input
                  value={it.role || ""}
                  placeholder="Role"
                  className={inputCls}
                  onChange={(e) => {
                    const next = [...form.internships];
                    next[i] = { ...it, role: e.target.value };
                    set("internships", next);
                  }}
                />
                <button
                  onClick={() =>
                    set(
                      "internships",
                      form.internships.filter((_, j) => j !== i),
                    )
                  }
                  className="px-3 text-slate-400 hover:text-red-600 text-sm"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <input
                  value={it.company || ""}
                  placeholder="Company"
                  className={inputCls}
                  onChange={(e) => {
                    const next = [...form.internships];
                    next[i] = { ...it, company: e.target.value };
                    set("internships", next);
                  }}
                />
                <input
                  value={it.duration || ""}
                  placeholder="Jun 2025 – Aug 2025"
                  className={inputCls}
                  onChange={(e) => {
                    const next = [...form.internships];
                    next[i] = { ...it, duration: e.target.value };
                    set("internships", next);
                  }}
                />
              </div>
              <ListEditor
                items={it.bullets || []}
                placeholder="What you did"
                onChange={(bullets) => {
                  const next = [...form.internships];
                  next[i] = { ...it, bullets };
                  set("internships", next);
                }}
              />
            </div>
          ))}
          <button
            onClick={() =>
              set("internships", [
                ...(form.internships || []),
                { role: "", company: "", duration: "", bullets: [""] },
              ])
            }
            className="text-sm text-slate-500 hover:text-slate-900 underline mt-2"
          >
            + Add internship
          </button>
        </Card>

        <Card
          title="Certifications"
          subtitle="Auto-filled from your profile"
          action={
            <button
              onClick={() => reset("certifications")}
              className="text-xs text-slate-500 hover:text-slate-900 underline"
            >
              Reset from profile
            </button>
          }
        >
          {(form.certifications || []).map((c, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input
                value={c.name || ""}
                placeholder="Certification"
                className={inputCls}
                onChange={(e) => {
                  const next = [...form.certifications];
                  next[i] = { ...c, name: e.target.value };
                  set("certifications", next);
                }}
              />
              <input
                value={c.issuer || ""}
                placeholder="Issuer"
                className={inputCls}
                onChange={(e) => {
                  const next = [...form.certifications];
                  next[i] = { ...c, issuer: e.target.value };
                  set("certifications", next);
                }}
              />
              <input
                value={c.year || ""}
                placeholder="Year"
                className="w-24 px-3 py-2 rounded-lg border border-slate-300 text-sm"
                onChange={(e) => {
                  const next = [...form.certifications];
                  next[i] = { ...c, year: e.target.value };
                  set("certifications", next);
                }}
              />
              <button
                onClick={() =>
                  set(
                    "certifications",
                    form.certifications.filter((_, j) => j !== i),
                  )
                }
                className="px-2 text-slate-400 hover:text-red-600 text-sm"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              set("certifications", [
                ...(form.certifications || []),
                { name: "", issuer: "", year: "" },
              ])
            }
            className="text-sm text-slate-500 hover:text-slate-900 underline mt-2"
          >
            + Add certification
          </button>
        </Card>

        <Card title="Achievements" subtitle="Optional">
          <ListEditor
            items={form.achievements || []}
            placeholder="Won inter-college hackathon, 2025"
            onChange={(v) => set("achievements", v)}
          />
        </Card>

        <Card title="Positions of Responsibility" subtitle="Optional">
          <ListEditor
            items={form.positions || []}
            placeholder="Technical Head, CS Association"
            onChange={(v) => set("positions", v)}
          />
        </Card>

        <Card title="Languages Known" subtitle="Optional">
          <ListEditor
            items={form.languagesKnown || []}
            placeholder="English"
            onChange={(v) => set("languagesKnown", v)}
          />
        </Card>

        <div className="h-8" />
      </div>

      {/* ─────────────── PREVIEW ─────────────── */}
      <div className="sticky top-24">
        <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">
          Live preview
        </p>
        <div className="bg-white border border-slate-300 shadow-sm overflow-y-auto max-h-[calc(100vh-14rem)]">
          <div
            ref={previewRef}
            className="p-8"
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: "10.5pt",
              lineHeight: 1.45,
              color: "#000",
            }}
          >
            {/* Header */}
            <div
              style={{
                fontFamily: "'Times New Roman', Times, serif",
                fontSize: "10.5pt",
                lineHeight: 1.45,
                color: "#000",
                fontVariantNumeric: "lining-nums",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1
                  style={{
                    fontSize: "20pt",
                    fontWeight: "bold",
                    margin: "0 0 6px",
                  }}
                >
                  {p.name}
                </h1>
                {form.phone && (
                  <p style={contactLine}>
                    <b>Phone No:</b> {form.phone}
                  </p>
                )}
                <p style={contactLine}>
                  <b>Gmail :</b> <span style={linkStyle}>{p.email}</span>
                </p>
                {form.linkedinUrl && (
                  <p style={contactLine}>
                    <b>LinkedIn:</b>{" "}
                    <span style={linkStyle}>{form.linkedinUrl}</span>
                  </p>
                )}
                {form.githubUrl && (
                  <p style={contactLine}>
                    <b>Git Hub :</b>{" "}
                    <span style={linkStyle}>{form.githubUrl}</span>
                  </p>
                )}
                {form.address && (
                  <p style={{ margin: "1px 0" }}>
                    <b>Address :</b> {form.address}
                  </p>
                )}
              </div>
              {form.photoUrl && (
                <img
                  src={form.photoUrl}
                  alt=""
                  style={{
                    width: "82px",
                    height: "100px",
                    objectFit: "cover",
                    border: "1px solid #999",
                    flexShrink: 0,
                  }}
                />
              )}
            </div>

            <hr
              style={{
                border: 0,
                borderTop: "1.5px solid #000",
                margin: "8px 0 12px",
              }}
            />

            {form.summary && (
              <>
                <h2 style={sectionHeading}>SUMMARY</h2>
                <p style={{ margin: "0 0 12px", textAlign: "justify" }}>
                  {form.summary}
                </p>
              </>
            )}

            <h2 style={sectionHeading}>EDUCATION</h2>
            {ed.degree?.course && (
              <div style={{ marginBottom: "10px" }}>
                <div style={rowBetween}>
                  <b>{ed.degree.course}</b>
                  <b style={{ whiteSpace: "nowrap" }}>{ed.degree.yearRange}</b>
                </div>
                <div style={rowBetween}>
                  <span>{ed.degree.institution}</span>
                  <span style={{ whiteSpace: "nowrap" }}>
                    CGPA: {ed.degree.cgpa}
                  </span>
                </div>
              </div>
            )}
            {ed.twelfth?.institution && (
              <div style={{ marginBottom: "10px" }}>
                <div style={rowBetween}>
                  <b>{ed.twelfth.title}</b>
                  <b style={{ whiteSpace: "nowrap" }}>{ed.twelfth.yearRange}</b>
                </div>
                <div style={rowBetween}>
                  <span>{ed.twelfth.institution}</span>
                  <span style={{ whiteSpace: "nowrap" }}>
                    Percentage: {ed.twelfth.percentage} %
                  </span>
                </div>
              </div>
            )}
            {ed.tenth?.institution && (
              <div style={{ marginBottom: "12px" }}>
                <div style={rowBetween}>
                  <b>{ed.tenth.title}</b>
                  <b style={{ whiteSpace: "nowrap" }}>{ed.tenth.yearRange}</b>
                </div>
                <div style={rowBetween}>
                  <span>{ed.tenth.institution}</span>
                  <span style={{ whiteSpace: "nowrap" }}>
                    Percentage: {ed.tenth.percentage}%
                  </span>
                </div>
              </div>
            )}

            <h2 style={sectionHeading}>TECHNICAL SKILLS</h2>
            <div style={{ marginBottom: "12px" }}>
              {form.technicalSkills?.languages && (
                <p style={{ margin: "1px 0" }}>
                  <b>Languages:</b> {form.technicalSkills.languages}
                </p>
              )}
              {form.technicalSkills?.interface && (
                <p style={{ margin: "1px 0" }}>
                  <b>Interface:</b> {form.technicalSkills.interface}
                </p>
              )}
              {form.technicalSkills?.database && (
                <p style={{ margin: "1px 0" }}>
                  <b>Database:</b> {form.technicalSkills.database}
                </p>
              )}
              {form.technicalSkills?.tools && (
                <p style={{ margin: "1px 0" }}>
                  <b>Tools:</b> {form.technicalSkills.tools}
                </p>
              )}
            </div>

            {form.projects?.filter((x) => x.title).length > 0 && (
              <>
                <h2 style={sectionHeading}>PROJECTS</h2>
                {form.projects
                  .filter((x) => x.title)
                  .map((pr, i) => (
                    <div key={i} style={{ marginBottom: "12px" }}>
                      <p
                        style={{
                          margin: "0 0 4px",
                          fontWeight: "bold",
                          fontSize: "11.5pt",
                        }}
                      >
                        {pr.title}
                        {pr.subtitle ? ` (${pr.subtitle})` : ""}
                      </p>
                      <ul style={{ margin: "0 0 0 18px", padding: 0 }}>
                        {(pr.bullets || []).filter(Boolean).map((b, j) => (
                          <li key={j} style={{ marginBottom: "2px" }}>
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </>
            )}

            {form.internships?.filter((x) => x.role).length > 0 && (
              <>
                <h2 style={sectionHeading}>INTERNSHIPS</h2>
                {form.internships
                  .filter((x) => x.role)
                  .map((it, i) => (
                    <div key={i} style={{ marginBottom: "12px" }}>
                      <div style={rowBetween}>
                        <b>
                          {it.role}
                          {it.company ? ` — ${it.company}` : ""}
                        </b>
                        <b style={{ whiteSpace: "nowrap" }}>{it.duration}</b>
                      </div>
                      <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
                        {(it.bullets || []).filter(Boolean).map((b, j) => (
                          <li key={j}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </>
            )}

            {form.certifications?.filter((c) => c.name).length > 0 && (
              <>
                <h2 style={sectionHeading}>CERTIFICATIONS</h2>
                <ul style={{ margin: "0 0 12px 18px", padding: 0 }}>
                  {form.certifications
                    .filter((c) => c.name)
                    .map((c, i) => (
                      <li key={i}>
                        {c.name}
                        {c.issuer ? ` — ${c.issuer}` : ""}
                        {c.year ? `, ${c.year}` : ""}
                      </li>
                    ))}
                </ul>
              </>
            )}

            {form.achievements?.filter(Boolean).length > 0 && (
              <>
                <h2 style={sectionHeading}>ACHIEVEMENTS</h2>
                <ul style={{ margin: "0 0 12px 18px", padding: 0 }}>
                  {form.achievements.filter(Boolean).map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </>
            )}

            {form.positions?.filter(Boolean).length > 0 && (
              <>
                <h2 style={sectionHeading}>POSITIONS OF RESPONSIBILITY</h2>
                <ul style={{ margin: "0 0 12px 18px", padding: 0 }}>
                  {form.positions.filter(Boolean).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </>
            )}

            {form.languagesKnown?.filter(Boolean).length > 0 && (
              <>
                <h2 style={sectionHeading}>LANGUAGES KNOWN</h2>
                <p style={{ margin: 0 }}>
                  {form.languagesKnown.filter(Boolean).join(", ")}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}