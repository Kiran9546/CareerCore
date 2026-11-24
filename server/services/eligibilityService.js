import Student from "../models/Student.js";
import DriveCandidate from "../models/DriveCandidate.js";
import DriveParticipation from "../models/DriveParticipation.js";
import "../models/User.js";
import {
  DEPARTMENTS,
  ROUND_TYPE_LABEL,
  REGISTRATION_STATUS,
  MANAGED_DRIVE_STATUS,
} from "../config/constants.js";
import { audit, httpError } from "./auditService.js";
import { notifyOnceMany, dedupeKeyFilter } from "./notificationService.js";
import Notification from "../models/Notification.js";
import { queueDriveOpportunityDeliveries } from "./notificationDeliveryService.js";

/**
 * CareerCore — Drive eligibility
 * ==============================
 *
 * Every criterion is one entry in CRITERIA. Adding a criterion later (a 10th
 * percentage, an education gap) means adding a field to the Student record
 * and one entry here; the calculation, the reasons shown to the officer, the
 * notification text and the registration check all pick it up.
 *
 * Only trusted academic data is evaluated — the fields the placement cell
 * and the cohort import maintain on Student. The 10th/12th percentages on
 * the Resume are typed by the student themselves, so they are deliberately
 * not used to decide eligibility.
 *
 * A missing or invalid value never passes silently: the student is marked
 * ineligible with a "missing from the academic record" reason, and
 * `missingData` lets the officer find and fix those records.
 */

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

const CRITERIA = [
  {
    key: "minCgpa",
    active: (e) => isNum(e.minCgpa) && e.minCgpa > 0,
    describe: (e) => `CGPA ≥ ${e.minCgpa}`,
    check: (s, e) => {
      if (!isNum(s.cgpa) || s.cgpa < 0 || s.cgpa > 10) return { missing: "CGPA is missing or invalid in the academic record" };
      if (s.cgpa < e.minCgpa) return { fail: `CGPA ${s.cgpa} is below ${e.minCgpa}` };
      return null;
    },
  },
  {
    key: "maxBacklogs",
    // Always applied: the long-standing default is "no backlogs".
    active: (e) => isNum(e.maxBacklogs),
    describe: (e) => (e.maxBacklogs === 0 ? "No backlogs" : `Backlogs ≤ ${e.maxBacklogs}`),
    check: (s, e) => {
      if (!isNum(s.backlogs) || s.backlogs < 0) return { missing: "Backlog count is missing or invalid in the academic record" };
      if (s.backlogs > e.maxBacklogs) return { fail: `${s.backlogs} backlog(s), maximum allowed is ${e.maxBacklogs}` };
      return null;
    },
  },
  {
    key: "branches",
    active: (e) => e.branches?.length > 0,
    describe: (e) => `Branches: ${e.branches.join(" / ")}`,
    check: (s, e) => {
      if (!s.branch) return { missing: "Branch is missing from the academic record" };
      if (!e.branches.includes(s.branch)) return { fail: `Branch ${s.branch} is not eligible` };
      return null;
    },
  },
  {
    key: "batches",
    active: (e) => e.batches?.length > 0,
    describe: (e) => `Graduation year: ${e.batches.join(" / ")}`,
    check: (s, e) => {
      if (!s.batch) return { missing: "Graduation year is missing from the academic record" };
      if (!e.batches.includes(String(s.batch))) return { fail: `Graduation year ${s.batch} is not eligible` };
      return null;
    },
  },
];

/** Plain-language lines for the criteria in force ("CGPA ≥ 7.5", ...). */
export const describeEligibility = (eligibility = {}) =>
  CRITERIA.filter((c) => c.active(eligibility)).map((c) => c.describe(eligibility));

/** Evaluate one student's academic record against a drive's criteria. */
export const evaluateStudent = (student, eligibility = {}) => {
  const reasons = [];
  let missingData = false;
  for (const c of CRITERIA) {
    if (!c.active(eligibility)) continue;
    const r = c.check(student, eligibility);
    if (r?.missing) {
      missingData = true;
      reasons.push(r.missing);
    } else if (r?.fail) {
      reasons.push(r.fail);
    }
  }
  return { eligible: reasons.length === 0, reasons, missingData };
};

/**
 * Validate and normalise criteria sent by the client. Throws a 400 with a
 * specific message for each kind of bad input the requirements name.
 */
export const parseEligibilityInput = (body = {}) => {
  const minCgpa = body.minCgpa === undefined || body.minCgpa === "" ? 0 : Number(body.minCgpa);
  if (!Number.isFinite(minCgpa) || minCgpa < 0 || minCgpa > 10) {
    throw httpError(400, "Invalid CGPA: minimum CGPA must be a number between 0 and 10");
  }
  const maxBacklogs =
    body.maxBacklogs === undefined || body.maxBacklogs === "" ? 0 : Number(body.maxBacklogs);
  if (!Number.isInteger(maxBacklogs) || maxBacklogs < 0 || maxBacklogs > 50) {
    throw httpError(400, "Invalid backlog value: maximum backlogs must be a whole number of 0 or more");
  }
  const branches = [...new Set((Array.isArray(body.branches) ? body.branches : []).map((b) => String(b).toUpperCase()))];
  if (!branches.length) throw httpError(400, "No branch selected. Choose at least one eligible branch.");
  const unknown = branches.filter((b) => !DEPARTMENTS.includes(b));
  if (unknown.length) throw httpError(400, `Unknown branch: ${unknown.join(", ")}`);

  const batches = [...new Set((Array.isArray(body.batches) ? body.batches : []).map((b) => String(b).trim()).filter(Boolean))];
  if (batches.some((b) => !/^\d{4}$/.test(b))) {
    throw httpError(400, "Graduation years must be four-digit years");
  }
  return { minCgpa, maxBacklogs, branches, batches };
};

const CHUNK = 1000;

/**
 * Calculate eligibility for every student against a managed drive's current
 * criteria and persist the result on `drivecandidates`.
 *
 * Safe to run any number of times. Registrations and round results are never
 * touched: a registered student who stops meeting the criteria keeps their
 * registration and history and is flagged instead (see DriveParticipation
 * .eligibilityFlag). Notification and view timestamps survive recalculation.
 */
export const calculateEligibility = async (drive, actor, { notify = true } = {}) => {
  const now = new Date();
  const eligibility = drive.eligibility?.toObject?.() ?? drive.eligibility ?? {};

  const students = await Student.find({})
    .select("userId usn branch batch cgpa backlogs")
    .populate("userId", "name")
    .lean();

  let eligibleCount = 0;
  let missingCount = 0;
  const verdicts = new Map();
  const ops = [];

  for (const s of students) {
    const v = evaluateStudent(s, eligibility);
    verdicts.set(String(s._id), v);
    if (v.eligible) eligibleCount++;
    if (v.missingData) missingCount++;
    ops.push({
      updateOne: {
        filter: { driveId: drive._id, studentId: s._id },
        update: {
          $set: {
            userId: s.userId?._id,
            eligible: v.eligible,
            reasons: v.reasons,
            missingData: v.missingData,
            academic: {
              name: s.userId?.name,
              usn: s.usn,
              branch: s.branch,
              batch: s.batch,
              cgpa: s.cgpa,
              backlogs: s.backlogs,
            },
            criteriaVersion: eligibility.version ?? 1,
            evaluatedAt: now,
          },
        },
        upsert: true,
      },
    });
  }

  for (let i = 0; i < ops.length; i += CHUNK) {
    await DriveCandidate.bulkWrite(ops.slice(i, i + CHUNK), { ordered: false });
  }
  // Rows for students who no longer exist are derived data with nobody
  // behind them; they would otherwise inflate every count.
  await DriveCandidate.deleteMany({
    driveId: drive._id,
    studentId: { $nin: students.map((s) => s._id) },
  });

  // Registered students whose standing changed: flag, never unregister.
  const registrations = await DriveParticipation.find({
    driveId: drive._id,
    registrationStatus: REGISTRATION_STATUS.REGISTERED,
  }).select("studentId eligibilityFlag");

  let newlyFlagged = 0;
  const flagOps = [];
  for (const p of registrations) {
    const v = verdicts.get(String(p.studentId));
    if (!v) continue;
    const flagged = Boolean(p.eligibilityFlag?.ineligibleSince);
    if (!v.eligible && !flagged) {
      newlyFlagged++;
      flagOps.push({
        updateOne: {
          filter: { _id: p._id },
          update: { $set: { "eligibilityFlag.ineligibleSince": now, "eligibilityFlag.reasons": v.reasons } },
        },
      });
    } else if (v.eligible && flagged) {
      flagOps.push({
        updateOne: {
          filter: { _id: p._id },
          update: { $unset: { "eligibilityFlag.ineligibleSince": "", "eligibilityFlag.reasons": "" } },
        },
      });
    }
  }
  if (flagOps.length) await DriveParticipation.bulkWrite(flagOps, { ordered: false });

  drive.eligibility.calculatedVersion = eligibility.version ?? 1;
  drive.eligibility.calculatedAt = now;
  await drive.save();

  const summary = {
    total: students.length,
    eligible: eligibleCount,
    ineligible: students.length - eligibleCount,
    missingData: missingCount,
    newlyFlagged,
  };

  await audit(actor, "eligibility.calculated", { drive, to: summary });

  // Newly eligible students hear about an open drive straight away; anyone
  // already told is skipped by the dedupe key.
  if (notify && drive.status === MANAGED_DRIVE_STATUS.OPEN) {
    summary.notified = await notifyEligibleStudents(drive);
  }

  return summary;
};

const formatDay = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "–";

const formatDateTime = (d) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit",
      })
    : "–";

/** The notification text for a new opportunity. */
export const opportunityMessage = (drive) => {
  const criteria = describeEligibility(drive.eligibility);
  const rounds = drive.orderedRounds?.() ?? [];
  const lines = [
    `You are eligible for the ${drive.role} placement drive.`,
    criteria.join(" · "),
    `Drive date: ${formatDay(drive.driveDate)}`,
    `Register by: ${formatDateTime(drive.registrationDeadline)}`,
  ];
  if (rounds.length) lines.push(`Process: ${rounds.map((r) => ROUND_TYPE_LABEL[r.type]).join(" → ")}`);
  return {
    title: `${drive.companyName}: Placement Opportunity`,
    body: lines.join("\n"),
  };
};

/**
 * Notify every eligible, not-yet-notified student of an open managed drive.
 * Idempotent: the dedupe key is per drive and student.
 *
 * Runs on publish and whenever a recalculation makes more students eligible
 * on an open drive. In order:
 *   1. the in-app notification (the bell and the website notification
 *      centre both read this one record), created here, in the request;
 *   2. the email and WhatsApp copies, queued as delivery rows and sent by
 *      the background worker, so the request never waits on SMTP or Meta;
 *   3. the candidates are marked notified.
 * A crash between steps leaves notifiedAt unset, so the next publish or
 * recalculation repeats them — and every step skips what already exists.
 *
 * Policy for a drive reopened after closing registration: students already
 * notified are never notified again on any channel; only students who have
 * become eligible since are.
 */
export const notifyEligibleStudents = async (drive) => {
  const candidates = await DriveCandidate.find({
    driveId: drive._id,
    eligible: true,
    notifiedAt: { $exists: false },
    userId: { $exists: true },
  })
    .select("_id userId studentId")
    .lean();

  if (!candidates.length) return 0;

  const { title, body } = opportunityMessage(drive);
  const keyOf = (c) => `drive:${drive._id}:eligible:${c.studentId}`;

  const { ids } = await notifyOnceMany(
    candidates.map((c) => ({
      dedupeKey: keyOf(c),
      userId: c.userId,
      type: "drive_opportunity",
      title,
      body,
      link: `/student/drives/${drive._id}`,
      // Structured copy of the drive details, so the notification centre
      // can show company, role and deadline without parsing the body.
      metadata: {
        driveId: drive._id,
        kind: "opportunity",
        companyName: drive.companyName,
        role: drive.role,
        registrationDeadline: drive.registrationDeadline,
        driveDate: drive.driveDate,
        ctc: drive.ctc,
        location: drive.location,
      },
    })),
  );

  // Notification ids for every candidate, including those whose key already
  // existed (an earlier, interrupted run), so each delivery row links to it.
  const keys = candidates.map(keyOf);
  const existing = await Notification.find(dedupeKeyFilter(keys)).select("_id dedupeKey").lean();
  const notificationIdOf = new Map(existing.map((n) => [n.dedupeKey, n._id]));

  await queueDriveOpportunityDeliveries(
    drive,
    candidates.map((c) => ({ studentId: c.studentId, userId: c.userId, notificationId: notificationIdOf.get(keyOf(c)) })),
  );

  // Every candidate here is now notified — either by this call or, if the
  // key already existed, by an earlier one.
  const now = new Date();
  await DriveCandidate.bulkWrite(
    candidates.map((c) => ({
      updateOne: {
        filter: { _id: c._id, notifiedAt: { $exists: false } },
        update: { $set: { notifiedAt: now, ...(ids.get(keyOf(c)) ? { notificationId: ids.get(keyOf(c)) } : {}) } },
      },
    })),
    { ordered: false },
  );

  return ids.size;
};
