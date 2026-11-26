import mongoose from "mongoose";
import Drive from "../models/Drive.js";
import DriveParticipation from "../models/DriveParticipation.js";
import DriveCandidate from "../models/DriveCandidate.js";
import RoundResult from "../models/RoundResult.js";
import Student from "../models/Student.js";
import Company from "../models/Company.js";
import {
  ACTIVE_DRIVE_STATUSES,
  ATTENDANCE,
  DRIVE_WORKFLOW,
  FINAL_STATUS,
  MANAGED_DRIVE_STATUS,
  REGISTRATION_STATUS,
  ROUND_RESULT,
  ROUND_STATUS,
  ROUND_TYPE_LABEL,
  STAGE_STATUS,
  ATTEMPT_STAGES,
  STUDENT_PLACEMENT_STATE,
} from "../config/constants.js";
import { describeEligibility } from "./eligibilityService.js";
import { pageParams, roundCounts } from "./roundService.js";
import { httpError } from "./auditService.js";
import { escapeRegex } from "../utils/escapeRegex.js";

/**
 * CareerCore — Recruitment statistics
 * ===================================
 *
 * Every number here is counted from persisted records on request; nothing is
 * stored. Drive counts are UNIQUE STUDENTS within that drive (one candidate,
 * one participation and at most one round entry per student per drive, by
 * unique index). Overall counts are unique students across drives — a student
 * selected by two companies is one placed student and two offers.
 */

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

// ─────────────────────────────────────────────────────────────
// DRIVE DASHBOARD
// ─────────────────────────────────────────────────────────────

export const driveDashboard = async (drive) => {
  const driveId = drive._id;
  const [cand, regs, flagged, selections] = await Promise.all([
    DriveCandidate.aggregate([
      { $match: { driveId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          eligible: { $sum: { $cond: ["$eligible", 1, 0] } },
          missingData: { $sum: { $cond: ["$missingData", 1, 0] } },
          notified: { $sum: { $cond: [{ $ifNull: ["$notifiedAt", false] }, 1, 0] } },
          viewed: { $sum: { $cond: [{ $ifNull: ["$viewedAt", false] }, 1, 0] } },
        },
      },
    ]),
    DriveParticipation.aggregate([
      { $match: { driveId } },
      { $group: { _id: "$registrationStatus", n: { $sum: 1 } } },
    ]),
    DriveParticipation.countDocuments({
      driveId,
      registrationStatus: REGISTRATION_STATUS.REGISTERED,
      "eligibilityFlag.ineligibleSince": { $exists: true },
      "eligibilityFlag.overriddenAt": { $exists: false },
    }),
    DriveParticipation.aggregate([
      { $match: { driveId, "stages.final.status": FINAL_STATUS.SELECTED } },
      {
        $group: {
          _id: null,
          selected: { $sum: 1 },
          accepted: { $sum: { $cond: [{ $eq: ["$stages.final.offer.status", "accepted"] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const c = cand[0] || { total: 0, eligible: 0, missingData: 0, notified: 0, viewed: 0 };
  const regMap = Object.fromEntries(regs.map((r) => [r._id ?? REGISTRATION_STATUS.REGISTERED, r.n]));
  const registered = regMap[REGISTRATION_STATUS.REGISTERED] || 0;
  const withdrawn = regMap[REGISTRATION_STATUS.WITHDRAWN] || 0;

  const rounds = [];
  for (const [i, r] of drive.orderedRounds().entries()) {
    rounds.push({
      _id: r._id,
      type: r.type,
      name: ROUND_TYPE_LABEL[r.type],
      order: i + 1,
      status: r.status,
      schedule: r.schedule,
      started: Boolean(r.participantsSeededAt),
      finalizedAt: r.finalizedAt,
      reopenCount: r.reopenCount,
      counts: r.participantsSeededAt ? await roundCounts(r._id) : null,
    });
  }

  return {
    definitions: {
      unit: "Unique students within this drive",
      totalStudents: "Students evaluated in the latest eligibility calculation",
    },
    criteria: describeEligibility(drive.eligibility),
    eligibilityStale:
      drive.eligibility?.calculatedVersion !== undefined &&
      drive.eligibility.calculatedVersion !== drive.eligibility.version,
    stats: {
      totalStudents: c.total,
      eligible: c.eligible,
      ineligible: c.total - c.eligible,
      missingData: c.missingData,
      notified: c.notified,
      viewed: c.viewed,
      registered,
      withdrawn,
      notRegistered: Math.max(c.eligible - registered - withdrawn, 0),
      flaggedIneligible: flagged,
      finalSelected: selections[0]?.selected || 0,
      offersAccepted: selections[0]?.accepted || 0,
    },
    rounds,
  };
};

// ─────────────────────────────────────────────────────────────
// DRIVE STUDENT LIST (what every clickable statistic opens)
// ─────────────────────────────────────────────────────────────

const CANDIDATE_VIEWS = new Set(["all", "eligible", "ineligible", "missing", "notified", "viewed", "not_registered", "registered", "withdrawn", "flagged"]);

/**
 * Paginated, filtered student list for one drive.
 *   view: all | eligible | ineligible | missing | notified | viewed |
 *         not_registered | registered | withdrawn | flagged | selected
 *   q (name/USN), branch, minCgpa, maxBacklogs, page, limit
 */
export const listDriveStudents = async (drive, query = {}) => {
  const view = query.view || "eligible";
  const { limit, page, skip } = pageParams(query);

  if (view === "selected") return listSelections(drive, { ...query, page, limit, skip });
  if (!CANDIDATE_VIEWS.has(view)) throw httpError(400, `Unknown list: ${view}`);

  const match = { driveId: drive._id };
  if (query.q) {
    const rx = new RegExp(escapeRegex(String(query.q).trim()), "i");
    match.$or = [{ "academic.name": rx }, { "academic.usn": rx }];
  }
  if (query.branch) match["academic.branch"] = String(query.branch);
  if (query.minCgpa !== undefined && query.minCgpa !== "") match["academic.cgpa"] = { $gte: Number(query.minCgpa) };
  if (query.maxBacklogs !== undefined && query.maxBacklogs !== "") match["academic.backlogs"] = { $lte: Number(query.maxBacklogs) };
  if (view === "eligible" || view === "not_registered") match.eligible = true;
  if (view === "ineligible") match.eligible = false;
  if (view === "missing") match.missingData = true;
  if (view === "notified") match.notifiedAt = { $exists: true };
  if (view === "viewed") match.viewedAt = { $exists: true };

  const after = {};
  if (view === "registered") after["reg.registrationStatus"] = REGISTRATION_STATUS.REGISTERED;
  if (view === "withdrawn") after["reg.registrationStatus"] = REGISTRATION_STATUS.WITHDRAWN;
  if (view === "not_registered") after.reg = null;
  if (view === "flagged") {
    after["reg.registrationStatus"] = REGISTRATION_STATUS.REGISTERED;
    after["reg.eligibilityFlag.ineligibleSince"] = { $exists: true };
  }
  if (query.registration === "registered") after["reg.registrationStatus"] = REGISTRATION_STATUS.REGISTERED;
  if (query.registration === "withdrawn") after["reg.registrationStatus"] = REGISTRATION_STATUS.WITHDRAWN;
  if (query.registration === "not_registered") after.reg = null;

  const [out] = await DriveCandidate.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "driveparticipations",
        let: { s: "$studentId" },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ["$driveId", drive._id] }, { $eq: ["$studentId", "$$s"] }] } } },
          { $project: { registrationStatus: { $ifNull: ["$registrationStatus", "registered"] }, registeredAt: 1, withdrawnAt: 1, eligibilityFlag: 1, "stages.final.status": 1 } },
        ],
        as: "reg",
      },
    },
    { $set: { reg: { $ifNull: [{ $first: "$reg" }, null] } } },
    ...(Object.keys(after).length ? [{ $match: after }] : []),
    { $sort: { "academic.usn": 1 } },
    {
      $facet: {
        rows: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: "n" }],
      },
    },
  ]);

  return {
    view,
    students: (out?.rows || []).map((r) => ({
      studentId: r.studentId,
      name: r.academic?.name,
      usn: r.academic?.usn,
      branch: r.academic?.branch,
      batch: r.academic?.batch,
      cgpa: r.academic?.cgpa,
      backlogs: r.academic?.backlogs,
      eligible: r.eligible,
      reasons: r.reasons,
      missingData: r.missingData,
      notifiedAt: r.notifiedAt,
      viewedAt: r.viewedAt,
      registration: r.reg
        ? {
            participationId: r.reg._id,
            status: r.reg.registrationStatus,
            registeredAt: r.reg.registeredAt,
            withdrawnAt: r.reg.withdrawnAt,
            flaggedIneligible: Boolean(r.reg.eligibilityFlag?.ineligibleSince),
            overridden: Boolean(r.reg.eligibilityFlag?.overriddenAt),
            finalStatus: r.reg.stages?.final?.status,
          }
        : null,
    })),
    total: out?.total?.[0]?.n || 0,
    page,
    limit,
  };
};

/** Final selections of a drive with offer details. */
export const listSelections = async (drive, { q, branch, page = 1, limit = 50, skip = 0 } = {}) => {
  const rows = await DriveParticipation.find({ driveId: drive._id, "stages.final.status": FINAL_STATUS.SELECTED })
    .populate({ path: "studentId", select: "usn branch batch cgpa backlogs userId", populate: { path: "userId", select: "name" } })
    .lean();
  let list = rows
    .filter((p) => p.studentId)
    .map((p) => ({
      participationId: p._id,
      studentId: p.studentId._id,
      name: p.studentId.userId?.name,
      usn: p.studentId.usn,
      branch: p.studentId.branch,
      batch: p.studentId.batch,
      cgpa: p.studentId.cgpa,
      backlogs: p.studentId.backlogs,
      finalStatus: p.stages.final.status,
      offer: p.stages.final.offer || {},
      selectedAt: p.stages.final.updatedAt,
    }));
  if (q) {
    const rx = new RegExp(escapeRegex(String(q).trim()), "i");
    list = list.filter((s) => rx.test(s.name || "") || rx.test(s.usn || ""));
  }
  if (branch) list = list.filter((s) => s.branch === branch);
  list.sort((a, b) => String(a.usn).localeCompare(String(b.usn)));
  return {
    view: "selected",
    drive: { _id: drive._id, companyName: drive.companyName, role: drive.role },
    students: list.slice(skip, skip + limit),
    total: list.length,
    page,
    limit,
  };
};

// ─────────────────────────────────────────────────────────────
// OVERALL PLACEMENT DASHBOARD
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/placement/statistics?batch=&branch=&companyId=&from=&to=
 *
 * Population: students matching batch (graduation year — the reporting
 * period) and branch. Placed: unique students in that population holding at
 * least one final selection in a non-cancelled drive inside the drive filter.
 */
export const overallStatistics = async (query = {}) => {
  const studentFilter = {};
  if (query.batch) studentFilter.batch = String(query.batch);
  if (query.branch) studentFilter.branch = String(query.branch);

  const driveFilter = { status: { $nin: [MANAGED_DRIVE_STATUS.CANCELLED, MANAGED_DRIVE_STATUS.DRAFT] } };
  if (query.companyId && mongoose.isValidObjectId(query.companyId)) driveFilter.companyId = oid(query.companyId);
  if (query.from || query.to) {
    driveFilter.driveDate = {};
    if (query.from) driveFilter.driveDate.$gte = new Date(query.from);
    if (query.to) driveFilter.driveDate.$lte = new Date(query.to);
  }

  const [students, drives] = await Promise.all([
    Student.find(studentFilter).select("_id branch").lean(),
    Drive.find(driveFilter).select("_id companyId companyName role status workflow ctc driveDate registrationDeadline rounds").lean(),
  ]);
  const branchOf = new Map(students.map((s) => [String(s._id), s.branch]));
  const driveIds = drives.map((d) => d._id);
  const driveById = new Map(drives.map((d) => [String(d._id), d]));

  const participations = await DriveParticipation.find({
    driveId: { $in: driveIds },
    studentId: { $in: students.map((s) => s._id) },
    registrationStatus: { $ne: REGISTRATION_STATUS.WITHDRAWN },
  })
    .select("driveId studentId stages registrationStatus")
    .lean();

  // ── Selections & offers ──
  const placed = new Set();
  const offers = [];
  const companyStats = new Map();
  for (const p of participations) {
    const d = driveById.get(String(p.driveId));
    const key = d.companyId ? String(d.companyId) : d.companyName.toLowerCase();
    if (!companyStats.has(key)) {
      companyStats.set(key, { company: d.companyName, companyId: d.companyId, drives: new Set(), selections: 0, highestCtc: null });
    }
    const cs = companyStats.get(key);
    cs.drives.add(String(d._id));
    if (p.stages?.final?.status === FINAL_STATUS.SELECTED) {
      placed.add(String(p.studentId));
      const ctc = p.stages.final.offer?.ctc ?? d.ctc;
      offers.push({ ctc, status: p.stages.final.offer?.status, accepted: p.stages.final.offer?.accepted });
      cs.selections++;
      if (typeof ctc === "number") cs.highestCtc = Math.max(cs.highestCtc ?? 0, ctc);
    }
  }
  // Companies that visited even if nobody from this population registered.
  for (const d of drives) {
    const key = d.companyId ? String(d.companyId) : d.companyName.toLowerCase();
    if (!companyStats.has(key)) companyStats.set(key, { company: d.companyName, companyId: d.companyId, drives: new Set(), selections: 0, highestCtc: null });
    companyStats.get(key).drives.add(String(d._id));
  }

  // ── Currently in recruitment ──
  const inProcess = await studentsInProcess(drives, participations);

  // ── Branch-wise ──
  const branches = new Map();
  for (const s of students) {
    if (!branches.has(s.branch)) branches.set(s.branch, { branch: s.branch, total: 0, placed: 0 });
    branches.get(s.branch).total++;
  }
  for (const sid of placed) {
    const b = branches.get(branchOf.get(sid));
    if (b) b.placed++;
  }

  const ctcs = offers.map((o) => o.ctc).filter((n) => typeof n === "number").sort((a, b) => a - b);
  const median = ctcs.length ? (ctcs.length % 2 ? ctcs[(ctcs.length - 1) / 2] : (ctcs[ctcs.length / 2 - 1] + ctcs[ctcs.length / 2]) / 2) : null;

  return {
    filters: { batch: query.batch || null, branch: query.branch || null, companyId: query.companyId || null, from: query.from || null, to: query.to || null },
    definitions: {
      population: "Students matching the batch (graduation year) and branch filters",
      placed: "Unique students with at least one final selection; a student with two offers counts once",
      placementPercentage: "Placed students ÷ total students in the population",
      companiesVisited: "Distinct companies with a published, non-cancelled drive in the filter",
      inRecruitment: "Unique students registered in an active drive and not yet eliminated or finished",
    },
    totals: {
      totalStudents: students.length,
      placedStudents: placed.size,
      placementPercentage: pct(placed.size, students.length),
      companiesVisited: companyStats.size,
      totalDrives: drives.length,
      activeDrives: drives.filter((d) => ACTIVE_DRIVE_STATUSES.includes(d.status)).length,
      studentsInRecruitment: inProcess.size,
      finalSelections: offers.length,
    },
    offers: {
      total: offers.length,
      accepted: offers.filter((o) => o.status === "accepted" || o.accepted).length,
      averageCtc: ctcs.length ? Math.round((ctcs.reduce((a, b) => a + b, 0) / ctcs.length) * 100) / 100 : null,
      medianCtc: median,
      highestCtc: ctcs.length ? ctcs[ctcs.length - 1] : null,
    },
    branchWise: [...branches.values()]
      .map((b) => ({ ...b, percentage: pct(b.placed, b.total) }))
      .sort((a, b) => String(a.branch).localeCompare(String(b.branch))),
    companyWise: [...companyStats.values()]
      .map((c) => ({ company: c.company, companyId: c.companyId, drives: c.drives.size, selections: c.selections, highestCtc: c.highestCtc }))
      .sort((a, b) => b.selections - a.selections || a.company.localeCompare(b.company)),
    activeDrives: drives
      .filter((d) => ACTIVE_DRIVE_STATUSES.includes(d.status))
      .map((d) => ({
        _id: d._id,
        companyName: d.companyName,
        role: d.role,
        status: d.status,
        driveDate: d.driveDate,
        workflow: d.workflow || DRIVE_WORKFLOW.RECORDED,
        // For the Overview list; absent on drives that never recorded them.
        ctc: typeof d.ctc === "number" ? d.ctc : null,
        registrationDeadline: d.registrationDeadline || null,
      })),
  };
};

/**
 * Unique students still in an active drive. A managed drive's student is in
 * process while registered before round 1, or while their latest round entry
 * is unfinalized or a pass into a round not yet reached; a recorded drive's
 * student while their final stage is unresolved and no stage was failed.
 */
const studentsInProcess = async (drives, participations) => {
  const active = drives.filter((d) => ACTIVE_DRIVE_STATUSES.includes(d.status));
  const activeIds = new Set(active.map((d) => String(d._id)));
  const set = new Set();

  const inProgress = active.filter((d) => d.status === MANAGED_DRIVE_STATUS.IN_PROGRESS);
  const latest = inProgress.length
    ? await RoundResult.aggregate([
        { $match: { driveId: { $in: inProgress.map((d) => d._id) } } },
        { $sort: { roundOrder: -1 } },
        { $group: { _id: { d: "$driveId", s: "$studentId" }, locked: { $first: "$locked" }, result: { $first: "$result" }, attendance: { $first: "$attendance" }, order: { $first: "$roundOrder" } } },
      ])
    : [];
  const latestMap = new Map(latest.map((l) => [`${l._id.d}:${l._id.s}`, l]));

  for (const p of participations) {
    const d = active.find((x) => String(x._id) === String(p.driveId));
    if (!d || !activeIds.has(String(p.driveId))) continue;
    if (d.workflow === DRIVE_WORKFLOW.MANAGED) {
      if (d.status !== MANAGED_DRIVE_STATUS.IN_PROGRESS) {
        set.add(String(p.studentId));
        continue;
      }
      const l = latestMap.get(`${p.driveId}:${p.studentId}`);
      if (!l) continue; // registered but never entered round 1 (e.g. flagged)
      if (!l.locked) set.add(String(p.studentId));
      else if (l.attendance === ATTENDANCE.APPEARED && l.result === ROUND_RESULT.PASSED && l.order < (d.rounds?.length || 0)) {
        set.add(String(p.studentId));
      }
    } else {
      const failed = ATTEMPT_STAGES.some((s) => p.stages?.[s]?.status === STAGE_STATUS.FAILED);
      if (!failed && (p.stages?.final?.status ?? FINAL_STATUS.NOT_REACHED) === FINAL_STATUS.NOT_REACHED) {
        set.add(String(p.studentId));
      }
    }
  }
  return set;
};

// ─────────────────────────────────────────────────────────────
// STUDENT PLACEMENT STATUS & HISTORY
// ─────────────────────────────────────────────────────────────

/**
 * One student's recruitment history across every drive, newest first, plus
 * their overall standing. `forStudent` hides what a student may not see:
 * results of rounds not yet finalized, and logistics of rounds they are not in.
 */
export const studentRecruitmentHistory = async (studentId, { forStudent = false } = {}) => {
  const [participations, candidates] = await Promise.all([
    DriveParticipation.find({ studentId }).populate("driveId").lean(),
    DriveCandidate.find({ studentId, eligible: true }).select("driveId notifiedAt viewedAt").lean(),
  ]);

  const valid = participations.filter((p) => p.driveId);
  const managedIds = valid.filter((p) => p.driveId.workflow === DRIVE_WORKFLOW.MANAGED).map((p) => p.driveId._id);
  const results = await RoundResult.find({ studentId, driveId: { $in: managedIds } }).select("-history").lean();
  const resultsByDrive = new Map();
  for (const r of results) {
    const k = String(r.driveId);
    if (!resultsByDrive.has(k)) resultsByDrive.set(k, new Map());
    resultsByDrive.get(k).set(String(r.roundId), r);
  }

  const entries = valid.map((p) => {
    const d = p.driveId;
    const base = {
      driveId: d._id,
      companyName: d.companyName,
      role: d.role,
      driveDate: d.driveDate,
      driveStatus: d.status,
      workflow: d.workflow || DRIVE_WORKFLOW.RECORDED,
      registrationStatus: p.registrationStatus || REGISTRATION_STATUS.REGISTERED,
      registeredAt: p.registeredAt,
      withdrawnAt: p.withdrawnAt,
      finalStatus: p.stages?.final?.status,
      offer: p.stages?.final?.status === FINAL_STATUS.SELECTED ? p.stages.final.offer : undefined,
    };

    if (base.workflow !== DRIVE_WORKFLOW.MANAGED) {
      const rounds = (d.stages || []).map((s) => ({
        name: s === "final" ? "Final" : s.charAt(0).toUpperCase() + s.slice(1),
        result: p.stages?.[s]?.status,
      }));
      return { ...base, rounds, outcome: legacyOutcome(p, d), currentStage: null };
    }

    const mine = resultsByDrive.get(String(d._id)) ?? new Map();
    const ordered = [...(d.rounds || [])].sort((a, b) => a.order - b.order);
    let currentStage = null;
    let eliminated = false;
    const rounds = ordered.map((r, i) => {
      const e = mine.get(String(r._id));
      const finalized = r.status === ROUND_STATUS.FINALIZED;
      const visible = !forStudent || finalized;
      if (e && !finalized && !currentStage) currentStage = ROUND_TYPE_LABEL[r.type];
      if (e && finalized && (e.attendance !== ATTENDANCE.APPEARED || e.result !== ROUND_RESULT.PASSED)) eliminated = true;
      const schedule = r.schedule
        ? {
            date: r.schedule.date,
            startTime: r.schedule.startTime,
            endTime: r.schedule.endTime,
            mode: r.schedule.mode,
            venue: r.schedule.venue,
            instructions: r.schedule.instructions,
            meetingLink: !forStudent || e ? r.schedule.meetingLink : undefined,
          }
        : undefined;
      return {
        roundId: r._id,
        order: i + 1,
        type: r.type,
        name: ROUND_TYPE_LABEL[r.type],
        roundStatus: r.status,
        entered: Boolean(e),
        attendance: e && visible ? e.attendance : undefined,
        result: e && visible ? e.result : undefined,
        schedule: !forStudent || e || (i === 0 && base.registrationStatus === REGISTRATION_STATUS.REGISTERED) ? schedule : undefined,
        isFinal: i === ordered.length - 1,
      };
    });

    let outcome;
    if (base.registrationStatus === REGISTRATION_STATUS.WITHDRAWN) outcome = "withdrawn";
    else if (p.stages?.final?.status === FINAL_STATUS.SELECTED) outcome = "selected";
    else if (p.stages?.final?.status === FINAL_STATUS.REJECTED || eliminated) outcome = "rejected";
    else if (d.status === MANAGED_DRIVE_STATUS.CANCELLED) outcome = "cancelled";
    else if (d.status === MANAGED_DRIVE_STATUS.COMPLETED) outcome = mine.size ? "rejected" : "not_progressed";
    else if (mine.size) outcome = "in_process";
    else outcome = "registered";

    if (!currentStage && outcome === "in_process") {
      // Passed the latest finalized round; next one not started yet.
      const next = rounds.find((r) => !r.entered);
      currentStage = next ? `Awaiting ${next.name}` : null;
    }

    return { ...base, rounds, outcome, currentStage };
  });

  entries.sort((a, b) => new Date(b.driveDate) - new Date(a.driveDate));

  // Open opportunities the student is eligible for but has not registered for.
  const registeredDrives = new Set(valid.map((p) => String(p.driveId._id)));
  const openDrives = await Drive.find({
    _id: { $in: candidates.map((c) => c.driveId).filter((id) => !registeredDrives.has(String(id))) },
    status: MANAGED_DRIVE_STATUS.OPEN,
  })
    .select("companyName role driveDate registrationDeadline")
    .lean();

  return {
    overall: overallState(entries, openDrives),
    drives: entries,
    openOpportunities: openDrives,
  };
};

const legacyOutcome = (p) => {
  if (p.registrationStatus === REGISTRATION_STATUS.WITHDRAWN) return "withdrawn";
  if (p.stages?.final?.status === FINAL_STATUS.SELECTED) return "selected";
  if (p.stages?.final?.status === FINAL_STATUS.REJECTED) return "rejected";
  if (ATTEMPT_STAGES.some((s) => p.stages?.[s]?.status === STAGE_STATUS.FAILED)) return "rejected";
  if (ATTEMPT_STAGES.some((s) => p.stages?.[s]?.status === STAGE_STATUS.PASSED)) return "in_process";
  return "registered";
};

/** Precedence: Selected > In process > Registered > Eligible > Rejected > Withdrawn > Not placed. */
const overallState = (entries, openDrives) => {
  const selected = entries.filter((e) => e.outcome === "selected");
  if (selected.length) {
    return { state: STUDENT_PLACEMENT_STATE.SELECTED, companyName: selected[0].companyName, role: selected[0].role, offers: selected.length };
  }
  const active = (e) => ![MANAGED_DRIVE_STATUS.COMPLETED, MANAGED_DRIVE_STATUS.CANCELLED].includes(e.driveStatus);
  const proc = entries.find((e) => e.outcome === "in_process" && active(e));
  if (proc) return { state: STUDENT_PLACEMENT_STATE.IN_PROCESS, companyName: proc.companyName, role: proc.role, stage: proc.currentStage };
  const reg = entries.find((e) => e.outcome === "registered" && active(e));
  if (reg) return { state: STUDENT_PLACEMENT_STATE.REGISTERED, companyName: reg.companyName, role: reg.role };
  if (openDrives.length) return { state: STUDENT_PLACEMENT_STATE.ELIGIBLE, opportunities: openDrives.length };
  if (entries.some((e) => e.outcome === "rejected")) return { state: STUDENT_PLACEMENT_STATE.REJECTED };
  if (entries.some((e) => e.outcome === "withdrawn")) return { state: STUDENT_PLACEMENT_STATE.WITHDRAWN };
  return { state: STUDENT_PLACEMENT_STATE.NOT_PLACED };
};

export const listCompanies = async ({ q, limit = 50 } = {}) => {
  const filter = {};
  if (q) filter.name = new RegExp(escapeRegex(String(q).trim()), "i");
  const companies = await Company.find(filter).select("name industry location website source").sort("name").limit(Math.min(Number(limit) || 50, 200)).lean();
  const counts = await Drive.aggregate([
    { $match: { companyId: { $in: companies.map((c) => c._id) } } },
    { $group: { _id: "$companyId", drives: { $sum: 1 } } },
  ]);
  const map = new Map(counts.map((c) => [String(c._id), c.drives]));
  return companies.map((c) => ({ ...c, driveCount: map.get(String(c._id)) || 0 }));
};
