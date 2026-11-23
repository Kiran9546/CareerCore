import mongoose from "mongoose";
import Drive from "../models/Drive.js";
import DriveCandidate from "../models/DriveCandidate.js";
import DriveParticipation from "../models/DriveParticipation.js";
import Student from "../models/Student.js";
import {
  DRIVE_WORKFLOW,
  MANAGED_DRIVE_STATUS,
  ROUND_TYPE_LABEL,
  REGISTRATION_STATUS,
} from "../config/constants.js";
import { httpError } from "../services/auditService.js";
import { asyncHandler as handle } from "../utils/asyncHandler.js";
import { describeEligibility, evaluateStudent } from "../services/eligibilityService.js";
import {
  registerStudent,
  withdrawStudent,
  registrationOpen,
  participationPolicyBlock,
} from "../services/recruitmentService.js";
import { studentRecruitmentHistory } from "../services/placementStatsService.js";

/**
 * The student's side of the recruitment workflow, mounted under
 * /api/student (student role only). The student is always resolved from the
 * JWT; no handler here accepts a student id, a CGPA or a branch from the
 * request — and nothing here can write attendance, results or selections.
 */

const me = async (req) => {
  const student = await Student.findOne({ userId: req.user._id }).select("userId usn branch batch cgpa backlogs");
  if (!student) throw httpError(404, "Complete your student profile first");
  return student;
};

/** Statuses a student may see a drive in. Drafts are invisible. */
const VISIBLE = [
  MANAGED_DRIVE_STATUS.OPEN,
  MANAGED_DRIVE_STATUS.REGISTRATION_CLOSED,
  MANAGED_DRIVE_STATUS.IN_PROGRESS,
  MANAGED_DRIVE_STATUS.COMPLETED,
  MANAGED_DRIVE_STATUS.CANCELLED,
];

const publicDrive = (d) => ({
  _id: d._id,
  companyName: d.companyName,
  role: d.role,
  description: d.description,
  location: d.location,
  ctc: d.ctc,
  driveDate: d.driveDate,
  registrationDeadline: d.registrationDeadline,
  status: d.status,
  criteria: describeEligibility(d.eligibility),
  process: [...(d.rounds || [])].sort((a, b) => a.order - b.order).map((r) => ROUND_TYPE_LABEL[r.type]),
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

/** GET /api/student/drives — opportunities and drives I registered for. */
export const listMyDrives = handle(async (req, res) => {
  const student = await me(req);
  const [candidates, participations] = await Promise.all([
    DriveCandidate.find({ studentId: student._id, eligible: true }).select("driveId").lean(),
    DriveParticipation.find({ studentId: student._id }).select("driveId registrationStatus stages.final.status").lean(),
  ]);
  const regByDrive = new Map(participations.map((p) => [String(p.driveId), p]));
  const ids = [...new Set([...candidates.map((c) => String(c.driveId)), ...regByDrive.keys()])];

  const drives = await Drive.find({
    _id: { $in: ids },
    workflow: DRIVE_WORKFLOW.MANAGED,
    status: { $in: VISIBLE },
  })
    .sort({ driveDate: -1 })
    .lean();

  const now = new Date();
  const shown = drives
    // An eligible-only drive that closed before I registered is no longer
    // an opportunity; it stays visible only if I took part.
    .filter((d) => regByDrive.has(String(d._id)) || d.status === MANAGED_DRIVE_STATUS.OPEN);
  const rows = await Promise.all(
    shown.map(async (d) => {
      const p = regByDrive.get(String(d._id));
      const open = registrationOpen(d, now) && (!p || p.registrationStatus === REGISTRATION_STATUS.WITHDRAWN);
      // The placement policy can rule out an otherwise open drive.
      const blockedReason = open ? await participationPolicyBlock(student, d) : null;
      return {
        ...publicDrive(d),
        registrationStatus: p?.registrationStatus || (p ? REGISTRATION_STATUS.REGISTERED : null),
        finalStatus: p?.stages?.final?.status,
        canRegister: open && !blockedReason,
        blockedReason,
      };
    }),
  );
  res.json({ drives: rows });
});

/** GET /api/student/drives/:id — detail, my rounds and results. */
export const getMyDrive = handle(async (req, res) => {
  const student = await me(req);
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, "Invalid drive");
  const drive = await Drive.findOne({ _id: req.params.id, workflow: DRIVE_WORKFLOW.MANAGED, status: { $in: VISIBLE } });
  if (!drive) throw httpError(404, "Drive not found");

  const [candidate, participation] = await Promise.all([
    DriveCandidate.findOne({ driveId: drive._id, studentId: student._id }),
    DriveParticipation.findOne({ driveId: drive._id, studentId: student._id }).select("registrationStatus registeredAt withdrawnAt stages.final"),
  ]);
  // Only students the drive concerns can open it.
  if (!participation && !candidate?.eligible) throw httpError(404, "Drive not found");

  if (candidate && !candidate.viewedAt) {
    await DriveCandidate.updateOne({ _id: candidate._id, viewedAt: { $exists: false } }, { $set: { viewedAt: new Date() } });
  }

  const history = participation ? await studentRecruitmentHistory(student._id, { forStudent: true }) : null;
  const mine = history?.drives.find((d) => String(d.driveId) === String(drive._id)) || null;
  const verdict = evaluateStudent(student, drive.eligibility.toObject());
  const registered = participation?.registrationStatus === REGISTRATION_STATUS.REGISTERED;
  const open = registrationOpen(drive) && (!participation || participation.registrationStatus === REGISTRATION_STATUS.WITHDRAWN);
  const blockedReason = open ? await participationPolicyBlock(student, drive) : null;

  res.json({
    drive: publicDrive(drive),
    me: {
      name: req.user.name,
      usn: student.usn,
      branch: student.branch,
      cgpa: student.cgpa,
      backlogs: student.backlogs,
      eligibleNow: verdict.eligible,
      reasons: verdict.reasons,
    },
    registration: participation
      ? {
          status: participation.registrationStatus,
          registeredAt: participation.registeredAt,
          withdrawnAt: participation.withdrawnAt,
        }
      : null,
    canRegister: open && !blockedReason,
    blockedReason,
    canWithdraw:
      registered &&
      [MANAGED_DRIVE_STATUS.OPEN, MANAGED_DRIVE_STATUS.REGISTRATION_CLOSED].includes(drive.status) &&
      !mine?.rounds?.some((r) => r.entered),
    progress: mine,
  });
});

export const registerForDrive = handle(async (req, res) => {
  const student = await me(req);
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, "Invalid drive");
  const drive = await Drive.findOne({ _id: req.params.id, workflow: DRIVE_WORKFLOW.MANAGED });
  if (!drive || drive.status === MANAGED_DRIVE_STATUS.DRAFT) throw httpError(404, "Invalid drive");
  const participation = await registerStudent(drive, student, req.user);
  res.status(201).json({ message: "Registered", registration: { status: participation.registrationStatus, registeredAt: participation.registeredAt } });
});

export const withdrawFromDrive = handle(async (req, res) => {
  const student = await me(req);
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, "Invalid drive");
  const drive = await Drive.findOne({ _id: req.params.id, workflow: DRIVE_WORKFLOW.MANAGED });
  if (!drive) throw httpError(404, "Invalid drive");
  const participation = await withdrawStudent(drive, student, req.user, req.body?.reason);
  res.json({ message: "Registration withdrawn", registration: { status: participation.registrationStatus, withdrawnAt: participation.withdrawnAt } });
});

/** GET /api/student/placement/status — overall status and full history. */
export const myRecruitmentHistory = handle(async (req, res) => {
  const student = await me(req);
  res.json(await studentRecruitmentHistory(student._id, { forStudent: true }));
});
