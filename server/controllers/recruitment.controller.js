import mongoose from "mongoose";
import Company from "../models/Company.js";
import Drive from "../models/Drive.js";
import DriveParticipation from "../models/DriveParticipation.js";
import InterviewTemplate from "../models/InterviewTemplate.js";
import AuditLog from "../models/AuditLog.js";
import {
  ROUND_TYPES,
  ROUND_TYPE_CODES,
  PARTICIPATION_POLICY_LABEL,
  MANAGED_STATUS_TRANSITIONS,
  MAX_PAGE_SIZE,
} from "../config/constants.js";
import { audit, httpError } from "../services/auditService.js";
import { asyncHandler as handle } from "../utils/asyncHandler.js";
import { calculateEligibility } from "../services/eligibilityService.js";
import {
  loadManagedDrive,
  createCompany as createCompanyRecord,
  createManagedDrive,
  updateEligibility,
  changeDriveStatus,
  cloneDrive as cloneDriveRecord,
  configureRounds,
  scheduleRound,
  ensureDefaultTemplates,
  getParticipationPolicy,
  setParticipationPolicy,
  overrideEligibilityFlag,
  updateOffer as updateOfferRecord,
} from "../services/recruitmentService.js";
import {
  listRoundParticipants,
  recordAttendance as recordAttendanceForRound,
  recordResults as recordResultsForRound,
  finalizeRound as finalizeRoundRecord,
  reopenRound as reopenRoundRecord,
} from "../services/roundService.js";
import {
  driveDashboard,
  listDriveStudents,
  overallStatistics,
  studentRecruitmentHistory,
  listCompanies as listCompanyRows,
} from "../services/placementStatsService.js";

/**
 * Placement-cell endpoints for the managed recruitment workflow. Every rule
 * lives in the services; these handlers only translate HTTP to calls. Role
 * checks are applied per route in placement.routes.js.
 */

// ─── Companies ───────────────────────────────────────────────

export const listCompanies = handle(async (req, res) => {
  res.json({ companies: await listCompanyRows({ q: req.query.q, limit: req.query.limit }) });
});

export const createCompany = handle(async (req, res) => {
  const company = await createCompanyRecord(req.body, req.user);
  res.status(201).json({ company });
});

export const getCompany = handle(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, "Invalid company");
  const company = await Company.findById(req.params.id).select("-recruiterUserId").lean();
  if (!company) throw httpError(404, "Company not found");
  const drives = await Drive.find({ companyId: company._id })
    .select("role driveDate status workflow ctc registrationDeadline")
    .sort("-driveDate")
    .lean();
  res.json({ company, drives });
});

// ─── Drives ──────────────────────────────────────────────────

export const createDrive = handle(async (req, res) => {
  const { drive, eligibility } = await createManagedDrive(req.body, req.user);
  res.status(201).json({ drive, eligibility });
});

export const getManagedDrive = handle(async (req, res) => {
  const drive = await loadManagedDrive(req.params.id);
  const dashboard = await driveDashboard(drive);
  res.json({
    drive,
    dashboard,
    allowedTransitions: MANAGED_STATUS_TRANSITIONS[drive.status] || [],
  });
});

export const changeStatus = handle(async (req, res) => {
  const drive = await loadManagedDrive(req.params.id);
  const out = await changeDriveStatus(drive, req.body.status, req.user, { reason: req.body.reason });
  res.json(out);
});

export const cloneDrive = handle(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, "Invalid drive");
  const source = await Drive.findById(req.params.id);
  if (!source) throw httpError(404, "Drive not found");
  const out = await cloneDriveRecord(source, req.body, req.user);
  res.status(201).json(out);
});

// ─── Eligibility ─────────────────────────────────────────────

export const setEligibility = handle(async (req, res) => {
  const drive = await loadManagedDrive(req.params.id);
  res.json(await updateEligibility(drive, req.body, req.user));
});

export const recalculateEligibility = handle(async (req, res) => {
  const drive = await loadManagedDrive(req.params.id);
  if (["completed", "cancelled", "in_progress"].includes(drive.status)) {
    throw httpError(409, "Eligibility is locked once the drive is in progress");
  }
  res.json({ eligibility: await calculateEligibility(drive, req.user) });
});

export const listStudents = handle(async (req, res) => {
  const drive = await loadManagedDrive(req.params.id);
  res.json(await listDriveStudents(drive, req.query));
});

export const overrideEligibility = handle(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, "Invalid registration");
  const participation = await DriveParticipation.findById(req.params.id);
  if (!participation) throw httpError(404, "Registration not found");
  const drive = await loadManagedDrive(participation.driveId);
  res.json({ participation: await overrideEligibilityFlag(participation, drive, req.body.reason, req.user) });
});

// ─── Interview process ───────────────────────────────────────

export const listRoundTypes = handle(async (req, res) => {
  res.json({ roundTypes: ROUND_TYPES.map(({ code, label }) => ({ code, label })) });
});

export const listTemplates = handle(async (req, res) => {
  await ensureDefaultTemplates();
  res.json({ templates: await InterviewTemplate.find().sort("name").lean() });
});

const templateBody = (body) => {
  const name = String(body.name || "").trim();
  if (!name) throw httpError(400, "Template name is required");
  const rounds = Array.isArray(body.rounds) ? body.rounds : [];
  if (!rounds.length) throw httpError(400, "No interview process selected. A template needs at least one round");
  if (rounds.some((r) => !ROUND_TYPE_CODES.includes(r))) throw httpError(400, "Unknown round type in template");
  if (new Set(rounds).size !== rounds.length) throw httpError(400, "Duplicate round in template");
  return { name, rounds };
};

export const createTemplate = handle(async (req, res) => {
  const template = await InterviewTemplate.create({ ...templateBody(req.body), createdBy: req.user._id });
  await audit(req.user, "template.created", { to: template.toObject() });
  res.status(201).json({ template });
});

export const updateTemplate = handle(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, "Invalid template");
  const template = await InterviewTemplate.findById(req.params.id);
  if (!template) throw httpError(404, "Template not found");
  const before = { name: template.name, rounds: [...template.rounds] };
  Object.assign(template, templateBody(req.body));
  await template.save();
  await audit(req.user, "template.updated", { from: before, to: { name: template.name, rounds: template.rounds } });
  res.json({ template });
});

export const deleteTemplate = handle(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, "Invalid template");
  const template = await InterviewTemplate.findByIdAndDelete(req.params.id);
  if (!template) throw httpError(404, "Template not found");
  await audit(req.user, "template.deleted", { from: { name: template.name, rounds: template.rounds } });
  res.json({ message: "Template deleted" });
});

export const setRounds = handle(async (req, res) => {
  const drive = await loadManagedDrive(req.params.id);
  res.json({ drive: await configureRounds(drive, req.body.rounds, req.user) });
});

export const setSchedule = handle(async (req, res) => {
  const drive = await loadManagedDrive(req.params.id);
  res.json({ drive: await scheduleRound(drive, req.params.roundId, req.body, req.user) });
});

// ─── Attendance, results, finalization ───────────────────────

export const roundParticipants = handle(async (req, res) => {
  const drive = await loadManagedDrive(req.params.id);
  res.json(await listRoundParticipants(drive, req.params.roundId, req.query));
});

export const recordAttendance = handle(async (req, res) => {
  const drive = await loadManagedDrive(req.params.id);
  res.json(await recordAttendanceForRound(drive, req.params.roundId, req.body, req.user));
});

export const recordResults = handle(async (req, res) => {
  const drive = await loadManagedDrive(req.params.id);
  res.json(await recordResultsForRound(drive, req.params.roundId, req.body, req.user));
});

export const finalizeRound = handle(async (req, res) => {
  const drive = await loadManagedDrive(req.params.id);
  res.json(await finalizeRoundRecord(drive, req.params.roundId, req.user));
});

export const reopenRound = handle(async (req, res) => {
  const drive = await loadManagedDrive(req.params.id);
  res.json(await reopenRoundRecord(drive, req.params.roundId, req.body.reason, req.user));
});

// ─── Selections & offers ─────────────────────────────────────

export const updateOffer = handle(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, "Invalid registration");
  const participation = await DriveParticipation.findById(req.params.id);
  if (!participation) throw httpError(404, "Registration not found");
  const drive = await loadManagedDrive(participation.driveId);
  const updated = await updateOfferRecord(participation, drive, req.body, req.user);
  res.json({ offer: updated.stages.final.offer });
});

// ─── Dashboards, history, audit ──────────────────────────────

export const statistics = handle(async (req, res) => {
  res.json(await overallStatistics(req.query));
});

export const studentHistory = handle(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.studentId)) throw httpError(400, "Invalid student");
  res.json(await studentRecruitmentHistory(req.params.studentId));
});

export const auditHistory = handle(async (req, res) => {
  const filter = {};
  if (req.params.id) {
    if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, "Invalid drive");
    filter.driveId = req.params.id;
  }
  if (req.query.action) filter.action = String(req.query.action);
  if (req.query.studentId && mongoose.isValidObjectId(req.query.studentId)) filter.studentId = req.query.studentId;
  if (req.query.roundId && mongoose.isValidObjectId(req.query.roundId)) filter.roundId = req.query.roundId;

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), MAX_PAGE_SIZE);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const [entries, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ entries, total, page, limit });
});

// ─── Participation policy ────────────────────────────────────

export const getPolicy = handle(async (req, res) => {
  res.json({ policy: await getParticipationPolicy(), options: PARTICIPATION_POLICY_LABEL });
});

export const setPolicy = handle(async (req, res) => {
  res.json({ policy: await setParticipationPolicy(req.body.policy, req.user), options: PARTICIPATION_POLICY_LABEL });
});
