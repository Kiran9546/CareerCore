import mongoose from "mongoose";
import Drive from "../models/Drive.js";
import DriveParticipation from "../models/DriveParticipation.js";
import Student from "../models/Student.js";
import {
  DRIVE_STAGES,
  ATTEMPT_STAGES,
  STAGE_STATUS,
  FINAL_STATUS,
  DRIVE_STATUS,
} from "../config/constants.js";
import {
  buildPlacementProfile,
  buildPlacementProfiles,
  buildCohortSummary,
} from "../services/placementProfileService.js";
import { compareProfiles } from "../services/placementRuleEngine.js";
import { notify } from "../services/notificationService.js";
import {
  buildPlacementWorkbook,
  exportFilename,
} from "../services/placementExportService.js";

/**
 * Placement drive management and official stage results.
 *
 * Every handler here is staff-only; the route layer decides which staff.
 * There is deliberately no student-facing write path anywhere in this file
 * — students read their placement journey through the student router, which
 * exposes reads only.
 */

const toNumberOrUndefined = (v) =>
  v === undefined || v === null || v === "" ? undefined : Number(v);

// ─────────────────────────────────────────────────────────────
// DRIVES
// ─────────────────────────────────────────────────────────────

/** GET /api/placement/drives */
export const listDrives = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.company) {
      filter.companyName = { $regex: String(req.query.company), $options: "i" };
    }

    const drives = await Drive.find(filter).sort("-driveDate").limit(200).lean();

    // Participant and offer counts per drive, in one aggregation rather than
    // a query per row.
    const counts = await DriveParticipation.aggregate([
      { $match: { driveId: { $in: drives.map((d) => d._id) } } },
      {
        $group: {
          _id: "$driveId",
          participants: { $sum: 1 },
          offers: {
            $sum: {
              $cond: [{ $eq: ["$stages.final.status", FINAL_STATUS.SELECTED] }, 1, 0],
            },
          },
        },
      },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c]));

    res.json({
      drives: drives.map((d) => ({
        ...d,
        participantCount: countMap.get(String(d._id))?.participants || 0,
        offerCount: countMap.get(String(d._id))?.offers || 0,
      })),
      total: drives.length,
    });
  } catch (err) {
    next(err);
  }
};

/** GET /api/placement/drives/:id */
export const getDrive = async (req, res, next) => {
  try {
    const drive = await Drive.findById(req.params.id);
    if (!drive) return res.status(404).json({ message: "Drive not found" });
    res.json({ drive });
  } catch (err) {
    next(err);
  }
};

/** POST /api/placement/drives */
export const createDrive = async (req, res, next) => {
  try {
    const { companyName, role, driveDate } = req.body;

    if (!companyName || !role || !driveDate) {
      return res
        .status(400)
        .json({ message: "companyName, role and driveDate are required" });
    }

    const stages = Array.isArray(req.body.stages) && req.body.stages.length
      ? DRIVE_STAGES.filter((s) => req.body.stages.includes(s))
      : [...DRIVE_STAGES];

    if (!stages.length) {
      return res.status(400).json({
        message: `stages must contain at least one of: ${DRIVE_STAGES.join(", ")}`,
      });
    }

    const drive = await Drive.create({
      companyName,
      role,
      driveDate,
      description: req.body.description,
      location: req.body.location,
      ctc: toNumberOrUndefined(req.body.ctc),
      stages,
      status: req.body.status || DRIVE_STATUS.PLANNED,
      eligibility: {
        minCgpa: toNumberOrUndefined(req.body.minCgpa) ?? 0,
        maxBacklogs: toNumberOrUndefined(req.body.maxBacklogs) ?? 0,
        branches: Array.isArray(req.body.branches) ? req.body.branches : [],
        batches: Array.isArray(req.body.batches) ? req.body.batches : [],
      },
      createdBy: req.user._id,
    });

    res.status(201).json({ drive });
  } catch (err) {
    next(err);
  }
};

/** PUT /api/placement/drives/:id */
export const updateDrive = async (req, res, next) => {
  try {
    const drive = await Drive.findById(req.params.id);
    if (!drive) return res.status(404).json({ message: "Drive not found" });

    for (const f of ["companyName", "role", "description", "location", "status"]) {
      if (req.body[f] !== undefined) drive[f] = req.body[f];
    }
    if (req.body.driveDate) drive.driveDate = req.body.driveDate;
    if (req.body.ctc !== undefined) drive.ctc = toNumberOrUndefined(req.body.ctc);

    if (Array.isArray(req.body.stages) && req.body.stages.length) {
      drive.stages = DRIVE_STAGES.filter((s) => req.body.stages.includes(s));
    }

    for (const [key, cast] of [
      ["minCgpa", toNumberOrUndefined],
      ["maxBacklogs", toNumberOrUndefined],
    ]) {
      if (req.body[key] !== undefined) drive.eligibility[key] = cast(req.body[key]);
    }
    if (Array.isArray(req.body.branches)) drive.eligibility.branches = req.body.branches;
    if (Array.isArray(req.body.batches)) drive.eligibility.batches = req.body.batches;

    await drive.save();
    res.json({ drive });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/placement/drives/:id */
export const deleteDrive = async (req, res, next) => {
  try {
    const drive = await Drive.findById(req.params.id);
    if (!drive) return res.status(404).json({ message: "Drive not found" });

    // Deleting a drive would silently erase every student's record of it.
    // Cancelling keeps the history intact, so that is the only route once
    // participants exist.
    const participants = await DriveParticipation.countDocuments({
      driveId: drive._id,
    });
    if (participants > 0) {
      return res.status(409).json({
        message:
          `This drive has ${participants} registered participants and their ` +
          "results are part of their placement history. Set the drive to " +
          "cancelled instead of deleting it.",
      });
    }

    await drive.deleteOne();
    res.json({ message: "Drive deleted" });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// PARTICIPANTS
// ─────────────────────────────────────────────────────────────

/** Mongo filter for the students a drive's eligibility rules allow. */
const eligibilityFilter = (drive) => {
  const e = drive.eligibility || {};
  const filter = {
    cgpa: { $gte: e.minCgpa ?? 0 },
    backlogs: { $lte: e.maxBacklogs ?? 99 },
  };
  if (e.branches?.length) filter.branch = { $in: e.branches };
  if (e.batches?.length) filter.batch = { $in: e.batches };
  return filter;
};

/** GET /api/placement/drives/:id/eligible — students who may be registered */
export const listEligibleStudents = async (req, res, next) => {
  try {
    const drive = await Drive.findById(req.params.id);
    if (!drive) return res.status(404).json({ message: "Drive not found" });

    const already = await DriveParticipation.find({ driveId: drive._id }).distinct(
      "studentId",
    );

    const students = await Student.find({
      ...eligibilityFilter(drive),
      _id: { $nin: already },
    })
      .populate("userId", "name email")
      .select("usn batch branch cgpa backlogs currentPRS readinessLevel")
      .sort("-currentPRS")
      .limit(300);

    res.json({
      students: students.map((s) => ({
        _id: s._id,
        name: s.userId?.name,
        usn: s.usn,
        batch: s.batch,
        branch: s.branch,
        cgpa: s.cgpa,
        backlogs: s.backlogs,
        prs: s.currentPRS,
        readinessLevel: s.readinessLevel,
      })),
      eligibility: drive.eligibility,
      total: students.length,
    });
  } catch (err) {
    next(err);
  }
};

/** GET /api/placement/drives/:id/participants */
export const listParticipants = async (req, res, next) => {
  try {
    const drive = await Drive.findById(req.params.id);
    if (!drive) return res.status(404).json({ message: "Drive not found" });

    const participations = await DriveParticipation.find({ driveId: drive._id })
      .populate({
        path: "studentId",
        select: "usn batch branch cgpa backlogs currentPRS readinessLevel userId",
        populate: { path: "userId", select: "name email" },
      })
      .sort("-createdAt");

    res.json({
      drive,
      participants: participations
        // A participation whose student was removed would otherwise render
        // as a blank row with no way to act on it.
        .filter((p) => p.studentId)
        .map((p) => ({
          _id: p._id,
          student: {
            _id: p.studentId._id,
            name: p.studentId.userId?.name,
            usn: p.studentId.usn,
            branch: p.studentId.branch,
            batch: p.studentId.batch,
            cgpa: p.studentId.cgpa,
            prs: p.studentId.currentPRS,
            readinessLevel: p.studentId.readinessLevel,
          },
          stages: p.stages,
          registeredAt: p.registeredAt,
        })),
      total: participations.length,
    });
  } catch (err) {
    next(err);
  }
};

/** POST /api/placement/drives/:id/participants  { studentIds: [...] } */
export const registerParticipants = async (req, res, next) => {
  try {
    const drive = await Drive.findById(req.params.id);
    if (!drive) return res.status(404).json({ message: "Drive not found" });

    const ids = (Array.isArray(req.body.studentIds) ? req.body.studentIds : [])
      .filter((id) => mongoose.isValidObjectId(id));

    if (!ids.length) {
      return res
        .status(400)
        .json({ message: "studentIds must be a non-empty array of student ids" });
    }

    // Eligibility is enforced server-side, not just filtered in the picker —
    // otherwise a hand-crafted request could register an ineligible student.
    const eligible = await Student.find({
      _id: { $in: ids },
      ...eligibilityFilter(drive),
    }).select("_id userId");

    const eligibleIds = new Set(eligible.map((s) => String(s._id)));
    const rejected = ids.filter((id) => !eligibleIds.has(String(id)));

    const ops = eligible.map((s) => ({
      updateOne: {
        filter: { driveId: drive._id, studentId: s._id },
        update: {
          $setOnInsert: {
            driveId: drive._id,
            studentId: s._id,
            registeredAt: new Date(),
            registeredBy: req.user._id,
          },
        },
        upsert: true,
      },
    }));

    const result = ops.length
      ? await DriveParticipation.bulkWrite(ops, { ordered: false })
      : { upsertedCount: 0 };

    // Best-effort notification; a mail/notify failure must not fail the
    // registration itself.
    for (const s of eligible) {
      if (!s.userId) continue;
      notify({
        userId: s.userId,
        type: "placement_update",
        title: `Registered for ${drive.companyName}`,
        body: `You have been registered for the ${drive.role} drive at ${drive.companyName}.`,
        link: "/student/placement",
        metadata: { driveId: drive._id },
      }).catch(() => {});
    }

    res.status(201).json({
      registered: result.upsertedCount ?? 0,
      alreadyRegistered: eligible.length - (result.upsertedCount ?? 0),
      rejectedIneligible: rejected.length,
      message: rejected.length
        ? `${result.upsertedCount ?? 0} registered. ${rejected.length} skipped — ` +
          "they do not meet this drive's eligibility criteria."
        : `${result.upsertedCount ?? 0} student(s) registered`,
    });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/placement/participations/:id */
export const removeParticipant = async (req, res, next) => {
  try {
    const participation = await DriveParticipation.findById(req.params.id);
    if (!participation) {
      return res.status(404).json({ message: "Participation not found" });
    }

    // Removing a participation that already carries results would delete
    // official history. Only an untouched registration can be withdrawn.
    const touched =
      ATTEMPT_STAGES.some(
        (s) => participation.stages[s]?.status !== STAGE_STATUS.NOT_REACHED,
      ) || participation.stages.final?.status !== FINAL_STATUS.NOT_REACHED;

    if (touched) {
      return res.status(409).json({
        message:
          "This participation already has recorded stage results and is part " +
          "of the student's official history. Correct the results instead of " +
          "removing the record.",
      });
    }

    await participation.deleteOne();
    res.json({ message: "Participant removed" });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// STAGE RESULTS
// ─────────────────────────────────────────────────────────────

const STAGE_NOTIFICATION = {
  [STAGE_STATUS.PASSED]: (drive, stage) => [
    `Cleared the ${stage} round at ${drive.companyName}`,
    `Your ${stage} result for the ${drive.role} drive at ${drive.companyName} has been recorded as cleared.`,
  ],
  [STAGE_STATUS.FAILED]: (drive, stage) => [
    `${drive.companyName} — ${stage} result recorded`,
    `Your ${stage} result for the ${drive.role} drive at ${drive.companyName} has been recorded.`,
  ],
};

/**
 * PATCH /api/placement/participations/:id/stage
 * Body: { stage, status, score?, note?, offer? }
 *
 * The single write path for official results. Because every summary metric
 * is derived from these documents on read, one write here updates the
 * student's placement profile, the faculty view and the officer overview at
 * the same time — there is no second copy to keep in sync.
 */
export const updateStageResult = async (req, res, next) => {
  try {
    const { stage, status } = req.body;

    if (!DRIVE_STAGES.includes(stage)) {
      return res
        .status(400)
        .json({ message: `stage must be one of: ${DRIVE_STAGES.join(", ")}` });
    }

    const allowed =
      stage === "final"
        ? Object.values(FINAL_STATUS)
        : Object.values(STAGE_STATUS);

    if (!allowed.includes(status)) {
      return res
        .status(400)
        .json({ message: `status for ${stage} must be one of: ${allowed.join(", ")}` });
    }

    const participation = await DriveParticipation.findById(req.params.id);
    if (!participation) {
      return res.status(404).json({ message: "Participation not found" });
    }

    const drive = await Drive.findById(participation.driveId);
    if (!drive) return res.status(404).json({ message: "Drive not found" });

    if (!drive.stages.includes(stage)) {
      return res.status(400).json({
        message: `This drive does not run a ${stage} stage`,
      });
    }

    // A student cannot clear a round they never reached. Enforcing the order
    // server-side is what keeps `not_reached` meaningful — without it, a
    // mis-click could record a technical pass for a student eliminated at
    // aptitude, and every derived metric downstream would inherit the lie.
    const ordered = drive.orderedStages();
    const index = ordered.indexOf(stage);
    if (index > 0 && status !== STAGE_STATUS.NOT_REACHED) {
      const previous = ordered[index - 1];
      const previousStatus = participation.stages[previous]?.status;
      if (previousStatus !== STAGE_STATUS.PASSED) {
        return res.status(400).json({
          message:
            `Cannot record a ${stage} result — the student has not cleared ` +
            `the ${previous} stage (currently "${previousStatus}").`,
        });
      }
    }

    const offer =
      stage === "final" && status === FINAL_STATUS.SELECTED
        ? {
            ctc: toNumberOrUndefined(req.body.ctc) ?? drive.ctc,
            role: req.body.offerRole || drive.role,
            offerDate: req.body.offerDate || new Date(),
            accepted: Boolean(req.body.accepted),
          }
        : undefined;

    const changed = participation.applyStageResult(
      stage,
      {
        status,
        score: toNumberOrUndefined(req.body.score),
        note: req.body.note,
        offer,
      },
      req.user._id,
    );

    // Failing a stage means the later stages were never reached. Clearing
    // them keeps the record truthful if a result is corrected downward.
    if (status === STAGE_STATUS.FAILED || status === FINAL_STATUS.REJECTED) {
      for (const later of ordered.slice(index + 1)) {
        participation.stages[later].status =
          later === "final" ? FINAL_STATUS.NOT_REACHED : STAGE_STATUS.NOT_REACHED;
      }
    }

    await participation.save();

    if (changed) {
      const student = await Student.findById(participation.studentId).select("userId");
      if (student?.userId) {
        const template =
          stage === "final"
            ? status === FINAL_STATUS.SELECTED
              ? [
                  `Offer from ${drive.companyName}`,
                  `You have been selected for ${drive.role} at ${drive.companyName}.`,
                ]
              : [
                  `${drive.companyName} — final result recorded`,
                  `Your final result for the ${drive.role} drive at ${drive.companyName} has been recorded.`,
                ]
            : STAGE_NOTIFICATION[status]?.(drive, stage);

        if (template) {
          notify({
            userId: student.userId,
            type: "placement_update",
            title: template[0],
            body: template[1],
            link: "/student/placement",
            metadata: { driveId: drive._id, stage, status },
          }).catch(() => {});
        }
      }
    }

    // Return the freshly derived profile so the UI updates without a
    // second round-trip, and so the caller can see the effect immediately.
    const profile = await buildPlacementProfile(participation.studentId, {
      includeStudent: false,
    });

    res.json({ participation, profile });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// PLACEMENT PROFILES (staff read)
// ─────────────────────────────────────────────────────────────

/** GET /api/placement/students/:studentId/profile */
export const getStudentPlacementProfile = async (req, res, next) => {
  try {
    const profile = await buildPlacementProfile(req.params.studentId);
    if (!profile) return res.status(404).json({ message: "Student not found" });
    res.json(profile);
  } catch (err) {
    next(err);
  }
};

/** GET /api/placement/compare?ids=a,b[,c] */
export const compareStudents = async (req, res, next) => {
  try {
    const ids = String(req.query.ids || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => mongoose.isValidObjectId(s))
      .slice(0, 4);

    if (ids.length < 2) {
      return res
        .status(400)
        .json({ message: "Provide at least two valid student ids to compare" });
    }

    const profiles = await buildPlacementProfiles(ids);
    if (profiles.length < 2) {
      return res
        .status(404)
        .json({ message: "Could not find enough of those students to compare" });
    }

    res.json({ profiles, comparison: compareProfiles(profiles) });
  } catch (err) {
    next(err);
  }
};

/** GET /api/placement/overview */
export const getPlacementOverview = async (req, res, next) => {
  try {
    const studentFilter = {};
    if (req.query.batch) studentFilter.batch = req.query.batch;
    if (req.query.branch) studentFilter.branch = req.query.branch;

    const [summary, driveCounts, upcoming] = await Promise.all([
      buildCohortSummary(studentFilter),
      Drive.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Drive.find({ driveDate: { $gte: new Date() } })
        .sort("driveDate")
        .limit(5)
        .select("companyName role driveDate status")
        .lean(),
    ]);

    res.json({
      summary,
      drivesByStatus: driveCounts.map((d) => ({ status: d._id, count: d.count })),
      upcomingDrives: upcoming,
      filters: studentFilter,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/placement/students
 * Staff student list with placement outcomes joined on. Aggregated rather
 * than built profile-by-profile, because this renders a whole batch.
 */
export const listStudentsWithOutcomes = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.batch) filter.batch = req.query.batch;
    if (req.query.branch) filter.branch = req.query.branch;

    const students = await Student.find(filter)
      .populate("userId", "name email")
      .select("usn batch branch cgpa backlogs currentPRS readinessLevel")
      .sort("-currentPRS")
      .limit(300);

    const attemptStatuses = [STAGE_STATUS.PASSED, STAGE_STATUS.FAILED];

    const rows = await DriveParticipation.aggregate([
      { $match: { studentId: { $in: students.map((s) => s._id) } } },
      {
        $group: {
          _id: "$studentId",
          drives: { $sum: 1 },
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
          interviewsPassed: {
            $sum: { $cond: [{ $eq: ["$stages.interview.status", STAGE_STATUS.PASSED] }, 1, 0] },
          },
          offers: {
            $sum: { $cond: [{ $eq: ["$stages.final.status", FINAL_STATUS.SELECTED] }, 1, 0] },
          },
        },
      },
    ]);
    const rowMap = new Map(rows.map((r) => [String(r._id), r]));

    res.json({
      students: students.map((s) => {
        const r = rowMap.get(String(s._id));
        return {
          _id: s._id,
          name: s.userId?.name,
          email: s.userId?.email,
          usn: s.usn,
          batch: s.batch,
          branch: s.branch,
          cgpa: s.cgpa,
          backlogs: s.backlogs,
          prs: s.currentPRS,
          readinessLevel: s.readinessLevel,
          drives: r?.drives || 0,
          aptitudeAttempts: r?.aptitudeAttempts || 0,
          aptitudePassed: r?.aptitudePassed || 0,
          technicalAttempts: r?.technicalAttempts || 0,
          technicalPassed: r?.technicalPassed || 0,
          interviewsReached: r?.interviewsReached || 0,
          interviewsPassed: r?.interviewsPassed || 0,
          offers: r?.offers || 0,
        };
      }),
      total: students.length,
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/placement/export[?batch=&branch=]
 *
 * Streams the placement workbook. Written to the response rather than
 * buffered so a large batch does not have to be held in memory whole, and
 * Content-Disposition carries the filename so the browser saves it with a
 * sensible name instead of "export".
 */
export const exportPlacementData = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.batch) filter.batch = String(req.query.batch);
    if (req.query.branch) filter.branch = String(req.query.branch);

    const workbook = await buildPlacementWorkbook(filter);
    const filename = exportFilename(filter);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    // The browser cannot read Content-Disposition on a cross-origin XHR
    // unless it is explicitly exposed, and the client reads the filename
    // from it to name the download.
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
};
