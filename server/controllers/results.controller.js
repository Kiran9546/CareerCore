import mongoose from "mongoose";
import crypto from "crypto";
import ResultSubmission from "../models/ResultSubmission.js";
import Student from "../models/Student.js";
import User from "../models/User.js";
import Drive from "../models/Drive.js";
import DriveParticipation from "../models/DriveParticipation.js";
import {
  ROLES,
  DRIVE_STAGES,
  STAGE_STATUS,
  FINAL_STATUS,
  SUBMISSION_STATUS,
  RESULT_SOURCE,
} from "../config/constants.js";
import {
  applyStages,
  parseResultsWorkbook,
  buildImportTemplate,
} from "../services/resultPipelineService.js";
import { notify } from "../services/notificationService.js";

/**
 * The result pipeline: requests, student submissions, faculty review, and
 * direct entry or spreadsheet import by faculty and the placement cell.
 *
 * ─── SCOPING ──────────────────────────────────────────────────────────
 * Faculty see and act on their own department only. That is enforced here
 * from `req.user.department`, never from anything in the request, so there
 * is no parameter to widen. The placement officer is unscoped.
 * ──────────────────────────────────────────────────────────────────────
 */

const isOfficer = (u) =>
  u.role === ROLES.PLACEMENT_OFFICER || u.role === ROLES.ADMIN;
const isFaculty = (u) => u.role === ROLES.FACULTY;

/**
 * The department filter for the signed-in user: a fixed value for faculty,
 * nothing for the placement cell. Returns null when a faculty account has no
 * department, which the callers turn into an empty result rather than an
 * unscoped one.
 */
const departmentScope = (user) => {
  if (isOfficer(user)) return {};
  if (isFaculty(user)) {
    return user.department ? { department: user.department } : null;
  }
  return null;
};

const studentScope = (user) => {
  if (isOfficer(user)) return {};
  if (isFaculty(user)) return user.department ? { branch: user.department } : null;
  return null;
};

const NO_DEPARTMENT = {
  message:
    "Your faculty account has no department set, so there are no students " +
    "in scope. Ask an administrator to set it.",
};

const ownStudent = (user) => Student.findOne({ userId: user._id }).select("_id branch");

const present = (s) => ({
  _id: s._id,
  status: s.status,
  source: s.source,
  department: s.department,
  student: s.studentId?._id
    ? {
        _id: s.studentId._id,
        name: s.studentId.userId?.name,
        usn: s.studentId.usn,
        branch: s.studentId.branch,
      }
    : { _id: s.studentId },
  drive: s.driveId?._id
    ? {
        _id: s.driveId._id,
        company: s.driveId.companyName,
        role: s.driveId.role,
        driveDate: s.driveId.driveDate,
        stagesRun: s.driveId.stages,
      }
    : { _id: s.driveId },
  stages: s.stages,
  offer: s.offer,
  studentNote: s.studentNote,
  facultyNote: s.facultyNote,
  requestNote: s.requestNote,
  requestedAt: s.requestedAt,
  submittedAt: s.submittedAt,
  reviewedAt: s.reviewedAt,
  isLocked: s.isLocked,
  createdAt: s.createdAt,
});

const POPULATE = [
  { path: "driveId", select: "companyName role driveDate stages" },
  {
    path: "studentId",
    select: "usn branch userId",
    populate: { path: "userId", select: "name email" },
  },
];

/** Read the proposed stages out of a request body, ignoring anything else. */
const readStages = (body) => {
  const stages = {};
  for (const stage of DRIVE_STAGES) {
    const incoming = body?.stages?.[stage];
    if (!incoming || !incoming.status) continue;
    const allowed =
      stage === "final" ? Object.values(FINAL_STATUS) : Object.values(STAGE_STATUS);
    if (!allowed.includes(incoming.status)) {
      return { error: `"${incoming.status}" is not a valid ${stage} result` };
    }
    stages[stage] = {
      status: incoming.status,
      score: incoming.score,
      note: incoming.note,
    };
  }
  return { stages };
};

// ─────────────────────────────────────────────────────────────
// FACULTY: ask a student for their results
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/results/requests
 * Body: { studentId, driveId, note? }
 *
 * Creating the request IS the permission. A student can only fill in a
 * submission that already exists for them in `requested` state, so there is
 * no path to self-reporting unasked.
 */
export const requestResults = async (req, res, next) => {
  try {
    const { studentId, driveId } = req.body;
    if (!mongoose.isValidObjectId(studentId) || !mongoose.isValidObjectId(driveId)) {
      return res.status(400).json({ message: "A valid studentId and driveId are required" });
    }

    const scope = studentScope(req.user);
    if (!scope) return res.status(403).json(NO_DEPARTMENT);

    const student = await Student.findOne({ _id: studentId, ...scope }).populate(
      "userId",
      "name",
    );
    if (!student) {
      return res.status(404).json({
        message: isFaculty(req.user)
          ? `No student with that id in ${req.user.department}`
          : "Student not found",
      });
    }

    const drive = await Drive.findById(driveId).select("companyName role");
    if (!drive) return res.status(404).json({ message: "Drive not found" });

    const existing = await ResultSubmission.findOne({
      studentId,
      driveId,
      status: { $in: [SUBMISSION_STATUS.REQUESTED, SUBMISSION_STATUS.SUBMITTED] },
    });
    if (existing) {
      return res.status(409).json({
        message:
          existing.status === SUBMISSION_STATUS.SUBMITTED
            ? "This student has already submitted results for that drive. Review them instead."
            : "You have already asked this student for that drive.",
      });
    }

    const submission = await ResultSubmission.create({
      studentId,
      driveId,
      department: student.branch,
      status: SUBMISSION_STATUS.REQUESTED,
      source: RESULT_SOURCE.STUDENT,
      requestedBy: req.user._id,
      requestedAt: new Date(),
      requestNote: req.body.note,
    });

    notify({
      userId: student.userId?._id ?? student.userId,
      type: "placement_update",
      title: `Please submit your ${drive.companyName} results`,
      body:
        `${req.user.name} has asked you to record how you did in the ` +
        `${drive.role} drive at ${drive.companyName}. Open your Placement page to fill it in.`,
      link: "/student/placement",
      metadata: { submissionId: submission._id, driveId: drive._id },
    }).catch(() => {});

    await submission.populate(POPULATE);
    res.status(201).json({ submission: present(submission) });
  } catch (err) {
    next(err);
  }
};

/** POST /api/results/requests/bulk — ask a whole set of students at once. */
export const requestResultsBulk = async (req, res, next) => {
  try {
    const { driveId } = req.body;
    const ids = (Array.isArray(req.body.studentIds) ? req.body.studentIds : []).filter(
      (id) => mongoose.isValidObjectId(id),
    );
    if (!mongoose.isValidObjectId(driveId) || !ids.length) {
      return res
        .status(400)
        .json({ message: "A valid driveId and a non-empty studentIds array are required" });
    }

    const scope = studentScope(req.user);
    if (!scope) return res.status(403).json(NO_DEPARTMENT);

    const drive = await Drive.findById(driveId).select("companyName role");
    if (!drive) return res.status(404).json({ message: "Drive not found" });

    const students = await Student.find({ _id: { $in: ids }, ...scope }).populate(
      "userId",
      "name",
    );
    const outOfScope = ids.length - students.length;

    // Skip anyone who already has a live request rather than tripping the
    // unique index and failing the whole batch.
    const live = await ResultSubmission.find({
      driveId,
      studentId: { $in: students.map((s) => s._id) },
      status: { $in: [SUBMISSION_STATUS.REQUESTED, SUBMISSION_STATUS.SUBMITTED] },
    }).distinct("studentId");
    const already = new Set(live.map(String));

    const fresh = students.filter((s) => !already.has(String(s._id)));

    if (fresh.length) {
      await ResultSubmission.insertMany(
        fresh.map((s) => ({
          studentId: s._id,
          driveId,
          department: s.branch,
          status: SUBMISSION_STATUS.REQUESTED,
          source: RESULT_SOURCE.STUDENT,
          requestedBy: req.user._id,
          requestedAt: new Date(),
          requestNote: req.body.note,
        })),
      );

      for (const s of fresh) {
        notify({
          userId: s.userId?._id ?? s.userId,
          type: "placement_update",
          title: `Please submit your ${drive.companyName} results`,
          body:
            `${req.user.name} has asked you to record how you did in the ` +
            `${drive.role} drive at ${drive.companyName}.`,
          link: "/student/placement",
          metadata: { driveId: drive._id },
        }).catch(() => {});
      }
    }

    res.status(201).json({
      requested: fresh.length,
      alreadyPending: already.size,
      outOfScope,
      message:
        `Asked ${fresh.length} student${fresh.length === 1 ? "" : "s"}.` +
        (already.size ? ` ${already.size} already had a pending request.` : "") +
        (outOfScope ? ` ${outOfScope} were outside your department.` : ""),
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// STUDENT: fill in what was asked for
// ─────────────────────────────────────────────────────────────

/** GET /api/results/mine — the student's own requests and their history. */
export const myResultRequests = async (req, res, next) => {
  try {
    const me = await ownStudent(req.user);
    if (!me) return res.status(404).json({ message: "Profile not found" });

    const subs = await ResultSubmission.find({ studentId: me._id })
      .populate(POPULATE)
      .sort({ updatedAt: -1 });

    res.json({
      submissions: subs.map(present),
      pending: subs.filter((s) => s.status === SUBMISSION_STATUS.REQUESTED).length,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/results/mine/:id
 *
 * The student fills in a request. Scoped by ownership: the submission must
 * already exist, belong to them, and still be open.
 */
export const submitMyResults = async (req, res, next) => {
  try {
    const me = await ownStudent(req.user);
    if (!me) return res.status(404).json({ message: "Profile not found" });

    const submission = await ResultSubmission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ message: "No such result request" });
    }
    if (String(submission.studentId) !== String(me._id)) {
      return res
        .status(403)
        .json({ message: "That result request belongs to another student" });
    }
    if (submission.isLocked) {
      return res.status(409).json({
        message:
          submission.status === SUBMISSION_STATUS.FORWARDED
            ? "This has already been forwarded to the placement cell and can no longer be edited."
            : "This request was declined and can no longer be edited.",
      });
    }

    const { stages, error } = readStages(req.body);
    if (error) return res.status(400).json({ message: error });
    if (!Object.keys(stages).length) {
      return res.status(400).json({ message: "Record at least one round result" });
    }

    submission.stages = { ...submission.stages.toObject(), ...stages };
    if (req.body.offer) submission.offer = req.body.offer;
    if (req.body.studentNote !== undefined) submission.studentNote = req.body.studentNote;
    submission.status = SUBMISSION_STATUS.SUBMITTED;
    submission.submittedBy = req.user._id;
    submission.submittedAt = new Date();
    await submission.save();

    // Tell the department's faculty there is something to review.
    const requester = submission.requestedBy;
    if (requester) {
      notify({
        userId: requester,
        type: "placement_update",
        title: `${req.user.name} submitted their results`,
        body: "A student you asked has recorded their round results. Review and forward them.",
        link: "/faculty/results",
        metadata: { submissionId: submission._id },
      }).catch(() => {});
    }

    await submission.populate(POPULATE);
    res.json({ submission: present(submission) });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// FACULTY / OFFICER: review and forward
// ─────────────────────────────────────────────────────────────

/** GET /api/results/submissions[?status=] — department-scoped for faculty. */
export const listSubmissions = async (req, res, next) => {
  try {
    const scope = departmentScope(req.user);
    if (!scope) return res.status(403).json(NO_DEPARTMENT);

    const filter = { ...scope };
    if (req.query.status && Object.values(SUBMISSION_STATUS).includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (req.query.driveId && mongoose.isValidObjectId(req.query.driveId)) {
      filter.driveId = req.query.driveId;
    }

    const subs = await ResultSubmission.find(filter)
      .populate(POPULATE)
      .sort({ updatedAt: -1 })
      .limit(400);

    const counts = subs.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {});

    res.json({
      submissions: subs.map(present),
      total: subs.length,
      counts,
      scope: isFaculty(req.user) ? req.user.department : "all",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/results/submissions
 *
 * Faculty entering results directly, with no student involved. Created
 * already submitted so it can be forwarded in the same breath.
 */
export const createSubmission = async (req, res, next) => {
  try {
    const { studentId, driveId } = req.body;
    if (!mongoose.isValidObjectId(studentId) || !mongoose.isValidObjectId(driveId)) {
      return res.status(400).json({ message: "A valid studentId and driveId are required" });
    }

    const scope = studentScope(req.user);
    if (!scope) return res.status(403).json(NO_DEPARTMENT);

    const student = await Student.findOne({ _id: studentId, ...scope });
    if (!student) {
      return res.status(404).json({
        message: isFaculty(req.user)
          ? `No student with that id in ${req.user.department}`
          : "Student not found",
      });
    }

    const drive = await Drive.findById(driveId).select("_id");
    if (!drive) return res.status(404).json({ message: "Drive not found" });

    const { stages, error } = readStages(req.body);
    if (error) return res.status(400).json({ message: error });
    if (!Object.keys(stages).length) {
      return res.status(400).json({ message: "Record at least one round result" });
    }

    const submission = await ResultSubmission.create({
      studentId,
      driveId,
      department: student.branch,
      status: SUBMISSION_STATUS.SUBMITTED,
      source: isFaculty(req.user) ? RESULT_SOURCE.FACULTY : RESULT_SOURCE.PLACEMENT_CELL,
      stages,
      offer: req.body.offer,
      facultyNote: req.body.facultyNote,
      submittedBy: req.user._id,
      submittedAt: new Date(),
    });

    await submission.populate(POPULATE);
    res.status(201).json({ submission: present(submission) });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/results/submissions/:id/forward
 *
 * Faculty accepts a submission and it becomes official. This is the only
 * place a student-originated result reaches DriveParticipation.
 */
export const forwardSubmission = async (req, res, next) => {
  try {
    const scope = departmentScope(req.user);
    if (!scope) return res.status(403).json(NO_DEPARTMENT);

    const submission = await ResultSubmission.findOne({
      _id: req.params.id,
      ...scope,
    });
    if (!submission) {
      return res.status(404).json({ message: "No such submission in your scope" });
    }
    if (submission.status === SUBMISSION_STATUS.FORWARDED) {
      return res.status(409).json({ message: "This has already been forwarded" });
    }
    if (submission.status === SUBMISSION_STATUS.REQUESTED) {
      return res
        .status(409)
        .json({ message: "The student has not filled this in yet" });
    }

    // Faculty may correct the numbers as they forward.
    if (req.body?.stages) {
      const { stages, error } = readStages(req.body);
      if (error) return res.status(400).json({ message: error });
      if (Object.keys(stages).length) {
        submission.stages = { ...submission.stages.toObject(), ...stages };
      }
    }
    if (req.body?.offer) submission.offer = req.body.offer;
    if (req.body?.facultyNote !== undefined) submission.facultyNote = req.body.facultyNote;

    const { participation, applied, skipped } = await applyStages({
      studentId: submission.studentId,
      driveId: submission.driveId,
      stages: submission.stages.toObject(),
      offer: submission.offer,
      userId: req.user._id,
      source: submission.source,
      note: submission.facultyNote,
    });

    submission.status = SUBMISSION_STATUS.FORWARDED;
    submission.participationId = participation._id;
    submission.reviewedBy = req.user._id;
    submission.reviewedAt = new Date();
    await submission.save();

    const student = await Student.findById(submission.studentId).select("userId");
    if (student?.userId) {
      notify({
        userId: student.userId,
        type: "placement_update",
        title: "Your results were forwarded to the placement cell",
        body: "Your submitted round results are now part of your official placement record.",
        link: "/student/placement",
        metadata: { submissionId: submission._id },
      }).catch(() => {});
    }

    await submission.populate(POPULATE);
    res.json({
      submission: present(submission),
      applied,
      skipped,
      message: skipped.length
        ? `Forwarded. ${applied.length} round(s) recorded, ${skipped.length} skipped.`
        : `Forwarded. ${applied.length} round(s) recorded.`,
    });
  } catch (err) {
    next(err);
  }
};

/** POST /api/results/submissions/:id/reject */
export const rejectSubmission = async (req, res, next) => {
  try {
    const scope = departmentScope(req.user);
    if (!scope) return res.status(403).json(NO_DEPARTMENT);

    const submission = await ResultSubmission.findOne({ _id: req.params.id, ...scope });
    if (!submission) {
      return res.status(404).json({ message: "No such submission in your scope" });
    }
    if (submission.status === SUBMISSION_STATUS.FORWARDED) {
      return res
        .status(409)
        .json({ message: "This has already been forwarded and cannot be declined" });
    }

    submission.status = SUBMISSION_STATUS.REJECTED;
    submission.facultyNote = req.body?.facultyNote ?? submission.facultyNote;
    submission.reviewedBy = req.user._id;
    submission.reviewedAt = new Date();
    await submission.save();

    const student = await Student.findById(submission.studentId).select("userId");
    if (student?.userId) {
      notify({
        userId: student.userId,
        type: "placement_update",
        title: "Your submitted results were not accepted",
        body:
          submission.facultyNote ||
          "Your department contact declined the results you submitted. Speak to them for details.",
        link: "/student/placement",
        metadata: { submissionId: submission._id },
      }).catch(() => {});
    }

    await submission.populate(POPULATE);
    res.json({ submission: present(submission) });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// DIRECT ENTRY AND IMPORT
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/results/apply
 *
 * Straight to the official record, for whoever already has the numbers. The
 * placement officer can do this for anyone; faculty for their department.
 */
export const applyDirect = async (req, res, next) => {
  try {
    const { studentId, driveId } = req.body;
    if (!mongoose.isValidObjectId(studentId) || !mongoose.isValidObjectId(driveId)) {
      return res.status(400).json({ message: "A valid studentId and driveId are required" });
    }

    const scope = studentScope(req.user);
    if (!scope) return res.status(403).json(NO_DEPARTMENT);

    const student = await Student.findOne({ _id: studentId, ...scope });
    if (!student) {
      return res.status(404).json({
        message: isFaculty(req.user)
          ? `No student with that id in ${req.user.department}`
          : "Student not found",
      });
    }

    const { stages, error } = readStages(req.body);
    if (error) return res.status(400).json({ message: error });
    if (!Object.keys(stages).length) {
      return res.status(400).json({ message: "Record at least one round result" });
    }

    const { applied, skipped } = await applyStages({
      studentId,
      driveId,
      stages,
      offer: req.body.offer,
      userId: req.user._id,
      source: isFaculty(req.user) ? RESULT_SOURCE.FACULTY : RESULT_SOURCE.PLACEMENT_CELL,
      note: req.body.note,
    });

    res.json({
      applied,
      skipped,
      message: skipped.length
        ? `${applied.length} round(s) recorded, ${skipped.length} skipped.`
        : `${applied.length} round(s) recorded.`,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Create the students a spreadsheet refers to but CareerCore has never
 * heard of.
 *
 * A placement office's own sheet is usually the master list — it has every
 * student who sat the drive, including ones who never signed up here. Left
 * alone, importing such a file reports "no student with this USN" on every
 * row and achieves nothing, which is exactly the dead end this exists to
 * remove.
 *
 * Each new student gets a User to hang off, because Student.userId is
 * required. That account is created WITHOUT a usable password: a long random
 * value nobody holds. The record exists so results can be attached to it,
 * and the person claims it later by registering — this must never become a
 * back door that silently provisions a working login for someone.
 *
 * @returns {{ created, skipped, byUsn }}
 */
const createMissingStudents = async (missing, actorId) => {
  const created = [];
  const skipped = [];
  const byUsn = new Map();

  for (const m of missing) {
    if (!m.creatable) {
      skipped.push({ usn: m.usn, reason: "No department could be determined" });
      continue;
    }

    // Re-check rather than trusting the parse: another row in the same file,
    // or a concurrent import, may have created this student already.
    const already = await Student.findOne({ usn: m.usn.toUpperCase() });
    if (already) {
      byUsn.set(m.usn.toUpperCase(), already);
      continue;
    }

    // Derived from the USN so re-importing the same sheet finds the same
    // account instead of making a second one.
    const email = `${m.usn.toLowerCase()}@mite.ac.in`;

    try {
      let user = await User.findOne({ email });
      if (!user) {
        user = await User.create({
          name: m.name?.trim() || m.usn,
          email,
          // Random and discarded: the account cannot be signed into until
          // the student registers or an admin sets a password.
          passwordHash: crypto.randomBytes(24).toString("hex"),
          role: ROLES.STUDENT,
          isVerified: true,
        });
      }

      const existingProfile = await Student.findOne({ userId: user._id });
      if (existingProfile) {
        byUsn.set(m.usn.toUpperCase(), existingProfile);
        continue;
      }

      const student = await Student.create({
        userId: user._id,
        usn: m.usn.toUpperCase(),
        branch: m.branch,
        batch: m.batch ?? String(new Date().getFullYear()),
        // Not known from a results sheet. Left at zero rather than guessed —
        // it feeds PRS, and an invented CGPA would quietly corrupt it.
        cgpa: 0,
        backlogs: 0,
      });

      byUsn.set(student.usn, student);
      created.push({
        usn: student.usn,
        name: user.name,
        branch: student.branch,
        batch: student.batch,
      });
    } catch (e) {
      skipped.push({ usn: m.usn, reason: e.message });
    }
  }

  return { created, skipped, byUsn };
};

/**
 * POST /api/results/import?dryRun=true
 *
 * Read a results spreadsheet. With `dryRun` it reports exactly what the file
 * would do and writes nothing, so the uploader can look before committing —
 * these files are hand-kept and a bad one would otherwise rewrite dozens of
 * official records silently.
 */
export const importResults = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No spreadsheet received" });
    }

    const scope = studentScope(req.user);
    if (!scope) return res.status(403).json(NO_DEPARTMENT);

    // A sheet with no company column can still be imported by naming the
    // drive it all belongs to — one tab per company is a common way to keep
    // these files.
    const importOpts = {
      department: isFaculty(req.user) ? req.user.department : undefined,
      driveId: mongoose.isValidObjectId(req.body?.driveId) ? req.body.driveId : undefined,
    };
    const createMissing = String(req.body?.createMissing) === "true";

    let parsed = await parseResultsWorkbook(req.file.buffer, importOpts);

    const dryRun = String(req.query.dryRun) === "true";
    if (dryRun) {
      return res.json({
        dryRun: true,
        ...parsed,
        message:
          `${parsed.rows.length} row(s) ready to apply, ` +
          `${parsed.errors.length} with problems.` +
          (parsed.creatableCount
            ? ` ${parsed.creatableCount} student(s) are not in CareerCore yet.`
            : ""),
      });
    }

    // Create the students the sheet refers to, then read it again so their
    // rows resolve. Re-parsing rather than patching the first result keeps
    // one code path deciding what a row means.
    let createdStudents = [];
    let createSkipped = [];
    if (createMissing && parsed.creatableCount > 0) {
      const outcome = await createMissingStudents(parsed.missing, req.user._id);
      createdStudents = outcome.created;
      createSkipped = outcome.skipped;
      if (createdStudents.length) {
        parsed = await parseResultsWorkbook(req.file.buffer, importOpts);
      }
    }

    const batchId = crypto.randomUUID();
    const results = [];
    for (const row of parsed.rows) {
      try {
        const { applied, skipped } = await applyStages({
          studentId: row.studentId,
          driveId: row.driveId,
          stages: row.stages,
          offer: row.offer,
          userId: req.user._id,
          source: RESULT_SOURCE.IMPORT,
          note: `Imported from ${req.file.originalname}`,
        });
        results.push({ ...row, applied, skipped, ok: true });
      } catch (e) {
        results.push({ ...row, ok: false, reason: e.message });
      }
    }

    const appliedRows = results.filter((r) => r.ok && r.applied.length);
    const skippedRows = results.filter((r) => !r.ok || !r.applied.length);

    res.json({
      dryRun: false,
      detected: parsed.detected,
      batchId,
      filename: req.file.originalname,
      appliedRows: appliedRows.length,
      skippedRows: skippedRows.length,
      createdStudents,
      createSkipped,
      parseErrors: parsed.errors,
      rows: results,
      message:
        (createdStudents.length
          ? `Added ${createdStudents.length} student(s) to CareerCore. `
          : "") +
        `Imported ${appliedRows.length} row(s) from ${req.file.originalname}.` +
        (parsed.errors.length ? ` ${parsed.errors.length} row(s) could not be read.` : "") +
        (skippedRows.length ? ` ${skippedRows.length} row(s) applied nothing.` : ""),
    });
  } catch (err) {
    next(err);
  }
};

/** GET /api/results/template — the blank spreadsheet to fill in. */
export const downloadTemplate = async (req, res, next) => {
  try {
    const wb = await buildImportTemplate();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="careercore-results-template.xlsx"',
    );
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/results/drives
 *
 * The drives a staff member can record results against.
 *
 * Faculty need this to pick which drive they are asking a student about,
 * but /api/placement/drives is deliberately placement-cell-only — it is the
 * officer's management surface, with participant counts and eligibility
 * editing behind it. Exposing a read-only list here gives faculty exactly
 * what the job needs without widening that surface.
 */
export const listDrivesForResults = async (req, res, next) => {
  try {
    if (!isOfficer(req.user) && !isFaculty(req.user)) {
      return res.status(403).json({ message: "Not allowed" });
    }
    if (isFaculty(req.user) && !req.user.department) {
      return res.status(403).json(NO_DEPARTMENT);
    }

    const drives = await Drive.find({})
      .select("companyName role driveDate status stages ctc eligibility")
      .sort("-driveDate")
      .limit(200)
      .lean();

    res.json({
      drives: drives.map((d) => ({
        _id: d._id,
        companyName: d.companyName,
        role: d.role,
        driveDate: d.driveDate,
        status: d.status,
        stages: d.stages,
        ctc: d.ctc,
        eligibility: d.eligibility,
      })),
      total: drives.length,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/results/students
 *
 * The students the signed-in staff member may act on, with their drive
 * participation, for the pickers. Department-scoped for faculty.
 */
export const listScopedStudents = async (req, res, next) => {
  try {
    const scope = studentScope(req.user);
    if (!scope) return res.status(403).json(NO_DEPARTMENT);

    const students = await Student.find(scope)
      .populate("userId", "name email")
      .select("usn batch branch cgpa userId")
      .sort("usn");

    const parts = await DriveParticipation.aggregate([
      { $match: { studentId: { $in: students.map((s) => s._id) } } },
      { $group: { _id: "$studentId", drives: { $sum: 1 } } },
    ]);
    const partMap = new Map(parts.map((p) => [String(p._id), p.drives]));

    res.json({
      students: students.map((s) => ({
        _id: s._id,
        name: s.userId?.name,
        email: s.userId?.email,
        usn: s.usn,
        branch: s.branch,
        batch: s.batch,
        cgpa: s.cgpa,
        drives: partMap.get(String(s._id)) || 0,
      })),
      scope: isFaculty(req.user) ? req.user.department : "all",
      total: students.length,
    });
  } catch (err) {
    next(err);
  }
};
