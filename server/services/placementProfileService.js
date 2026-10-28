import mongoose from "mongoose";
import Student from "../models/Student.js";
import DriveParticipation from "../models/DriveParticipation.js";
// Imported for their side effect of registering the models this function
// populates. Without them, whether `populate("driveId")` works depends on
// some other module having imported Drive first — which is true when the
// placement routes are mounted, and false in a standalone script.
import "../models/Drive.js";
import "../models/User.js";
import "../models/CareerPath.js";
import {
  ATTEMPT_STAGES,
  DRIVE_STAGES,
  STAGE_STATUS,
  FINAL_STATUS,
  PLACEMENT_STATUS,
  DRIVE_STATUS,
} from "../config/constants.js";
import { deriveInsights } from "./placementRuleEngine.js";

/**
 * CareerCore — Central placement calculation
 * ==========================================
 *
 * buildPlacementProfile(studentId) is the single place where placement
 * summary metrics are produced. Every consumer — the student's own journey
 * page, the faculty placement profile, the comparison view, the placement
 * officer's overview — calls this one function, so all four cannot disagree
 * with each other.
 *
 * DESIGN RULE: nothing here is denormalized back onto the Student document.
 * Attempts, pass counts, interviews reached, offers and success rate are all
 * recomputed from `driveparticipations` on read. A stored total is a total
 * that can go stale the moment a placement officer corrects a result; a
 * derived total cannot.
 *
 * COUNTING RULE: `not_reached` is never an attempt. A student eliminated at
 * aptitude has a technical record of `not_reached`, and their technical
 * attempt count stays at zero — they did not fail the technical round, they
 * never sat it.
 *
 * This module does not touch PRS. It reads `currentPRS` to report it
 * alongside the outcomes, which is the entire point of the module: to show
 * where a strong score and a weak outcome diverge.
 */

const round = (n) => Math.round((n ?? 0) * 100) / 100;
const pct = (num, den) => (den > 0 ? round((num / den) * 100) : null);

/** An attempt is any resolved outcome — passed or failed. Never not_reached. */
const isAttempt = (status) =>
  status === STAGE_STATUS.PASSED || status === STAGE_STATUS.FAILED;

/**
 * Tally one pass/fail stage across a set of participations.
 * `attempts` deliberately excludes not_reached (see COUNTING RULE above).
 */
const tallyStage = (participations, stage) => {
  let attempts = 0;
  let passed = 0;
  let failed = 0;
  let notReached = 0;
  const scores = [];

  for (const p of participations) {
    const result = p.stages?.[stage];
    const status = result?.status ?? STAGE_STATUS.NOT_REACHED;

    if (status === STAGE_STATUS.PASSED) {
      attempts++;
      passed++;
    } else if (status === STAGE_STATUS.FAILED) {
      attempts++;
      failed++;
    } else {
      notReached++;
    }

    if (isAttempt(status) && typeof result?.score === "number") {
      scores.push(result.score);
    }
  }

  return {
    stage,
    attempts,
    passed,
    failed,
    notReached,
    // null rather than 0 when there is nothing to divide by — "no data" and
    // "scored zero" must not render identically.
    passRate: attempts > 0 ? round(passed / attempts) : null,
    passPercent: pct(passed, attempts),
    avgScore: scores.length
      ? round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null,
  };
};

/** Sort key: the drive's date if available, else the registration date. */
const participationDate = (p) =>
  p.driveId?.driveDate ? new Date(p.driveId.driveDate) : new Date(p.registeredAt);

/**
 * How far this student got in one drive, as a single readable outcome.
 * Derived from the stage statuses — never stored.
 */
const outcomeOf = (p) => {
  if (p.stages?.final?.status === FINAL_STATUS.SELECTED) return "offer";
  if (p.stages?.final?.status === FINAL_STATUS.REJECTED) return "rejected_final";

  // Walk backwards to find the last stage that actually resolved.
  for (const stage of [...ATTEMPT_STAGES].reverse()) {
    const status = p.stages?.[stage]?.status;
    if (status === STAGE_STATUS.FAILED) return `failed_${stage}`;
    if (status === STAGE_STATUS.PASSED) return `cleared_${stage}`;
  }
  return "not_started";
};

/** The furthest stage this student actually reached in one drive. */
const furthestStage = (p) => {
  let furthest = null;
  for (const stage of ATTEMPT_STAGES) {
    if (isAttempt(p.stages?.[stage]?.status)) furthest = stage;
  }
  if (
    p.stages?.final?.status &&
    p.stages.final.status !== FINAL_STATUS.NOT_REACHED
  ) {
    furthest = "final";
  }
  return furthest;
};

/**
 * buildPlacementProfile(studentId)
 *
 * @param {string|ObjectId} studentId  Student document id (NOT the User id).
 * @param {object}  [options]
 * @param {boolean} [options.includeStudent=true]  Attach basic/academic details.
 * @returns {Promise<object|null>} null when the student does not exist.
 */
export const buildPlacementProfile = async (studentId, options = {}) => {
  const { includeStudent = true } = options;

  if (!mongoose.isValidObjectId(studentId)) return null;

  const student = await Student.findById(studentId)
    .populate("userId", "name email")
    .populate("careerInterest", "name code");

  if (!student) return null;

  const participations = await DriveParticipation.find({ studentId })
    .populate("driveId", "companyName role driveDate ctc location status stages")
    .lean();

  // Drop orphans defensively: a participation whose drive was deleted would
  // otherwise crash every read of this student's profile.
  // A withdrawn registration stays on record but is not a drive taken part in.
  const valid = participations.filter(
    (p) => p.driveId && p.registrationStatus !== "withdrawn",
  );
  valid.sort((a, b) => participationDate(b) - participationDate(a));

  // ── Stage tallies ────────────────────────────────────────────
  const aptitude = tallyStage(valid, "aptitude");
  const technical = tallyStage(valid, "technical");
  const interviewTally = tallyStage(valid, "interview");

  // "Reached" is the inverse of not_reached — a failed interview was still an
  // interview attended.
  const interviewsReached = interviewTally.attempts;

  const offers = valid.filter(
    (p) => p.stages?.final?.status === FINAL_STATUS.SELECTED,
  );
  const finalRejections = valid.filter(
    (p) => p.stages?.final?.status === FINAL_STATUS.REJECTED,
  );

  // A drive counts as "attended" once any stage produced a real outcome.
  // Registering and not turning up is not attendance.
  const attended = valid.filter(
    (p) =>
      ATTEMPT_STAGES.some((s) => isAttempt(p.stages?.[s]?.status)) ||
      (p.stages?.final?.status &&
        p.stages.final.status !== FINAL_STATUS.NOT_REACHED),
  );

  const metrics = {
    drivesRegistered: valid.length,
    drivesAttended: attended.length,

    aptitude: {
      attempts: aptitude.attempts,
      passed: aptitude.passed,
      failed: aptitude.failed,
      notReached: aptitude.notReached,
      passRate: aptitude.passRate,
      passPercent: aptitude.passPercent,
      avgScore: aptitude.avgScore,
    },
    technical: {
      attempts: technical.attempts,
      passed: technical.passed,
      failed: technical.failed,
      notReached: technical.notReached,
      passRate: technical.passRate,
      passPercent: technical.passPercent,
      avgScore: technical.avgScore,
    },
    interview: {
      reached: interviewsReached,
      passed: interviewTally.passed,
      failed: interviewTally.failed,
      notReached: interviewTally.notReached,
      passRate: interviewTally.passRate,
      passPercent: interviewTally.passPercent,
    },

    offers: offers.length,
    finalRejections: finalRejections.length,

    /** Offers per drive actually attended. null when nothing was attended —
     *  0% and "no drives yet" are different statements. */
    successRate: pct(offers.length, attended.length),

    bestOfferCtc: offers.length
      ? Math.max(...offers.map((p) => p.stages.final.offer?.ctc || 0)) || null
      : null,
  };

  // ── Funnel ───────────────────────────────────────────────────
  // Built from the same tallies as the metrics above, so the two views can
  // never contradict each other.
  const funnel = [
    { stage: "Registered", count: metrics.drivesRegistered },
    { stage: "Aptitude attempted", count: aptitude.attempts },
    { stage: "Aptitude cleared", count: aptitude.passed },
    { stage: "Technical attempted", count: technical.attempts },
    { stage: "Technical cleared", count: technical.passed },
    { stage: "Interview reached", count: interviewsReached },
    { stage: "Offers", count: metrics.offers },
  ];

  // ── Company-wise history ─────────────────────────────────────
  const history = valid.map((p) => ({
    participationId: p._id,
    driveId: p.driveId._id,
    company: p.driveId.companyName,
    role: p.driveId.role,
    driveDate: p.driveId.driveDate,
    driveStatus: p.driveId.status,
    ctc: p.driveId.ctc,
    stagesRun: DRIVE_STAGES.filter((s) => (p.driveId.stages || []).includes(s)),
    stages: {
      aptitude: p.stages?.aptitude ?? { status: STAGE_STATUS.NOT_REACHED },
      technical: p.stages?.technical ?? { status: STAGE_STATUS.NOT_REACHED },
      interview: p.stages?.interview ?? { status: STAGE_STATUS.NOT_REACHED },
      final: p.stages?.final ?? { status: FINAL_STATUS.NOT_REACHED },
    },
    furthestStage: furthestStage(p),
    outcome: outcomeOf(p),
    offer:
      p.stages?.final?.status === FINAL_STATUS.SELECTED
        ? p.stages.final.offer
        : null,
    registeredAt: p.registeredAt,
  }));

  // ── Overall standing ─────────────────────────────────────────
  let placementStatus = PLACEMENT_STATUS.NO_HISTORY;
  if (metrics.offers > 0) {
    placementStatus = PLACEMENT_STATUS.PLACED;
  } else if (
    valid.some(
      (p) =>
        p.driveId.status === DRIVE_STATUS.PLANNED ||
        p.driveId.status === DRIVE_STATUS.ONGOING,
    )
  ) {
    placementStatus = PLACEMENT_STATUS.IN_PROCESS;
  } else if (metrics.drivesAttended > 0) {
    placementStatus = PLACEMENT_STATUS.UNPLACED;
  }

  // ── Rule engine ──────────────────────────────────────────────
  // Insights come from the tallies above and nothing else. The engine
  // decides for itself whether there is enough evidence to say anything.
  const insights = deriveInsights(metrics, {
    prs: student.currentPRS,
    readinessLevel: student.readinessLevel,
    cgpa: student.cgpa,
  });

  const profile = {
    studentId: student._id,
    metrics,
    funnel,
    history,
    placementStatus,
    insights,
    computedAt: new Date(),
  };

  if (includeStudent) {
    profile.student = {
      _id: student._id,
      name: student.userId?.name,
      email: student.userId?.email,
      usn: student.usn,
      batch: student.batch,
      branch: student.branch,
      phone: student.phone,
      cgpa: student.cgpa,
      backlogs: student.backlogs,
      prs: student.currentPRS,
      prsBreakdown: student.prsBreakdown,
      readinessLevel: student.readinessLevel,
      careerInterest: student.careerInterest,
      profileCompleteness: student.profileCompleteness,
      skills: student.skills,
      projects: student.projects,
      certifications: student.certifications,
    };
  }

  return profile;
};

/**
 * Batch variant for the faculty comparison view. Runs the same single
 * calculation per student rather than a parallel implementation, so a
 * comparison can never disagree with the individual profiles it compares.
 */
export const buildPlacementProfiles = async (studentIds, options = {}) => {
  const results = await Promise.all(
    studentIds.map((id) => buildPlacementProfile(id, options)),
  );
  return results.filter(Boolean);
};

/**
 * Cohort roll-up for the placement officer overview and the faculty stats
 * strip. Aggregated in MongoDB rather than by building every profile,
 * because this runs across a whole batch.
 */
export const buildCohortSummary = async (studentFilter = {}) => {
  const students = await Student.find(studentFilter).select("_id");
  const ids = students.map((s) => s._id);

  const attemptStatuses = [STAGE_STATUS.PASSED, STAGE_STATUS.FAILED];

  const rows = await DriveParticipation.aggregate([
    { $match: { studentId: { $in: ids }, registrationStatus: { $ne: "withdrawn" } } },
    {
      $group: {
        _id: "$studentId",
        registered: { $sum: 1 },
        aptitudeAttempts: {
          $sum: { $cond: [{ $in: ["$stages.aptitude.status", attemptStatuses] }, 1, 0] },
        },
        aptitudePassed: {
          $sum: { $cond: [{ $eq: ["$stages.aptitude.status", STAGE_STATUS.PASSED] }, 1, 0] },
        },
        technicalAttempts: {
          $sum: { $cond: [{ $in: ["$stages.technical.status", attemptStatuses] }, 1, 0] },
        },
        technicalPassed: {
          $sum: { $cond: [{ $eq: ["$stages.technical.status", STAGE_STATUS.PASSED] }, 1, 0] },
        },
        interviewsReached: {
          $sum: { $cond: [{ $in: ["$stages.interview.status", attemptStatuses] }, 1, 0] },
        },
        offers: {
          $sum: { $cond: [{ $eq: ["$stages.final.status", FINAL_STATUS.SELECTED] }, 1, 0] },
        },
      },
    },
  ]);

  const totals = rows.reduce(
    (acc, r) => {
      acc.registrations += r.registered;
      acc.aptitudeAttempts += r.aptitudeAttempts;
      acc.aptitudePassed += r.aptitudePassed;
      acc.technicalAttempts += r.technicalAttempts;
      acc.technicalPassed += r.technicalPassed;
      acc.interviewsReached += r.interviewsReached;
      acc.offers += r.offers;
      if (r.offers > 0) acc.studentsPlaced += 1;
      return acc;
    },
    {
      registrations: 0,
      aptitudeAttempts: 0,
      aptitudePassed: 0,
      technicalAttempts: 0,
      technicalPassed: 0,
      interviewsReached: 0,
      offers: 0,
      studentsPlaced: 0,
    },
  );

  return {
    studentsTracked: students.length,
    studentsWithHistory: rows.length,
    ...totals,
    placementPercent: pct(totals.studentsPlaced, students.length),
    aptitudePassPercent: pct(totals.aptitudePassed, totals.aptitudeAttempts),
    technicalPassPercent: pct(totals.technicalPassed, totals.technicalAttempts),
    funnel: [
      { stage: "Registrations", count: totals.registrations },
      { stage: "Aptitude attempted", count: totals.aptitudeAttempts },
      { stage: "Aptitude cleared", count: totals.aptitudePassed },
      { stage: "Technical attempted", count: totals.technicalAttempts },
      { stage: "Technical cleared", count: totals.technicalPassed },
      { stage: "Interview reached", count: totals.interviewsReached },
      { stage: "Offers", count: totals.offers },
    ],
  };
};
