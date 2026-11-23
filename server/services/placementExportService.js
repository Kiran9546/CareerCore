import ExcelJS from "exceljs";
import Student from "../models/Student.js";
import Drive from "../models/Drive.js";
import DriveParticipation from "../models/DriveParticipation.js";
import "../models/User.js";
import { STAGE_STATUS, FINAL_STATUS } from "../config/constants.js";
import { buildCohortSummary } from "./placementProfileService.js";

/**
 * Builds the placement data workbook the officer downloads.
 *
 * Four sheets, because the office uses the data four different ways:
 *   Summary        one row of cohort totals, for a report header
 *   Students       one row per student — the roster with round-by-round counts
 *   Drives         one row per drive, with its funnel
 *   Participations one row per student per drive — the raw records
 *
 * Every number is recomputed from driveParticipations at export time by the
 * same counting rule the UI uses, so a downloaded sheet and the screen it
 * was downloaded from can never disagree. In particular `not_reached` is
 * never counted as an attempt here either — the sheet carries a separate
 * "Not reached" column so the distinction survives into Excel.
 */

const HEADER_FILL = "FF0F172A"; // slate-900, matching the app's header
const ATTEMPTED = [STAGE_STATUS.PASSED, STAGE_STATUS.FAILED];

const STATUS_TEXT = {
  not_reached: "Not reached",
  passed: "Passed",
  failed: "Failed",
  selected: "Selected",
  rejected: "Rejected",
};

/** Style a sheet's first row as a header and freeze it. */
const styleHeader = (sheet) => {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  row.alignment = { vertical: "middle", horizontal: "left" };
  row.height = 22;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };
};

/**
 * Widen each column to fit its content. ExcelJS has no auto-fit, and
 * without this every column lands at the default width and the sheet is
 * unreadable the moment it opens.
 */
const autoWidth = (sheet, min = 10, max = 46) => {
  sheet.columns.forEach((col) => {
    let widest = String(col.header ?? "").length;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > widest) widest = len;
    });
    col.width = Math.min(max, Math.max(min, widest + 2));
  });
};

const isAttempt = (s) => ATTEMPTED.includes(s);

/** Tally one stage across a student's participations. */
const tally = (parts, stage) => {
  let attempts = 0, passed = 0, failed = 0, notReached = 0;
  for (const p of parts) {
    const s = p.stages?.[stage]?.status ?? STAGE_STATUS.NOT_REACHED;
    if (s === STAGE_STATUS.PASSED) { attempts++; passed++; }
    else if (s === STAGE_STATUS.FAILED) { attempts++; failed++; }
    else notReached++;
  }
  return { attempts, passed, failed, notReached };
};

/** Percentage, or an em dash when there is nothing to divide by. */
const pctOrDash = (num, den) =>
  den > 0 ? Math.round((num / den) * 1000) / 10 : "–";

export const buildPlacementWorkbook = async (filter = {}) => {
  const studentFilter = {};
  if (filter.batch) studentFilter.batch = filter.batch;
  if (filter.branch) studentFilter.branch = filter.branch;

  const students = await Student.find(studentFilter)
    .populate("userId", "name email")
    .select("usn batch branch cgpa backlogs currentPRS readinessLevel userId phone")
    .sort("usn");

  const studentIds = students.map((s) => s._id);

  const participations = await DriveParticipation.find({
    studentId: { $in: studentIds },
  })
    .populate("driveId", "companyName role driveDate ctc status stages")
    .lean();

  const valid = participations.filter((p) => p.driveId);

  const byStudent = new Map();
  for (const p of valid) {
    const key = String(p.studentId);
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push(p);
  }

  const drives = await Drive.find({}).sort("-driveDate").lean();
  const summary = await buildCohortSummary(studentFilter);

  const wb = new ExcelJS.Workbook();
  wb.creator = "CareerCore";
  wb.created = new Date();

  // ── Sheet 1: Summary ────────────────────────────────────────
  const sum = wb.addWorksheet("Summary");
  sum.columns = [
    { header: "Metric", key: "metric" },
    { header: "Value", key: "value" },
  ];
  const scope =
    [filter.batch && `Batch ${filter.batch}`, filter.branch]
      .filter(Boolean)
      .join(" · ") || "All batches and branches";

  sum.addRows([
    { metric: "Exported at", value: new Date().toLocaleString() },
    { metric: "Scope", value: scope },
    { metric: "Students tracked", value: summary.studentsTracked },
    { metric: "Students with drive history", value: summary.studentsWithHistory },
    { metric: "Students placed", value: summary.studentsPlaced },
    { metric: "Placement %", value: summary.placementPercent ?? "–" },
    { metric: "Total registrations", value: summary.registrations },
    { metric: "Aptitude attempted", value: summary.aptitudeAttempts },
    { metric: "Aptitude cleared", value: summary.aptitudePassed },
    { metric: "Aptitude pass %", value: summary.aptitudePassPercent ?? "–" },
    { metric: "Technical attempted", value: summary.technicalAttempts },
    { metric: "Technical cleared", value: summary.technicalPassed },
    { metric: "Technical pass %", value: summary.technicalPassPercent ?? "–" },
    { metric: "Interviews reached", value: summary.interviewsReached },
    { metric: "Offers", value: summary.offers },
    { metric: "Drives conducted", value: drives.length },
  ]);
  styleHeader(sum);
  autoWidth(sum);

  // ── Sheet 2: Students ───────────────────────────────────────
  const st = wb.addWorksheet("Students");
  st.columns = [
    { header: "USN", key: "usn" },
    { header: "Name", key: "name" },
    { header: "Email", key: "email" },
    { header: "Branch", key: "branch" },
    { header: "Batch", key: "batch" },
    { header: "CGPA", key: "cgpa" },
    { header: "Backlogs", key: "backlogs" },
    { header: "Drives registered", key: "registered" },
    { header: "Drives attended", key: "attended" },
    { header: "Aptitude attempted", key: "aptA" },
    { header: "Aptitude cleared", key: "aptP" },
    { header: "Aptitude failed", key: "aptF" },
    { header: "Aptitude not reached", key: "aptN" },
    { header: "Aptitude pass %", key: "aptPct" },
    { header: "Technical attempted", key: "techA" },
    { header: "Technical cleared", key: "techP" },
    { header: "Technical failed", key: "techF" },
    { header: "Technical not reached", key: "techN" },
    { header: "Technical pass %", key: "techPct" },
    { header: "Interviews reached", key: "intR" },
    { header: "Interviews cleared", key: "intP" },
    { header: "Interviews failed", key: "intF" },
    { header: "Offers", key: "offers" },
    { header: "Best offer CTC (LPA)", key: "bestCtc" },
    { header: "Success rate %", key: "success" },
    { header: "Status", key: "status" },
    { header: "Companies offered", key: "offerCos" },
  ];

  for (const s of students) {
    const parts = byStudent.get(String(s._id)) || [];
    const a = tally(parts, "aptitude");
    const t = tally(parts, "technical");
    const i = tally(parts, "interview");

    const offers = parts.filter(
      (p) => p.stages?.final?.status === FINAL_STATUS.SELECTED,
    );
    const attended = parts.filter(
      (p) =>
        ["aptitude", "technical", "interview"].some((k) =>
          isAttempt(p.stages?.[k]?.status),
        ) ||
        (p.stages?.final?.status &&
          p.stages.final.status !== FINAL_STATUS.NOT_REACHED),
    ).length;

    st.addRow({
      usn: s.usn,
      name: s.userId?.name ?? "",
      email: s.userId?.email ?? "",
      branch: s.branch,
      batch: s.batch,
      cgpa: s.cgpa,
      backlogs: s.backlogs,
      registered: parts.length,
      attended,
      aptA: a.attempts, aptP: a.passed, aptF: a.failed, aptN: a.notReached,
      aptPct: pctOrDash(a.passed, a.attempts),
      techA: t.attempts, techP: t.passed, techF: t.failed, techN: t.notReached,
      techPct: pctOrDash(t.passed, t.attempts),
      intR: i.attempts, intP: i.passed, intF: i.failed,
      offers: offers.length,
      bestCtc: offers.length
        ? Math.max(...offers.map((p) => p.stages.final.offer?.ctc || 0)) || "–"
        : "–",
      success: pctOrDash(offers.length, attended),
      status: offers.length ? "Placed" : attended ? "Unplaced" : "No history",
      offerCos: offers.map((p) => p.driveId.companyName).join(", "),
    });
  }
  styleHeader(st);
  autoWidth(st);

  // ── Sheet 3: Drives ─────────────────────────────────────────
  const dr = wb.addWorksheet("Drives");
  dr.columns = [
    { header: "Company", key: "company" },
    { header: "Role", key: "role" },
    { header: "Date", key: "date" },
    { header: "CTC (LPA)", key: "ctc" },
    { header: "Location", key: "location" },
    { header: "Status", key: "status" },
    { header: "Min CGPA", key: "minCgpa" },
    { header: "Max backlogs", key: "maxBacklogs" },
    { header: "Branches", key: "branches" },
    { header: "Stages run", key: "stages" },
    { header: "Registered", key: "registered" },
    { header: "Aptitude cleared", key: "aptP" },
    { header: "Technical cleared", key: "techP" },
    { header: "Interviews reached", key: "intR" },
    { header: "Offers", key: "offers" },
  ];

  for (const d of drives) {
    const parts = valid.filter((p) => String(p.driveId._id) === String(d._id));
    const a = tally(parts, "aptitude");
    const t = tally(parts, "technical");
    const i = tally(parts, "interview");
    dr.addRow({
      company: d.companyName,
      role: d.role,
      date: d.driveDate ? new Date(d.driveDate).toLocaleDateString() : "",
      ctc: d.ctc ?? "–",
      location: d.location ?? "",
      status: d.status,
      minCgpa: d.eligibility?.minCgpa ?? 0,
      maxBacklogs: d.eligibility?.maxBacklogs ?? 0,
      branches: d.eligibility?.branches?.length
        ? d.eligibility.branches.join(", ")
        : "All",
      stages: (d.stages || []).join(" → "),
      registered: parts.length,
      aptP: a.passed,
      techP: t.passed,
      intR: i.attempts,
      offers: parts.filter(
        (p) => p.stages?.final?.status === FINAL_STATUS.SELECTED,
      ).length,
    });
  }
  styleHeader(dr);
  autoWidth(dr);

  // ── Sheet 4: Participations (the raw records) ───────────────
  const pa = wb.addWorksheet("Participations");
  pa.columns = [
    { header: "USN", key: "usn" },
    { header: "Name", key: "name" },
    { header: "Branch", key: "branch" },
    { header: "Company", key: "company" },
    { header: "Role", key: "role" },
    { header: "Drive date", key: "date" },
    { header: "Aptitude", key: "apt" },
    { header: "Technical", key: "tech" },
    { header: "Interview", key: "intv" },
    { header: "Final", key: "final" },
    { header: "Offer CTC (LPA)", key: "ctc" },
    { header: "Outcome", key: "outcome" },
  ];

  const studentById = new Map(students.map((s) => [String(s._id), s]));

  const outcomeOf = (p) => {
    if (p.stages?.final?.status === FINAL_STATUS.SELECTED) return "Offer";
    if (p.stages?.final?.status === FINAL_STATUS.REJECTED) return "Rejected at final";
    for (const stage of ["interview", "technical", "aptitude"]) {
      const s = p.stages?.[stage]?.status;
      if (s === STAGE_STATUS.FAILED) return `Failed ${stage}`;
      if (s === STAGE_STATUS.PASSED) return `Cleared ${stage}`;
    }
    return "Not started";
  };

  const sorted = [...valid].sort((a, b) => {
    const sa = studentById.get(String(a.studentId))?.usn ?? "";
    const sb = studentById.get(String(b.studentId))?.usn ?? "";
    if (sa !== sb) return sa.localeCompare(sb);
    return new Date(a.driveId.driveDate) - new Date(b.driveId.driveDate);
  });

  for (const p of sorted) {
    const s = studentById.get(String(p.studentId));
    if (!s) continue; // student outside the requested batch/branch filter
    pa.addRow({
      usn: s.usn,
      name: s.userId?.name ?? "",
      branch: s.branch,
      company: p.driveId.companyName,
      role: p.driveId.role,
      date: p.driveId.driveDate
        ? new Date(p.driveId.driveDate).toLocaleDateString()
        : "",
      apt: STATUS_TEXT[p.stages?.aptitude?.status] ?? "Not reached",
      tech: STATUS_TEXT[p.stages?.technical?.status] ?? "Not reached",
      intv: STATUS_TEXT[p.stages?.interview?.status] ?? "Not reached",
      final: STATUS_TEXT[p.stages?.final?.status] ?? "Not reached",
      ctc:
        p.stages?.final?.status === FINAL_STATUS.SELECTED
          ? (p.stages.final.offer?.ctc ?? "–")
          : "–",
      outcome: outcomeOf(p),
    });
  }
  styleHeader(pa);
  autoWidth(pa);

  return wb;
};

/** Filename that sorts chronologically and says what it contains. */
export const exportFilename = (filter = {}) => {
  const stamp = new Date().toISOString().slice(0, 10);
  const scope = [filter.batch, filter.branch].filter(Boolean).join("-");
  return `careercore-placement-${scope ? `${scope}-` : ""}${stamp}.xlsx`;
};
