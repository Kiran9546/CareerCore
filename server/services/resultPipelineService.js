import ExcelJS from "exceljs";
import Student from "../models/Student.js";
import Drive from "../models/Drive.js";
import DriveParticipation from "../models/DriveParticipation.js";
import {
  DRIVE_STAGES,
  ATTEMPT_STAGES,
  STAGE_STATUS,
  FINAL_STATUS,
  RESULT_SOURCE,
  USN_BRANCH_CODES,
  COURSE_YEARS,
  normaliseDepartment,
} from "../config/constants.js";

/**
 * Turning proposed results into official ones, from a form or a spreadsheet.
 *
 * Everything here funnels into applyStages(), so a result typed into the
 * officer's grid, forwarded by faculty, and read out of a spreadsheet all
 * land on DriveParticipation.stages by the same route and under the same
 * rules. There is one place that writes an official result.
 */

/** Normalise whatever a human typed into one of our status values. */
const STATUS_WORDS = {
  pass: STAGE_STATUS.PASSED,
  passed: STAGE_STATUS.PASSED,
  cleared: STAGE_STATUS.PASSED,
  clear: STAGE_STATUS.PASSED,
  qualified: STAGE_STATUS.PASSED,
  y: STAGE_STATUS.PASSED,
  yes: STAGE_STATUS.PASSED,
  "1": STAGE_STATUS.PASSED,

  fail: STAGE_STATUS.FAILED,
  failed: STAGE_STATUS.FAILED,
  "not cleared": STAGE_STATUS.FAILED,
  rejected: STAGE_STATUS.FAILED,
  n: STAGE_STATUS.FAILED,
  no: STAGE_STATUS.FAILED,
  "0": STAGE_STATUS.FAILED,

  "not reached": STAGE_STATUS.NOT_REACHED,
  not_reached: STAGE_STATUS.NOT_REACHED,
  na: STAGE_STATUS.NOT_REACHED,
  "n/a": STAGE_STATUS.NOT_REACHED,
  "-": STAGE_STATUS.NOT_REACHED,
  absent: STAGE_STATUS.NOT_REACHED,
};

const FINAL_WORDS = {
  selected: FINAL_STATUS.SELECTED,
  select: FINAL_STATUS.SELECTED,
  offer: FINAL_STATUS.SELECTED,
  offered: FINAL_STATUS.SELECTED,
  placed: FINAL_STATUS.SELECTED,
  y: FINAL_STATUS.SELECTED,
  yes: FINAL_STATUS.SELECTED,
  "1": FINAL_STATUS.SELECTED,

  rejected: FINAL_STATUS.REJECTED,
  reject: FINAL_STATUS.REJECTED,
  "not selected": FINAL_STATUS.REJECTED,
  n: FINAL_STATUS.REJECTED,
  no: FINAL_STATUS.REJECTED,
  "0": FINAL_STATUS.REJECTED,

  "not reached": FINAL_STATUS.NOT_REACHED,
  not_reached: FINAL_STATUS.NOT_REACHED,
  na: FINAL_STATUS.NOT_REACHED,
  "n/a": FINAL_STATUS.NOT_REACHED,
  "-": FINAL_STATUS.NOT_REACHED,
};

/**
 * Read a spreadsheet cell as a stage status.
 *
 * Placement offices keep these sheets by hand, so the same column arrives as
 * "Pass", "PASSED", "Y", "cleared" or a tick. Rejecting anything but an exact
 * enum value would make the importer useless on the files it exists to read;
 * anything genuinely unrecognised is reported back per row rather than
 * guessed at.
 */
export const parseStatus = (raw, isFinal = false) => {
  if (raw === null || raw === undefined) return null;
  const key = String(raw).trim().toLowerCase();
  if (!key) return null;
  const table = isFinal ? FINAL_WORDS : STATUS_WORDS;
  return table[key] ?? null;
};

const toNumberOrUndefined = (v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Write a set of stage outcomes onto a participation, creating it if the
 * student was never registered for the drive.
 *
 * The two integrity rules from the officer's grid hold here too, because
 * they are properties of the data rather than of the screen: a later stage
 * cannot be passed unless the earlier one was, and failing a stage clears
 * everything after it. A spreadsheet that violates them is corrected rather
 * than trusted, and what was corrected is reported back.
 *
 * @returns {{participation, applied: string[], skipped: {stage,reason}[]}}
 */
export const applyStages = async ({
  studentId,
  driveId,
  stages,
  offer,
  userId,
  source = RESULT_SOURCE.PLACEMENT_CELL,
  note,
}) => {
  const drive = await Drive.findById(driveId);
  if (!drive) throw Object.assign(new Error("Drive not found"), { status: 404 });

  let participation = await DriveParticipation.findOne({ driveId, studentId });
  if (!participation) {
    participation = await DriveParticipation.create({
      driveId,
      studentId,
      registeredAt: drive.driveDate ?? new Date(),
      registeredBy: userId,
    });
  }

  const ordered = drive.orderedStages();
  const applied = [];
  const skipped = [];

  for (const stage of ordered) {
    const proposed = stages?.[stage];
    if (!proposed || !proposed.status) continue;

    const isFinal = stage === "final";
    const allowed = isFinal
      ? Object.values(FINAL_STATUS)
      : Object.values(STAGE_STATUS);
    if (!allowed.includes(proposed.status)) {
      skipped.push({ stage, reason: `"${proposed.status}" is not valid for ${stage}` });
      continue;
    }

    // A later stage needs the previous one cleared. Applied in order, so by
    // the time we reach this stage the previous one already reflects the
    // same submission rather than only what was there before.
    const index = ordered.indexOf(stage);
    const notReached = isFinal ? FINAL_STATUS.NOT_REACHED : STAGE_STATUS.NOT_REACHED;
    if (index > 0 && proposed.status !== notReached) {
      const previous = ordered[index - 1];
      if (participation.stages[previous]?.status !== STAGE_STATUS.PASSED) {
        skipped.push({
          stage,
          reason:
            `cannot record ${stage} — ${previous} is ` +
            `"${participation.stages[previous]?.status ?? "not_reached"}"`,
        });
        continue;
      }
    }

    participation.applyStageResult(
      stage,
      {
        status: proposed.status,
        score: toNumberOrUndefined(proposed.score),
        note: proposed.note ?? note,
        offer:
          isFinal && proposed.status === FINAL_STATUS.SELECTED
            ? {
                ctc: toNumberOrUndefined(offer?.ctc) ?? drive.ctc,
                role: offer?.role || drive.role,
                offerDate: offer?.offerDate || drive.driveDate || new Date(),
              }
            : undefined,
      },
      userId,
    );
    applied.push(stage);

    // Failing a stage means the ones after it were never reached.
    if (
      proposed.status === STAGE_STATUS.FAILED ||
      proposed.status === FINAL_STATUS.REJECTED
    ) {
      for (const later of ordered.slice(index + 1)) {
        participation.stages[later].status =
          later === "final" ? FINAL_STATUS.NOT_REACHED : STAGE_STATUS.NOT_REACHED;
      }
    }
  }

  if (applied.length) {
    participation.history.push({
      stage: "batch",
      from: null,
      to: source,
      changedAt: new Date(),
      changedBy: userId,
      note: note ?? `Applied via ${source}`,
    });
    await participation.save();
  }

  return { participation, applied, skipped };
};

// ─────────────────────────────────────────────────────────────
// SPREADSHEET IMPORT
// ─────────────────────────────────────────────────────────────

/**
 * Reading a placement office's own results sheet.
 *
 * These files are kept by hand and no two look alike. Columns are named
 * whatever the office calls them, the header may sit below a title block,
 * and the number of rounds varies per company — one drive has a single
 * written test, the next has two technical rounds plus a GD plus an HR
 * round. So the parser identifies columns by what their names MEAN rather
 * than by matching a fixed list, and folds however many round columns it
 * finds onto the four stages the rest of the system records.
 *
 * Nothing is guessed silently: the mapping it worked out, and every column
 * it could not place, are returned so the uploader can see how their sheet
 * was read before anything is written.
 */

/** Reduce a header to comparable tokens: "CTC (LPA) " -> ["ctc", "lpa"]. */
const tokenize = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

/**
 * Which stage a round column belongs to.
 *
 * Matched on meaning, so "Tech Round 2", "Coding Test" and "DSA" all land on
 * technical without needing to be listed. Order matters: `final` is checked
 * first because "Final Result" also contains "result", and a bare "Result"
 * column is the outcome, not a round.
 */
const STAGE_SIGNALS = [
  {
    stage: "final",
    any: ["final", "offer", "offered", "placed", "selection", "selected", "outcome", "result", "status", "verdict"],
  },
  {
    stage: "aptitude",
    any: ["aptitude", "apti", "written", "screening", "prescreening", "quants", "quantitative", "reasoning", "online", "mcq"],
  },
  {
    stage: "technical",
    any: ["technical", "tech", "coding", "code", "programming", "dsa", "machine", "assessment"],
  },
  {
    stage: "interview",
    any: ["interview", "hr", "pi", "personal", "managerial", "manager", "panel", "gd", "discussion", "group"],
  },
];

const META_SIGNALS = [
  { field: "usn", any: ["usn", "reg", "regno", "registration", "roll", "seat", "enrolment", "enrollment"], pair: [["student", "id"]] },
  { field: "company", any: ["company", "organisation", "organization", "firm", "employer", "recruiter", "corporate"] },
  { field: "role", any: ["role", "designation", "position", "profile", "post"], pair: [["job", "title"]] },
  { field: "ctc", any: ["ctc", "package", "lpa", "salary", "compensation", "stipend"] },
  { field: "name", any: ["name", "candidate", "student"] },
  {
    field: "department",
    any: ["department", "dept", "branch", "stream", "discipline", "specialisation", "specialization"],
  },
];

/** A generic "Round 3" / "R2" style column with no other signal. */
const genericRound = (tokens) => {
  const joined = tokens.join(" ");
  const m = joined.match(/^(?:round|rnd|r)\s*(\d+)$/) || joined.match(/^(?:round|rnd)\s*(\d+)/);
  return m ? Number(m[1]) : null;
};

/**
 * Work out what every column in a header row means.
 *
 * @returns {{ meta, rounds, unmapped, score }}
 *   meta     field -> column number
 *   rounds   ordered list of { col, stage, header, roundIndex }
 *   unmapped headers it could not place, for reporting back
 */
const mapHeaderRow = (row) => {
  const meta = {};
  const rounds = [];
  const unmapped = [];
  const generic = [];

  row.eachCell({ includeEmpty: false }, (cell, col) => {
    const rawText =
      typeof cell.value === "object" && cell.value !== null
        ? String(cell.value.result ?? cell.value.text ?? cell.value.richText?.map((r) => r.text).join("") ?? "")
        : String(cell.value ?? "");
    const header = rawText.trim();
    if (!header) return;
    const tokens = tokenize(header);
    if (!tokens.length) return;

    // Metadata columns first — a "Company Name" column must not be read as
    // a "name" column, so the more specific signals are checked in order.
    for (const sig of META_SIGNALS) {
      const hit =
        tokens.some((t) => sig.any.includes(t)) ||
        (sig.pair ?? []).some((pair) => pair.every((p) => tokens.includes(p)));
      if (hit) {
        // First column to claim a field keeps it; a later duplicate is noise.
        if (meta[sig.field] === undefined) {
          meta[sig.field] = col;
          return;
        }
      }
    }

    // Round columns.
    for (const sig of STAGE_SIGNALS) {
      if (tokens.some((t) => sig.any.includes(t))) {
        rounds.push({ col, stage: sig.stage, header });
        return;
      }
    }

    const n = genericRound(tokens);
    if (n !== null) {
      generic.push({ col, header, n });
      return;
    }

    unmapped.push({ col, header });
  });

  // Generic "Round 1..N" columns carry no stage in their name, so they are
  // laid onto the canonical stages in order — round 1 is the first gate, and
  // anything past the fourth folds into the interview stage, which is where
  // extra rounds realistically sit.
  const ORDER = ["aptitude", "technical", "interview", "final"];
  generic
    .sort((a, b) => a.n - b.n)
    .forEach((g, i) => {
      rounds.push({ col: g.col, stage: ORDER[Math.min(i, ORDER.length - 1)], header: g.header });
    });

  // Keep round columns in sheet order so several columns for one stage are
  // combined left to right, which is the order the rounds happened in.
  rounds.sort((a, b) => a.col - b.col);
  rounds.forEach((r, i) => { r.roundIndex = i + 1; });

  const score =
    (meta.usn !== undefined ? 3 : 0) +
    (meta.company !== undefined ? 2 : 0) +
    rounds.length +
    Object.keys(meta).length;

  return { meta, rounds, unmapped, score };
};

const cellText = (row, col) => {
  if (!col) return "";
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    return String(
      v.result ?? v.text ?? v.richText?.map((r) => r.text).join("") ?? "",
    ).trim();
  }
  return String(v).trim();
};

/** Does this look like a student identifier rather than prose? */
const looksLikeUsn = (text) =>
  /^[0-9][A-Z0-9]{5,}$/i.test(String(text).replace(/\s+/g, ""));

/**
 * Read the branch and batch out of a USN laid out `4MT<YY><BB><NNN>`.
 *
 * A sheet without a department column still carries the branch inside every
 * identifier, and the entry year gives the graduating batch. Both are
 * fallbacks — an explicit department column always wins, because a college
 * can and does re-issue codes.
 */
export const parseUsn = (usn) => {
  const m = String(usn ?? "").toUpperCase().match(/^[0-9][A-Z]{2}(\d{2})([A-Z]{2})\d+$/);
  if (!m) return {};
  const [, yy, code] = m;
  const entryYear = 2000 + Number(yy);
  return {
    branch: USN_BRANCH_CODES[code],
    batch: String(entryYear + COURSE_YEARS),
  };
};

/**
 * Combine several columns that all belong to one stage.
 *
 * A drive with "Technical 1" and "Technical 2" is only cleared if both were
 * cleared, so any failure short-circuits and a round that was never reached
 * stops the chain without being a failure. This is what lets a sheet carry
 * more rounds than the four the system records without losing meaning.
 */
const combineStage = (values, isFinal) => {
  let sawPass = false;
  for (const raw of values) {
    const status = parseStatus(raw, isFinal);
    if (status === null) return { error: raw };
    if (status === (isFinal ? FINAL_STATUS.REJECTED : STAGE_STATUS.FAILED)) {
      return { status };
    }
    if (status === (isFinal ? FINAL_STATUS.SELECTED : STAGE_STATUS.PASSED)) {
      sawPass = true;
      continue;
    }
    // not_reached: everything after it was not reached either.
    if (sawPass) break;
    return { status: isFinal ? FINAL_STATUS.NOT_REACHED : STAGE_STATUS.NOT_REACHED };
  }
  return {
    status: sawPass
      ? isFinal
        ? FINAL_STATUS.SELECTED
        : STAGE_STATUS.PASSED
      : isFinal
        ? FINAL_STATUS.NOT_REACHED
        : STAGE_STATUS.NOT_REACHED,
  };
};

/**
 * Parse a results workbook into rows we can apply.
 *
 * Nothing is written here — parsing and applying are separate so the caller
 * can show exactly what a file will do before it does it.
 *
 * @param {Buffer} buffer            the uploaded .xlsx
 * @param {object} [opts]
 * @param {string} [opts.department] restrict to one department's students
 * @param {string} [opts.driveId]    apply every row to this drive, for a
 *                                   sheet with no company column
 */
export const parseResultsWorkbook = async (buffer, opts = {}) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  // Prefer a sheet that actually parses; offices often keep a cover sheet
  // first, or one tab per company.
  let sheet = null;
  let best = null;
  let headerRow = 1;

  for (const ws of wb.worksheets) {
    if (!ws.rowCount) continue;
    // The header is usually near the top but can sit under a title block or
    // a couple of blank rows, so scan further than the first row or two.
    for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
      const candidate = mapHeaderRow(ws.getRow(r));
      // `best === null` on the first look keeps a zero-scoring candidate, so
      // even a sheet that maps nothing still reports which row it examined
      // rather than dead-ending on "no readable sheets".
      if (best === null || candidate.score > best.score) {
        best = candidate;
        sheet = ws;
        headerRow = r;
      }
    }
  }

  if (!sheet || !best) {
    throw Object.assign(
      new Error(
        "The workbook has no rows to read. Check the file opens in Excel and " +
          "has a sheet with a header row.",
      ),
      { status: 400 },
    );
  }

  const { meta, rounds, unmapped } = best;

  // ── Find the USN column even when the header does not say so ──
  // A sheet whose identifier column is called something unexpected is still
  // usable: look for a column whose values are shaped like student numbers.
  if (meta.usn === undefined) {
    const sampleRows = [];
    for (let r = headerRow + 1; r <= Math.min(headerRow + 25, sheet.rowCount); r++) {
      sampleRows.push(sheet.getRow(r));
    }
    const populated = sampleRows.filter((r) => r.hasValues).length;

    let bestCol = null;
    let bestHits = 0;
    for (let c = 1; c <= sheet.columnCount; c++) {
      // Round columns hold pass/fail words, never identifiers, so they are
      // never candidates. Metadata columns ARE reconsidered: a header like
      // "Student Code" is claimed as a name by its wording, and the values
      // underneath are the only thing that reveals it is really the USN.
      if (rounds.some((x) => x.col === c)) continue;
      if (meta.company === c || meta.role === c || meta.ctc === c) continue;

      const hits = sampleRows.filter((r) => looksLikeUsn(cellText(r, c))).length;
      if (hits > bestHits) { bestHits = hits; bestCol = c; }
    }

    // Has to hold for most of the sampled rows, not just match one stray cell.
    if (bestCol && bestHits >= Math.max(1, Math.floor(populated * 0.5))) {
      meta.usn = bestCol;
      // If that column had been read as the student's name, it is not the
      // name — one column cannot be both.
      if (meta.name === bestCol) delete meta.name;
    }
  }

  const detected = {
    sheetName: sheet.name,
    headerRow,
    columns: {
      ...Object.fromEntries(
        Object.entries(meta).map(([field, col]) => [
          field,
          cellText(sheet.getRow(headerRow), col) || `column ${col}`,
        ]),
      ),
    },
    rounds: rounds.map((r) => ({ header: r.header, mappedTo: r.stage })),
    ignored: unmapped.map((u) => u.header),
  };

  if (meta.usn === undefined) {
    const seen = sheet.getRow(headerRow).values;
    throw Object.assign(
      new Error(
        "Could not identify a student column. The sheet needs a column of " +
          "USNs — it can be called USN, Reg No, Roll No or similar. " +
          `Row ${headerRow} of "${sheet.name}" reads: ` +
          (Array.isArray(seen)
            ? seen.filter(Boolean).map((v) => String(v)).join(" | ").slice(0, 300)
            : "(empty)"),
      ),
      { status: 400, detected },
    );
  }

  if (!rounds.length) {
    throw Object.assign(
      new Error(
        "Found students but no round columns. Add at least one column for a " +
          "round — Aptitude, Technical, Interview, Final, or Round 1, Round 2 " +
          "and so on.",
      ),
      { status: 400, detected },
    );
  }

  // ── Collect the data rows ──
  const raw = [];
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const usn = cellText(row, meta.usn).toUpperCase().replace(/\s+/g, "");
    if (!usn) continue;
    raw.push({ rowNumber: r, usn, row });
  }

  // Looked up unscoped, then narrowed. A faculty import needs to tell three
  // cases apart, and they need different answers: the student is theirs, the
  // student belongs to another department, or the student is not in
  // CareerCore at all. Filtering in the query alone collapses the last two
  // into one and reports an existing student as missing.
  const usnList = raw.map((x) => x.usn);
  const everyone = await Student.find({ usn: { $in: usnList } })
    .populate("userId", "name")
    .select("usn branch batch userId");

  const anyByUsn = new Map(everyone.map((s) => [s.usn.toUpperCase(), s]));
  const inScope = opts.department
    ? everyone.filter((s) => s.branch === opts.department)
    : everyone;
  const byUsn = new Map(inScope.map((s) => [s.usn.toUpperCase(), s]));

  const drives = await Drive.find({}).select("companyName role driveDate stages");
  const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const byCompanyRole = new Map(
    drives.map((d) => [`${norm(d.companyName)}|${norm(d.role)}`, d]),
  );
  const byCompany = new Map(drives.map((d) => [norm(d.companyName), d]));

  const fallbackDrive = opts.driveId
    ? drives.find((d) => String(d._id) === String(opts.driveId))
    : null;

  // Group the round columns by the stage they were mapped onto.
  const roundsByStage = rounds.reduce((acc, r) => {
    (acc[r.stage] ??= []).push(r);
    return acc;
  }, {});

  const rows = [];
  const errors = [];

  const missing = [];

  for (const { rowNumber, usn, row } of raw) {
    let student = byUsn.get(usn);

    if (!student) {
      // Exists, but in a department this caller cannot touch. Nothing to
      // create and nothing to fix in the sheet — say so plainly.
      const elsewhere = anyByUsn.get(usn);
      if (elsewhere) {
        errors.push({
          rowNumber,
          usn,
          creatable: false,
          reason:
            `This student is in ${elsewhere.branch}, not ${opts.department}` +
            " \u2014 ask the placement cell to import this row",
        });
        continue;
      }

      // The office's sheet is often the master list, so an unknown USN is
      // usually a student CareerCore has not been told about rather than a
      // typo. Gather enough to create them and let the caller decide.
      const fromUsn = parseUsn(usn);
      // The sheet's own wording wins when it can be placed — "Information
      // Science" and "ISE" both have to become ISE, because faculty scoping
      // compares Student.branch to User.department directly. The USN's
      // branch code is the fallback for a sheet with no department column.
      const sheetDept = meta.department
        ? normaliseDepartment(cellText(row, meta.department))
        : null;
      const branch = sheetDept || fromUsn.branch || null;

      // A faculty import must not CREATE a student into another department
      // either, even when the sheet asks for it.
      const outOfScope = opts.department && branch && branch !== opts.department;

      const candidate = {
        rowNumber,
        usn,
        name: meta.name ? cellText(row, meta.name) : "",
        branch,
        batch: fromUsn.batch ?? null,
        creatable: Boolean(branch) && !outOfScope,
      };
      missing.push(candidate);

      errors.push({
        rowNumber,
        usn,
        creatable: candidate.creatable,
        reason: outOfScope
          ? `This student is in ${branch}, not ${opts.department}`
          : candidate.creatable
            ? "Not in CareerCore yet — tick “Create students missing from CareerCore” to add them"
            : "Not in CareerCore, and the department could not be worked out " +
              "from the sheet or the USN. Add a Department column.",
      });
      continue;
    }

    const company = meta.company ? cellText(row, meta.company) : "";
    const role = meta.role ? cellText(row, meta.role) : "";

    const drive =
      (company &&
        (byCompanyRole.get(`${norm(company)}|${norm(role)}`) ??
          byCompany.get(norm(company)))) ||
      fallbackDrive;

    if (!drive) {
      errors.push({
        rowNumber, usn,
        reason: company
          ? `No drive found for "${company}"${role ? ` (${role})` : ""}`
          : "No company column on this sheet — pick a drive to apply the whole file to",
      });
      continue;
    }

    const stages = {};
    const unreadable = [];
    for (const [stage, cols] of Object.entries(roundsByStage)) {
      // Only stages this drive actually runs.
      if (drive.stages?.length && !drive.stages.includes(stage)) continue;
      const values = cols.map((c) => cellText(row, c.col)).filter((v) => v !== "");
      if (!values.length) continue;
      const combined = combineStage(values, stage === "final");
      if (combined.error !== undefined) {
        unreadable.push(`${stage}: "${combined.error}"`);
        continue;
      }
      stages[stage] = { status: combined.status };
    }

    if (unreadable.length) {
      errors.push({ rowNumber, usn, reason: `Could not read ${unreadable.join(", ")}` });
      continue;
    }
    if (!Object.keys(stages).length) {
      errors.push({ rowNumber, usn, reason: "No round results on this row" });
      continue;
    }

    const ctcLpa = meta.ctc ? toNumberOrUndefined(cellText(row, meta.ctc)) : undefined;

    rows.push({
      rowNumber,
      usn,
      studentId: student._id,
      studentName: student.userId?.name,
      branch: student.branch,
      driveId: drive._id,
      company: drive.companyName,
      role: drive.role,
      stages,
      offer: ctcLpa !== undefined ? { ctc: ctcLpa * 100000 } : undefined,
    });
  }

  return {
    rows,
    errors,
    missing,
    creatableCount: missing.filter((m) => m.creatable).length,
    detected,
    headers: Object.values(detected.columns),
    sheetName: sheet.name,
    totalDataRows: raw.length,
  };
};

/** Build the blank template the UI offers for download. */
export const buildImportTemplate = async () => {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CareerCore";
  const sheet = wb.addWorksheet("Results");

  sheet.columns = [
    { header: "USN", key: "usn", width: 16 },
    { header: "Name", key: "name", width: 22 },
    { header: "Company", key: "company", width: 20 },
    { header: "Role", key: "role", width: 24 },
    { header: "Aptitude", key: "aptitude", width: 14 },
    { header: "Technical", key: "technical", width: 14 },
    { header: "Interview", key: "interview", width: 14 },
    { header: "Final", key: "final", width: 14 },
    { header: "CTC (LPA)", key: "ctc", width: 12 },
  ];

  const head = sheet.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  head.height = 22;
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  sheet.addRow({
    usn: "4MTPJ26A01",
    name: "Aarav Shetty",
    company: "Infosys",
    role: "Systems Engineer",
    aptitude: "Passed",
    technical: "Failed",
    interview: "Not reached",
    final: "Not reached",
    ctc: "",
  });

  const notes = wb.addWorksheet("How to fill this in");
  notes.columns = [
    { header: "Column", key: "c", width: 16 },
    { header: "What to put in it", key: "d", width: 92 },
  ];
  notes.addRows([
    { c: "USN", d: "Required. Must match a student already in CareerCore." },
    { c: "Company", d: "Required. Must match a drive that already exists. Add the drive first if it does not." },
    { c: "Role", d: "Optional. Used to pick between two drives at the same company." },
    { c: "Aptitude / Technical / Interview", d: "Passed, Failed or Not reached. Pass/Fail/Y/N/Cleared/NA are all understood." },
    { c: "Final", d: "Selected, Rejected or Not reached. Offer/Placed/Y/N are all understood." },
    { c: "CTC (LPA)", d: "Optional, only read when Final is Selected. Plain number, e.g. 7.5" },
    { c: "", d: "" },
    { c: "Note", d: "A round can only be recorded as passed if the previous round was passed. Rows that break that are reported back and skipped, not guessed at." },
    { c: "Note", d: "\"Not reached\" is not a failure — it means the student never sat that round, and it is never counted as an attempt." },
  ]);
  const nhead = notes.getRow(1);
  nhead.font = { bold: true, color: { argb: "FFFFFFFF" } };
  nhead.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };

  return wb;
};
