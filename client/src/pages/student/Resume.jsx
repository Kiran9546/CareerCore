import { useEffect, useLayoutEffect, useState, useRef } from "react";
import api, { fileUrl } from "../../api/axios";
import { ResumeSkeleton } from "../../components/ui/Skeleton";

/* ── A4 geometry ────────────────────────────────────────────────────────────
   The preview renders real A4 sheets rather than one long scrolling column,
   and the same geometry drives the PDF, so what you see is what you get.     */
const MM_PX = 96 / 25.4; // CSS px per mm at the 96dpi reference resolution
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const PAD_X_MM = 12;
const PAD_TOP_MM = 12;
const PAD_BOTTOM_MM = 12;

const CONTENT_W_MM = PAGE_W_MM - PAD_X_MM * 2; // 186mm
const CONTENT_H_MM = PAGE_H_MM - PAD_TOP_MM - PAD_BOTTOM_MM; // 273mm

const PAGE_W_PX = PAGE_W_MM * MM_PX;
const PAGE_H_PX = PAGE_H_MM * MM_PX;
const CONTENT_H_PX = CONTENT_H_MM * MM_PX;
const PAGE_GAP_PX = 24;

const PDF_SCALE = 2;

/* html2pdf renders the whole container to one tall canvas and slices it every
   `floor(canvasWidth * pageRatio)` pixels. Matching our sheet height to that
   slice height keeps N sheets == N PDF pages; without it the rounding leaves a
   blank trailing page. The 2px shave absorbs html2canvas's width rounding —
   it only ever eats into the blank bottom margin. */
const PDF_SLICE_H_PX = Math.floor(
  Math.round(PAGE_W_PX * PDF_SCALE) * (PAGE_H_MM / PAGE_W_MM),
);
const EXPORT_PAGE_H_PX = Math.floor(PDF_SLICE_H_PX / PDF_SCALE) - 2;

/** Typography shared by the measuring column and every rendered sheet. */
const sheetType = {
  fontFamily: "'Times New Roman', Times, serif",
  fontSize: "10.5pt",
  lineHeight: 1.45,
  color: "#000",
  fontVariantNumeric: "lining-nums",
  // A sheet clips its overflow, so anything wider than the column would simply
  // disappear — a pasted URL, a base64 blob, a run of characters with no
  // spaces. `anywhere` also shrinks min-content, which keeps a long token from
  // stretching the header table or the flex rows past the page width.
  overflowWrap: "anywhere",
};

/**
 * Decide where each A4 page starts, in px down the measured content column.
 *
 * Breaks land on block boundaries so a project or an education entry is never
 * sliced through the middle, and never immediately after a section heading —
 * that would strand the heading at the foot of a page. A block taller than a
 * whole page (a pathologically long bullet) is cut at the page height, because
 * the alternative is dropping it.
 */
function computePageOffsets(root) {
  const blocks = Array.from(root.querySelectorAll("[data-rz-block]"));
  if (!blocks.length) return [0];

  const rootTop = root.getBoundingClientRect().top;
  const rects = blocks.map((el) => el.getBoundingClientRect());
  const tops = rects.map((r) => r.top - rootTop);
  const heights = rects.map((r) => r.height);
  const keeps = blocks.map((el) => el.dataset.rzKeep === "1");
  const total = rects[rects.length - 1].bottom - rootTop;

  const offsets = [0];
  let cursor = 0;

  for (let guard = 0; guard < 80; guard++) {
    if (total - cursor <= CONTENT_H_PX + 0.5) break;
    const limit = cursor + CONTENT_H_PX;

    // Last block boundary that still fits, and the last one that fits without
    // stranding a heading at the foot of the page.
    let best = 0;
    let bestIdx = -1;
    let next = 0;
    for (let i = 1; i < tops.length; i++) {
      if (tops[i] <= cursor + 1 || tops[i] > limit) continue;
      best = tops[i];
      bestIdx = i;
      if (!keeps[i - 1]) next = tops[i];
    }

    if (!next) {
      next = limit; // nothing fits — cut inside the block
    } else if (next < best && next - cursor < CONTENT_H_PX * 0.5) {
      // Honouring the heading rule would leave this page more than half empty.
      // That is only worth it if the block we are deferring can actually fit on
      // a page of its own; if it is taller than any page it gets cut wherever
      // we break, so filling this page up first is strictly better.
      if (heights[bestIdx] > CONTENT_H_PX) next = limit;
    }

    offsets.push(next);
    cursor = next;
  }

  return offsets;
}

const sameOffsets = (a, b) =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 0.5);

/**
 * One A4 sheet showing the content column from `offset` down to `windowH` px.
 *
 * `windowH` is the distance to the NEXT page's offset, not the full usable page
 * height — a break taken early (because the block that followed would not fit)
 * leaves the rest of the sheet blank, and without this clip that blank space
 * would instead show the top of the block already printed on the next page.
 */
function Sheet({ offset, windowH, height, screen, children }) {
  return (
    <div
      data-rz-sheet=""
      className="keep-palette"
      style={{
        width: `${PAGE_W_MM}mm`,
        height: `${height}px`,
        boxSizing: "border-box",
        padding: `${PAD_TOP_MM}mm ${PAD_X_MM}mm ${PAD_BOTTOM_MM}mm`,
        background: "#fff",
        overflow: "hidden",
        // outline rather than border — a border would eat into the A4 box
        ...(screen
          ? {
              outline: "1px solid #cbd5e1",
              boxShadow: "0 1px 8px rgba(15,23,42,0.14)",
            }
          : null),
        ...sheetType,
      }}
    >
      <div style={{ height: `${windowH}px`, overflow: "hidden" }}>
        <div style={{ marginTop: `${-offset}px` }}>{children}</div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900";
const labelCls = "block text-sm font-medium text-slate-700 mb-1.5";

/** Mirrors the maxlength on Resume.summary in the Mongoose schema. */
const SUMMARY_MAX = 800;

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
// No `nowrap` here: a long LinkedIn or GitHub URL has to wrap onto a second
// line rather than run off the clipped edge of the sheet.
const contactLine = { margin: "1px 0" };
const linkStyle = { color: "#1155cc", textDecoration: "underline" };

/**
 * Bullet markers are drawn as real text, not as CSS list markers.
 *
 * Two things forced this. Tailwind's preflight applies `list-style: none` to
 * every ul, so the markers were missing entirely. Restoring `list-style: disc`
 * fixed the preview but not the PDF: html2canvas synthesises ::marker
 * pseudo-elements itself and lays them out at the top of the line box, so the
 * dots floated above their text. A real glyph in a real span is painted from
 * the browser's own layout, so preview and PDF agree exactly.
 */
const bulletList = { margin: 0, paddingLeft: "6px", listStyle: "none" };
const BULLET_COL = "12px"; // marker column; 6px padding + 12px = the old 18px indent

function Bullet({ children, style }) {
  return (
    <li style={{ display: "flex", alignItems: "baseline", ...style }}>
      <span aria-hidden="true" style={{ flex: `0 0 ${BULLET_COL}` }}>
        •
      </span>
      <span style={{ flex: "1 1 auto", minWidth: 0 }}>{children}</span>
    </li>
  );
}

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

/**
 * Flatten the resume into an ordered list of breakable blocks.
 *
 * Granularity is what makes pagination look right: every education entry,
 * project, internship and list item is its own block, so a long list splits
 * across a page boundary item by item instead of jumping wholesale to the
 * next page and leaving half a sheet blank. Headings are marked `keep` so a
 * break is never taken directly after them.
 */
function buildResumeBlocks({ p, form, ed }) {
  const out = [];
  const push = (key, node, keep = false) => out.push({ key, node, keep });
  const heading = (key, text) =>
    push(key, <h2 style={sectionHeading}>{text}</h2>, true);

  // ─── Header ───────────────────────────────────────────────────────────
  push(
    "header",
    <>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: "4px",
        }}
      >
        <tbody>
          <tr>
            <td style={{ verticalAlign: "top", padding: 0 }}>
              <h2
                style={{
                  fontSize: "20pt",
                  fontWeight: "bold",
                  margin: "0 0 6px",
                }}
              >
                {p.name}
              </h2>
              {form.phone && (
                <p style={contactLine}>
                  <b>Phone:</b> {form.phone}
                </p>
              )}
              <p style={contactLine}>
                <b>Email:</b> <span style={linkStyle}>{p.email}</span>
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
            </td>
            {form.photoUrl && (
              <td
                style={{
                  verticalAlign: "top",
                  width: "90px",
                  padding: 0,
                  textAlign: "right",
                }}
              >
                <img
                  src={fileUrl(form.photoUrl)}
                  alt={p.name ? `Photo of ${p.name}` : "Resume photo"}
                  width="82"
                  height="100"
                  style={{
                    width: "82px",
                    height: "100px",
                    objectFit: "cover",
                    border: "1px solid #999",
                  }}
                />
              </td>
            )}
          </tr>
        </tbody>
      </table>

      <hr
        style={{
          border: 0,
          borderTop: "1.5px solid #000",
          margin: "8px 0 12px",
        }}
      />
    </>,
  );

  // ─── Summary ──────────────────────────────────────────────────────────
  if (form.summary) {
    heading("summary-h", "SUMMARY");
    push(
      "summary",
      <p style={{ margin: "0 0 12px", textAlign: "justify" }}>
        {form.summary}
      </p>,
    );
  }

  // ─── Education ────────────────────────────────────────────────────────
  // A heading with nothing under it reads like a mistake on a printed resume,
  // so every section below is emitted only when it actually has content.
  const hasEdu =
    ed.degree?.course || ed.twelfth?.institution || ed.tenth?.institution;
  if (hasEdu) heading("education-h", "EDUCATION");
  const eduRow = (key, title, right, institution, rightLabel, gap) =>
    push(
      key,
      <div style={{ marginBottom: gap }}>
        <div style={rowBetween}>
          <b>{title}</b>
          {right && <b style={{ whiteSpace: "nowrap" }}>{right}</b>}
        </div>
        <div style={rowBetween}>
          <span>{institution}</span>
          {rightLabel && (
            <span style={{ whiteSpace: "nowrap" }}>{rightLabel}</span>
          )}
        </div>
      </div>,
    );

  if (ed.degree?.course)
    eduRow(
      "edu-degree",
      ed.degree.course,
      ed.degree.yearRange,
      ed.degree.institution,
      ed.degree.cgpa || ed.degree.cgpa === 0 ? `CGPA: ${ed.degree.cgpa}` : "",
      "10px",
    );
  if (ed.twelfth?.institution)
    eduRow(
      "edu-12",
      ed.twelfth.title,
      ed.twelfth.yearRange,
      ed.twelfth.institution,
      ed.twelfth.percentage ? `Percentage: ${ed.twelfth.percentage} %` : "",
      "10px",
    );
  if (ed.tenth?.institution)
    eduRow(
      "edu-10",
      ed.tenth.title,
      ed.tenth.yearRange,
      ed.tenth.institution,
      ed.tenth.percentage ? `Percentage: ${ed.tenth.percentage} %` : "",
      "12px",
    );

  // ─── Technical skills ─────────────────────────────────────────────────
  const ts = form.technicalSkills || {};
  const skillRows = [
    ["Languages", ts.languages],
    ["Interface", ts.interface],
    ["Database", ts.database],
    ["Tools", ts.tools],
  ].filter(([, v]) => v && String(v).trim());
  if (skillRows.length) {
    heading("skills-h", "TECHNICAL SKILLS");
    push(
      "skills",
      <div style={{ marginBottom: "12px" }}>
        {skillRows.map(([label, value]) => (
          <p key={label} style={{ margin: "1px 0" }}>
            <b>{label}:</b> {value}
          </p>
        ))}
      </div>,
    );
  }

  // ─── Projects ─────────────────────────────────────────────────────────
  const projects = (form.projects || []).filter((x) => x.title);
  if (projects.length) {
    heading("projects-h", "PROJECTS");
    projects.forEach((pr, i) =>
      push(
        `project-${i}`,
        <div style={{ marginBottom: "12px" }}>
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
          <ul style={bulletList}>
            {(pr.bullets || []).filter(Boolean).map((b, j) => (
              <Bullet key={j} style={{ marginBottom: "2px" }}>
                {b}
              </Bullet>
            ))}
          </ul>
        </div>,
      ),
    );
  }

  // ─── Internships ──────────────────────────────────────────────────────
  const internships = (form.internships || []).filter((x) => x.role);
  if (internships.length) {
    heading("internships-h", "INTERNSHIPS");
    internships.forEach((it, i) =>
      push(
        `internship-${i}`,
        <div style={{ marginBottom: "12px" }}>
          <div style={rowBetween}>
            <b>
              {it.role}
              {it.company ? ` | ${it.company}` : ""}
            </b>
            <b style={{ whiteSpace: "nowrap" }}>{it.duration}</b>
          </div>
          <ul style={{ ...bulletList, marginTop: "4px" }}>
            {(it.bullets || []).filter(Boolean).map((b, j) => (
              <Bullet key={j}>{b}</Bullet>
            ))}
          </ul>
        </div>,
      ),
    );
  }

  // ─── Bulleted sections — one block per item so long lists split cleanly ──
  const bulletSection = (key, title, items, render) => {
    if (!items.length) return;
    heading(`${key}-h`, title);
    items.forEach((item, i) =>
      push(
        `${key}-${i}`,
        <ul
          style={{
            ...bulletList,
            marginBottom: i === items.length - 1 ? "12px" : 0,
          }}
        >
          <Bullet>{render(item)}</Bullet>
        </ul>,
      ),
    );
  };

  bulletSection(
    "cert",
    "CERTIFICATIONS",
    (form.certifications || []).filter((c) => c.name),
    (c) =>
      `${c.name}${c.issuer ? `, ${c.issuer}` : ""}${c.year ? `, ${c.year}` : ""}`,
  );
  bulletSection(
    "achievement",
    "ACHIEVEMENTS",
    (form.achievements || []).filter(Boolean),
    (a) => a,
  );
  bulletSection(
    "position",
    "POSITIONS OF RESPONSIBILITY",
    (form.positions || []).filter(Boolean),
    (x) => x,
  );

  // ─── Languages known ──────────────────────────────────────────────────
  const langs = (form.languagesKnown || []).filter(Boolean);
  if (langs.length) {
    heading("languages-h", "LANGUAGES KNOWN");
    push("languages", <p style={{ margin: 0 }}>{langs.join(", ")}</p>);
  }

  return out;
}

export default function Resume() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const fileInputRef = useRef(null);

  // Pagination: the off-screen column is measured, and `offsets` holds the
  // content Y position at which each A4 sheet starts.
  const measureRef = useRef(null);
  const exportRef = useRef(null);
  const previewWrapRef = useRef(null);
  const [offsets, setOffsets] = useState([0]);
  const [zoom, setZoom] = useState(1);
  const [exporting, setExporting] = useState(false);

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

  // Re-paginate whenever the measured column changes height — edits, the photo
  // finishing its download, or a webfont settling all move the break points.
  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;

    let raf = 0;
    const recompute = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        setOffsets((prev) => {
          const next = computePageOffsets(root);
          return sameOffsets(prev, next) ? prev : next;
        }),
      );
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(root);
    root.querySelectorAll("img").forEach((img) => {
      if (!img.complete) img.addEventListener("load", recompute);
    });
    document.fonts?.ready.then(recompute).catch(() => {});

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [form, data]);

  // Scale the sheets down to fit the preview column. The sheets themselves stay
  // exactly 210mm wide so the export is unaffected by the on-screen fit.
  useLayoutEffect(() => {
    const wrap = previewWrapRef.current;
    if (!wrap) return;
    const fit = () => {
      // clientWidth includes padding; using it whole made the scaled sheet plus
      // the wrapper padding wider than the content box, so the preview grew a
      // horizontal scrollbar.
      const cs = getComputedStyle(wrap);
      const inner =
        wrap.clientWidth -
        parseFloat(cs.paddingLeft || 0) -
        parseFloat(cs.paddingRight || 0);
      setZoom(Math.min(1, Math.max(0.2, inner / PAGE_W_PX)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [form]);

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
    try {
      const r = await api.post(`/student/resume/reset/${section}`);
      setForm(r.data.resume);
      setMsg(`${section} reset from profile`);
    } catch (e) {
      setMsg(e.response?.data?.message || `Could not reset ${section}`);
    }
    setTimeout(() => setMsg(""), 2500);
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

  /**
   * Export the paginated sheets. Each sheet is already exactly one A4 page, so
   * the PDF needs no margin of its own and no page-break heuristics — html2pdf
   * slices the tall canvas straight along the sheet boundaries.
   */
  const download = async () => {
    if (!data || exporting) return;
    setExporting(true);
    setMsg("Preparing PDF…");
    try {
      // Let React mount the off-screen export tree, then let it settle.
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
      const root = exportRef.current;
      if (!root) throw new Error("export tree missing");

      // html2canvas paints whatever is decoded at that instant, so a photo that
      // is still loading would come out blank.
      await Promise.all(
        Array.from(root.querySelectorAll("img")).map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((res) => {
                img.addEventListener("load", res, { once: true });
                img.addEventListener("error", res, { once: true });
              }),
        ),
      );

      // Loaded on demand: the PDF library is most of this page's weight and
      // is only needed at the moment of download.
      const { default: html2pdf } = await import("html2pdf.js");
      await html2pdf()
        .set({
          margin: 0,
          filename: `${data.profile.usn}_${data.profile.name.replace(/\s+/g, "_").toUpperCase()}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: PDF_SCALE,
            useCORS: true,
            backgroundColor: "#ffffff",
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: [] },
        })
        .from(root)
        .save();

      setMsg("");
    } catch {
      setMsg("Could not generate the PDF");
      setTimeout(() => setMsg(""), 3000);
    } finally {
      setExporting(false);
    }
  };

  if (msg && !form) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-900">
        {msg}
      </div>
    );
  }
  if (!form) return <ResumeSkeleton />;

  const p = data.profile;
  const ed = form.education || {};

  const blocks = buildResumeBlocks({ p, form, ed });
  // The same element list is rendered into the measuring column and into every
  // sheet; React elements are immutable descriptors, so sharing them is safe.
  const blockNodes = blocks.map((b) => (
    <div key={b.key} data-rz-block="" data-rz-keep={b.keep ? "1" : "0"}>
      {b.node}
    </div>
  ));
  const pageCount = offsets.length;
  // A page shows everything up to the next break, capped at the usable height.
  const windowFor = (i) =>
    i === offsets.length - 1
      ? CONTENT_H_PX
      : Math.min(CONTENT_H_PX, offsets[i + 1] - offsets[i]);
  const screenStackH =
    pageCount * PAGE_H_PX + (pageCount - 1) * PAGE_GAP_PX + pageCount * 22;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
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
            disabled={exporting}
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-white disabled:opacity-50"
          >
            {exporting ? "Generating…" : "Download PDF"}
          </button>
          {msg && (
            <span role="status" className="feedback-in text-sm text-slate-500 self-center">{msg}</span>
          )}
        </div>

        <Card title="Contact" subtitle="Appears in the header of your resume">
          <Field label="Photo" hint="Optional. JPG or PNG, under 2 MB">
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
                  src={fileUrl(form.photoUrl)}
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

            {photoError && (
              <p className="text-xs text-red-600 mt-2">{photoError}</p>
            )}
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
            // The schema caps this at 800; stop it at the input rather than
            // letting the save fail after the student has written it.
            maxLength={SUMMARY_MAX}
            value={form.summary || ""}
            onChange={(e) => set("summary", e.target.value)}
            className={inputCls}
            placeholder="Third-year Information Science student with strong interest in…"
          />
          <p className="text-xs text-slate-400 mt-1.5 text-right">
            {(form.summary || "").length} / {SUMMARY_MAX}
          </p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  // Number("") is 0, which turned "clear the field" into
                  // "score zero"; keep an empty box empty.
                  set(
                    "education.twelfth.percentage",
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  // Number("") is 0, which turned "clear the field" into
                  // "score zero"; keep an empty box empty.
                  set(
                    "education.tenth.percentage",
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
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
                placeholder="Subtitle, e.g. Ongoing or Final Year Project"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
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

        <div className="h-2" />
      </div>
      {/* ─────────────── PREVIEW ─────────────── */}
      <div className="sticky top-24">
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-xs text-slate-400 uppercase tracking-wide">
            Live preview · A4
          </p>
          <p className="text-xs text-slate-400">
            {pageCount} {pageCount === 1 ? "page" : "pages"}
            {zoom < 0.999 && ` · ${Math.round(zoom * 100)}%`}
          </p>
        </div>

        <div
          ref={previewWrapRef}
          className="overflow-y-auto max-h-[calc(100vh-14rem)] bg-slate-100 rounded-lg p-3"
        >
          {/* Spacer carries the scaled height so the scroll area sizes correctly */}
          <div
            style={{
              width: `${PAGE_W_PX * zoom}px`,
              height: `${screenStackH * zoom}px`,
              margin: "0 auto",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
            >
              {offsets.map((offset, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom:
                      i === offsets.length - 1 ? 0 : `${PAGE_GAP_PX}px`,
                  }}
                >
                  <Sheet
                    offset={offset}
                    windowH={windowFor(i)}
                    height={PAGE_H_PX}
                    screen
                  >
                    {blockNodes}
                  </Sheet>
                  <p
                    className="text-center text-slate-400"
                    style={{ fontSize: "11px", marginTop: "6px" }}
                  >
                    Page {i + 1} of {pageCount}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Off-screen measuring column: one unbroken run of content at the exact
          A4 content width. Its block positions are what pagination reads. */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="keep-palette"
        style={{
          position: "absolute",
          left: "-10000px",
          top: 0,
          width: `${CONTENT_W_MM}mm`,
          ...sheetType,
        }}
      >
        {blockNodes}
      </div>

      {/* Off-screen export tree, mounted only while generating the PDF. Sheets
          sit flush with no gap, outline or label so the canvas html2pdf slices
          is exactly N A4 pages of resume and nothing else. */}
      {exporting && (
        <div
          aria-hidden="true"
          style={{ position: "absolute", left: "-10000px", top: 0 }}
        >
          {/* html2pdf deep-clones this node into its own container, so it has
              to be a plain in-flow block — an absolutely positioned root would
              contribute no height there and only the first page would render.
              Hence the separate off-screen positioning wrapper above. */}
          <div
            ref={exportRef}
            className="keep-palette"
            style={{ width: `${PAGE_W_MM}mm`, background: "#fff" }}
          >
            {offsets.map((offset, i) => (
              <Sheet
                key={i}
                offset={offset}
                windowH={windowFor(i)}
                height={EXPORT_PAGE_H_PX}
              >
                {blockNodes}
              </Sheet>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
