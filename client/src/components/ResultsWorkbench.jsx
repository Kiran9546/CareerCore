import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import { STAGE_LABEL, formatDate } from "../utils/placement";

/**
 * Recording results: ask students, review what they send, enter results
 * directly, or import a spreadsheet.
 *
 * Faculty and the placement officer get the same workbench because they do
 * the same four things with it. What differs is scope, and the server
 * decides that from the signed-in account — faculty see only their own
 * department, the officer sees everyone — so nothing here needs to know
 * which role is looking at it. The `scope` string the API returns is shown
 * back to the user so it is never ambiguous whose records are on screen.
 */

const STATUS_STYLE = {
  requested: "bg-amber-100 text-amber-800",
  submitted: "bg-blue-100 text-blue-700",
  forwarded: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};
const STATUS_LABEL = {
  requested: "Awaiting student",
  submitted: "Needs review",
  forwarded: "Forwarded",
  rejected: "Declined",
};
const SOURCE_LABEL = {
  student: "From the student",
  faculty: "Entered by faculty",
  placement_cell: "Entered by the placement cell",
  spreadsheet_import: "Imported from a spreadsheet",
};

const PASS_FAIL = [
  ["not_reached", "Not reached"],
  ["passed", "Passed"],
  ["failed", "Failed"],
];
const FINAL = [
  ["not_reached", "Not reached"],
  ["selected", "Selected"],
  ["rejected", "Rejected"],
];
const STAGES = ["aptitude", "technical", "interview", "final"];

const emptyStages = () =>
  Object.fromEntries(STAGES.map((s) => [s, "not_reached"]));

export default function ResultsWorkbench() {
  const [tab, setTab] = useState("review");
  const [students, setStudents] = useState([]);
  const [drives, setDrives] = useState([]);
  const [subs, setSubs] = useState([]);
  const [scope, setScope] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // ── Ask students ──
  const [askDrive, setAskDrive] = useState("");
  const [askStudents, setAskStudents] = useState([]);
  const [askNote, setAskNote] = useState("");

  // ── Direct entry ──
  const [entryStudent, setEntryStudent] = useState("");
  const [entryDrive, setEntryDrive] = useState("");
  const [entryStages, setEntryStages] = useState(emptyStages);
  const [entryCtc, setEntryCtc] = useState("");

  // ── Import ──
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importDrive, setImportDrive] = useState("");
  const [createMissing, setCreateMissing] = useState(false);
  // How the parser read the sheet, shown whether the file worked or not — a
  // rejected upload is far more useful when it says what it DID see.
  const [detected, setDetected] = useState(null);
  const fileInput = useRef(null);

  const loadSubs = useCallback(() => {
    api
      .get("/results/submissions")
      .then((r) => {
        setSubs(r.data.submissions);
        setScope(r.data.scope);
      })
      .catch((e) =>
        setError(e.response?.data?.message || "Could not load submissions"),
      );
  }, []);

  useEffect(() => {
    loadSubs();
    api
      .get("/results/students")
      .then((r) => {
        setStudents(r.data.students);
        setScope(r.data.scope);
      })
      .catch((e) => setError(e.response?.data?.message || "Could not load students"));
    // Read through the results router, not /placement/drives — that one is
    // the officer's management surface and faculty are refused there.
    api
      .get("/results/drives")
      .then((r) => setDrives(r.data.drives))
      .catch((e) =>
        setError(e.response?.data?.message || "Could not load drives"),
      );
  }, [loadSubs]);

  const counts = useMemo(
    () =>
      subs.reduce((acc, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      }, {}),
    [subs],
  );

  const needsReview = subs.filter((s) => s.status === "submitted");

  // ── Actions ──────────────────────────────────────────────
  const ask = async () => {
    setError(""); setNotice("");
    if (!askDrive) return setError("Pick the drive you are asking about");
    if (!askStudents.length) return setError("Pick at least one student");
    setBusy(true);
    try {
      const r = await api.post("/results/requests/bulk", {
        driveId: askDrive,
        studentIds: askStudents,
        note: askNote,
      });
      setNotice(r.data.message);
      setAskStudents([]);
      setAskNote("");
      loadSubs();
    } catch (e) {
      setError(e.response?.data?.message || "Could not send the requests");
    } finally {
      setBusy(false);
    }
  };

  const act = async (sub, action) => {
    setError(""); setNotice("");
    try {
      const r = await api.post(`/results/submissions/${sub._id}/${action}`);
      setNotice(r.data.message || (action === "forward" ? "Forwarded" : "Declined"));
      loadSubs();
    } catch (e) {
      setError(e.response?.data?.message || `Could not ${action} that submission`);
    }
  };

  const enterDirect = async () => {
    setError(""); setNotice("");
    if (!entryStudent || !entryDrive) return setError("Pick a student and a drive");
    const stages = Object.fromEntries(
      Object.entries(entryStages).map(([k, v]) => [k, { status: v }]),
    );
    if (!Object.values(stages).some((s) => s.status !== "not_reached")) {
      return setError("Record at least one round");
    }
    setBusy(true);
    try {
      const r = await api.post("/results/apply", {
        studentId: entryStudent,
        driveId: entryDrive,
        stages,
        ...(entryStages.final === "selected" && entryCtc
          ? { offer: { ctc: Number(entryCtc) * 100000 } }
          : {}),
      });
      setNotice(
        r.data.message +
          (r.data.skipped?.length
            ? ` Skipped: ${r.data.skipped.map((s) => s.reason).join("; ")}`
            : ""),
      );
      setEntryStages(emptyStages());
      setEntryCtc("");
      loadSubs();
    } catch (e) {
      setError(e.response?.data?.message || "Could not record the result");
    } finally {
      setBusy(false);
    }
  };

  const runImport = async (dryRun) => {
    setError(""); setNotice("");
    if (!file) return setError("Choose a spreadsheet first");
    const fd = new FormData();
    fd.append("file", file);
    if (importDrive) fd.append("driveId", importDrive);
    fd.append("createMissing", String(createMissing));
    setBusy(true);
    try {
      const r = await api.post(`/results/import?dryRun=${dryRun}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(r.data);
      setDetected(r.data.detected ?? null);
      setNotice(r.data.message);
      if (!dryRun) {
        setFile(null);
        if (fileInput.current) fileInput.current.value = "";
        loadSubs();
      }
    } catch (e) {
      // The server attaches what it managed to read even when it refuses the
      // file, so show that rather than only the failure.
      setDetected(e.response?.data?.detected ?? null);
      setPreview(null);
      setError(e.response?.data?.message || "Could not read the spreadsheet");
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    setError("");
    try {
      const res = await api.get("/results/template", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "careercore-results-template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Could not download the template");
    }
  };

  const input =
    "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900";
  const label = "block text-xs font-medium text-slate-600 mb-1";

  const TABS = [
    ["review", `Review${needsReview.length ? ` (${needsReview.length})` : ""}`],
    ["ask", "Ask students"],
    ["enter", "Enter directly"],
    ["import", "Import spreadsheet"],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Results</h2>
          <p className="text-sm text-slate-500">
            Ask students for their results, review what they send, or record
            them yourself.
          </p>
        </div>
        {scope && (
          <span className="px-2.5 py-1 rounded text-xs bg-slate-100 text-slate-700">
            {scope === "all" ? "All departments" : `${scope} department only`}
          </span>
        )}
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Awaiting student", counts.requested || 0],
          ["Needs review", counts.submitted || 0],
          ["Forwarded", counts.forwarded || 0],
          ["Students in scope", students.length],
        ].map(([l, v]) => (
          <div key={l} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-2xl font-bold text-slate-900">{v}</p>
            <p className="text-xs text-slate-500 mt-1">{l}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === v
                ? "border-slate-900 text-slate-900 font-medium"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ── REVIEW ──────────────────────────────────────────── */}
      {tab === "review" && (
        <div className="space-y-3">
          {subs.map((sub) => (
            <div key={sub._id} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-slate-900">{sub.student.name}</p>
                    <span className="text-xs text-slate-400">{sub.student.usn}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${STATUS_STYLE[sub.status] ?? ""}`}>
                      {STATUS_LABEL[sub.status] ?? sub.status}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
                      {SOURCE_LABEL[sub.source] ?? sub.source}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {sub.drive.company}
                    {sub.drive.role ? ` · ${sub.drive.role}` : ""}
                    {sub.drive.driveDate ? ` · ${formatDate(sub.drive.driveDate)}` : ""}
                  </p>
                  {sub.studentNote && (
                    <p className="text-xs text-slate-600 mt-1.5 italic">“{sub.studentNote}”</p>
                  )}
                </div>
                {sub.status === "submitted" && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => act(sub, "forward")}
                      className="px-3 py-1.5 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800"
                    >
                      Forward
                    </button>
                    <button
                      onClick={() => act(sub, "reject")}
                      className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {STAGES.map((stage) => {
                  const st = sub.stages?.[stage]?.status ?? "not_reached";
                  if (st === "not_reached") return null;
                  const good = st === "passed" || st === "selected";
                  return (
                    <span
                      key={stage}
                      className={`px-2 py-0.5 rounded text-xs ${
                        good ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {STAGE_LABEL[stage]}: {st.replace("_", " ")}
                    </span>
                  );
                })}
                {sub.offer?.ctc ? (
                  <span className="px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700">
                    ₹{(sub.offer.ctc / 100000).toFixed(1)} LPA
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          {!subs.length && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <p className="text-slate-500">
                Nothing here yet. Ask students for their results, or record some
                yourself.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── ASK ─────────────────────────────────────────────── */}
      {tab === "ask" && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <p className="text-xs text-slate-500">
            Students can only submit results for a drive you have asked them
            about. Asking is the permission.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Drive</label>
              <select className={input} value={askDrive} onChange={(e) => setAskDrive(e.target.value)}>
                <option value="">Select a drive…</option>
                {drives.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.companyName} · {d.role} ({formatDate(d.driveDate)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Message (optional)</label>
              <input
                className={input}
                placeholder="e.g. Please fill this in before Friday"
                value={askNote}
                onChange={(e) => setAskNote(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className={label}>Students ({askStudents.length} selected)</label>
              <button
                onClick={() =>
                  setAskStudents(
                    askStudents.length === students.length ? [] : students.map((s) => s._id),
                  )
                }
                className="text-xs text-slate-600 underline"
              >
                {askStudents.length === students.length ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {students.map((s) => (
                    <tr
                      key={s._id}
                      onClick={() =>
                        setAskStudents((a) =>
                          a.includes(s._id) ? a.filter((x) => x !== s._id) : [...a, s._id],
                        )
                      }
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-2 px-3 w-8">
                        <input type="checkbox" readOnly checked={askStudents.includes(s._id)} className="pointer-events-none" />
                      </td>
                      <td className="py-2">
                        <p className="text-slate-800">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.usn} · {s.branch}</p>
                      </td>
                      <td className="py-2 pr-3 text-right text-xs text-slate-500">
                        {s.drives} drive{s.drives === 1 ? "" : "s"}
                      </td>
                    </tr>
                  ))}
                  {!students.length && (
                    <tr><td className="py-4 px-3 text-sm text-slate-400">No students in scope.</td></tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>
          </div>

          <button
            onClick={ask}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Sending…" : `Ask ${askStudents.length || ""} student${askStudents.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {/* ── ENTER DIRECTLY ──────────────────────────────────── */}
      {tab === "enter" && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <p className="text-xs text-slate-500">
            Goes straight onto the official record, no review step. Use this
            when you already have the results.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Student</label>
              <select className={input} value={entryStudent} onChange={(e) => setEntryStudent(e.target.value)}>
                <option value="">Select a student…</option>
                {students.map((s) => (
                  <option key={s._id} value={s._id}>{s.name} · {s.usn}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Drive</label>
              <select className={input} value={entryDrive} onChange={(e) => setEntryDrive(e.target.value)}>
                <option value="">Select a drive…</option>
                {drives.map((d) => (
                  <option key={d._id} value={d._id}>{d.companyName} · {d.role}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STAGES.map((stage) => (
              <div key={stage}>
                <label className={label}>{STAGE_LABEL[stage]}</label>
                <select
                  className={input}
                  value={entryStages[stage]}
                  onChange={(e) => setEntryStages((s) => ({ ...s, [stage]: e.target.value }))}
                >
                  {(stage === "final" ? FINAL : PASS_FAIL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {entryStages.final === "selected" && (
            <div className="sm:w-56">
              <label className={label}>Offer CTC (LPA)</label>
              <input
                type="number" step="0.1" min="0" className={input}
                value={entryCtc} onChange={(e) => setEntryCtc(e.target.value)}
              />
            </div>
          )}

          <p className="text-xs text-slate-400">
            A round can only be recorded as passed if the previous one was.
            Anything that breaks that is skipped and reported back, not guessed at.
          </p>

          <button
            onClick={enterDirect}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Record result"}
          </button>
        </div>
      )}

      {/* ── IMPORT ──────────────────────────────────────────── */}
      {tab === "import" && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex flex-wrap justify-between items-start gap-3">
            <p className="text-xs text-slate-500 max-w-xl">
              Upload the results sheet you already keep, whatever shape it is
              in. Columns are recognised by meaning, so “Reg No”, “Tech Round
              2”, “GD”, “HR” and “Round 1…4” are all understood, and a sheet
              with more or fewer rounds than usual still reads. Values like
              “Pass”, “Y”, “Cleared” and “NA” are understood too. Preview
              first. It shows exactly how the file was read, and what it would
              do, without changing anything.
            </p>
            <button
              onClick={downloadTemplate}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 shrink-0"
            >
              Download template
            </button>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              setFile(e.target.files[0] ?? null);
              setPreview(null);
              setDetected(null);
              setError("");
            }}
            className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-slate-900 file:text-white hover:file:bg-slate-800"
          />

          <div>
            <label className={label}>
              If the sheet has no company column, apply every row to
            </label>
            <select
              className={`${input} sm:w-96`}
              value={importDrive}
              onChange={(e) => setImportDrive(e.target.value)}
            >
              <option value="">Use the company column in the sheet</option>
              {drives.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.companyName} · {d.role}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={createMissing}
              onChange={(e) => setCreateMissing(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm text-slate-700">
              Create students missing from CareerCore
              <span className="block text-xs text-slate-500 mt-0.5">
                Adds anyone in the sheet who is not here yet, using their USN,
                name and department. Their department comes from a Department
                column if the sheet has one, otherwise from the USN itself.
                CGPA is left at 0 and no password is set. The record exists so
                results can be attached, and the student claims it by
                registering.
              </span>
            </span>
          </label>

          <div className="flex gap-2">
            <button
              onClick={() => runImport(true)}
              disabled={busy || !file}
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40"
            >
              {busy ? "Reading…" : "Preview"}
            </button>
            <button
              onClick={() => runImport(false)}
              disabled={busy || !file}
              className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
            >
              Import
            </button>
          </div>

          {/* Always shown once a file has been read, success or not: which
              sheet, which header row, and what every column was taken to
              mean. This is what turns “could not read your file” into
              something actionable. */}
          {detected && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium text-slate-700 uppercase tracking-wide">
                  How your sheet was read
                </p>
                <span className="px-2 py-0.5 rounded text-xs bg-white border border-slate-200 text-slate-600">
                  Sheet “{detected.sheetName}” · header on row {detected.headerRow}
                </span>
              </div>

              {Object.keys(detected.columns ?? {}).length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">Identified columns</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(detected.columns).map(([field, header]) => (
                      <span
                        key={field}
                        className="px-2 py-0.5 rounded text-xs bg-white border border-slate-200 text-slate-700"
                      >
                        {header} <span className="text-slate-400">→ {field}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {detected.rounds?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">
                    Round columns: {detected.rounds.length} found, folded onto the
                    rounds this system records
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {detected.rounds.map((r, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded text-xs bg-blue-50 border border-blue-200 text-blue-800"
                      >
                        {r.header}{" "}
                        <span className="opacity-70">
                          → {STAGE_LABEL[r.mappedTo] ?? r.mappedTo}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {detected.ignored?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">
                    Ignored, because nothing in the system matches these
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {detected.ignored.map((h, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded text-xs bg-white border border-slate-200 text-slate-400"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {preview && (
            <div className="mt-2 space-y-3">
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded text-xs bg-green-100 text-green-700">
                  {preview.dryRun ? preview.rows?.length ?? 0 : preview.appliedRows} row(s) {preview.dryRun ? "ready" : "imported"}
                </span>
                {preview.dryRun && preview.creatableCount > 0 && (
                  <span className="px-2.5 py-1 rounded text-xs bg-blue-100 text-blue-700">
                    {preview.creatableCount} student(s) not in CareerCore yet
                  </span>
                )}
                {!preview.dryRun && preview.createdStudents?.length > 0 && (
                  <span className="px-2.5 py-1 rounded text-xs bg-blue-100 text-blue-700">
                    {preview.createdStudents.length} student(s) added
                  </span>
                )}
                {(preview.errors?.length || preview.parseErrors?.length) > 0 && (
                  <span className="px-2.5 py-1 rounded text-xs bg-red-100 text-red-700">
                    {(preview.errors ?? preview.parseErrors).length} row(s) with problems
                  </span>
                )}
                {preview.sheetName && (
                  <span className="px-2.5 py-1 rounded text-xs bg-slate-100 text-slate-600">
                    Sheet: {preview.sheetName}
                  </span>
                )}
              </div>

              {(preview.errors ?? preview.parseErrors ?? []).length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 max-h-52 overflow-y-auto">
                  <ul className="space-y-1">
                    {(preview.errors ?? preview.parseErrors).map((e, i) => (
                      <li key={i} className="text-xs text-red-700">
                        Row {e.rowNumber}{e.usn ? ` (${e.usn})` : ""}: {e.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Named explicitly rather than only counted: adding people to
                  the system is not something to do on a number alone. */}
              {(preview.creatableCount > 0 || preview.createdStudents?.length > 0) && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs font-medium text-blue-800 mb-2">
                    {preview.dryRun
                      ? createMissing
                        ? "These students will be added when you import"
                        : "These students are not in CareerCore. Tick the box above to add them"
                      : "Added to CareerCore"}
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {(preview.createdStudents ??
                      preview.missing?.filter((m) => m.creatable) ??
                      []).map((m, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded text-xs bg-white border border-blue-200 text-blue-800"
                      >
                        {m.usn}
                        {m.name ? ` · ${m.name}` : ""}
                        {m.branch ? ` · ${m.branch}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {preview.rows?.length > 0 && (
                <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-2 px-3 font-medium">USN</th>
                        <th className="py-2 font-medium">Student</th>
                        <th className="py-2 font-medium">Company</th>
                        <th className="py-2 pr-3 font-medium">Rounds</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 px-3 text-slate-600">{r.usn}</td>
                          <td className="py-2 text-slate-800">{r.studentName}</td>
                          <td className="py-2 text-slate-600">{r.company}</td>
                          <td className="py-2 pr-3 text-xs text-slate-500">
                            {Object.entries(r.stages ?? {})
                              .map(([k, v]) => `${STAGE_LABEL[k] ?? k}: ${v.status}`)
                              .join(", ")}
                            {r.skipped?.length ? (
                              <span className="text-amber-700"> · skipped {r.skipped.length}</span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
